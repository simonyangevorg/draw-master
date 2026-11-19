const BASE_URL = process.env.E2E_BASE_URL || 'http://localhost';

export const ORGANISER_EMAIL = 'e2e-organiser@example.com';
export const ORGANISER_PASSWORD = 'CorrectHorse123!';
export const E2E_CLUB_NAME = 'E2E Club';

// The super-admin is bootstrapped by auth-service from SUPERADMIN_EMAIL /
// SUPERADMIN_INITIAL_PASSWORD (set for the stack in CI and local E2E runs).
// The suite then changes that initial password, as the real first sign-in
// must, to SUPERADMIN_PASSWORD.
export const SUPERADMIN_EMAIL = process.env.SUPERADMIN_EMAIL || 'e2e-superadmin@example.com';
const SUPERADMIN_INITIAL_PASSWORD = process.env.SUPERADMIN_INITIAL_PASSWORD || 'E2E-initial-password-1';
export const SUPERADMIN_PASSWORD = 'E2E-superadmin-password-2';

async function call(path, { token, ...init } = {}) {
  const res = await fetch(`${BASE_URL}${path}`, {
    ...init,
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
  });
  const body = await res.json().catch(() => ({}));
  return { status: res.status, ok: res.ok, body };
}

const post = (path, data, token) => call(path, { method: 'POST', body: JSON.stringify(data), token });

/** Sign the super-admin in, replacing the bootstrap password on the first run. */
async function superAdminToken() {
  let res = await post('/api/auth/login', { email: SUPERADMIN_EMAIL, password: SUPERADMIN_PASSWORD });
  if (res.ok) return res.body.token;
  res = await post('/api/auth/login', { email: SUPERADMIN_EMAIL, password: SUPERADMIN_INITIAL_PASSWORD });
  if (!res.ok) throw new Error(`E2E setup: the super-admin can't sign in (${res.status}). Is SUPERADMIN_EMAIL set for the stack?`);
  const changed = await post('/api/auth/password', { currentPassword: SUPERADMIN_INITIAL_PASSWORD, newPassword: SUPERADMIN_PASSWORD }, res.body.token);
  if (!changed.ok) throw new Error(`E2E setup: could not change the super-admin password (${changed.status})`);
  return changed.body.token;
}

// There is no self-service way to run tournaments: the super-admin opens a
// club and appoints its admins (L-02/L-03). This does exactly that, through
// the real API, so the suite has a club admin to drive the organiser flows
// (create tournament, open registration, approve/reject, draw, scores).
export default async function globalSetup() {
  await post('/api/auth/register', { email: ORGANISER_EMAIL, password: ORGANISER_PASSWORD, name: 'E2E Organiser' });
  const token = await superAdminToken();

  const clubs = (await call('/api/auth/admin/clubs', { token })).body;
  let club = Array.isArray(clubs) ? clubs.find((c) => c.name === E2E_CLUB_NAME) : null;
  if (!club) {
    const created = await post('/api/auth/admin/clubs', { name: E2E_CLUB_NAME, city: 'Testville' }, token);
    if (!created.ok) throw new Error(`E2E setup: could not create the club (${created.status})`);
    club = created.body;
  }

  const users = (await call(`/api/auth/admin/users?search=${encodeURIComponent(ORGANISER_EMAIL)}`, { token })).body;
  const organiser = users.find((u) => u.email === ORGANISER_EMAIL);
  const appointed = await post(`/api/auth/admin/clubs/${club.id}/admins`, { userId: organiser.id }, token);
  if (!appointed.ok && appointed.status !== 409) {
    throw new Error(`E2E setup: could not appoint the organiser (${appointed.status})`);
  }
}
