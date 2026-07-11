import { test, expect } from '@playwright/test';
import { registerMember, login, uniqueEmail } from './helpers.js';
import { ORGANISER_EMAIL, ORGANISER_PASSWORD } from './global-setup.js';

async function createTournament(page, overrides = {}) {
  await page.goto('/tournaments/new');

  await page.getByPlaceholder('e.g. FPTC Summer Open 2026').fill(overrides.name);
  await page.locator('input[name="startDate"]').fill('2027-01-01');
  await page.locator('input[name="endDate"]').fill('2027-01-05');
  await page.getByRole('button', { name: /Continue/ }).click();

  await page.locator('select[name="drawFormat"]').selectOption('SINGLE_ELIMINATION');
  await page.locator('input[name="minParticipants"]').fill('2');
  await page.getByRole('button', { name: /Continue/ }).click();

  await page.locator('select[name="setsToWin"]').selectOption('1'); // Best of 1 — one set decides the match
  await page.getByRole('button', { name: /Continue/ }).click();

  if (overrides.requiresApproval) {
    await page.getByText('Require organiser approval for applications').click();
  }
  await page.getByRole('button', { name: /Create Tournament/ }).click();

  await page.waitForURL(/\/tournaments\/[0-9a-f-]+$/);
  return page.url();
}

test('register, login, create tournament, open, enroll, generate draw, record score', async ({ browser }) => {
  const organiserContext = await browser.newContext();
  const organiserPage = await organiserContext.newPage();
  await login(organiserPage, ORGANISER_EMAIL, ORGANISER_PASSWORD);

  const tournamentUrl = await createTournament(organiserPage, { name: `E2E Lifecycle ${Date.now()}` });

  await organiserPage.getByRole('button', { name: 'Open Registration' }).click();
  await expect(organiserPage.getByText('Tournament is now open for registration.')).toBeVisible();

  // Two members register (fresh accounts — exercises the Register+Login flow)
  // and enroll themselves in the now-open tournament.
  const memberContexts = [];
  for (let i = 0; i < 2; i++) {
    const ctx = await browser.newContext();
    const page = await ctx.newPage();
    await registerMember(page, {
      name: `E2E Member ${i}`,
      email: uniqueEmail(`e2e-member-${i}`),
      password: 'CorrectHorse123!',
    });
    await page.goto(tournamentUrl);
    await page.getByRole('button', { name: 'Apply to Tournament' }).click();
    await expect(page.getByText('Application submitted successfully!')).toBeVisible();
    memberContexts.push(ctx);
  }

  await organiserPage.goto(tournamentUrl);
  await organiserPage.getByRole('button', { name: 'Generate Draw' }).click();
  await expect(organiserPage.getByText('Draw generated successfully!')).toBeVisible();

  await organiserPage.getByRole('button', { name: 'Draw', exact: true }).click();
  const scorableCard = organiserPage.locator('.bk-card-scorable').first();
  await expect(scorableCard).toBeVisible();
  await scorableCard.click();

  await organiserPage.locator('.score-input').nth(0).fill('6');
  await organiserPage.locator('.score-input').nth(1).fill('2');
  await organiserPage.getByRole('button', { name: 'Save & Advance Winner' }).click();
  await expect(organiserPage.getByText('Score saved')).toBeVisible();

  for (const ctx of memberContexts) await ctx.close();
  await organiserContext.close();
});
