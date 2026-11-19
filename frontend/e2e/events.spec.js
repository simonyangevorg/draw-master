import { test, expect } from '@playwright/test';
import { registerMember, login, uniqueEmail } from './helpers.js';
import { ORGANISER_EMAIL, ORGANISER_PASSWORD } from './global-setup.js';

// F-01 acceptance: one tournament runs two events, each with its own entries
// and draw; drawing one leaves the other open for entries.
test('a two-event tournament runs both events', async ({ browser }) => {
  const orgCtx = await browser.newContext();
  const org = await orgCtx.newPage();
  await login(org, ORGANISER_EMAIL, ORGANISER_PASSWORD);

  // Create: Men's Singles (knockout) + Women's Singles (round robin), min 2 each.
  await org.goto('/tournaments/new');
  await org.getByPlaceholder('e.g. Summer Club Open 2026').fill(`E2E Two Events ${Date.now()}`);
  await org.locator('input[name="startDate"]').fill('2027-06-01');
  await org.locator('input[name="endDate"]').fill('2027-06-03');
  await org.getByRole('button', { name: /Continue/ }).click();
  await org.locator('input[name="minParticipants"]').fill('2');
  await org.getByRole('button', { name: '+ Add another event' }).click();
  await expect(org.locator('input[name="eventName"]').nth(1)).toHaveValue("Women's Singles");
  await org.locator('select[name="drawFormat"]').nth(1).selectOption('ROUND_ROBIN');
  await org.locator('input[name="minParticipants"]').nth(1).fill('2');
  await org.getByRole('button', { name: /Continue/ }).click();
  await org.locator('select[name="knockoutPreset"]').first().selectOption({ label: '1 set to 6' });
  await org.getByRole('button', { name: /Continue/ }).click();
  await org.getByRole('button', { name: /Create Tournament/ }).click();
  await org.waitForURL(/\/tournaments\/[0-9a-f-]+$/);
  const url = org.url();
  await expect(org.getByRole('tab', { name: /Men's Singles/ })).toBeVisible();
  await expect(org.getByRole('tab', { name: /Women's Singles/ })).toBeVisible();
  await org.getByRole('button', { name: 'Open Registration' }).click();
  await expect(org.getByText('Tournament is now open for registration.')).toBeVisible();

  // Two players; each enters both events.
  const players = [];
  for (let i = 0; i < 2; i++) {
    const ctx = await browser.newContext();
    const page = await ctx.newPage();
    await registerMember(page, { name: `E2E Both ${i}`, email: uniqueEmail(`e2e-both-${i}`), password: 'CorrectHorse123!' });
    await page.goto(url);
    for (const event of ["Men's Singles", "Women's Singles"]) {
      await page.getByRole('tab', { name: new RegExp(event) }).click();
      await page.getByRole('button', { name: 'Apply to Tournament' }).click();
      await expect(page.getByText('Application submitted successfully!')).toBeVisible();
      await expect(page.getByText(`registered`, { exact: false })).toBeVisible();
    }
    players.push(ctx);
  }

  // Draw the men's event only: the women's event still takes entries.
  await org.goto(url);
  await org.getByRole('tab', { name: /Men's Singles/ }).click();
  await org.getByRole('button', { name: 'Generate Draw', exact: true }).first().click();
  await expect(org.getByRole('alertdialog', { name: 'Confirm draw generation' })).toContainText("Men's Singles draw with 2 approved players");
  await org.getByRole('button', { name: 'Generate draw', exact: true }).click();
  await expect(org.getByText("Draw generated for Men's Singles!")).toBeVisible();
  await expect(org.getByRole('tab', { name: /Men's Singles/ })).toContainText('In play');
  await expect(org.getByRole('tab', { name: /Women's Singles/ })).toContainText('Entries open');

  // Score the men's final.
  await org.getByRole('button', { name: 'Draw', exact: true }).click();
  await org.locator('.bk-card-scorable').first().click();
  await org.locator('.score-input').nth(0).fill('6');
  await org.locator('.score-input').nth(1).fill('3');
  await org.getByRole('button', { name: 'Save & Advance Winner' }).click();
  await expect(org.getByText('Score saved')).toBeVisible();

  // Then draw the women's event (round robin) as well.
  await org.getByRole('tab', { name: /Women's Singles/ }).click();
  await org.getByRole('button', { name: 'Generate Draw', exact: true }).first().click();
  await org.getByRole('button', { name: 'Generate draw', exact: true }).click();
  await expect(org.getByText("Draw generated for Women's Singles!")).toBeVisible();
  await expect(org.getByRole('tab', { name: /Women's Singles/ })).toContainText('In play');

  for (const ctx of players) await ctx.close();
  await orgCtx.close();
});
