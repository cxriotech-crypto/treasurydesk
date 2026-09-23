import { expect, test } from '@playwright/test';
import { DEMO, NAMES, collectConsoleErrors, login, switchTo } from './helpers';

test.describe('Sign-in and access', () => {
  test('each demo role can sign in and lands on its dashboard', async ({ page }) => {
    const errors = collectConsoleErrors(page);
    for (const role of Object.keys(DEMO) as (keyof typeof DEMO)[]) {
      await login(page, role);
      await expect(
        page.getByRole('button', { name: new RegExp(`User menu for ${NAMES[role]}`) })
      ).toBeVisible();
      await expect(page.getByRole('heading', { level: 1 })).toContainText(
        /Good (morning|afternoon|evening)/
      );
      await page.getByRole('button', { name: /User menu/ }).click();
      await page.getByRole('menuitem', { name: 'Sign out' }).click();
      await expect(page).toHaveURL(/\/login/);
    }
    expect(errors).toEqual([]);
  });

  test('bad email and wrong 2FA code show inline errors', async ({ page }) => {
    await page.goto('/login');
    await page.getByLabel('Email').fill('nobody@fmtfinance.com');
    await page.getByLabel('Password').fill('x');
    await page.getByRole('button', { name: 'Continue' }).click();
    await expect(page.getByText('No user with this email address')).toBeVisible();

    await page.getByLabel('Email').fill(DEMO.TO);
    await page.getByRole('button', { name: 'Continue' }).click();
    await page.getByLabel('6-digit code').fill('111111');
    await page.getByRole('button', { name: 'Verify and sign in' }).click();
    await expect(page.getByText('Incorrect code')).toBeVisible();
  });

  test('protected pages redirect to sign-in and come back afterwards', async ({ page }) => {
    await page.goto('/transactions');
    await expect(page).toHaveURL(/\/login\?next=%2Ftransactions/);
    await page.getByLabel('Email').fill(DEMO.TO);
    await page.getByLabel('Password').fill('demo');
    await page.getByRole('button', { name: 'Continue' }).click();
    await page.getByLabel('6-digit code').fill('123456');
    await page.getByRole('button', { name: 'Verify and sign in' }).click();
    await expect(page).toHaveURL(/\/transactions/);
  });

  test('a role without access is sent to the forbidden page', async ({ page }) => {
    await login(page, 'TO');
    await page.goto('/audit');
    await expect(page).toHaveURL(/\/forbidden/);
    await expect(page.getByRole('heading', { name: /don’t have access/ })).toBeVisible();
    await page.getByRole('link', { name: 'Back to dashboard' }).click();
    await expect(page).toHaveURL(/\/dashboard/);
  });

  test('the role switcher changes the dashboard in place', async ({ page }) => {
    await login(page, 'TO');
    await expect(page.getByText('My drafts')).toBeVisible();
    await switchTo(page, 'HT');
    await expect(page.getByText('Pending my approval')).toBeVisible();
    await switchTo(page, 'OPS');
    await expect(page.getByText('Ready to execute')).toBeVisible();
  });

  test('signs out after the idle timeout', async ({ page }) => {
    await login(page, 'TO');
    // Back-date the shared session rather than waiting 17 minutes.
    await page.evaluate(() => {
      const s = JSON.parse(localStorage.getItem('treasurydesk.session.v1')!);
      s.lastActivityAt = new Date(Date.now() - 15.5 * 60000).toISOString();
      localStorage.setItem('treasurydesk.session.v1', JSON.stringify(s));
    });
    await expect(page.getByRole('dialog', { name: 'Are you still there?' })).toBeVisible({
      timeout: 10_000,
    });
    await page.evaluate(() => {
      const s = JSON.parse(localStorage.getItem('treasurydesk.session.v1')!);
      s.lastActivityAt = new Date(Date.now() - 17.5 * 60000).toISOString();
      localStorage.setItem('treasurydesk.session.v1', JSON.stringify(s));
    });
    await expect(page).toHaveURL(/\/login\?reason=idle/, { timeout: 15_000 });
    await expect(page.getByText('You were signed out')).toBeVisible();
  });
});
