import { Test, TestingModule } from '@nestjs/testing';
import { JwtService } from '@nestjs/jwt';
import { ForbiddenException } from '@nestjs/common';
import { ThrottlerGuard } from '@nestjs/throttler';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';

function makeRes() {
  return {
    setHeader: jest.fn(),
    status: jest.fn().mockReturnThis(),
  } as any;
}

describe('AuthController', () => {
  let controller: AuthController;

  const mockAuthService = {
    register: jest.fn(),
    login: jest.fn(),
    refresh: jest.fn(),
    getMe: jest.fn(),
    updateRole: jest.fn(),
  };
  const mockJwtService = {
    verify: jest.fn(),
  };

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      controllers: [AuthController],
      providers: [
        { provide: AuthService, useValue: mockAuthService },
        { provide: JwtService, useValue: mockJwtService },
      ],
    })
      .overrideGuard(ThrottlerGuard)
      .useValue({ canActivate: () => true })
      .compile();

    controller = module.get<AuthController>(AuthController);
  });

  describe('validate', () => {
    it('returns 200 with no headers when no Authorization header is present', () => {
      const req = { headers: {} } as any;
      const res = makeRes();

      const result = controller.validate(req, res);

      expect(result).toEqual({});
      expect(res.setHeader).not.toHaveBeenCalled();
      expect(res.status).not.toHaveBeenCalled();
    });

    it('sets X-User-* headers for a valid token', () => {
      mockJwtService.verify.mockReturnValue({
        sub: 'user-1', email: 'a@example.com', name: 'A', role: 'MEMBER',
      });
      const req = { headers: { authorization: 'Bearer valid-token' } } as any;
      const res = makeRes();

      const result = controller.validate(req, res);

      expect(result).toEqual({});
      expect(res.setHeader).toHaveBeenCalledWith('X-User-Sub', 'user-1');
      expect(res.setHeader).toHaveBeenCalledWith('X-User-Email', 'a@example.com');
      expect(res.setHeader).toHaveBeenCalledWith('X-User-Name', 'A');
      expect(res.setHeader).toHaveBeenCalledWith('X-User-Role', 'MEMBER');
    });

    it('returns 401 for an expired or invalid token', () => {
      mockJwtService.verify.mockImplementation(() => { throw new Error('jwt expired'); });
      const req = { headers: { authorization: 'Bearer expired-token' } } as any;
      const res = makeRes();

      const result = controller.validate(req, res);

      expect(res.status).toHaveBeenCalledWith(401);
      expect(result).toEqual({ message: 'Invalid or expired token' });
    });
  });

  describe('updateRole', () => {
    it('throws ForbiddenException when the caller is not an ORGANISER', () => {
      const req = { user: { role: 'MEMBER' } } as any;

      expect(() => controller.updateRole(req, 'target-id', { role: 'ORGANISER' }))
        .toThrow(ForbiddenException);
      expect(mockAuthService.updateRole).not.toHaveBeenCalled();
    });

    it('delegates to authService when the caller is an ORGANISER', () => {
      const req = { user: { role: 'ORGANISER', sub: 'organiser-1' } } as any;
      mockAuthService.updateRole.mockResolvedValue({ id: 'target-id', role: 'ORGANISER' });

      controller.updateRole(req, 'target-id', { role: 'ORGANISER' });

      expect(mockAuthService.updateRole).toHaveBeenCalledWith('target-id', { role: 'ORGANISER' }, 'organiser-1');
    });
  });
});
