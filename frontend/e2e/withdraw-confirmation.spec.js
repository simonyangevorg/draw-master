import { test, expect } from '@playwright/test';
import { registerMember, login, uniqueEmail } from './helpers.js';
import { ORGANISER_EMAIL, ORGANISER_PASSWORD } from './global-setup.js';

test('withdrawing uses an inline confirmation, not a native dialog', async ({ browser }) => {
  const organiserContext = await browser.newContext();
  const organiserPage = await organiserContext.newPage();
  await login(organiserPage, ORGANISER_EMAIL, ORGANISER_PASSWORD);

  await organiserPage.goto('/tournaments/new');
  await organiserPage.getByPlaceholder('e.g. FPTC Summer Open 2026').fill(`E2E Withdraw ${Date.now()}`);
  await organiserPage.locator('input[name="startDate"]').fill('2027-04-01');
  await organiserPage.locator('input[name="endDate"]').fill('2027-04-05');
  await organiserPage.getByRole('button', { name: /Continue/ }).click();
  await organiserPage.locator('input[name="minParticipants"]').fill('2');
  await organiserPage.getByRole('button', { name: /Continue/ }).click();
  await organiserPage.getByRole('button', { name: /Continue/ }).click();
  await organiserPage.getByRole('button', { name: /Create Tournament/ }).click();
  await organiserPage.waitForURL(/\/tournaments\/[0-9a-f-]+$/);
  const tournamentUrl = organiserPage.url();
  await organiserPage.getByRole('button', { name: 'Open Registration' }).click();

  const memberCtx = await browser.newContext();
  const memberPage = await memberCtx.newPage();
  // A native confirm()/alert() call would hang the test waiting for a
  // response, since no dialog handler is registered here — that itself
  // proves the flow no longer calls window.confirm().
  await registerMember(memberPage, {
    name: 'E2E Withdraw Member',
    email: uniqueEmail('e2e-withdraw'),
    password: 'CorrectHorse123!',
  });
  await memberPage.goto(tournamentUrl);
  await memberPage.getByRole('button', { name: 'Apply to Tournament' }).click();
  await expect(memberPage.getByText('Application submitted successfully!')).toBeVisible();

  await memberPage.getByRole('button', { name: 'Withdraw' }).click();
  await expect(memberPage.getByText('Withdraw this participant? This cannot be undone.')).toBeVisible();

  // Cancel first — should dismiss without withdrawing.
  await memberPage.getByRole('button', { name: 'Cancel' }).click();
  await expect(memberPage.getByText('Withdraw this participant?')).toHaveCount(0);
  await expect(memberPage.getByRole('button', { name: 'Withdraw' })).toBeVisible();

  // Now actually confirm.
  await memberPage.getByRole('button', { name: 'Withdraw' }).click();
  await memberPage.getByRole('button', { name: 'Confirm Withdraw' }).click();
  await expect(memberPage.getByText('Participant withdrawn.')).toBeVisible();

  await memberCtx.close();
  await organiserContext.close();
});
