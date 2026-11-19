import { validate } from 'class-validator';
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
  it('accepts MEMBER and GUEST roles', async () => {
    for (const role of ['MEMBER', 'GUEST']) {
      const errors = await validate(makeDto({ role }));
      expect(errors).toHaveLength(0);
    }
  });

  it('accepts an omitted role', async () => {
    const errors = await validate(makeDto());
    expect(errors).toHaveLength(0);
  });

  it('rejects ORGANISER at registration', async () => {
    const errors = await validate(makeDto({ role: 'ORGANISER' }));
    expect(errors.some((e) => e.property === 'role')).toBe(true);
  });

  it('rejects an unknown role', async () => {
    const errors = await validate(makeDto({ role: 'ADMIN' }));
    expect(errors.some((e) => e.property === 'role')).toBe(true);
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
