import { expect, test } from '@playwright/test';
import {
  accountOfficerApproves,
  collectConsoleErrors,
  fastDemo,
  login,
  recordPayment,
  sign,
  switchTo,
} from './helpers';

/**
 * Walks the wizard to the voucher step: type and scenario, instruction (with two documents),
 * signature, Eazybankz. The customer call-back comes after submission, with the Account Officer.
 */
async function buildToVoucher(
  page: import('@playwright/test').Page,
  type: RegExp,
  scenario?: RegExp
) {
  await page.goto('/transactions/new');
  await page.getByRole('radio', { name: type }).click();
  if (scenario) await page.getByRole('radio', { name: scenario }).click();

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

  // Step 2 – instruction, with more than one document.
  const amount = page.getByLabel('Amount on the instruction');
  if (!(await amount.inputValue())) await amount.fill('2,000,000');
  await page.getByLabel('Purpose').fill('Playwright end-to-end check');
  await page.getByLabel('Add instruction documents').setInputFiles([
    { name: 'letter.pdf', mimeType: 'application/pdf', buffer: Buffer.from('%PDF-1.4 letter') },
    { name: 'letter-p2.png', mimeType: 'image/png', buffer: Buffer.from('png page two') },
  ]);
  await expect(page.getByText('letter-p2.png')).toBeVisible();
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

  // Step 4 – Eazybankz
  await expect(page.getByRole('heading', { name: /4\. Eazybankz/ })).toBeVisible();
  await page.getByRole('button', { name: 'Refresh from Eazybankz' }).click();
  await page.getByLabel('Figures confirmed in Eazybankz').check();
  const funds = page.getByLabel('Funds received');
  if (await funds.count()) {
    await funds.check();
    await page.getByLabel('Source account confirmed').check();
  }
  await page.getByRole('button', { name: 'Continue to voucher' }).click();
  await expect(page.getByRole('heading', { name: /5\. Voucher/ })).toBeVisible();
  // A new maturity on a weekend or holiday is caught here; take the suggested business day.
  const move = page.getByRole('button', { name: /^Move to / });
  if (await move.isVisible({ timeout: 1500 }).catch(() => false)) await move.click();
  return ref;
}

async function signAndSubmit(page: import('@playwright/test').Page) {
  await page.getByRole('button', { name: 'Sign & submit' }).click();
  await sign(page, 'TO', 'Sign & submit');
  await expect(page.getByText('Awaiting Account Officer', { exact: true }).first()).toBeVisible({
    timeout: 20_000,
  });
}

