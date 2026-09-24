/**
 * What each register's upload file must contain, and how a row is checked.
 *
 * Pure functions: the screen, the service and the checks all read these specs, so the template a
 * user downloads always matches the columns the importer validates.
 */
import type { ImportRegister } from '@/domain/types';
import { ACCOUNT_PRODUCT_LABELS, PRODUCT_LABELS } from '@/domain/codes';
import { isValidMoney, toMoney } from './money';
import { isIsoDate } from './dates';

const PRODUCT_CODES = Object.keys(PRODUCT_LABELS);
const ACCOUNT_PRODUCT_CODES = Object.keys(ACCOUNT_PRODUCT_LABELS);

export interface ImportColumn {
  key: string;
  label: string;
  required: boolean;
  /** Shown in the template and in the column help. */
  example: string;
  hint?: string;
}

export interface RegisterSpec {
  label: string;
  description: string;
  columns: ImportColumn[];
  /** Field errors for one row, keyed by column. Empty when the row is good. */
  validate(row: Record<string, string>): Record<string, string>;
}

const money = (v: string) => isValidMoney(v.replace(/,/g, ''));
const rate = (v: string) => /^\d+(\.\d{1,4})?$/.test(v) && Number(v) >= 0 && Number(v) <= 100;
const digits = (v: string, n: number) => new RegExp(`^\\d{${n}}$`).test(v);
const PHONE = /^(0|\+?234)[789]\d{9}$/;

/** Blank optional cells are fine; a filled cell is always checked. */
function check(
  row: Record<string, string>,
  columns: ImportColumn[],
  rules: Record<string, (v: string) => string | null>
): Record<string, string> {
  const errors: Record<string, string> = {};
  for (const c of columns) {
    const value = (row[c.key] ?? '').trim();
    if (!value) {
      if (c.required) errors[c.key] = `${c.label} is required`;
      continue;
    }
    const msg = rules[c.key]?.(value);
    if (msg) errors[c.key] = msg;
  }
  return errors;
}

const CUSTOMERS: RegisterSpec = {
  label: 'Customers',
  description: 'Names, contact details and the Account Officer each customer belongs to.',
  columns: [
    {
      key: 'customerName',
      label: 'Customer name',
      required: true,
      example: 'Adeyemi Holdings Ltd',
    },
    {
      key: 'customerType',
      label: 'Customer type',
      required: true,
      example: 'CORPORATE',
      hint: 'INDIVIDUAL or CORPORATE',
    },
    { key: 'regPhone', label: 'Registered phone', required: true, example: '08031234567' },
    { key: 'email', label: 'Email', required: true, example: 'treasury@adeyemi.com' },
    { key: 'address', label: 'Address', required: true, example: '14 Marina, Lagos Island' },
    { key: 'bvn', label: 'BVN', required: false, example: '22233344455', hint: '11 digits' },
    {
      key: 'whtExempt',
      label: 'WHT exempt',
      required: false,
      example: 'NO',
      hint: 'YES or NO (default NO)',
    },
    {
      key: 'accountOfficerEmail',
      label: 'Account Officer email',
      required: true,
      example: 'tunde.bakare@fmtfinance.com',
      hint: 'Must be an active Account Officer',
    },
  ],
  validate: (row) =>
    check(row, CUSTOMERS.columns, {
      customerType: (v) =>
        ['INDIVIDUAL', 'CORPORATE'].includes(v.toUpperCase())
          ? null
          : 'Use INDIVIDUAL or CORPORATE',
      regPhone: (v) => (PHONE.test(v.replace(/\s/g, '')) ? null : 'Enter a Nigerian mobile number'),
      email: (v) => (/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(v) ? null : 'Enter a valid email'),
      bvn: (v) => (digits(v, 11) ? null : 'BVN must be 11 digits'),
      whtExempt: (v) => (['YES', 'NO'].includes(v.toUpperCase()) ? null : 'Use YES or NO'),
      accountOfficerEmail: (v) =>
        /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(v) ? null : 'Enter a valid email',
    }),
};

