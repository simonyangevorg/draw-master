import { validate } from 'class-validator';
import { ValidationPipe } from '@nestjs/common';
import { plainToInstance } from 'class-transformer';
import { RegisterDto } from './register.dto';

function makeDto(overrides: Record<string, unknown> = {}) {
  return plainToInstance(RegisterDto, {
    email: 'user@example.com',
    name: 'User Name',
    password: 'password123',
    ...overrides,
  });
}

describe('RegisterDto', () => {
  it('accepts a normal sign-up', async () => {
    expect(await validate(makeDto())).toHaveLength(0);
  });

  // L-02: nobody picks a role or club at sign-up; an old client still sending them gets them stripped.
  it('drops role and clubId sent by an old client', async () => {
    const pipe = new ValidationPipe({ whitelist: true });
    const out = await pipe.transform(
      { email: 'a@b.com', name: 'Al', password: 'password123', role: 'SUPER_ADMIN', clubId: 'x' },
      { type: 'body', metatype: RegisterDto },
    );
    expect(out).not.toHaveProperty('role');
    expect(out).not.toHaveProperty('clubId');
  });
});

describe('RegisterDto normalisation (B-12, B-14)', () => {
  it('trims and lower-cases the email', () => {
    expect(makeDto({ email: '  Luca.Bianchi@Example.COM ' }).email).toBe('luca.bianchi@example.com');
  });

  it('rejects a whitespace-only name', async () => {
    const errors = await validate(makeDto({ name: '     ' }));
    expect(errors.some((e) => e.property === 'name')).toBe(true);
  });

  it('rejects a 5000-character name', async () => {
    const errors = await validate(makeDto({ name: 'x'.repeat(5000) }));
    expect(errors.some((e) => e.property === 'name')).toBe(true);
  });
});
