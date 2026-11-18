import { requireEnv, requireJwtSecret } from './env';

describe('env', () => {
  const saved = { ...process.env };
  afterEach(() => { process.env = { ...saved }; });

  it('requireEnv throws when the variable is missing or blank', () => {
    delete process.env.SOME_VAR;
    expect(() => requireEnv('SOME_VAR')).toThrow(/SOME_VAR/);
    process.env.SOME_VAR = '   ';
    expect(() => requireEnv('SOME_VAR')).toThrow(/SOME_VAR/);
  });

  it('requireJwtSecret rejects missing, short and published placeholder secrets', () => {
    delete process.env.JWT_SECRET;
    expect(() => requireJwtSecret()).toThrow();
    process.env.JWT_SECRET = 'short';
    expect(() => requireJwtSecret()).toThrow(/32/);
    process.env.JWT_SECRET = 'fptc_super_secret_change_in_prod';
    expect(() => requireJwtSecret()).toThrow(/placeholder/);
    process.env.JWT_SECRET = 'change_me_64_char_random_hex_string';
    expect(() => requireJwtSecret()).toThrow(/placeholder/);
  });

  it('requireJwtSecret accepts a long random secret', () => {
    process.env.JWT_SECRET = 'a'.repeat(64);
    expect(requireJwtSecret()).toBe('a'.repeat(64));
  });
});