const ACCOUNTS: RegisterSpec = {
  label: 'Accounts',
  description: 'Savings, personal and call accounts, with their opening balances.',
  columns: [
    {
      key: 'cifNo',
      label: 'CIF number',
      required: true,
      example: 'FMT000001',
      hint: 'The customer this account belongs to',
    },
    { key: 'accountNo', label: 'Account number', required: true, example: '0123456789' },
    { key: 'accountName', label: 'Account name', required: true, example: 'Adeyemi Holdings Ltd' },
    {
      key: 'productCode',
      label: 'Product',
      required: true,
      example: 'PA',
      hint: ACCOUNT_PRODUCT_CODES.join(', '),
    },
    { key: 'ledgerBal', label: 'Ledger balance', required: true, example: '5000000.00' },
    {
      key: 'availableBal',
      label: 'Available balance',
      required: false,
      example: '5000000.00',
      hint: 'Defaults to the ledger balance',
    },
    { key: 'openedDate', label: 'Opened date', required: true, example: '2024-03-01' },
  ],
  validate: (row) =>
    check(row, ACCOUNTS.columns, {
      accountNo: (v) => (digits(v, 10) ? null : 'Account number must be 10 digits'),
      productCode: (v) =>
        ACCOUNT_PRODUCT_CODES.includes(v.toUpperCase())
          ? null
          : `Use one of ${ACCOUNT_PRODUCT_CODES.join(', ')}`,
      ledgerBal: (v) => (money(v) ? null : 'Enter an amount like 5000000.00'),
      availableBal: (v) => (money(v) ? null : 'Enter an amount like 5000000.00'),
      openedDate: (v) => (isIsoDate(v) ? null : 'Use the date format YYYY-MM-DD'),
    }),
};

const INVESTMENTS: RegisterSpec = {
  label: 'Investments',
  description: 'The investment book: principal, rate, tenor and value dates.',
  columns: [
    { key: 'cifNo', label: 'CIF number', required: true, example: 'FMT000001' },
    {
      key: 'accountNo',
      label: 'Funding account',
      required: true,
      example: '0123456789',
      hint: "One of the customer's accounts",
    },
    {
      key: 'productCode',
      label: 'Product',
      required: true,
      example: 'TERM',
      hint: PRODUCT_CODES.join(', '),
    },
    { key: 'principalAmt', label: 'Principal', required: true, example: '10000000.00' },
    { key: 'intRate', label: 'Rate (% p.a.)', required: true, example: '15.00' },
    { key: 'effectiveDate', label: 'Effective date', required: true, example: '2026-01-06' },
    { key: 'tenorDays', label: 'Tenor (days)', required: true, example: '365' },
    {
      key: 'annivFreqDays',
      label: 'Anniversary interest',
      required: false,
      example: '0',
      hint: '0, 30, 60 or 90 (0 = paid at maturity)',
    },
    {
      key: 'intPaidToDate',
      label: 'Interest paid to date',
      required: false,
      example: '0.00',
      hint: 'Defaults to 0.00',
    },
  ],
  validate: (row) =>
    check(row, INVESTMENTS.columns, {
      accountNo: (v) => (digits(v, 10) ? null : 'Account number must be 10 digits'),
      productCode: (v) =>
        PRODUCT_CODES.includes(v.toUpperCase()) ? null : `Use one of ${PRODUCT_CODES.join(', ')}`,
      principalAmt: (v) =>
        money(v) && Number(v.replace(/,/g, '')) > 0 ? null : 'Enter an amount above zero',
      intRate: (v) => (rate(v) ? null : 'Enter a rate between 0 and 100'),
      effectiveDate: (v) => (isIsoDate(v) ? null : 'Use the date format YYYY-MM-DD'),
      tenorDays: (v) =>
        /^\d+$/.test(v) && Number(v) >= 1 && Number(v) <= 1825
          ? null
          : 'Tenor must be 1–1,825 days',
      annivFreqDays: (v) => (['0', '30', '60', '90'].includes(v) ? null : 'Use 0, 30, 60 or 90'),
      intPaidToDate: (v) => (money(v) ? null : 'Enter an amount like 0.00'),
    }),
};

const BENEFICIARIES: RegisterSpec = {
  label: 'Beneficiaries',
  description: 'Saved payment destinations for each customer.',
  columns: [
    { key: 'cifNo', label: 'CIF number', required: true, example: 'FMT000001' },
    { key: 'benefName', label: 'Beneficiary name', required: true, example: 'Chidi Okafor' },
    {
      key: 'bankCode',
      label: 'Bank code',
      required: true,
      example: '058',
      hint: 'CBN code, 3 digits; 000 for an account here',
    },
    { key: 'accountNo', label: 'Account number', required: true, example: '0123456789' },
    {
      key: 'accountType',
      label: 'Account type',
      required: false,
      example: 'SAVINGS',
      hint: 'SAVINGS or CURRENT (default SAVINGS)',
    },
  ],
  validate: (row) =>
    check(row, BENEFICIARIES.columns, {
      bankCode: (v) => (digits(v, 3) ? null : 'Bank code must be 3 digits'),
      accountNo: (v) => (digits(v, 10) ? null : 'Account number must be 10 digits'),
      accountType: (v) =>
        ['SAVINGS', 'CURRENT'].includes(v.toUpperCase()) ? null : 'Use SAVINGS or CURRENT',
    }),
};

