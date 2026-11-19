import { UnauthorizedException, ValidationPipe, BadRequestException } from '@nestjs/common';
import { JwtGuard } from './jwt.guard';
import { UpdateTournamentDto } from '../tournaments/dto/update-tournament.dto';

const ctxFor = (req: any) => ({ switchToHttp: () => ({ getRequest: () => req }) }) as any;

describe('JwtGuard (gateway headers)', () => {
  const guard = new JwtGuard();

  it('builds req.user from the X-User-* headers', () => {
    const req: any = { headers: { 'x-user-sub': 'u1', 'x-user-role': 'PLAYER', 'x-user-name': 'Hannah', 'x-user-clubs': 'c1:A,c2:M,bad,c3:Z' } };
    expect(guard.canActivate(ctxFor(req))).toBe(true);
    expect(req.user).toEqual(expect.objectContaining({
      sub: 'u1', role: 'PLAYER', name: 'Hannah',
      clubs: [{ id: 'c1', role: 'ADMIN' }, { id: 'c2', role: 'MEMBER' }],
    }));
  });

  it('rejects a request without X-User-Sub, even with a bearer token', () => {
    const req: any = { headers: { authorization: 'Bearer anything' } };
    expect(() => guard.canActivate(ctxFor(req))).toThrow(UnauthorizedException);
  });
});

describe('PATCH /tournaments/:id body validation', () => {
  const pipe = new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true });
  const validate = (body: any) =>
    pipe.transform(body, { type: 'body', metatype: UpdateTournamentDto });

  it.each([
    [{ status: 'BANANA' }],
    [{ status: 'COMPLETED' }],
    [{ createdBy: 'someone-else' }],
    [{ organiserId: 'someone-else' }],
    [{ visibility: 'SECRET' }],
    [{ clubId: 'other-club' }],
    [{ id: 'x' }],
    [{ startDate: 'not-a-date' }],
    [{ drawFormat: 'NONSENSE' }],
  ])('rejects %j with 400', async (body) => {
    await expect(validate(body)).rejects.toThrow(BadRequestException);
  });

  it('accepts a legitimate descriptive change', async () => {
    await expect(validate({ name: 'Autumn Open', venue: 'Court 1' })).resolves.toEqual(
      expect.objectContaining({ name: 'Autumn Open' }),
    );
  });
});
