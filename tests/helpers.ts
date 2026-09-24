import { expect, type Page, type ConsoleMessage } from '@playwright/test';

export const DEMO = {
  TO: 'adaeze.okonkwo@fmtfinance.com',
  AO: 'tunde.bakare@fmtfinance.com',
  HT: 'ibrahim.musa@fmtfinance.com',
  MIS: 'chiamaka.eze@fmtfinance.com',
  AUD: 'olumide.adeyemi@fmtfinance.com',
  MD: 'folake.adebayo@fmtfinance.com',
  OPS: 'emeka.nwosu@fmtfinance.com',
  ADM: 'kelechi.obi@fmtfinance.com',
} as const;

export const NAMES: Record<keyof typeof DEMO, string> = {
  TO: 'Adaeze Okonkwo',
  AO: 'Tunde Bakare',
  HT: 'Ibrahim Musa',
  MIS: 'Chiamaka Eze',
  AUD: 'Olumide Adeyemi',
  MD: 'Mrs. Folake Adebayo',
  OPS: 'Emeka Nwosu',
  ADM: 'Kelechi Obi',
};

/** Console errors that are not the app's fault (dev-server noise). */
const IGNORED = [/favicon/i, /Download the React DevTools/i, /webpack-hmr/i, /hydration/i];

export function collectConsoleErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on('console', (m: ConsoleMessage) => {
    if (m.type() !== 'error') return;
    const text = m.text();
    if (IGNORED.some((re) => re.test(text))) return;
    errors.push(text);
  });
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
  return errors;
}

/** Sign out if a session is already open (the app sends signed-in users away from /login). */
export async function signOut(page: Page) {
  const menu = page.getByRole('button', { name: /User menu/ });
  if (!(await menu.isVisible().catch(() => false))) return;
  await menu.click();
  await page.getByRole('menuitem', { name: 'Sign out' }).click();
  await expect(page).toHaveURL(/\/login/, { timeout: 20_000 });
}

/** Sign in through the UI (email + password, then the demo 2FA code). */
export async function login(page: Page, role: keyof typeof DEMO) {
  const email = page.getByLabel('Email');
  const menu = page.getByRole('button', { name: /User menu/ });
  // A live session bounces /login to the dashboard, so sign out and come back.
  for (let attempt = 0; attempt < 3; attempt++) {
    await page.goto('/login');
    await expect(email.or(menu).first()).toBeVisible({ timeout: 20_000 });
    await page.waitForTimeout(250); // let hydration run the redirect before deciding
    if (await email.isVisible().catch(() => false)) break;
    await signOut(page);
  }
  await email.fill(DEMO[role]);
  await page.getByLabel('Password').fill('demo');
  await page.getByRole('button', { name: 'Continue' }).click();
  await page.getByLabel('6-digit code').fill('123456');
  await page.getByRole('button', { name: 'Verify and sign in' }).click();
  await expect(page).toHaveURL(/\/(dashboard|transactions|approvals|operations)/, {
    timeout: 20_000,
  });
}

/** Switch demo user from the user menu (keeps the same page where allowed). */
export async function switchTo(page: Page, role: keyof typeof DEMO) {
  await switchToName(page, NAMES[role]);
}

/** Switch to a demo user by their full name (e.g. the Account Officer a customer belongs to). */
export async function switchToName(page: Page, fullName: string) {
  await page.getByRole('button', { name: /User menu/ }).click();
  await page.getByRole('menuitem', { name: fullName }).click(); // the item also shows the role
  await expect(
    page.getByRole('button', { name: new RegExp(`User menu for ${fullName}`) })
  ).toBeVisible();
}

/** Fill and submit the signature dialog, optionally leaving a note for the next approver. */
export async function sign(
  page: Page,
  role: keyof typeof DEMO,
  action = 'Approve & sign',
  comment?: string
) {
  const dialog = page.getByRole('dialog');
  await dialog.getByLabel('Full name').fill(NAMES[role]);
  await dialog.getByLabel('PIN').fill('1234');
  if (comment) await dialog.getByLabel('Comment (optional)').fill(comment);
  await dialog.getByRole('button', { name: action }).click();
  await expect(dialog).toBeHidden({ timeout: 20_000 });
}

/** No horizontal page scroll at the current viewport. */
export async function expectNoHorizontalScroll(page: Page) {
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth
  );
  expect(overflow, 'page should not scroll horizontally').toBeLessThanOrEqual(1);
}

/** Speed the demo up: no simulated latency, GAPS never fails unless a test asks. */
export async function fastDemo(page: Page, gapsFailureRate = 0) {
  await login(page, 'ADM');
  await page.goto('/settings');
  await page.getByRole('tab', { name: 'Demo' }).click();
  await page.getByLabel('Simulated latency (ms)').fill('0');
  await page.getByLabel('GAPS failure rate (%)').fill(String(gapsFailureRate));
  await page.getByRole('button', { name: 'Save' }).click();
  await expect(page.getByText('Demo settings saved')).toBeVisible();
}
