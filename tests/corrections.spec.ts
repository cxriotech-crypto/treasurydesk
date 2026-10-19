import { expect, test, type Page } from '@playwright/test';
import { collectConsoleErrors, fastDemo, login, sign, switchTo, switchToName } from './helpers';

const pdf = (name: string) => ({
  name,
  mimeType: 'application/pdf',
  buffer: Buffer.from(`%PDF-1.4 ${name}`),
});

/** Open the first of the maker's transactions in a status, from the list. */
async function openFirst(page: Page, status: string) {
  await page.goto(`/transactions?status=${status}`);
  await page.locator('main tbody tr a').first().click();
  await expect(page).toHaveURL(/\/transactions\/TXN-/);
}

test.describe('Client corrections', () => {
  test('Treasury submits a batch; an approver decides item by item', async ({ page }) => {
    const errors = collectConsoleErrors(page);
    await fastDemo(page);
    await login(page, 'TO');

    // Several ready transactions, submitted together with one signature.
    await page.goto('/batches');
    await page.getByRole('button', { name: 'New batch' }).click();
    const modal = page.getByRole('dialog', { name: 'New batch' });
    await expect(modal.getByText(/Ready to sign/)).toBeVisible({ timeout: 20_000 });
    const boxes = modal.locator('ul input[type="checkbox"]');
    await boxes.nth(0).check();
    await boxes.nth(1).check();
    await modal.getByRole('button', { name: /Sign and submit/ }).click();
    await sign(page, 'TO', 'Sign & submit');
    await expect(page).toHaveURL(/\/batches\/BAT-/, { timeout: 20_000 });
    await expect(page.getByText('Awaiting Account Officer').first()).toBeVisible();

    // Head of Treasury opens the seeded batch waiting for them and returns one item.
    await switchTo(page, 'HT');
    await page.goto('/batches');
    await page
      .locator('main tbody tr', { hasText: 'Awaiting Head Treasury' })
      .first()
      .locator('td')
      .first()
      .click();
    await expect(page.getByText(/item\(s\) waiting for you/)).toBeVisible({ timeout: 20_000 });
    // The table and the phone card list both render the item; act on the visible copy.
    await page.locator('main table').getByRole('radio', { name: 'Return' }).first().click();
    await page
      .locator('input[aria-label^="Reason for TRX-"]:visible')
      .first()
      .fill('Rate letter missing');
    await page.getByRole('button', { name: /Sign 1 decision/ }).click();
    await sign(page, 'HT', 'Sign decisions');
    await expect(page.getByText('1 decision(s) signed')).toBeVisible({ timeout: 20_000 });
    await expect(page.getByText('Returned for correction').first()).toBeVisible();
    expect(errors).toEqual([]);
  });

  test('the maker recalls a transaction; a recall request is sent back to the person who asked', async ({
    page,
  }) => {
    await fastDemo(page);
    await login(page, 'TO');

    // Recall from the More menu.
    await openFirst(page, 'PENDING_AUDIT');
    await page.getByRole('button', { name: 'More actions' }).click();
    await page.getByRole('menuitem', { name: 'Recall' }).click();
    await page.getByRole('dialog').getByLabel('Reason').fill('Customer changed the value date');
    await page.getByRole('dialog').getByRole('button', { name: 'Recall' }).click();
    await expect(page.getByText('Recalled', { exact: true })).toBeVisible({ timeout: 20_000 });
    await expect(page.getByRole('link', { name: 'Correct and resubmit' })).toBeVisible();

    // Someone else asks; the maker sends it back to them.
    await openFirst(page, 'PENDING_MD');
    await switchTo(page, 'AUD');
    await page.getByRole('button', { name: 'More actions' }).click();
    await page.getByRole('menuitem', { name: 'Request a recall' }).click();
    await page.getByRole('dialog').getByLabel('Reason').fill('I need to re-check the mandate');
    await page.getByRole('dialog').getByRole('button', { name: 'Request recall' }).click();
    await expect(page.getByText('You asked for a recall')).toBeVisible({ timeout: 20_000 });

    await switchTo(page, 'TO');
    await page.getByRole('button', { name: 'Answer' }).first().click();
    const answer = page.getByRole('dialog');
    await answer.getByRole('radio', { name: /Send it back to Olumide Adeyemi/ }).check();
    await answer.getByRole('button', { name: 'Recall' }).click();
    await expect(page.getByText('Awaiting Audit', { exact: true }).first()).toBeVisible({
      timeout: 20_000,
    });
  });

  test('a paper signature is uploaded for an approver who cannot sign in the app', async ({
    page,
  }) => {
    await fastDemo(page);
    await login(page, 'TO');
    await openFirst(page, 'PENDING_HEAD_TREASURY');
    await page.getByRole('button', { name: 'More actions' }).click();
    await page.getByRole('menuitem', { name: /Record paper signature/ }).click();
    const dlg = page.getByRole('dialog');
    await dlg.getByRole('button', { name: 'Record signature' }).click();
    await expect(dlg.getByText(/Choose the Head, Treasury who signed/)).toBeVisible();
    await dlg.getByLabel('Who signed').selectOption({ label: 'Ibrahim Musa' });
    await dlg.getByLabel('Why it was signed on paper').fill('Travelling; signed the printout');
    await dlg
      .getByLabel('Upload the signed copy')
      .setInputFiles([pdf('signed-page-1.pdf'), pdf('signed-page-2.pdf')]);
    await expect(dlg.getByText('signed-page-2.pdf')).toBeVisible();
    await dlg.getByRole('button', { name: 'Record signature' }).click();
    // On to the next level of its route (MIS, or Operations for an inflow credited to an account).
    await expect(page.getByText(/^(Awaiting MIS|Ready for Operations)$/).first()).toBeVisible({
      timeout: 20_000,
    });
    await page.getByRole('tab', { name: /Documents/ }).click();
    await expect(page.getByText('Paper signatures')).toBeVisible();
    await expect(page.getByText('signed-page-1.pdf')).toBeVisible();

    // The approver named on it is told, and confirms it (or could dispute it).
    await switchToName(page, 'Ibrahim Musa');
    const banner = page.getByText('Signed on paper in your name');
    await expect(banner).toBeVisible({ timeout: 20_000 });
    await expect(page.getByRole('button', { name: 'I did not sign it' })).toBeVisible();
    await page.getByRole('button', { name: 'Yes, I signed it' }).click();
    await expect(page.getByText('Paper signature confirmed')).toBeVisible({ timeout: 20_000 });
    await expect(banner).toBeHidden();
  });

  test('several supporting documents can be added at once', async ({ page }) => {
    await fastDemo(page);
    await login(page, 'MIS');
    await openFirst(page, 'PENDING_MIS');
    await page.getByRole('tab', { name: /Documents/ }).click();
    await page
      .getByLabel('Choose documents')
      .setInputFiles([pdf('valuation.pdf'), pdf('board-minutes.pdf'), pdf('id-card.pdf')]);
    await page.getByRole('button', { name: 'Add 3 document(s)' }).click();
    await expect(page.getByText('3 document(s) added')).toBeVisible({ timeout: 20_000 });
    await expect(page.getByText('board-minutes.pdf')).toBeVisible();
  });
});
