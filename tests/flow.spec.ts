import { expect, test } from '@playwright/test';
import { collectConsoleErrors, fastDemo, login, sign, switchTo } from './helpers';

/** Walks the wizard up to the voucher step for the scenario given, and returns the reference. */
async function buildToVoucher(page: import('@playwright/test').Page, type: RegExp, scenario: RegExp) {
  await page.goto('/transactions/new');
  await page.getByRole('radio', { name: type }).click();
  await page.getByRole('radio', { name: scenario }).click();

  // Pick the first customer that has an eligible subject (investment or account).
  const combo = page.locator('main input[role="combobox"]');
  await combo.click();
  const options = page.locator('main [role="option"]');
  const optionCount = await options.count();
  let picked = false;
  for (let i = 0; i < Math.min(optionCount, 40) && !picked; i++) {
    await combo.click();
    await options.nth(i).click();
    const subjects = page.locator('[aria-label="Subject"] button:not([disabled])');
    if (await subjects.count()) {
      await subjects.first().click();
      picked = true;
    }
  }
  const needsSubject = await page.locator('[aria-label="Subject"]').count();
  expect(needsSubject === 0 || picked, 'a customer with an eligible subject was found').toBeTruthy();

  await page.getByRole('button', { name: /Create draft and continue|Continue/ }).click();
  await expect(page.getByRole('heading', { name: /2\. Instruction/ })).toBeVisible({ timeout: 20_000 });
  const ref = (await page.getByRole('heading', { level: 1 }).textContent())!.trim();

  // Step 2 – instruction
  const amount = page.getByLabel('Amount on the instruction');
  if (!(await amount.inputValue())) await amount.fill('2,000,000');
  await page.getByLabel('Purpose').fill('Playwright end-to-end check');
  await page.getByRole('button', { name: 'Save instruction and continue' }).click();

  // Step 3 – signature
  await expect(page.getByRole('heading', { name: /3\. Signature/ })).toBeVisible();
  for (const label of ['Signature matches the specimen', 'Signed according to the mandate', 'Account ownership confirmed', 'Instruction is complete']) {
    await page.getByLabel(label).check();
  }
  await page.getByRole('button', { name: 'Verified, continue' }).click();

  // Step 4 – call-back
  await expect(page.getByRole('heading', { name: /4\. Call-back/ })).toBeVisible();
  for (const item of ['Amount confirmed', 'Instruction confirmed', 'Beneficiary confirmed', 'Purpose confirmed']) {
    await page.getByRole('radiogroup', { name: item }).getByRole('radio', { name: 'Confirmed' }).click();
  }
  await page.getByRole('radio', { name: 'Confirmed', exact: true }).last().check();
  await page.getByRole('button', { name: 'Save call-back' }).click();

  // Step 5 – Eazybankz
  await expect(page.getByRole('heading', { name: /5\. Eazybankz/ })).toBeVisible();
  await page.getByRole('button', { name: 'Refresh from Eazybankz' }).click();
  await page.getByLabel('Figures confirmed in Eazybankz').check();
  const funds = page.getByLabel('Funds received');
  if (await funds.count()) {
    await funds.check();
    await page.getByLabel('Source account confirmed').check();
  }
  await page.getByRole('button', { name: 'Continue to voucher' }).click();
  await expect(page.getByRole('heading', { name: /6\. Voucher/ })).toBeVisible();
  return ref;
}

