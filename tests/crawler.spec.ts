import { expect, test } from '@playwright/test';
import { DEMO, collectConsoleErrors, expectNoHorizontalScroll, fastDemo, login } from './helpers';

/** Routes each role may open (must match src/app/routes.ts). */
const ROUTES: Record<keyof typeof DEMO, string[]> = {
  TO: [
    '/dashboard',
    '/calendar',
    '/notifications',
    '/transactions',
    '/transactions/new',
    '/imports',
    '/callbacks',
    '/investments',
    '/customers',
  ],
  AO: [
    '/dashboard',
    '/calendar',
    '/notifications',
    '/transactions',
    '/callbacks',
    '/investments',
    '/customers',
  ],
  HT: [
    '/dashboard',
    '/calendar',
    '/notifications',
    '/transactions',
    '/approvals',
    '/imports',
    '/callbacks',
    '/investments',
    '/customers',
    '/reports',
    '/settings',
  ],
  MIS: [
    '/dashboard',
    '/transactions',
    '/approvals',
    '/investments',
    '/customers',
    '/reports',
    '/settings',
  ],
  AUD: [
    '/dashboard',
    '/transactions',
    '/approvals',
    '/investments',
    '/customers',
    '/reports',
    '/audit',
    '/settings',
    '/settings/self-check',
  ],
  MD: [
    '/dashboard',
    '/transactions',
    '/approvals',
    '/investments',
    '/customers',
    '/reports',
    '/audit',
    '/settings',
  ],
  OPS: [
    '/dashboard',
    '/calendar',
    '/notifications',
    '/transactions',
    '/operations',
    '/callbacks',
    '/investments',
    '/customers',
  ],
  ADM: [
    '/dashboard',
    '/calendar',
    '/notifications',
    '/transactions',
    '/investments',
    '/customers',
    '/reports',
    '/audit',
    '/settings',
    '/settings/self-check',
  ],
};

/** Controls the crawler must not press (destructive, irreversible, or they leave the app). */
const SKIP =
  /reset|delete|remove|deactivate|clear|sign out|export|print|stop processing|reject|return to maker|send to gaps|mark executed|retry|execute|approve|confirm|sign|save|create|add |log call/i;

test.describe('Every route for every role', () => {
  test.setTimeout(240_000);

  for (const role of Object.keys(ROUTES) as (keyof typeof DEMO)[]) {
    test(`${role}: pages load and controls open without console errors`, async ({ page }) => {
      await fastDemo(page); // no simulated latency
      const errors = collectConsoleErrors(page);
      await login(page, role);

      for (const route of ROUTES[role]) {
        await page.goto(route);
        await expect(page.getByRole('heading', { level: 1 })).toBeVisible({ timeout: 20_000 });
        await expect(page.getByText('Something went wrong')).toHaveCount(0);
        await expectNoHorizontalScroll(page);

        // Press each safe control once, then dismiss whatever it opened.
        const handles = await page.locator('main button:visible').elementHandles();
        for (const handle of handles.slice(0, 14)) {
          try {
            const label =
              ((await handle.textContent()) ?? '') +
              ' ' +
              ((await handle.getAttribute('aria-label')) ?? '');
            if (SKIP.test(label) || (await handle.isDisabled())) continue;
            await handle.click({ timeout: 3000 });
            await page.keyboard.press('Escape');
          } catch {
            // The control went away (re-render or navigation) — nothing to press.
          }
          if (!page.url().includes(route)) await page.goto(route);
        }
        await expect(page.getByText('Something went wrong')).toHaveCount(0);
      }

      expect(errors, `console errors for ${role}`).toEqual([]);
    });
  }

  test('transaction, investment and customer detail pages open from their lists', async ({
    page,
  }) => {
    await fastDemo(page);
    const errors = collectConsoleErrors(page);
    await login(page, 'TO');

    await page.goto('/transactions');
    await page.locator('main tbody tr a').first().click();
    await expect(page).toHaveURL(/\/transactions\/TXN-/);
    for (const tab of [
      'Vouchers',
      'Instruction',
      'Verification & call-back',
      'Controls',
      'Timeline',
      'Comments',
    ]) {
      await page.getByRole('tab', { name: new RegExp(tab) }).click();
      await expect(page.getByText('Something went wrong')).toHaveCount(0);
    }

    await page.goto('/investments');
    await page.locator('main tbody tr a').first().click();
    await expect(page).toHaveURL(/\/investments\/INV-/);
    await expect(page.getByText('Accrued interest to today')).toBeVisible();

    await page.goto('/customers');
    await page.locator('main tbody tr a').first().click();
    await expect(page).toHaveURL(/\/customers\/CUS-/);
    for (const tab of [
      'Signatories & mandate',
      'Accounts',
      'Investments',
      'Beneficiaries',
      'Transactions',
      'Call-backs',
    ]) {
      await page.getByRole('tab', { name: new RegExp(tab) }).click();
      await expect(page.getByText('Something went wrong')).toHaveCount(0);
    }
    expect(errors).toEqual([]);
  });
});
