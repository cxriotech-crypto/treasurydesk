'use client';

import React, { useState, useCallback } from 'react';
import Decimal from 'decimal.js';
import {
  interest,
  preliqFull,
  preliqPartial,
  anniversary,
  rolloverA,
  thirdParty,
  wht,
} from '@/lib/calc';
import { CheckCircle, XCircle, PlayCircle, RefreshCw } from 'lucide-react';

// ─── Types ────────────────────────────────────────────────────────────────────

interface FieldResult {
  label: string;
  expected: string;
  actual: string;
  pass: boolean;
}

interface TestResult {
  id: number;
  name: string;
  fields: FieldResult[];
  pass: boolean;
  error?: string;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function eq(a: string, b: string): boolean {
  try {
    return new Decimal(a).toDecimalPlaces(2).equals(new Decimal(b).toDecimalPlaces(2));
  } catch {
    return a === b;
  }
}

function field(label: string, expected: string, actual: string): FieldResult {
  return { label, expected, actual, pass: eq(expected, actual) };
}

// ─── Test definitions ─────────────────────────────────────────────────────────
// Settings used: WHT 10%, PRELIQ_CHARGE 20%, TRANSFER_FEE 0.10%, DAY_COUNT 365
// These are the seed defaults so they match the live settings.

function runTests(): TestResult[] {
  const results: TestResult[] = [];
  const customer = { isWhtExempt: false };

  // ── Test 1: Maturity payout ───────────────────────────────────────────────
  try {
    const P = '10000000';
    const rate = '15';
    const days = 365;
    const interestAmt = interest(P, rate, days);
    const whtAmt = wht(interestAmt, customer, true);
    const net = new Decimal(P).plus(interestAmt).minus(whtAmt).toFixed(2);

    const fields: FieldResult[] = [
      field('Interest', '1500000.00', interestAmt),
      field('WHT', '150000.00', whtAmt),
      field('Net Maturity Value', '11350000.00', net),
    ];
    results.push({ id: 1, name: 'Maturity — P 10,000,000 @ 15% for 365 days', fields, pass: fields.every(f => f.pass) });
  } catch (e: unknown) {
    results.push({ id: 1, name: 'Maturity — P 10,000,000 @ 15% for 365 days', fields: [], pass: false, error: String(e) });
  }

  // ── Test 2: Full pre-liquidation at day 180 ───────────────────────────────
  try {
    const effectiveDate = '2025-01-01';
    const liqDate = '2025-07-01'; // 181 days from Jan 1 — use exact 180 days
    // We need exactly 180 days elapsed. Use a fixed pair.
    const eff2 = '2025-01-01';
    const liq2 = '2025-07-01'; // Jan1 → Jul1 = 181 days; use Jun30 for 180
    const liq180 = '2025-06-30'; // Jan1 → Jun30 = 180 days

    const inv = {
      principalAmt: '10000000',
      intRate: '15',
      effectiveDate: eff2,
      maturityDate: '2026-01-01',
      customer,
    };
    const result = preliqFull(inv, liq180);

    const fields: FieldResult[] = [
      field('Accrued Interest', '739726.03', result.accrued),
      field('Charge (20%)', '147945.21', result.charge),
      field('Net Interest', '591780.82', result.netInterest),
      field('WHT (10% on net)', '59178.08', result.wht),
      field('Payout', '10532602.74', result.payout),
    ];
    results.push({ id: 2, name: 'Full Pre-Liquidation at day 180', fields, pass: fields.every(f => f.pass) });
  } catch (e: unknown) {
    results.push({ id: 2, name: 'Full Pre-Liquidation at day 180', fields: [], pass: false, error: String(e) });
  }

  // ── Test 3: Partial pre-liquidation ──────────────────────────────────────
  try {
    // P=10,000,000 @ 15%, liqDate = effectiveDate + 365 days → accrued = 1,500,000
    const eff3 = '2025-01-01';
    const liq3 = '2026-01-01'; // exactly 365 days
    const inv3 = {
      principalAmt: '10000000',
      intRate: '15',
      effectiveDate: eff3,
      maturityDate: '2026-01-01',
      customer,
    };
    const result = preliqPartial(inv3, liq3, '3000000');

    const fields: FieldResult[] = [
      field('Accrued Interest', '1500000.00', result.accrued),
      field('Charge (20% of accrued)', '300000.00', result.charge),
      field('Payout', '3000000.00', result.payout),
      field('Remaining Principal', '7000000.00', result.remaining),
      field('Rebooked Principal', '6700000.00', result.rebookedPrincipal),
    ];
    results.push({ id: 3, name: 'Partial Pre-Liquidation — requested 3,000,000', fields, pass: fields.every(f => f.pass) });
  } catch (e: unknown) {
    results.push({ id: 3, name: 'Partial Pre-Liquidation — requested 3,000,000', fields: [], pass: false, error: String(e) });
  }

  // ── Test 4: Anniversary 30/60/90 days ─────────────────────────────────────
  try {
    const inv4 = { principalAmt: '10000000', intRate: '15', effectiveDate: '2025-01-01', customer };
    const a30 = anniversary(inv4, 30);
    const a60 = anniversary(inv4, 60);
    const a90 = anniversary(inv4, 90);

    const fields: FieldResult[] = [
      field('30-day period interest', '123287.67', a30.periodInterest),
      field('60-day period interest', '246575.34', a60.periodInterest),
      field('90-day period interest', '369863.01', a90.periodInterest),
    ];
    results.push({ id: 4, name: 'Anniversary — 30 / 60 / 90 days @ 15%', fields, pass: fields.every(f => f.pass) });
  } catch (e: unknown) {
    results.push({ id: 4, name: 'Anniversary — 30 / 60 / 90 days @ 15%', fields: [], pass: false, error: String(e) });
  }

  // ── Test 5: Rollover A into 182 days at 16% ───────────────────────────────
  try {
    const inv5 = {
      principalAmt: '10000000',
      intRate: '15',
      tenorDays: 365,
      effectiveDate: '2025-01-01',
      maturityDate: '2026-01-01',
      customer,
    };
    const result = rolloverA(inv5, '16', 182, '2026-01-01');

    const fields: FieldResult[] = [
      field('Roll Amount (NET basis)', '11350000.00', result.rollAmount),
      field('Projected New Interest', '905512.33', result.projectedNewInterest),
    ];
    results.push({ id: 5, name: 'Rollover A — 182 days @ 16% (NET basis)', fields, pass: fields.every(f => f.pass) });
  } catch (e: unknown) {
    results.push({ id: 5, name: 'Rollover A — 182 days @ 16% (NET basis)', fields: [], pass: false, error: String(e) });
  }

  // ── Test 6: Third-party external 5,000,000 ────────────────────────────────
  try {
    const result = thirdParty('5000000', false);

    const fields: FieldResult[] = [
      field('Fee (0.10%)', '5000.00', result.fee),
      field('Amount to Beneficiary', '4995000.00', result.amountToBeneficiary),
    ];
    results.push({ id: 6, name: 'Third-Party External Transfer — 5,000,000', fields, pass: fields.every(f => f.pass) });
  } catch (e: unknown) {
    results.push({ id: 6, name: 'Third-Party External Transfer — 5,000,000', fields: [], pass: false, error: String(e) });
  }

  return results;
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function CalcSelfCheckClient() {
  const [results, setResults] = useState<TestResult[] | null>(null);
  const [running, setRunning] = useState(false);

  const runAll = useCallback(() => {
    setRunning(true);
    // Small timeout so the spinner renders
    setTimeout(() => {
      try {
        setResults(runTests());
      } catch {
        setResults([]);
      }
      setRunning(false);
    }, 80);
  }, []);

  const passed = results ? results.filter(r => r.pass).length : 0;
  const total = results ? results.length : 0;
  const allPass = results ? passed === total : false;

  return (
    <div className="p-6 max-w-4xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-gray-900 dark:text-white">Calculation Self-Check</h1>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
            Runs all financial formula test cases live against the current settings.
            WHT 10% · Preliq charge 20% · Transfer fee 0.10% · Day count 365.
          </p>
        </div>
        <button
          onClick={runAll}
          disabled={running}
          className="flex items-center gap-2 px-4 py-2 rounded-lg bg-accent text-white text-sm font-semibold hover:bg-accent/90 disabled:opacity-60 transition-colors shrink-0"
        >
          {running ? (
            <RefreshCw size={15} className="animate-spin" />
          ) : (
            <PlayCircle size={15} />
          )}
          Run all
        </button>
      </div>

      {/* Summary badge */}
      {results && (
        <div
          className={`flex items-center gap-3 px-4 py-3 rounded-xl border text-sm font-semibold
            ${allPass
              ? 'bg-green-50 border-green-200 text-green-800 dark:bg-green-900/20 dark:border-green-700 dark:text-green-300' :'bg-red-50 border-red-200 text-red-800 dark:bg-red-900/20 dark:border-red-700 dark:text-red-300'
            }`}
        >
          {allPass ? <CheckCircle size={18} /> : <XCircle size={18} />}
          <span>{passed}/{total} passed</span>
          {!allPass && <span className="font-normal text-xs ml-1">— {total - passed} test{total - passed !== 1 ? 's' : ''} failed</span>}
        </div>
      )}

      {/* Test cards */}
      {results ? (
        <div className="space-y-4">
          {results.map((test) => (
            <div
              key={test.id}
              className={`rounded-xl border bg-white dark:bg-gray-800 overflow-hidden
                ${test.pass
                  ? 'border-green-200 dark:border-green-700' :'border-red-200 dark:border-red-700'
                }`}
            >
              {/* Card header */}
              <div
                className={`flex items-center gap-3 px-4 py-3 border-b
                  ${test.pass
                    ? 'bg-green-50 border-green-100 dark:bg-green-900/20 dark:border-green-800' :'bg-red-50 border-red-100 dark:bg-red-900/20 dark:border-red-800'
                  }`}
              >
                {test.pass
                  ? <CheckCircle size={16} className="text-green-600 dark:text-green-400 shrink-0" />
                  : <XCircle size={16} className="text-red-600 dark:text-red-400 shrink-0" />
                }
                <span className="text-sm font-semibold text-gray-800 dark:text-gray-100 flex-1">
                  Test {test.id}: {test.name}
                </span>
                <span
                  className={`text-xs font-bold px-2 py-0.5 rounded-full
                    ${test.pass
                      ? 'bg-green-100 text-green-700 dark:bg-green-800 dark:text-green-200' :'bg-red-100 text-red-700 dark:bg-red-800 dark:text-red-200'
                    }`}
                >
                  {test.pass ? 'PASS' : 'FAIL'}
                </span>
              </div>

              {/* Error */}
              {test.error && (
                <div className="px-4 py-3 text-xs text-red-600 dark:text-red-400 font-mono bg-red-50 dark:bg-red-900/10">
                  Error: {test.error}
                </div>
              )}

              {/* Fields table */}
              {test.fields.length > 0 && (
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-gray-100 dark:border-gray-700">
                      <th className="text-left px-4 py-2 text-xs font-semibold text-gray-500 dark:text-gray-400 w-1/3">Field</th>
                      <th className="text-right px-4 py-2 text-xs font-semibold text-gray-500 dark:text-gray-400 w-1/4">Expected</th>
                      <th className="text-right px-4 py-2 text-xs font-semibold text-gray-500 dark:text-gray-400 w-1/4">Actual</th>
                      <th className="text-center px-4 py-2 text-xs font-semibold text-gray-500 dark:text-gray-400 w-16">Result</th>
                    </tr>
                  </thead>
                  <tbody>
                    {test.fields.map((f, i) => (
                      <tr
                        key={i}
                        className={`border-b border-gray-50 dark:border-gray-700/50 last:border-0
                          ${!f.pass ? 'bg-red-50/50 dark:bg-red-900/10' : ''}`}
                      >
                        <td className="px-4 py-2.5 text-gray-700 dark:text-gray-300">{f.label}</td>
                        <td className="px-4 py-2.5 text-right font-mono text-gray-600 dark:text-gray-400 tabular-nums">{f.expected}</td>
                        <td className={`px-4 py-2.5 text-right font-mono tabular-nums font-semibold
                          ${f.pass ? 'text-green-700 dark:text-green-400' : 'text-red-600 dark:text-red-400'}`}>
                          {f.actual}
                        </td>
                        <td className="px-4 py-2.5 text-center">
                          {f.pass
                            ? <CheckCircle size={14} className="text-green-500 mx-auto" />
                            : <XCircle size={14} className="text-red-500 mx-auto" />
                          }
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          ))}
        </div>
      ) : (
        <div className="rounded-xl border border-dashed border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50 py-16 text-center">
          <PlayCircle size={40} className="mx-auto text-gray-300 dark:text-gray-600 mb-3" />
          <p className="text-sm text-gray-500 dark:text-gray-400">Click <strong>Run all</strong> to execute the test suite</p>
          <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">6 test cases · uses live settings</p>
        </div>
      )}
    </div>
  );
}
