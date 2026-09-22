import { expect, test } from '@playwright/test';
import { collectConsoleErrors, expectNoHorizontalScroll, login } from './helpers';

const WIDTHS = [360, 375, 768, 1024, 1280, 1440, 1920];
const PAGES = ['/dashboard', '/transactions', '/transactions/new', '/investments', '/customers', '/calendar', '/callbacks', '/notifications'];

test.describe('Responsive layout', () => {
  test('no horizontal scroll from 360 px to 1920 px', async ({ page }) => {
    const errors = collectConsoleErrors(page);
    await login(page, 'TO');
    for (const width of WIDTHS) {
      await page.setViewportSize({ width, height: 900 });
      for (const path of PAGES) {
        await page.goto(path);
        await expect(page.getByRole('heading', { level: 1 })).toBeVisible({ timeout: 20_000 });
        await expectNoHorizontalScroll(page);
      }
    }
    expect(errors).toEqual([]);
  });

  test('the navigation drawer opens below 1024 px', async ({ page }) => {
    await login(page, 'TO');
    await page.setViewportSize({ width: 375, height: 812 });
    await page.goto('/dashboard');
    await page.getByRole('button', { name: 'Open navigation' }).click();
    const drawer = page.getByRole('dialog', { name: 'Navigation' });
    await expect(drawer).toBeVisible();
    await drawer.getByRole('link', { name: 'Transactions' }).click();
    await expect(page).toHaveURL(/\/transactions/);
    await expect(drawer).toBeHidden();
  });

  test('tables become stacked cards below 768 px', async ({ page }) => {
    await login(page, 'TO');
    await page.setViewportSize({ width: 375, height: 812 });
    await page.goto('/transactions');
    await expect(page.locator('main table')).toBeHidden();
    await expect(page.locator('main ul.divide-y > li').first()).toBeVisible();

    await page.setViewportSize({ width: 1280, height: 900 });
    await expect(page.locator('main table')).toBeVisible();
  });

  test('screenshots at every breakpoint', async ({ page }, testInfo) => {
    await login(page, 'MD');
    for (const width of [375, 768, 1024, 1440, 1920]) {
      await page.setViewportSize({ width, height: 900 });
      await page.goto('/dashboard');
      await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
      await page.waitForTimeout(600); // let the charts settle
      await testInfo.attach(`dashboard-${width}`, { body: await page.screenshot({ fullPage: true }), contentType: 'image/png' });
    }
  });
});
