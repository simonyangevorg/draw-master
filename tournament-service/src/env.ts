/** Read a required env var; refuse to start without it (no silent fallbacks). */
export function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value || !value.trim()) {
    throw new Error(`Missing required environment variable ${name}`);
  }
  return value;
}
