import { test, expect } from '@playwright/test';
import { registerMember, login, uniqueEmail } from './helpers.js';
import { ORGANISER_EMAIL, ORGANISER_PASSWORD } from './global-setup.js';

// F-08 acceptance: a round robin is played round by round, the table updates,
// and when the last match is in the event finishes with a champion.
test('a 3-player round robin runs to a champion', async ({ browser }) => {
  const orgCtx = await browser.newContext();
  const org = await orgCtx.newPage();
  await login(org, ORGANISER_EMAIL, ORGANISER_PASSWORD);

  await org.goto('/tournaments/new');
  await org.getByPlaceholder('e.g. Summer Club Open 2026').fill(`E2E Round Robin ${Date.now()}`);
  await org.locator('input[name="startDate"]').fill('2027-08-01');
  await org.locator('input[name="endDate"]').fill('2027-08-02');
  await org.getByRole('button', { name: /Continue/ }).click();
  await org.locator('select[name="drawFormat"]').selectOption('ROUND_ROBIN');
  await org.locator('input[name="minParticipants"]').fill('3');
  await org.getByRole('button', { name: /Continue/ }).click();
  await org.locator('select[name="groupPreset"]').selectOption({ label: '1 set to 6' });
  await org.getByRole('button', { name: /Continue/ }).click();
  await org.getByRole('button', { name: /Create Tournament/ }).click();
  await org.waitForURL(/\/tournaments\/[0-9a-f-]+$/);
  const url = org.url();
  await org.getByRole('button', { name: 'Open Registration' }).click();
  await expect(org.getByText('Tournament is now open for registration.')).toBeVisible();

  const players = [];
  for (let i = 0; i < 3; i++) {
    const ctx = await browser.newContext();
    const page = await ctx.newPage();
    await registerMember(page, { name: `E2E RR ${i}`, email: uniqueEmail(`e2e-rr-${i}`), password: 'CorrectHorse123!' });
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

  // 3 players: 3 rounds, one match each (one player sits out).
  await expect(org.locator('.gs-round')).toHaveCount(3);
  for (let i = 0; i < 3; i++) {
    await org.locator('.gs-round .gs-sched-clickable').first().click();
    const dialog = org.getByRole('dialog', { name: 'Enter match score' });
    await expect(dialog).toContainText('One set');
    await dialog.locator('.score-input').nth(0).fill('6');
    await dialog.locator('.score-input').nth(1).fill(String(i)); // 6-0, 6-1, 6-2
    await dialog.getByRole('button', { name: 'Save & Advance Winner' }).click();
    await expect(org.getByText('Score saved')).toBeVisible();
    await org.getByRole('button', { name: 'Draw', exact: true }).click();
  }

  await expect(org.locator('.gs-sched-clickable')).toHaveCount(0);
  await expect(org.locator('.gs-standings-table tbody tr')).toHaveCount(3);
  await expect(org.getByRole('status').filter({ hasText: 'champion' })).toContainText("Men's Singles champion:");

  for (const ctx of players) await ctx.close();
  await orgCtx.close();
});
