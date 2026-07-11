import { execSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '../..');
const BASE_URL = process.env.E2E_BASE_URL || 'http://localhost';

export const ORGANISER_EMAIL = 'e2e-organiser@example.com';
export const ORGANISER_PASSWORD = 'CorrectHorse123!';

// There is no self-service way to become an ORGANISER (see TICKET-004) —
// the first organiser account in any environment has to be bootstrapped
// directly against the database. This mirrors that real bootstrap step
// so the E2E suite has an organiser account to drive the organiser-only
// flows (create tournament, open registration, approve/reject, generate
// draw, record scores).
export default async function globalSetup() {
  await fetch(`${BASE_URL}/api/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      email: ORGANISER_EMAIL,
      password: ORGANISER_PASSWORD,
      name: 'E2E Organiser',
    }),
  }).catch(() => {});

  execSync(
    `docker compose exec -T postgres psql -U tennis -d auth -c "UPDATE users SET role='ORGANISER' WHERE email='${ORGANISER_EMAIL}';"`,
    { cwd: REPO_ROOT, stdio: 'inherit' },
  );
}
