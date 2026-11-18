import { UnauthorizedException } from '@nestjs/common';
import { JwtGuard } from './jwt.guard';

describe('JwtGuard (auth-service)', () => {
  const verify = jest.fn();
  const guard = new JwtGuard({ verify } as any);
  const ctxFor = (authorization?: string) => {
    const req: any = { headers: authorization ? { authorization } : {} };
    return { req, ctx: { switchToHttp: () => ({ getRequest: () => req }) } as any };
  };

  beforeEach(() => verify.mockReset());

  it('accepts an access token and sets req.user', () => {
    verify.mockReturnValue({ sub: 'u1', role: 'PLAYER' });
    const { req, ctx } = ctxFor('Bearer access');
    expect(guard.canActivate(ctx)).toBe(true);
    expect(req.user.sub).toBe('u1');
  });

  it('rejects a refresh token', () => {
    verify.mockReturnValue({ sub: 'u1', type: 'refresh' });
    expect(() => guard.canActivate(ctxFor('Bearer refresh').ctx)).toThrow(UnauthorizedException);
  });

  it('rejects a missing token', () => {
    expect(() => guard.canActivate(ctxFor().ctx)).toThrow(UnauthorizedException);
  });

  it('rejects an invalid token', () => {
    verify.mockImplementation(() => { throw new Error('bad'); });
    expect(() => guard.canActivate(ctxFor('Bearer x').ctx)).toThrow(UnauthorizedException);
  });
});
