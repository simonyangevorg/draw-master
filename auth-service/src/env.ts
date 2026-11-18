/** Read a required env var; refuse to start without it (no silent fallbacks). */
export function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value || !value.trim()) {
    throw new Error(`Missing required environment variable ${name}`);
  }
  return value;
}

// Values that have been published in this repo and must never sign tokens.
const KNOWN_PUBLIC_SECRETS = new Set([
  'fptc_super_secret_change_in_prod',
  'change_me_64_char_random_hex_string',
]);

/**
 * JWT_SECRET must be present, at least 32 characters, and not one of the
 * defaults/placeholders that appear in this repository.
 */
export function requireJwtSecret(): string {
  const secret = requireEnv('JWT_SECRET');
  if (KNOWN_PUBLIC_SECRETS.has(secret)) {
    throw new Error('JWT_SECRET is set to a published placeholder value; generate a real one (openssl rand -hex 64)');
  }
  if (secret.length < 32) {
    throw new Error('JWT_SECRET must be at least 32 characters long');
  }
  return secret;
}

/**
 * Login attempts allowed per client per minute. Defaults to 5. CI/E2E raise it
 * because the whole suite logs in from one machine within a minute.
 */
export const LOGIN_THROTTLE_LIMIT = (() => {
  const n = Number(process.env.LOGIN_THROTTLE_LIMIT);
  return Number.isInteger(n) && n > 0 ? n : 5;
})();