const BANKS: RegisterSpec = {
  label: 'Banks',
  description: 'The CBN bank list used for payments to other banks.',
  columns: [
    { key: 'bankCode', label: 'CBN code', required: true, example: '058' },
    { key: 'bankName', label: 'Bank name', required: true, example: 'Guaranty Trust Bank' },
    { key: 'shortName', label: 'Short name', required: true, example: 'GTBank' },
  ],
  validate: (row) =>
    check(row, BANKS.columns, {
      bankCode: (v) => (digits(v, 3) ? null : 'CBN code must be 3 digits'),
    }),
};

const HOLIDAYS: RegisterSpec = {
  label: 'Public holidays',
  description: 'Dates the bank does not process, used for maturity and SLA dates.',
  columns: [
    { key: 'holidayDate', label: 'Date', required: true, example: '2026-10-01' },
    { key: 'description', label: 'Description', required: true, example: 'Independence Day' },
  ],
  validate: (row) =>
    check(row, HOLIDAYS.columns, {
      holidayDate: (v) => (isIsoDate(v) ? null : 'Use the date format YYYY-MM-DD'),
    }),
};

export const IMPORT_SPECS: Record<ImportRegister, RegisterSpec> = {
  CUSTOMERS,
  ACCOUNTS,
  INVESTMENTS,
  BENEFICIARIES,
  BANKS,
  HOLIDAYS,
};

export const IMPORT_REGISTERS = Object.keys(IMPORT_SPECS) as ImportRegister[];

/** Header row plus one example row, for the downloadable template. */
export function templateRows(register: ImportRegister): string[][] {
  const spec = IMPORT_SPECS[register];
  return [spec.columns.map((c) => c.label), spec.columns.map((c) => c.example)];
}

/** Match the file's headers to the spec's columns by label, ignoring case and spacing. */
export function mapHeaders(register: ImportRegister, headers: string[]): Record<number, string> {
  const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '');
  const spec = IMPORT_SPECS[register];
  const out: Record<number, string> = {};
  headers.forEach((h, i) => {
    const col = spec.columns.find((c) => norm(c.label) === norm(h) || norm(c.key) === norm(h));
    if (col) out[i] = col.key;
  });
  return out;
}

export interface ParsedImport {
  rows: Record<string, string>[];
  rejected: { line: number; errors: string[] }[];
  missingColumns: string[];
}

/** Turn a sheet into validated rows. Line numbers are the file's own (header = line 1). */
export function parseRows(
  register: ImportRegister,
  headers: string[],
  body: string[][]
): ParsedImport {
  const spec = IMPORT_SPECS[register];
  const map = mapHeaders(register, headers);
  const found = new Set(Object.values(map));
  const missingColumns = spec.columns
    .filter((c) => c.required && !found.has(c.key))
    .map((c) => c.label);
  const rows: Record<string, string>[] = [];
  const rejected: { line: number; errors: string[] }[] = [];
  if (missingColumns.length) return { rows, rejected, missingColumns };

  body.forEach((cells, i) => {
    if (cells.every((c) => !c || !c.trim())) return; // blank line
    const row: Record<string, string> = {};
    cells.forEach((cell, col) => {
      const key = map[col];
      if (key) row[key] = (cell ?? '').trim();
    });
    const errors = spec.validate(row);
    const keys = Object.keys(errors);
    if (keys.length) {
      rejected.push({ line: i + 2, errors: keys.map((k) => errors[k]) });
      return;
    }
    // Normalise the values the rest of the app depends on being canonical.
    for (const c of spec.columns) {
      const v = row[c.key];
      if (v === undefined) continue;
      if (['principalAmt', 'ledgerBal', 'availableBal', 'intPaidToDate'].includes(c.key))
        row[c.key] = toMoney(v.replace(/,/g, ''));
      else if (['customerType', 'productCode', 'accountType', 'whtExempt'].includes(c.key))
        row[c.key] = v.toUpperCase();
    }
    rows.push(row);
  });
  return { rows, rejected, missingColumns };
}
