import { test, expect } from '@playwright/test';
import { uniqueEmail } from './helpers.js';
import { E2E_CLUB_NAME, ORGANISER_EMAIL, ORGANISER_PASSWORD } from './global-setup.js';

// API-level probes for the holes found in the 2026-11 QA pass (QA-33, QA-20).
// Every request here goes through the real gateway, exactly as an attacker's
// would. They must keep failing: a 2xx on any of them is a security regression.

const PASSWORD = 'Court2026!secure';
const FAKE_ID = '00000000-0000-4000-8000-000000000000';

async function signUp(request, name) {
  // Register returns tokens directly. (Logging in separately would trip the
  // 5-per-minute login throttle when several probes run back to back.)
  const email = uniqueEmail('e2e-probe');
  const res = await request.post('/api/auth/register', { data: { email, password: PASSWORD, name } });
  expect(res.ok()).toBeTruthy();
  const body = await res.json();
  return { id: body.user.id, token: body.token, refreshToken: body.refreshToken };
}

const bearer = (token) => ({ Authorization: `Bearer ${token}` });

async function e2eClubId(request) {
  const clubs = await (await request.get('/api/auth/clubs')).json();
  return clubs.find((c) => c.name === E2E_CLUB_NAME).id;
}

const TOURNAMENT = {
  startDate: '2027-05-01', endDate: '2027-05-02',
  tournamentType: 'SINGLES_MEN', drawFormat: 'SINGLE_ELIMINATION', surface: 'CLAY',
};

test.describe('anonymous callers cannot write', () => {
  // player-service is retired (L-18): its routes are gone from the gateway.
  test('the retired player-service routes are not reachable', async ({ request }) => {
    const created = await request.post('/api/players/', { data: { name: 'Forged' } });
    expect([401, 403, 404]).toContain(created.status());
    const patched = await request.patch(`/api/players/${FAKE_ID}`, { data: { name: 'x' } });
    expect([401, 403, 404]).toContain(patched.status());
    const deleted = await request.delete(`/api/players/${FAKE_ID}`);
    expect([401, 403, 404]).toContain(deleted.status());
  });

  test('stats cannot be forged from outside', async ({ request }) => {
    const res = await request.post('/api/stats/results', {
      data: { matchId: 'forged', player1Id: 'a', player2Id: 'b', winnerId: 'a', sets: [{ p1: 6, p2: 0 }] },
    });
    expect(res.status()).toBe(403);
    const seeds = await request.post('/api/stats/seedings', { data: { playerIds: ['a'] } });
    expect(seeds.status()).toBe(403);
  });

  test('notifications cannot be injected from outside', async ({ request }) => {
    const res = await request.post('/api/notifications/notify', {
      data: { recipientId: FAKE_ID, channel: 'in-app', subject: 'Phish', body: 'click here' },
    });
    expect(res.status()).toBe(403);
  });

  test('notifications cannot be read anonymously', async ({ request }) => {
    const res = await request.get(`/api/notifications/${FAKE_ID}`);
    expect(res.status()).toBe(401);
  });

  test('tournaments cannot be created anonymously', async ({ request }) => {
    const res = await request.post('/api/tournaments/', { data: { name: 'x' } });
    expect(res.status()).toBe(401);
  });
});

test.describe('logged-in callers stay inside their own data', () => {
  test("a user cannot read another user's notifications", async ({ request }) => {
    const alice = await signUp(request, 'Probe Alice');
    const bob = await signUp(request, 'Probe Bob');

    const own = await request.get(`/api/notifications/${alice.id}`, { headers: bearer(alice.token) });
    expect(own.status()).toBe(200);
    const mine = await request.get('/api/notifications/me', { headers: bearer(alice.token) });
    expect(mine.status()).toBe(200);

    const other = await request.get(`/api/notifications/${bob.id}`, { headers: bearer(alice.token) });
    expect(other.status()).toBe(403);
  });

  test('a player cannot create a tournament', async ({ request }) => {
    const player = await signUp(request, 'Probe Player');
    const res = await request.post('/api/tournaments/', {
      headers: bearer(player.token),
      data: { ...TOURNAMENT, name: 'Player-made', clubId: await e2eClubId(request) },
    });
    expect(res.status()).toBe(403);
  });

  // L-06: club seats come only from the signed token, never from the client.
  test('a forged X-User-Clubs header does not make a player a club admin', async ({ request }) => {
    const player = await signUp(request, 'Probe Forger');
    const clubId = await e2eClubId(request);
    const res = await request.post('/api/tournaments/', {
      headers: { ...bearer(player.token), 'X-User-Clubs': `${clubId}:A`, 'X-User-Role': 'SUPER_ADMIN' },
      data: { ...TOURNAMENT, name: 'Forged admin', clubId },
    });
    expect(res.status()).toBe(403);
  });

  test("a non-member can't see a club-only tournament, or manage it", async ({ request }) => {
    const org = await (await request.post('/api/auth/login', { data: { email: ORGANISER_EMAIL, password: ORGANISER_PASSWORD } })).json();
    const created = await request.post('/api/tournaments/', {
      headers: bearer(org.token),
      data: { ...TOURNAMENT, name: `Members only ${Date.now()}`, clubId: await e2eClubId(request), visibility: 'CLUB' },
    });
    expect(created.status()).toBe(201);
    const t = await created.json();
    await request.post(`/api/tournaments/${t.id}/open`, { headers: bearer(org.token) });

    const outsider = await signUp(request, 'Probe Outsider');
    expect((await request.get(`/api/tournaments/${t.id}`, { headers: bearer(outsider.token) })).status()).toBe(404);
    expect((await request.get(`/api/tournaments/${t.id}`)).status()).toBe(404);
    const list = await (await request.get('/api/tournaments/', { headers: bearer(outsider.token) })).json();
    expect(list.some((x) => x.id === t.id)).toBe(false);
    const entry = await request.post(`/api/tournaments/${t.id}/participants`, {
      headers: bearer(outsider.token), data: { playerId: outsider.id },
    });
    expect(entry.status()).toBe(403);
    const draw = await request.post(`/api/tournaments/${t.id}/draw`, { headers: bearer(outsider.token) });
    expect(draw.status()).toBe(403);
  });

  test('a refresh token is not accepted as an access token', async ({ request }) => {
    const user = await signUp(request, 'Probe Refresh');
    const me = await request.get('/api/auth/me', { headers: bearer(user.refreshToken) });
    expect(me.status()).toBe(401);
    const parts = await request.get('/api/tournaments/me/participations', { headers: bearer(user.refreshToken) });
    expect(parts.status()).toBe(401);
  });

  test('client-supplied identity headers are ignored', async ({ request }) => {
    const res = await request.get('/api/tournaments/me/participations', {
      headers: { 'X-User-Sub': FAKE_ID, 'X-User-Role': 'ORGANISER' },
    });
    expect(res.status()).toBe(401);
  });
});
