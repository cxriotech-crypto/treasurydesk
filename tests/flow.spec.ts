import { expect, test } from '@playwright/test';
import {
  NAMES,
  collectConsoleErrors,
  fastDemo,
  login,
  sign,
  switchTo,
  switchToName,
} from './helpers';

/** Walks the wizard up to the voucher step for the scenario given, and returns the reference. */
async function buildToVoucher(
  page: import('@playwright/test').Page,
  type: RegExp,
  scenario: RegExp,
  opts: { skipCallback?: boolean } = {}
) {
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
  expect(
    needsSubject === 0 || picked,
    'a customer with an eligible subject was found'
  ).toBeTruthy();

  await page.getByRole('button', { name: /Create draft and continue|Continue/ }).click();
  await expect(page.getByRole('heading', { name: /2\. Instruction/ })).toBeVisible({
    timeout: 20_000,
  });
  const ref = (await page.getByRole('heading', { level: 1 }).textContent())!.match(
    /TRX-\d{4}-\d+/
  )![0];

  // Step 2 – instruction
  const amount = page.getByLabel('Amount on the instruction');
  if (!(await amount.inputValue())) await amount.fill('2,000,000');
  await page.getByLabel('Purpose').fill('Playwright end-to-end check');
  await page.getByRole('button', { name: 'Save instruction and continue' }).click();

  // Step 3 – signature
  await expect(page.getByRole('heading', { name: /3\. Signature/ })).toBeVisible();
  for (const label of [
    'Signature matches the specimen',
    'Signed according to the mandate',
    'Account ownership confirmed',
    'Instruction is complete',
  ]) {
    await page.getByLabel(label).check();
  }
  await page.getByRole('button', { name: 'Verified, continue' }).click();

  // Step 4 – the call-back belongs to the customer's Account Officer (SOP step 3).
  await expect(page.getByRole('heading', { name: /4\. Call-back/ })).toBeVisible();
  await expect(page.getByText('Waiting for the Account Officer')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Save call-back' })).toHaveCount(0);
  const draftUrl = page.url();

  // The call-back never blocks: the maker can carry on and the control stays outstanding.
  if (opts.skipCallback) {
    await page.getByRole('button', { name: 'Continue without the call-back' }).click();
    await expect(page.getByRole('heading', { name: /5\. Eazybankz/ })).toBeVisible({
      timeout: 20_000,
    });
    await finishToVoucher(page);
    return ref;
  }

  const intro = (await page
    .locator('main p', { hasText: /calls .* and confirms/ })
    .first()
    .textContent())!;
  const officer = intro.match(/^(.*?) calls /)![1].trim();

  await switchToName(page, officer);
  await page.goto('/callbacks');
  await page.locator('main li', { hasText: ref }).getByRole('button', { name: 'Log call' }).click();
  const call = page.getByRole('dialog');
  for (const item of [
    'Amount confirmed',
    'Instruction confirmed',
    'Beneficiary confirmed',
    'Purpose confirmed',
  ]) {
    await call
      .getByRole('radiogroup', { name: item })
      .getByRole('radio', { name: 'Confirmed', exact: true })
      .click();
  }
  await call.getByRole('radio', { name: 'Confirmed', exact: true }).last().check();
  await call.getByRole('button', { name: 'Save call-back' }).click();
  await expect(page.getByText('Call-back confirmed')).toBeVisible({ timeout: 20_000 });

  // Back to the maker to finish the voucher.
  await switchToName(page, NAMES.TO);
  await page.goto(draftUrl);
  await finishToVoucher(page);
  return ref;
}

/** Steps 5 and 6: confirm Eazybankz, then land on the voucher. */
async function finishToVoucher(page: import('@playwright/test').Page) {
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
}

test.describe('Transaction flows', () => {
  test('pre-liquidation runs from draft to completed through every role', async ({ page }) => {
    const errors = collectConsoleErrors(page);
    await fastDemo(page);
    await login(page, 'TO');

    const ref = await buildToVoucher(page, /Pre-liquidation/, /Partial/);
    await expect(page.getByText(/Pre-liquidation charge \(20%\)/)).toBeVisible();

    // The two deductions can be switched off for this transaction alone, then back on.
    const charge = page.getByRole('switch', { name: 'Apply the pre-liquidation charge' });
    await charge.click();
    const why = page.getByRole('dialog');
    await why.getByRole('button', { name: 'Switch the charge off' }).click();
    await expect(why.getByText('Reason is required')).toBeVisible();
    await why.getByLabel('Reason').fill('Head of Treasury waived it — customer bereavement');
    await why.getByRole('button', { name: 'Switch the charge off' }).click();
    await expect(page.getByText('Pre-liquidation charge (switched off)')).toBeVisible();
    await expect(page.getByText(/Switched off: Head of Treasury waived it/)).toBeVisible();
    await charge.click(); // back on, and the reason goes with it
    await expect(page.getByText(/Pre-liquidation charge \(20%\)/)).toBeVisible();
    await expect(page.getByText(/Switched off: Head of Treasury/)).toHaveCount(0);
    // Interest is not paid out on a partial pre-liquidation, so there is no tax to switch.
    await expect(page.getByRole('switch', { name: 'Deduct withholding tax' })).toHaveCount(0);
    await page.getByRole('button', { name: 'Sign & submit' }).click();
    await sign(page, 'TO', 'Sign & submit');
    await expect(page.getByText('Awaiting Head Treasury', { exact: true }).first()).toBeVisible({
      timeout: 20_000,
    });

    // Maker cannot approve their own transaction.
    await expect(page.getByRole('button', { name: 'Approve & sign' })).toHaveCount(0);

    // HT approves, MIS returns, maker corrects and resubmits.
    await switchTo(page, 'HT');
    await page.getByRole('button', { name: 'Approve & sign' }).first().click();
    await sign(page, 'HT', 'Approve & sign', 'Rate confirmed with the customer by phone');
    await expect(page.getByText('Awaiting MIS', { exact: true }).first()).toBeVisible();

    // The next approver is shown who left the note, their position, and the note itself.
    await switchTo(page, 'MIS');
    await expect(page.getByText('Notes from the signatures so far')).toBeVisible();
    await expect(page.getByText('Ibrahim Musa, Head, Treasury:')).toBeVisible();
    await expect(page.getByText('Rate confirmed with the customer by phone')).toBeVisible();
    await page.goto('/approvals');
    await expect(
      page.locator('main table').getByText('Rate confirmed with the customer by phone')
    ).toBeVisible();
    await page.goBack();
    await page.getByRole('button', { name: 'Return to maker' }).first().click();
    await page.getByRole('dialog').getByLabel('Comment to the maker').fill('Attach a clearer scan');
    await page.getByRole('dialog').getByRole('button', { name: 'Return to maker' }).click();
    await expect(page.getByText('Returned for correction', { exact: true }).first()).toBeVisible();

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
    await expect(page.getByText('Ready for Operations', { exact: true }).first()).toBeVisible();

    // Operations execute, Treasury confirms.
    await switchTo(page, 'OPS');
    await page
      .getByRole('button', { name: /^Execute$/ })
      .first()
      .click();
    const drawer = page.getByRole('dialog');
    await drawer.getByRole('button', { name: 'Use demo reference' }).click();
    await drawer.getByRole('button', { name: /Mark executed|Send to GAPS/ }).click();
    await expect(drawer.getByText('Executed', { exact: true }).first()).toBeVisible({
      timeout: 30_000,
    });
    await drawer.getByRole('button', { name: 'Close' }).first().click();

    await switchTo(page, 'TO');
    await page.getByRole('button', { name: 'Confirm completion' }).click();
    await page.getByRole('dialog').getByRole('button', { name: 'Confirm completion' }).click();
    await expect(page.getByText('Completed', { exact: true }).first()).toBeVisible({
      timeout: 20_000,
    });

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
    await page
      .getByRole('dialog')
      .getByLabel('What differs')
      .fill('Signature does not match the specimen');
    await page.getByRole('dialog').getByRole('button', { name: 'Stop processing' }).click();
    await expect(page.getByText('Stopped – signature mismatch').first()).toBeVisible({
      timeout: 20_000,
    });
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
    await drawer.getByRole('button', { name: 'Close' }).first().click(); // the drawer stays open for a retry

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
    await expect(retry.getByText('Executed', { exact: true }).first()).toBeVisible({
      timeout: 40_000,
    });
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

  test('withholding tax can be switched off on a maturity voucher', async ({ page }) => {
    await fastDemo(page);
    await login(page, 'TO');
    await buildToVoucher(page, /Termination at maturity/, /Principal \+ interest/);
    const tax = page.getByRole('switch', { name: /Deduct withholding tax/ });
    await expect(tax).toBeVisible();

    if (await tax.isDisabled()) {
      // A WHT-exempt customer: the switch is locked off and the voucher says why.
      await expect(page.getByText('WHT (exempt)')).toBeVisible();
      await expect(page.getByText(/is WHT-exempt, so no tax/)).toBeVisible();
      return;
    }
    await expect(page.getByText('WHT', { exact: true })).toBeVisible();
    await tax.click();
    const why = page.getByRole('dialog');
    await why.getByLabel('Reason').fill('Customer produced a tax exemption certificate');
    await why.getByRole('button', { name: 'Switch the tax off' }).click();
    await expect(page.getByText('WHT (switched off)')).toBeVisible();
    await expect(page.getByText(/Switched off: Customer produced/)).toBeVisible();
    await tax.click();
    await expect(page.getByText('WHT', { exact: true })).toBeVisible();
  });

  test('a transaction can be submitted with the call-back outstanding', async ({ page }) => {
    await fastDemo(page);
    await login(page, 'TO');
    await buildToVoucher(page, /Termination at maturity/, /Principal \+ interest/, {
      skipCallback: true,
    });
    await expect(page.getByText('Customer call-back outstanding')).toBeVisible();
    await page.getByRole('button', { name: 'Sign & submit' }).click();
    await sign(page, 'TO', 'Sign & submit');
    await expect(page.getByText('Awaiting Head Treasury', { exact: true }).first()).toBeVisible({
      timeout: 20_000,
    });

    // Every approver sees the same warning before signing.
    await switchTo(page, 'HT');
    await expect(page.getByText('Customer call-back outstanding')).toBeVisible();
    await page.getByRole('tab', { name: /Controls/ }).click();
    await expect(page.getByRole('tabpanel').getByLabel('pending')).not.toHaveCount(0);
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
    await expect(printPage.getByText('FIRST MARINA TRUST FINANCE COMPANY LIMITED')).toBeVisible({
      timeout: 20_000,
    });
    await expect(printPage.getByText('AMOUNT IN WORDS')).toBeVisible();
    await expect(printPage.getByText('TREASURY OFFICER')).toBeVisible();
    await expect(printPage.getByText('MANAGING DIRECTOR')).toBeVisible();
    await printPage.close();
  });
});
