import { test } from '@playwright/test';
import { login } from './helpers';

const PAGES = ['/dashboard', '/transactions', '/transactions/new', '/investments', '/customers', '/calendar', '/callbacks', '/notifications'];

test('overflow probe', async ({ page }) => {
  await login(page, 'TO');
  for (const w of [360, 375]) {
    await page.setViewportSize({ width: w, height: 900 });
    for (const path of [...PAGES]) {
      await page.goto(path);
      await page.waitForTimeout(700);
      const report = await page.evaluate(() => {
        const limit = document.documentElement.clientWidth;
        const over = document.documentElement.scrollWidth - limit;
        if (over <= 1) return null;
        const out: string[] = [`overflow=${over}`];
        document.querySelectorAll('*').forEach((el) => {
          const r = el.getBoundingClientRect();
          if (r.right > limit + 1 && r.width > 0)
            out.push(`${el.tagName.toLowerCase()} "${(el.className || '').toString().slice(0, 50)}" right=${Math.round(r.right)}`);
        });
        return out.slice(0, 8).join('\n');
      });
      if (report) console.log(`\n### ${w}px ${path}\n${report}`);
    }
  }
  // Transaction detail too (VoucherView lives here).
  await page.goto('/transactions');
  await page.locator('main a[href^="/transactions/TXN-"]').first().click();
  await page.waitForTimeout(800);
  const detail = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  console.log(`\n### 375px transaction detail overflow=${detail}`);
  console.log('PROBE DONE');
});
