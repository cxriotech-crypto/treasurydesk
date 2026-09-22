import { expect, test } from '@playwright/test';
import { collectConsoleErrors, fastDemo, login, switchTo } from './helpers';

const stamp = () => String(Date.now()).slice(-6);

test.describe('CRUD', () => {
  test('customer: create, edit, add signatory, add and delete beneficiary', async ({ page }) => {
    const errors = collectConsoleErrors(page);
    await fastDemo(page);
    await login(page, 'TO');
    const name = `Playwright Test Ltd ${stamp()}`;

    await page.goto('/customers');
    await page.getByRole('button', { name: 'New customer' }).click();
    const form = page.getByRole('dialog');
    await form.getByLabel('Customer name').fill(name);
    await form.getByLabel('Registered phone').fill('08031234567');
    await form.getByLabel('Email').fill(`test${stamp()}@example.com`);
    await form.getByLabel('Address').fill('1 Test Street, Lagos');
    await form.getByLabel('BVN').fill('22233344455');
    await form.getByLabel('Account Officer').selectOption({ index: 1 });
    await form.getByLabel('First signatory').fill('Test Signatory');
    await form.getByRole('button', { name: 'Create customer' }).click();
    await expect(page).toHaveURL(/\/customers\/CUS-/, { timeout: 20_000 });
    await expect(page.getByRole('heading', { level: 1 })).toContainText(name);

    // Validation: a bad phone number is rejected.
    await page.getByRole('button', { name: 'Edit' }).click();
    await page.getByRole('dialog').getByLabel('Registered phone').fill('123');
    await page.getByRole('dialog').getByRole('button', { name: 'Save changes' }).click();
    await expect(page.getByText('Enter a Nigerian mobile number')).toBeVisible();
    await page.getByRole('dialog').getByLabel('Registered phone').fill('08039998877');
    await page.getByRole('dialog').getByRole('button', { name: 'Save changes' }).click();
    await expect(page.getByText('Customer updated')).toBeVisible();

    // Signatory
    await page.getByRole('tab', { name: /Signatories/ }).click();
    await page.getByRole('button', { name: 'Add signatory' }).click();
    await page.getByRole('dialog').getByLabel('Full name').fill('Second Signatory');
    await page.getByRole('dialog').getByLabel('Signature class').selectOption('B');
    await page.getByRole('dialog').getByRole('button', { name: 'Save' }).click();
    await expect(page.getByText('Signatory added')).toBeVisible();
    await expect(page.getByAltText(/Specimen signature of Second Signatory/)).toBeVisible();

    // Beneficiary: create then delete
    await page.getByRole('tab', { name: /Beneficiaries/ }).click();
    await page.getByRole('button', { name: 'Add beneficiary' }).click();
    const ben = page.getByRole('dialog');
    await ben.getByLabel('Beneficiary name').fill('Test Beneficiary');
    await ben.getByLabel('Bank').selectOption({ index: 2 });
    await ben.getByLabel('Account number').fill('0123456789');
    await ben.getByRole('button', { name: 'Save' }).click();
    await expect(page.getByText('Beneficiary saved')).toBeVisible();
    await page.getByRole('button', { name: /Delete Test Beneficiary/ }).click();
    await page.getByRole('dialog').getByRole('button', { name: 'Delete beneficiary' }).click();
    await expect(page.getByText('Beneficiary deleted')).toBeVisible();

    expect(errors).toEqual([]);
  });

  test('admin: bank, holiday and user CRUD', async ({ page }) => {
    const errors = collectConsoleErrors(page);
    await login(page, 'ADM');
    await page.goto('/settings');

    // Bank
    await page.getByRole('tab', { name: 'Banks' }).click();
    await page.getByRole('button', { name: 'Add' }).click();
    const bank = page.getByRole('dialog');
    await bank.getByLabel('CBN code').fill('999');
    await bank.getByLabel('Bank name').fill(`Test Bank ${stamp()}`);
    await bank.getByLabel('Short name').fill('TestBank');
    await bank.getByRole('button', { name: 'Save' }).click();
    await expect(page.getByText('Bank saved')).toBeVisible();
    await page.getByRole('button', { name: 'Deactivate' }).last().click();
    await expect(page.getByText('Bank deactivated')).toBeVisible();

    // Holiday
    await page.getByRole('tab', { name: 'Public holidays' }).click();
    await page.getByRole('button', { name: 'Add' }).click();
    const hol = page.getByRole('dialog');
    await hol.getByLabel('Date').fill('2026-11-17');
    await hol.getByLabel('Description').fill('Playwright test holiday');
    await hol.getByRole('button', { name: 'Save' }).click();
    await expect(page.getByText('Holiday saved')).toBeVisible();
    await page.getByRole('button', { name: /Remove Playwright test holiday/ }).click();
    await page.getByRole('dialog').getByRole('button', { name: 'Remove holiday' }).click();
    await expect(page.getByText('Holiday removed')).toBeVisible();

    // User
    await page.getByRole('tab', { name: 'Users & roles' }).click();
    await page.getByRole('button', { name: 'Add user' }).click();
    const user = page.getByRole('dialog');
    await user.getByLabel('Full name').fill(`Test User ${stamp()}`);
    await user.getByLabel('Email').fill(`user${stamp()}@fmtfinance.com`);
    await user.getByLabel('Staff ID').fill(`FMT-${stamp()}`);
    await user.getByLabel('Role').selectOption('AO');
    await user.getByRole('button', { name: 'Save' }).click();
    await expect(page.getByText('User saved')).toBeVisible();

    expect(errors).toEqual([]);
  });

  test('comments can be added, edited and deleted by their author', async ({ page }) => {
    await fastDemo(page);
    await login(page, 'TO');
    await page.goto('/transactions');
    await page.locator('main tbody tr a').first().click();
    await page.getByRole('tab', { name: /Comments/ }).click();
    await page.getByLabel('New comment').fill('Playwright comment');
    await page.getByRole('button', { name: 'Add comment' }).click();
    await expect(page.getByText('Comment added')).toBeVisible();
    await page.getByRole('button', { name: 'Edit comment' }).first().click();
    await page.getByLabel('Edit comment').fill('Playwright comment (edited)');
    await page.getByRole('button', { name: 'Save' }).click();
    await expect(page.getByText('Comment updated')).toBeVisible();
    await page.getByRole('button', { name: 'Delete comment' }).first().click();
    await page.getByRole('dialog').getByRole('button', { name: 'Delete' }).click();
    await expect(page.getByText('Comment deleted')).toBeVisible();
  });

  test('a call-back can be logged from the call-back log', async ({ page }) => {
    await fastDemo(page);
    await login(page, 'AO');
    await page.goto('/callbacks');
    const logButton = page.getByRole('button', { name: 'Log call' }).first();
    if (!(await logButton.count())) test.skip(true, 'no call-back waiting for this officer');
    await logButton.click();
    const dialog = page.getByRole('dialog');
    for (const item of ['Amount confirmed', 'Instruction confirmed', 'Beneficiary confirmed', 'Purpose confirmed']) {
      await dialog.getByRole('radiogroup', { name: item }).getByRole('radio', { name: 'Confirmed', exact: true }).click();
    }
    await dialog.getByRole('radio', { name: 'Confirmed', exact: true }).last().check();
    await dialog.getByRole('button', { name: 'Save call-back' }).click();
    await expect(page.getByText('Call-back confirmed')).toBeVisible({ timeout: 20_000 });
  });

  test('changing a rate recalculates open drafts and the self-check still passes', async ({ page }) => {
    await login(page, 'ADM');
    await page.goto('/settings');
    await page.getByLabel('Pre-liquidation charge (%)').fill('25');
    await page.getByLabel('Reason for the change').fill('Playwright rate change');
    await page.getByRole('button', { name: 'Save settings' }).click();
    await expect(page.getByText(/open drafts? recalculated/)).toBeVisible({ timeout: 20_000 });

    await page.goto('/settings/self-check');
    await page.getByRole('button', { name: 'Run all checks' }).click();
    await expect(page.getByText('6/6 required checks passed')).toBeVisible({ timeout: 20_000 });

    await page.goto('/settings');
    await page.getByLabel('Pre-liquidation charge (%)').fill('20');
    await page.getByLabel('Reason for the change').fill('Revert');
    await page.getByRole('button', { name: 'Save settings' }).click();
    await expect(page.getByText(/open drafts? recalculated/)).toBeVisible();
  });

  test('the audit trail verifies its own hash chain', async ({ page }) => {
    await login(page, 'AUD');
    await page.goto('/audit');
    await page.getByRole('button', { name: 'Verify integrity' }).click();
    await expect(page.getByText('The hash chain is intact')).toBeVisible({ timeout: 20_000 });
  });

  test('notifications can be read and cleared', async ({ page }) => {
    await login(page, 'HT');
    await page.goto('/notifications');
    await page.getByRole('button', { name: 'Mark all read' }).click();
    await expect(page.getByRole('button', { name: 'Mark all read' })).toBeDisabled({ timeout: 20_000 });
    await switchTo(page, 'MD');
  });
});