test.describe('Transaction flows', () => {
  test('pre-liquidation runs from draft to completed through every role', async ({ page }) => {
    const errors = collectConsoleErrors(page);
    await fastDemo(page);
    await login(page, 'TO');

    const ref = await buildToVoucher(page, /Pre-liquidation/, /Partial/);
    await expect(page.getByText('Pre-liquidation charge')).toBeVisible();
    await page.getByRole('button', { name: 'Sign & submit' }).click();
    await sign(page, 'TO', 'Sign & submit');
    await expect(page.getByText('Awaiting Head Treasury')).toBeVisible({ timeout: 20_000 });

    // Maker cannot approve their own transaction.
    await expect(page.getByRole('button', { name: 'Approve & sign' })).toHaveCount(0);

    // HT approves, MIS returns, maker corrects and resubmits.
    await switchTo(page, 'HT');
    await page.getByRole('button', { name: 'Approve & sign' }).first().click();
    await sign(page, 'HT');
    await expect(page.getByText('Awaiting MIS')).toBeVisible();

    await switchTo(page, 'MIS');
    await page.getByRole('button', { name: 'Return to maker' }).first().click();
    await page.getByRole('dialog').getByLabel('Comment to the maker').fill('Attach a clearer scan');
    await page.getByRole('dialog').getByRole('button', { name: 'Return to maker' }).click();
    await expect(page.getByText('Returned for correction')).toBeVisible();

    await switchTo(page, 'TO');
    await page.getByRole('link', { name: 'Correct and resubmit' }).click();
    await expect(page.getByRole('heading', { name: /6\. Voucher/ })).toBeVisible();
    await page.getByRole('button', { name: 'Sign & submit' }).click();
    await sign(page, 'TO', 'Sign & submit');

    for (const role of ['HT', 'MIS', 'AUD', 'MD'] as const) {
      await switchTo(page, role);
      await page.getByRole('button', { name: 'Approve & sign' }).first().click();
      await sign(page, role);
    }
    await expect(page.getByText('Ready for Operations')).toBeVisible();

    // Operations execute, Treasury confirms.
    await switchTo(page, 'OPS');
    await page.getByRole('button', { name: /^Execute$/ }).first().click();
    const drawer = page.getByRole('dialog');
    await drawer.getByRole('button', { name: 'Use demo reference' }).click();
    await drawer.getByRole('button', { name: /Mark executed|Send to GAPS/ }).click();
    await expect(drawer.getByText('Executed')).toBeVisible({ timeout: 30_000 });
    await drawer.getByRole('button', { name: 'Close' }).click();

    await switchTo(page, 'TO');
    await page.getByRole('button', { name: 'Confirm completion' }).click();
    await page.getByRole('dialog').getByRole('button', { name: 'Confirm completion' }).click();
    await expect(page.getByText('Completed', { exact: true }).first()).toBeVisible({ timeout: 20_000 });

    // Every control passed.
    await page.getByRole('tab', { name: /Controls/ }).click();
    await expect(page.getByRole('tabpanel').getByLabel('pending')).toHaveCount(0);
    expect(errors, `console errors while running ${ref}`).toEqual([]);
  });

  test('a signature mismatch stops processing', async ({ page }) => {
    await fastDemo(page);
    await login(page, 'TO');
    await page.goto('/transactions/new');
    await page.getByRole('radio', { name: /Inflow/ }).click();
    const combo = page.locator('main input[role="combobox"]');
    await combo.click();
    await page.locator('main [role="option"]').first().click();
    await page.getByRole('button', { name: /Create draft and continue/ }).click();
    await page.getByLabel('Amount on the instruction').fill('5,000,000');
    await page.getByLabel('Purpose').fill('Stop test');
    await page.getByRole('button', { name: 'Save instruction and continue' }).click();
    await page.getByRole('button', { name: 'Signature differs — stop processing' }).click();
    await page.getByRole('dialog').getByLabel('What differs').fill('Signature does not match the specimen');
    await page.getByRole('dialog').getByRole('button', { name: 'Stop processing' }).click();
    await expect(page.getByText('Stopped – signature mismatch').first()).toBeVisible({ timeout: 20_000 });
  });

  test('GAPS failure is reported and the retry succeeds', async ({ page }) => {
    await fastDemo(page, 100); // every GAPS submission fails
    await login(page, 'OPS');
    await page.goto('/operations');
    const row = page.locator('main tbody tr', { hasText: 'GAPS' }).first();
    await row.getByRole('button', { name: /Execute|Retry/ }).click();
    const drawer = page.getByRole('dialog');
    await drawer.getByRole('button', { name: 'Use demo reference' }).click();
    await drawer.getByRole('button', { name: /Send to GAPS|Retry GAPS submission/ }).click();
    await expect(drawer.getByText('Last GAPS submission failed')).toBeVisible({ timeout: 40_000 });

    await switchTo(page, 'ADM');
    await page.goto('/settings');
    await page.getByRole('tab', { name: 'Demo' }).click();
    await page.getByLabel('GAPS failure rate (%)').fill('0');
    await page.getByRole('button', { name: 'Save' }).click();
    await expect(page.getByText('Demo settings saved')).toBeVisible();

    await switchTo(page, 'OPS');
    await page.goto('/operations');
    const failed = page.locator('main tbody tr', { hasText: 'Execution failed' }).first();
    await failed.getByRole('button', { name: 'Retry' }).click();
    const retry = page.getByRole('dialog');
    await retry.getByRole('button', { name: 'Use demo reference' }).click();
    await retry.getByRole('button', { name: /Retry GAPS submission|Send to GAPS/ }).click();
    await expect(retry.getByText('Executed')).toBeVisible({ timeout: 40_000 });
  });

  test('approvers can bulk approve with one signature', async ({ page }) => {
    await fastDemo(page);
    await login(page, 'HT');
    await page.goto('/approvals');
    const boxes = page.locator('main tbody input[type="checkbox"]:not([disabled])');
    await boxes.nth(0).check();
    await boxes.nth(1).check();
    await page.getByRole('button', { name: /Approve selected \(2\)/ }).click();
    await sign(page, 'HT');
    await expect(page.getByText('2 approved')).toBeVisible({ timeout: 20_000 });
  });

  test('the printed voucher shows the figures, words and signatures', async ({ page }) => {
    await fastDemo(page);
    await login(page, 'TO');
    await page.goto('/transactions?tab=completed');
    await page.locator('main tbody tr a').first().click();
    await page.getByRole('tab', { name: /Vouchers/ }).click();
    const [printPage] = await Promise.all([
      page.context().waitForEvent('page'),
      page.getByRole('link', { name: 'Print voucher' }).first().click(),
    ]);
    await printPage.waitForLoadState();
    await expect(printPage.getByText('FIRST MARINA TRUST FINANCE COMPANY LIMITED')).toBeVisible({ timeout: 20_000 });
    await expect(printPage.getByText('AMOUNT IN WORDS')).toBeVisible();
    await expect(printPage.getByText('TREASURY OFFICER')).toBeVisible();
    await expect(printPage.getByText('MANAGING DIRECTOR')).toBeVisible();
    await printPage.close();
  });
});
