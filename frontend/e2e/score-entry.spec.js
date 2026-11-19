import { test, expect } from '@playwright/test';
import { registerMember, login, uniqueEmail } from './helpers.js';
import { ORGANISER_EMAIL, ORGANISER_PASSWORD } from './global-setup.js';

// F-06: the score dialog applies the match rules live, and records a retirement.
test('impossible scores are refused; a retirement is recorded as "ret."', async ({ browser }) => {
  const orgCtx = await browser.newContext();
  const org = await orgCtx.newPage();
  await login(org, ORGANISER_EMAIL, ORGANISER_PASSWORD);

  await org.goto('/tournaments/new');
  await org.getByPlaceholder('e.g. Summer Club Open 2026').fill(`E2E Scores ${Date.now()}`);
  await org.locator('input[name="startDate"]').fill('2027-07-01');
  await org.locator('input[name="endDate"]').fill('2027-07-02');
  await org.getByRole('button', { name: /Continue/ }).click();
  await org.locator('input[name="minParticipants"]').fill('2');
  await org.getByRole('button', { name: /Continue/ }).click();
  await org.locator('select[name="knockoutPreset"]').selectOption({ label: 'Best of 3, match tiebreak to 10' });
  await org.getByRole('button', { name: /Continue/ }).click();
  await org.getByRole('button', { name: /Create Tournament/ }).click();
  await org.waitForURL(/\/tournaments\/[0-9a-f-]+$/);
  const url = org.url();
  await org.getByRole('button', { name: 'Open Registration' }).click();
  await expect(org.getByText('Tournament is now open for registration.')).toBeVisible();

  const players = [];
  for (let i = 0; i < 2; i++) {
    const ctx = await browser.newContext();
    const page = await ctx.newPage();
    await registerMember(page, { name: `E2E Scorer ${i}`, email: uniqueEmail(`e2e-scorer-${i}`), password: 'CorrectHorse123!' });
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
  await org.locator('.bk-card-scorable').first().click();

  const dialog = org.getByRole('dialog', { name: 'Enter match score' });
  await expect(dialog).toContainText('match tiebreak to 10');
  const save = dialog.getByRole('button', { name: 'Save & Advance Winner' });

  // 6-5 can't end a set: refused before anything is sent.
  await dialog.locator('.score-input').nth(0).fill('6');
  await dialog.locator('.score-input').nth(1).fill('5');
  await expect(dialog.getByRole('alert')).toContainText("isn't a finished set");
  await expect(save).toBeDisabled();

  // Player 1 leads 6-3, 2-1 and retires: the other player wins.
  await dialog.locator('.score-input').nth(1).fill('3');
  await dialog.getByRole('radio', { name: 'Retired' }).click();
  await dialog.locator('.score-input').nth(2).fill('2');
  await dialog.locator('.score-input').nth(3).fill('1');
  await dialog.locator('.score-winner-btn').nth(1).click();
  await expect(dialog.locator('.score-preview')).toHaveText('6-3 2-1 ret.');
  await save.click();
  await expect(org.getByText('Score saved')).toBeVisible();
  await expect(org.locator('.bk-card-done').first()).toContainText('6-3 2-1 ret.');

  for (const ctx of players) await ctx.close();
  await orgCtx.close();
});
