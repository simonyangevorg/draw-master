import { test, expect } from '@playwright/test';
import { registerMember, login, uniqueEmail } from './helpers.js';
import { ORGANISER_EMAIL, ORGANISER_PASSWORD } from './global-setup.js';

async function createApprovalRequiredTournament(page, name) {
  await page.goto('/tournaments/new');
  await page.getByPlaceholder('e.g. FPTC Summer Open 2026').fill(name);
  await page.locator('input[name="startDate"]').fill('2027-02-01');
  await page.locator('input[name="endDate"]').fill('2027-02-05');
  await page.getByRole('button', { name: /Continue/ }).click();
  await page.locator('input[name="minParticipants"]').fill('2');
  await page.getByRole('button', { name: /Continue/ }).click();
  await page.getByRole('button', { name: /Continue/ }).click();
  await page.getByText('Require organiser approval for applications').click();
  await page.getByRole('button', { name: /Create Tournament/ }).click();
  await page.waitForURL(/\/tournaments\/[0-9a-f-]+$/);
  return page.url();
}

async function getUserId(page) {
  return page.evaluate(() => JSON.parse(localStorage.getItem('tennis_user')).id);
}

test('organiser approves one participant and rejects another', async ({ browser }) => {
  const organiserContext = await browser.newContext();
  const organiserPage = await organiserContext.newPage();
  await login(organiserPage, ORGANISER_EMAIL, ORGANISER_PASSWORD);

  const tournamentUrl = await createApprovalRequiredTournament(organiserPage, `E2E Approval ${Date.now()}`);
  await organiserPage.getByRole('button', { name: 'Open Registration' }).click();

  const approveCtx = await browser.newContext();
  const approvePage = await approveCtx.newPage();
  await registerMember(approvePage, {
    name: 'E2E To Approve',
    email: uniqueEmail('e2e-approve'),
    password: 'CorrectHorse123!',
  });
  await approvePage.goto(tournamentUrl);
  await approvePage.getByRole('button', { name: 'Apply to Tournament' }).click();
  const approveId = await getUserId(approvePage);

  const rejectCtx = await browser.newContext();
  const rejectPage = await rejectCtx.newPage();
  await registerMember(rejectPage, {
    name: 'E2E To Reject',
    email: uniqueEmail('e2e-reject'),
    password: 'CorrectHorse123!',
  });
  await rejectPage.goto(tournamentUrl);
  await rejectPage.getByRole('button', { name: 'Apply to Tournament' }).click();
  const rejectId = await getUserId(rejectPage);

  await organiserPage.goto(tournamentUrl);
  await organiserPage.getByRole('button', { name: 'Participants', exact: true }).click();
  await expect(organiserPage.getByText('2 pending applications awaiting approval')).toBeVisible();

  const approveRow = organiserPage.locator('tr', { hasText: approveId.slice(0, 8) });
  const rejectRow = organiserPage.locator('tr', { hasText: rejectId.slice(0, 8) });

  await approveRow.getByRole('button', { name: 'Approve' }).click();
  await expect(organiserPage.getByText('Participant approved.')).toBeVisible();

  await rejectRow.getByRole('button', { name: 'Reject' }).click();
  await expect(organiserPage.getByText('Participant rejected.')).toBeVisible();

  await expect(approveRow.getByText('APPROVED')).toBeVisible();
  await expect(rejectRow.getByText('REJECTED')).toBeVisible();

  await approveCtx.close();
  await rejectCtx.close();
  await organiserContext.close();
});
