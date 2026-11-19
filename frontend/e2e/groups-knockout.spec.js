import { test, expect } from '@playwright/test';
import { registerMember, login, uniqueEmail } from './helpers.js';
import { ORGANISER_EMAIL, ORGANISER_PASSWORD } from './global-setup.js';

// F-09 acceptance: the groups finish, their qualifiers appear in the knockout
// by themselves, and the knockout runs to a champion. All through the UI.
test('groups fill the knockout, which runs to a champion', async ({ browser }) => {
  test.setTimeout(90_000);
  const orgCtx = await browser.newContext();
  const org = await orgCtx.newPage();
  await login(org, ORGANISER_EMAIL, ORGANISER_PASSWORD);

  await org.goto('/tournaments/new');
  await org.getByPlaceholder('e.g. Summer Club Open 2026').fill(`E2E Groups ${Date.now()}`);
  await org.locator('input[name="startDate"]').fill('2027-09-01');
  await org.locator('input[name="endDate"]').fill('2027-09-03');
  await org.getByRole('button', { name: /Continue/ }).click();
  await org.locator('select[name="drawFormat"]').selectOption('GROUP_STAGE_KNOCKOUT');
  await org.locator('select[name="numberOfGroups"]').selectOption('2');
  await org.locator('select[name="advancePerGroup"]').selectOption('2');
  await org.locator('input[name="minParticipants"]').fill('6');
  await org.getByRole('button', { name: /Continue/ }).click();
  await org.locator('select[name="groupPreset"]').selectOption({ label: '1 set to 6' });
  await org.locator('select[name="knockoutPreset"]').selectOption({ label: '1 set to 6' });
  await org.getByRole('button', { name: /Continue/ }).click();
  await org.getByRole('button', { name: /Create Tournament/ }).click();
  await org.waitForURL(/\/tournaments\/[0-9a-f-]+$/);
  const url = org.url();
  await org.getByRole('button', { name: 'Open Registration' }).click();
  await expect(org.getByText('Tournament is now open for registration.')).toBeVisible();

  const players = [];
  for (let i = 0; i < 6; i++) {
    const ctx = await browser.newContext();
    const page = await ctx.newPage();
    await registerMember(page, { name: `E2E Group ${i}`, email: uniqueEmail(`e2e-grp-${i}`), password: 'CorrectHorse123!' });
    await page.goto(url);
    await page.getByRole('button', { name: 'Apply to Tournament' }).click();
    await expect(page.getByText('Application submitted successfully!')).toBeVisible();
    players.push(ctx);
  }

  await org.goto(url);
  await org.getByRole('button', { name: 'Generate Draw', exact: true }).first().click();
  await org.getByRole('button', { name: 'Generate draw', exact: true }).click();
  await expect(org.getByText(/Draw generated for /)).toBeVisible();
  await org.getByRole('button', { name: 'Draw', exact: true }).click();
  await expect(org.getByText('Group A: 0 of 3 matches played')).toBeVisible();

  const scoreFirst = async (selector, n) => {
    for (let i = 0; i < n; i++) {
      await org.locator(selector).first().click();
      const dialog = org.getByRole('dialog', { name: 'Enter match score' });
      await dialog.locator('.score-input').nth(0).fill('6');
      await dialog.locator('.score-input').nth(1).fill('2');
      await dialog.getByRole('button', { name: 'Save & Advance Winner' }).click();
      await expect(org.getByText('Score saved')).toBeVisible();
      await org.getByRole('button', { name: 'Draw', exact: true }).click();
    }
  };

  // Six group matches: then both groups say who qualified, and the knockout is filled.
  await scoreFirst('.gs-sched-clickable', 6);
  await expect(org.getByText(/Group A complete/)).toBeVisible();
  await expect(org.getByText(/Group B complete/)).toBeVisible();
  await expect(org.locator('.bk-card-scorable')).toHaveCount(2);

  // Two semi-finals and the final.
  await scoreFirst('.bk-card-scorable', 3);
  await expect(org.getByRole('status').filter({ hasText: 'champion' })).toContainText("Men's Singles champion:");

  for (const ctx of players) await ctx.close();
  await orgCtx.close();
});
