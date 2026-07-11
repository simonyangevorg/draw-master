import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { JwtService } from '@nestjs/jwt';
import { ConflictException, UnauthorizedException, NotFoundException } from '@nestjs/common';
import * as bcrypt from 'bcryptjs';
import { AuthService } from './auth.service';
import { UserEntity } from './entities/user.entity';

function makeUser(overrides: Partial<UserEntity> = {}): UserEntity {
  return {
    id: 'user-1',
    email: 'existing@example.com',
    name: 'Existing User',
    passwordHash: 'hashed-password',
    role: 'MEMBER',
    clubId: null,
    createdAt: new Date(),
    ...overrides,
  } as UserEntity;
}

describe('AuthService', () => {
  let service: AuthService;

  const mockUsersRepo = {
    findOne: jest.fn(),
    create: jest.fn(),
    save: jest.fn(),
  };
  const mockJwtService = {
    sign: jest.fn(),
    verify: jest.fn(),
  };

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthService,
        { provide: getRepositoryToken(UserEntity), useValue: mockUsersRepo },
        { provide: JwtService, useValue: mockJwtService },
      ],
    }).compile();

    service = module.get<AuthService>(AuthService);
  });

  describe('register', () => {
    it('throws ConflictException when email is already registered', async () => {
      mockUsersRepo.findOne.mockResolvedValue(makeUser());

      await expect(
        service.register({ email: 'existing@example.com', name: 'New', password: 'password123' }),
      ).rejects.toThrow(ConflictException);
    });

    it('defaults role to MEMBER when none is given', async () => {
      mockUsersRepo.findOne.mockResolvedValue(null);
      mockUsersRepo.create.mockImplementation((data) => data);
      mockUsersRepo.save.mockImplementation(async (u) => u);
      mockJwtService.sign.mockReturnValue('signed-token');

      const result = await service.register({ email: 'new@example.com', name: 'New User', password: 'password123' });

      expect(mockUsersRepo.create).toHaveBeenCalledWith(expect.objectContaining({ role: 'MEMBER' }));
      expect(result.user.email).toBe('new@example.com');
    });

    it('never returns the password hash', async () => {
      mockUsersRepo.findOne.mockResolvedValue(null);
      mockUsersRepo.create.mockImplementation((data) => data);
      mockUsersRepo.save.mockImplementation(async (u) => u);
      mockJwtService.sign.mockReturnValue('signed-token');

      const result = await service.register({ email: 'new@example.com', name: 'New User', password: 'password123' });

      expect(result.user).not.toHaveProperty('passwordHash');
    });
  });

  describe('login', () => {
    it('throws UnauthorizedException for an unknown user', async () => {
      mockUsersRepo.findOne.mockResolvedValue(null);

      await expect(
        service.login({ email: 'nobody@example.com', password: 'whatever' }),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('throws UnauthorizedException for a wrong password', async () => {
      const hash = await bcrypt.hash('correct-password', 10);
      mockUsersRepo.findOne.mockResolvedValue(makeUser({ passwordHash: hash }));

      await expect(
        service.login({ email: 'existing@example.com', password: 'wrong-password' }),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('returns a token and sanitized user on correct credentials', async () => {
      const hash = await bcrypt.hash('correct-password', 10);
      mockUsersRepo.findOne.mockResolvedValue(makeUser({ passwordHash: hash }));
      mockJwtService.sign.mockReturnValue('signed-token');

      const result = await service.login({ email: 'existing@example.com', password: 'correct-password' });

      expect(result.token).toBe('signed-token');
      expect(result.user).not.toHaveProperty('passwordHash');
    });
  });

  describe('refresh', () => {
    it('throws UnauthorizedException when the token is not a refresh token', async () => {
      mockJwtService.verify.mockReturnValue({ sub: 'user-1', type: undefined });

      await expect(service.refresh({ refreshToken: 'access-token' })).rejects.toThrow(UnauthorizedException);
    });

    it('throws UnauthorizedException when verification fails', async () => {
      mockJwtService.verify.mockImplementation(() => { throw new Error('expired'); });

      await expect(service.refresh({ refreshToken: 'bad-token' })).rejects.toThrow(UnauthorizedException);
    });

    it('issues a new token pair for a valid refresh token', async () => {
      mockJwtService.verify.mockReturnValue({ sub: 'user-1', type: 'refresh' });
      mockUsersRepo.findOne.mockResolvedValue(makeUser());
      mockJwtService.sign.mockReturnValue('new-token');

      const result = await service.refresh({ refreshToken: 'valid-refresh-token' });

      expect(result.token).toBe('new-token');
    });
  });

  describe('getMe', () => {
    it('throws NotFoundException when the user no longer exists', async () => {
      mockUsersRepo.findOne.mockResolvedValue(null);

      await expect(service.getMe('missing-user')).rejects.toThrow(NotFoundException);
    });
  });
});
