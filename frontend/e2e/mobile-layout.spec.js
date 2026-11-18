import { test, expect } from '@playwright/test';
import { login } from './helpers.js';
import { ORGANISER_EMAIL, ORGANISER_PASSWORD } from './global-setup.js';

// QA-2: at phone width the sidebar used to render full-height and cover every
// logged-in page. The nav must collapse to a short top bar with the page
// content directly below it.
test.use({ viewport: { width: 375, height: 812 } });

for (const path of ['/dashboard', '/tournaments', '/profile']) {
  test(`${path} is usable at 375px: nav is a top bar, content starts below it`, async ({ page }) => {
    await login(page, ORGANISER_EMAIL, ORGANISER_PASSWORD);
    await page.goto(path);

    const sidebar = await page.locator('.sidebar').boundingBox();
    const main = await page.locator('.dash-main').boundingBox();
    expect(sidebar).not.toBeNull();
    expect(main).not.toBeNull();

    expect(sidebar.height).toBeLessThan(100);
    expect(main.y).toBeLessThan(120);
    expect(main.y).toBeGreaterThanOrEqual(sidebar.y + sidebar.height - 1);

    // No horizontal page scroll.
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    expect(overflow).toBeLessThanOrEqual(1);
  });
}
