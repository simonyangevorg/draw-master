import { test, expect } from '@playwright/test';
import { login } from './helpers.js';
import { ORGANISER_EMAIL, ORGANISER_PASSWORD } from './global-setup.js';

// Sprint 1 UX checks: L-09 (brand), B-20 (404, post-login landing, no raw
// enums), B-11 (entry counter) and B-16 (gateway answers JSON).

test('the product is called DrawMaster', async ({ page }) => {
  await page.goto('/');
  await expect(page).toHaveTitle('DrawMaster');
  await expect(page.getByRole('img', { name: 'DrawMaster' }).first()).toBeVisible();
  await expect(page.locator('body')).not.toContainText(/pushers|fptc/i);
});

test('an unknown URL shows a 404 page', async ({ page }) => {
  await page.goto('/this/does/not/exist');
  await expect(page.getByRole('heading', { name: 'Page not found' })).toBeVisible();
});

test('login lands on the dashboard', async ({ page }) => {
  await login(page, ORGANISER_EMAIL, ORGANISER_PASSWORD); // waits for /dashboard
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
});

test('login returns you to the page that asked you to sign in', async ({ page }) => {
  await page.goto('/tournaments');
  await page.waitForURL((url) => url.pathname === '/login');
  await page.getByLabel('Email address').fill(ORGANISER_EMAIL);
  await page.getByLabel('Password').fill(ORGANISER_PASSWORD);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await page.waitForURL((url) => url.pathname === '/tournaments');
});

test('tournament pages show labels, not raw enum values, and an approved/max counter', async ({ page }) => {
  await login(page, ORGANISER_EMAIL, ORGANISER_PASSWORD);
  await page.goto('/tournaments/new');
  await page.getByPlaceholder('e.g. Summer Club Open 2026').fill(`E2E Labels ${Date.now()}`);
  await page.locator('input[name="startDate"]').fill('2027-03-01');
  await page.locator('input[name="endDate"]').fill('2027-03-02');
  await page.getByRole('button', { name: /Continue/ }).click();
  // B-17: unavailable formats aren't offered
  await expect(page.locator('select[name="drawFormat"] option[value="DOUBLE_ELIMINATION"]')).toHaveCount(0);
  await expect(page.locator('select[name="tournamentType"] option[value="MIXED_DOUBLES"]')).toHaveCount(0);
  await page.locator('select[name="surface"]').selectOption('HARD_OUTDOOR');
  await page.getByRole('button', { name: /Continue/ }).click();
  await page.getByRole('button', { name: /Continue/ }).click();
  await page.getByRole('button', { name: /Create Tournament/ }).click();
  await page.waitForURL(/\/tournaments\/[0-9a-f-]+$/);

  const main = page.locator('main');
  await expect(main).toContainText('Singles Men');
  await expect(main).toContainText('Hard (Outdoor)');
  await expect(main).not.toContainText(/SINGLES[ _]MEN|HARD_OUTDOOR|SINGLE_ELIMINATION/);
  await expect(main).toContainText('0/16'); // approved/max, not every row
});

test('the gateway answers JSON for unknown API paths and bad tokens', async ({ request }) => {
  const missing = await request.get('/api/does-not-exist');
  expect(missing.status()).toBe(404);
  expect(await missing.json()).toMatchObject({ statusCode: 404 });

  const forged = await request.get('/api/tournaments/me/participations', {
    headers: { Authorization: 'Bearer not.a.token' },
  });
  expect(forged.status()).toBe(401);
  expect(await forged.json()).toMatchObject({ statusCode: 401 });

  const noSlash = await request.get('/api/tournaments');
  expect(noSlash.status()).toBe(200);
  expect(Array.isArray(await noSlash.json())).toBe(true);
});