test.describe('Transaction flows', () => {
  test('pre-liquidation runs through every level, with a return that restarts the chain', async ({
    page,
  }) => {
    const errors = collectConsoleErrors(page);
    await fastDemo(page);
    await login(page, 'TO');

    const ref = await buildToVoucher(page, /Pre-liquidation/, /Partial/);
    await expect(page.getByText(/Pre-liquidation charge \(20%\)/)).toBeVisible();

    // The charge can be switched off for this transaction alone, with a reason, then back on.
    const charge = page.getByRole('switch', { name: 'Apply the pre-liquidation charge' });
    await charge.click();
    const why = page.getByRole('dialog');
    await why.getByRole('button', { name: 'Switch the charge off' }).click();
    await expect(why.getByText('Reason is required')).toBeVisible();
    await why.getByLabel('Reason').fill('Head of Treasury waived it — customer bereavement');
    await why.getByRole('button', { name: 'Switch the charge off' }).click();
    await expect(page.getByText('Pre-liquidation charge (switched off)')).toBeVisible();
    await expect(page.getByText(/Switched off: Head of Treasury waived it/)).toBeVisible();
    await charge.click();
    await expect(page.getByText(/Pre-liquidation charge \(20%\)/)).toBeVisible();
    // The accrued interest is added to the rebooked principal, so WHT applies to it (and can be switched off).
    await expect(page.getByRole('switch', { name: 'Deduct withholding tax' })).toHaveCount(1);
    await expect(page.getByText('Add interest (net of WHT)')).toBeVisible();

    // Submitted, it goes to the customer's Account Officer first — not to Head of Treasury.
    await signAndSubmit(page);
    await expect(page.getByRole('button', { name: 'Approve & sign' })).toHaveCount(0);

    // The Account Officer calls the customer, then approves (they cannot before the call).
    await accountOfficerApproves(page);
    await expect(page.getByText('Awaiting Head Treasury', { exact: true }).first()).toBeVisible();

    await switchTo(page, 'HT');
    await page.getByRole('button', { name: 'Approve & sign' }).first().click();
    await sign(page, 'HT', 'Approve & sign', 'Rate confirmed with the customer by phone');
    await expect(page.getByText('Awaiting MIS', { exact: true }).first()).toBeVisible();

    // The next approver sees who left the note, their position and the note.
    await switchTo(page, 'MIS');
    await expect(page.getByText('Notes from the signatures so far')).toBeVisible();
    await expect(page.getByText('Ibrahim Musa, Head, Treasury:')).toBeVisible();
    await expect(page.getByText('Rate confirmed with the customer by phone')).toBeVisible();
    await page.goto('/approvals');
    await expect(
      page.locator('main table').getByText('Rate confirmed with the customer by phone')
    ).toBeVisible();
    await page.goBack();

    // MIS returns it; the maker corrects and resubmits; it starts again at the Account Officer.
    await page.getByRole('button', { name: 'Return to maker' }).first().click();
    await page.getByRole('dialog').getByLabel('Comment to the maker').fill('Attach a clearer scan');
    await page.getByRole('dialog').getByRole('button', { name: 'Return to maker' }).click();
    await expect(page.getByText('Returned for correction', { exact: true }).first()).toBeVisible();

    await switchTo(page, 'TO');
    await page.getByRole('link', { name: 'Correct and resubmit' }).click();
    await expect(page.getByRole('heading', { name: /5\. Voucher/ })).toBeVisible();
    await signAndSubmit(page);
    await accountOfficerApproves(page);

    await switchTo(page, 'HT');
    await page.getByRole('button', { name: 'Approve & sign' }).first().click();
    await sign(page, 'HT');
    await switchTo(page, 'MIS');
    await page.getByRole('button', { name: 'Approve & sign' }).first().click();
    await sign(page, 'MIS');

    // Internal Audit re-verifies the signature, with the same view the Treasury Officer had.
    await switchTo(page, 'AUD');
    await expect(page.getByRole('button', { name: 'Approve & sign' }).first()).toBeDisabled();
    await page.getByRole('button', { name: 'Verify signature' }).first().click();
    const verify = page.getByRole('dialog');
    await expect(verify.getByText('Specimen signatures on file')).toBeVisible();
    await expect(verify.getByText('letter-p2.png')).toBeVisible();
    for (const label of [
      'Signature matches the specimen',
      'Signed according to the mandate',
      'Account ownership confirmed',
      'Instruction is complete',
    ])
      await verify.getByLabel(label).check();
    await verify.getByRole('button', { name: 'Verified' }).click();
    await page.getByRole('button', { name: 'Approve & sign' }).first().click();
    await sign(page, 'AUD');

    await switchTo(page, 'MD');
    await page.getByRole('button', { name: 'Approve & sign' }).first().click();
    await sign(page, 'MD');
    await expect(page.getByText('Ready for Operations', { exact: true }).first()).toBeVisible();

    // Operations: one officer pays in GAPS and records it, a different one approves the record.
    await switchTo(page, 'OPS');
    await page.getByRole('button', { name: 'Record payment' }).first().click();
    let drawer = page.getByRole('dialog');
    await expect(drawer.getByText('TreasuryDesk does not send money.')).toBeVisible();
    await recordPayment(drawer, 'PAID');
    await expect(drawer.getByRole('button', { name: 'Approve record' })).toBeDisabled();
    await drawer.getByRole('button', { name: 'Close' }).first().click();

    await switchTo(page, 'OPS2');
    await page.getByRole('button', { name: 'Approve payment record' }).first().click();
    drawer = page.getByRole('dialog');
    await drawer.getByRole('button', { name: 'Approve record' }).click();
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
    await page.getByRole('radio', { name: /^A\. New investment/ }).click();
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

  test('a failed GAPS payment is recorded, confirmed, then paid again', async ({ page }) => {
    await fastDemo(page);
    await login(page, 'OPS');
    await page.goto('/operations?status=PENDING_OPERATIONS');
    const row = page.locator('main tbody tr', { hasText: 'GAPS' }).first();
    const ref = (await row.locator('td').first().textContent())!.trim();
    await row.getByRole('button', { name: /Record payment|Record again/ }).click();
    let drawer = page.getByRole('dialog');
    await recordPayment(drawer, 'FAILED');
    await drawer.getByRole('button', { name: 'Close' }).first().click();

    await switchTo(page, 'OPS2');
    await page.goto('/operations');
    await page
      .locator('main tbody tr', { hasText: ref })
      .getByRole('button', { name: 'Approve record' })
      .click();
    drawer = page.getByRole('dialog');
    await drawer.getByRole('button', { name: 'Approve record' }).click();
    await expect(drawer.getByText('Last payment failed')).toBeVisible({ timeout: 20_000 });
    await drawer
      .getByRole('button', { name: /Cancel|Close/ })
      .first()
      .click();

    // Paid again in GAPS: recorded by the first officer, approved by the second.
    await switchTo(page, 'OPS');
    await page.goto('/operations');
    await page
      .locator('main tbody tr', { hasText: ref })
      .getByRole('button', { name: 'Record again' })
      .click();
    drawer = page.getByRole('dialog');
    await recordPayment(drawer, 'PAID');
    await drawer.getByRole('button', { name: 'Close' }).first().click();
    await switchTo(page, 'OPS2');
    await page.goto('/operations');
    await page
      .locator('main tbody tr', { hasText: ref })
      .getByRole('button', { name: 'Approve record' })
      .click();
    drawer = page.getByRole('dialog');
    await drawer.getByRole('button', { name: 'Approve record' }).click();
    await expect(drawer.getByText('Executed', { exact: true }).first()).toBeVisible({
      timeout: 30_000,
    });
  });

  test('an inflow credited to an account goes Treasury Officer → Head of Treasury → Operations', async ({
    page,
  }) => {
    const errors = collectConsoleErrors(page);
    await fastDemo(page);
    await login(page, 'TO');
    const ref = await buildToVoucher(page, /Inflow/, /^B\. Credit to an account/);
    await page.getByRole('textbox', { name: /^Amount received/ }).fill('3,500,000');
    await page.getByRole('combobox', { name: /^Credit to/ }).selectOption('PA');
    await expect(page.getByText('Amount credited')).toBeVisible({ timeout: 20_000 });
    await page.getByRole('button', { name: 'Sign & submit' }).click();
    await sign(page, 'TO', 'Sign & submit');
    // No Account Officer call-back on this route: straight to the Head of Treasury.
    await expect(page.getByText('Awaiting Head Treasury', { exact: true }).first()).toBeVisible({
      timeout: 20_000,
    });

    await switchTo(page, 'HT');
    await page.getByRole('button', { name: 'Approve & sign' }).first().click();
    await sign(page, 'HT');
    await expect(page.getByText('Ready for Operations', { exact: true }).first()).toBeVisible({
      timeout: 20_000,
    });
    await page.getByRole('tab', { name: /Controls/ }).click();
    await expect(page.getByRole('tabpanel').getByLabel('not required')).toHaveCount(4);
    expect(errors, `console errors while running ${ref}`).toEqual([]);
  });

  test('commission on turnover is its own transaction, with the rate chosen each time', async ({
    page,
  }) => {
    const errors = collectConsoleErrors(page);
    await fastDemo(page);
    await login(page, 'TO');
    await page.goto('/transactions/new');
    await page.getByRole('radio', { name: /Commission on turnover/ }).click();
    await page.getByRole('radio', { name: /^A\. Current \(CMS\) account/ }).click();
    const combo = page.locator('main input[role="combobox"]');
    const options = page.locator('main [role="option"]');
    let picked = false;
    for (let i = 0; i < 40 && !picked; i++) {
      await combo.click();
      await options.nth(i).click();
      const subjects = page.locator('[aria-label="Subject"] button:not([disabled])');
      if (await subjects.count()) {
        await subjects.first().click();
        picked = true;
      }
    }
    expect(picked, 'a customer with a Current account').toBeTruthy();
    await page.getByRole('button', { name: /Create draft and continue/ }).click();
    // No customer instruction or signature check: straight to Eazybankz.
    await expect(page.getByRole('heading', { name: /2\. Eazybankz/ })).toBeVisible({
      timeout: 20_000,
    });
    await page.getByRole('button', { name: 'Refresh from Eazybankz' }).click();
    await page.getByLabel('Figures confirmed in Eazybankz').check();
    await page.getByRole('button', { name: 'Continue to voucher' }).click();
    await expect(page.getByRole('heading', { name: /3\. Voucher/ })).toBeVisible();
    await page.getByRole('textbox', { name: /^Turnover/ }).fill('1,000,000');
    await expect(page.getByText('Choose the COT rate').first()).toBeVisible();
    await page.getByRole('radio', { name: '₦5 per mille' }).click();
    await expect(page.getByText('₦5,000.00').first()).toBeVisible({ timeout: 20_000 });
    await page.getByRole('button', { name: 'Sign & submit' }).click();
    await sign(page, 'TO', 'Sign & submit');
    await expect(page.getByText('Awaiting Head Treasury', { exact: true }).first()).toBeVisible({
      timeout: 20_000,
    });
    expect(errors).toEqual([]);
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

  test('a maturity on a weekend asks to move to the next business day', async ({ page }) => {
    await fastDemo(page);
    await login(page, 'TO');
    await buildToVoucher(page, /Inflow/, /^A\. New investment/);
    await page.getByLabel('Principal').fill('10,000,000');
    await page.getByLabel('Rate (% p.a.)').fill('15');
    // Effective next Wednesday, and a tenor that lands the maturity on a Saturday.
    const start = new Date();
    start.setUTCDate(start.getUTCDate() + ((3 - start.getUTCDay() + 7) % 7 || 7));
    const eff = start.toISOString().slice(0, 10);
    await page.getByLabel('Effective / transfer date').fill(eff);
    const base = new Date(`${eff}T12:00:00Z`).getTime();
    let tenor = 90;
    while (new Date(base + tenor * 864e5).getUTCDay() !== 6) tenor++;
    await page.getByLabel('Tenor', { exact: true }).fill(String(tenor));

    const ask = page.getByRole('dialog', { name: 'Change the maturity date?' });
    await expect(ask).toBeVisible({ timeout: 20_000 });
    await expect(ask.getByText(/a weekend/)).toBeVisible();
    await ask.getByRole('button', { name: /^Move to Monday/ }).click();
    await expect(ask).toBeHidden();
    await expect(page.getByLabel('Tenor', { exact: true })).toHaveValue(String(tenor + 2));
    await expect(page.getByText('The maturity date is not a business day')).toHaveCount(0);
  });

  test('the printed voucher shows the previous investment, words and signatures', async ({
    page,
  }) => {
    await fastDemo(page);
    await login(page, 'TO');
    await page.goto('/transactions?tab=completed&type=ROLLOVER');
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
    await expect(printPage.getByText('Previous investment')).toBeVisible();
    await expect(printPage.getByText(/Interest accrued to/)).toBeVisible();
    await expect(printPage.getByText('AMOUNT IN WORDS')).toBeVisible();
    await expect(printPage.getByText('ACCOUNT OFFICER')).toBeVisible();
    await expect(printPage.getByText('MANAGING DIRECTOR')).toBeVisible();
    await printPage.close();
  });
});
