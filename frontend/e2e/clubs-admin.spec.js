import { test, expect } from '@playwright/test';
import { login, registerMember, uniqueEmail } from './helpers.js';
import { SUPERADMIN_EMAIL, SUPERADMIN_PASSWORD } from './global-setup.js';

// L-03 acceptance: the super-admin opens a club and appoints an admin, and
// that admin can then create tournaments for the club.
test('super-admin opens a club, appoints an admin, and the admin can create tournaments', async ({ browser }) => {
  const clubName = `E2E Club ${Date.now()}`;

  // A player signs up: no "New Tournament" for them.
  const adminCtx = await browser.newContext();
  const adminPage = await adminCtx.newPage();
  const adminEmail = uniqueEmail('e2e-new-admin');
  await registerMember(adminPage, { name: 'New Club Admin', email: adminEmail, password: 'CorrectHorse123!' });
  await expect(adminPage.getByRole('link', { name: /New Tournament/ })).toHaveCount(0);

  // The super-admin opens the club and appoints them.
  const superCtx = await browser.newContext();
  const superPage = await superCtx.newPage();
  await login(superPage, SUPERADMIN_EMAIL, SUPERADMIN_PASSWORD);
  await superPage.getByRole('link', { name: /Manage clubs/ }).click();
  await superPage.getByLabel('Club name *').fill(clubName);
  await superPage.getByLabel('City').fill('Testville');
  await superPage.getByRole('button', { name: 'Open club' }).click();
  await superPage.waitForURL(/\/admin\/clubs\/[0-9a-f-]+$/);
  await expect(superPage.getByText('No admins yet')).toBeVisible();
  await superPage.getByLabel('Appoint an admin').fill(adminEmail);
  await superPage.getByRole('button', { name: 'Make admin' }).click();
  await expect(superPage.getByText('Admin appointed')).toBeVisible();
  await expect(superPage.getByText(adminEmail)).toBeVisible();

  // Their next session picks up the seat (here: the reload refreshes it).
  await adminPage.reload();
  await expect(adminPage.getByRole('link', { name: /New Tournament/ }).first()).toBeVisible();
  await adminPage.goto('/tournaments/new');
  await expect(adminPage.locator('select[name="clubId"]')).toHaveValue(/.+/); // their one club is preselected
  await expect(adminPage.locator('select[name="clubId"] option:checked')).toHaveText(clubName);

  // The new club is in the public directory.
  await adminPage.goto('/clubs');
  await expect(adminPage.getByText(clubName)).toBeVisible();

  await adminCtx.close();
  await superCtx.close();
});

test('only the super-admin can open the club admin pages', async ({ page }) => {
  await registerMember(page, { name: 'Curious Player', email: uniqueEmail('e2e-curious'), password: 'CorrectHorse123!' });
  await page.goto('/admin/clubs');
  await expect(page.getByRole('heading', { name: 'Page not found' })).toBeVisible();
  await expect(page.getByRole('link', { name: /Manage clubs/ })).toHaveCount(0);
});
