import { expect, test } from '@playwright/test';
import { collectConsoleErrors, fastDemo, login, sign, switchTo } from './helpers';

const stamp = () => String(Date.now()).slice(-5);

test.describe('Data import', () => {
  test('Treasury uploads a file and the Head of Treasury approves it', async ({ page }) => {
    const errors = collectConsoleErrors(page);
    await fastDemo(page);
    await login(page, 'TO');
    const name = `Playwright holiday ${stamp()}`;

    await page.goto('/imports');
    await page.getByLabel('Register').selectOption('HOLIDAYS');

    // Two good rows and one that fails its check.
    const csv = [
      'Date,Description',
      `2027-05-04,${name}`,
      `2027-05-05,${name} 2`,
      `not-a-date,${name} 3`,
    ].join('\n');
    await page.getByLabel('Choose a file to import').setInputFiles({
      name: 'holidays.csv',
      mimeType: 'text/csv',
      buffer: Buffer.from(csv),
    });

    await expect(page.getByText(/2 row\(s\) ready to import/)).toBeVisible();
    await expect(page.getByText(/1 row\(s\) will be left out/)).toBeVisible();
    await expect(page.getByText(/Line 4/)).toBeVisible();

    await page.getByRole('button', { name: /Send 2 row\(s\) for approval/ }).click();
    await expect(page.getByText('The Head of Treasury has been asked to approve it.')).toBeVisible({
      timeout: 20_000,
    });
    await expect(page.locator('main table').getByText('Awaiting approval').first()).toBeVisible();

    // Nothing is written until it is approved.
    await switchTo(page, 'HT');
    await page.goto('/settings');
    await page.getByRole('tab', { name: 'Public holidays' }).click();
    await page.getByLabel('Year').selectOption('2027');
    await expect(page.getByText(name, { exact: true })).toHaveCount(0);

    await page.goto('/imports');
    await page.getByRole('button', { name: 'Approve' }).first().click();
    await sign(page, 'HT', 'Approve & import');
    await expect(page.getByText('2 record(s) created.')).toBeVisible({ timeout: 20_000 });

    await page.goto('/settings');
    await page.getByRole('tab', { name: 'Public holidays' }).click();
    await page.getByLabel('Year').selectOption('2027');
    await expect(page.getByText(name, { exact: true })).toBeVisible();

    expect(errors).toEqual([]);
  });

  test('the Head of Treasury imports without a second approval, and templates download', async ({
    page,
  }) => {
    await fastDemo(page);
    await login(page, 'HT');
    await page.goto('/imports');

    const download = page.waitForEvent('download');
    await page.getByRole('button', { name: 'Download template' }).click();
    expect((await download).suggestedFilename()).toContain('customers-template.csv');

    await page.getByLabel('Register').selectOption('BANKS');
    const code = String(Math.floor(Math.random() * 900) + 100);
    await page.getByLabel('Choose a file to import').setInputFiles({
      name: 'banks.csv',
      mimeType: 'text/csv',
      buffer: Buffer.from(`CBN code,Bank name,Short name\n${code},Playwright Bank,PWB`),
    });
    await expect(page.getByText(/1 row\(s\) ready to import/)).toBeVisible();
    await page.getByRole('button', { name: /Import 1 row\(s\)/ }).click();
    await expect(page.getByText(/record\(s\) created/).first()).toBeVisible({ timeout: 20_000 });
    await expect(
      page
        .locator('main table')
        .getByText(/Applied/)
        .first()
    ).toBeVisible();
  });

  test('a file missing a required column is rejected with the column named', async ({ page }) => {
    await fastDemo(page);
    await login(page, 'TO');
    await page.goto('/imports');
    await page.getByLabel('Register').selectOption('INVESTMENTS');
    await page.getByLabel('Choose a file to import').setInputFiles({
      name: 'investments.csv',
      mimeType: 'text/csv',
      buffer: Buffer.from('CIF number,Principal\nFMT000001,1000000.00'),
    });
    await expect(page.getByText('The file is missing required columns')).toBeVisible();
    await expect(page.getByText(/Funding account/).first()).toBeVisible();
    await expect(page.getByRole('button', { name: /for approval/ })).toHaveCount(0);
  });
});
