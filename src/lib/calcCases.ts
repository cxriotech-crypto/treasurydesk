/**
 * Calculation self-check cases (brief section 7.4). Used by `npm run test:calc` and the in-app
 * Self-Check page. They always run with fixed test settings, never the live ones.
 */
import type { Settings } from '@/domain/types';
import {
  DEFAULT_SETTINGS,
  calcAnniversary,
  calcInflow,
  calcMaturity,
  calcPreliqFull,
  calcPreliqPartial,
  calcRollover,
  calcThirdParty,
  maturityDate,
  type CalcEnv,
  type InvestmentTerms,
} from './calc';
import { addDays } from './dates';
import { amountInWords } from './words';

export const TEST_SETTINGS: Settings = {
  ...DEFAULT_SETTINGS,
  whtRate: '10',
  preliqChargeRate: '20',
  transferFeeRate: '0.10',
  dayCount: 365,
  whtOnAnniversary: false,
  whtBasisPreliq: 'AFTER_CHARGE',
  partialPreliqInterest: 'NOT_PAID',
  tpFeeMode: 'DEDUCT',
  rolloverCInterest: 'PAY_OUT',
  rolloverABasis: 'NET',
  maturityHolidayRule: 'NEXT_BUSINESS_DAY',
};

const EFFECTIVE = '2025-01-06'; // a Monday
const env = (settings: Partial<Settings> = {}, holidays: string[] = []): CalcEnv => ({
  settings: { ...TEST_SETTINGS, ...settings },
  holidays,
});

function inv(tenorDays = 365, principal = '10000000.00', rate = '15'): InvestmentTerms {
  return {
    principalAmt: principal,
    intRate: rate,
    effectiveDate: EFFECTIVE,
    tenorDays,
    maturityDate: addDays(EFFECTIVE, tenorDays),
    intPaidToDate: '0.00',
    nextAnnivDate: null,
  };
}

export interface CheckLine {
  label: string;
  expected: string;
  actual: string;
}

export interface CalcCase {
  id: string;
  name: string;
  required: boolean;
  run: () => CheckLine[];
}

const L = (label: string, expected: string, actual: string): CheckLine => ({
  label,
  expected,
  actual,
});

export const CALC_CASES: CalcCase[] = [
  {
    id: '1',
    name: 'Maturity, 365-day tenor',
    required: true,
    run: () => {
      const r = calcMaturity(inv(365), false, env());
      return [
        L('Interest', '1500000.00', r.interest.value),
        L('WHT', '150000.00', r.wht.value),
        L('Net', '11350000.00', r.net.value),
      ];
    },
  },
  {
    id: '2',
    name: 'Full pre-liquidation at day 180',
    required: true,
    run: () => {
      const r = calcPreliqFull(inv(365), addDays(EFFECTIVE, 180), false, env());
      return [
        L('Accrued interest', '739726.03', r.accrued.value),
        L('Charge', '147945.21', r.charge.value),
        L('Net interest', '591780.82', r.netInterest.value),
        L('WHT', '59178.08', r.wht.value),
        L('Payout', '10532602.74', r.payout.value),
      ];
    },
  },
  {
    id: '3',
    name: 'Partial pre-liquidation at day 365, requested ₦3,000,000',
    required: true,
    run: () => {
      const r = calcPreliqPartial(
        inv(365),
        { requested: '3000000', liquidationDate: addDays(EFFECTIVE, 365) },
        false,
        env()
      );
      return [
        L('Accrued interest', '1500000.00', r.accrued.value),
        L('Charge', '300000.00', r.charge.value),
        L('Payout', '3000000.00', r.payout.value),
        L('Remaining', '7000000.00', r.remaining.value),
        L('Rebooked principal', '6700000.00', r.rebooked.value),
      ];
    },
  },
  {
    id: '4',
    name: 'Anniversary interest 30 / 60 / 90 days',
    required: true,
    run: () => [
      L('30 days', '123287.67', calcAnniversary(inv(365), 30, false, env()).periodInterest.value),
      L('60 days', '246575.34', calcAnniversary(inv(365), 60, false, env()).periodInterest.value),
      L('90 days', '369863.01', calcAnniversary(inv(365), 90, false, env()).periodInterest.value),
    ],
  },
  {
    id: '5',
    name: 'Rollover A at maturity (365 days) into 182 days at 16%',
    required: true,
    run: () => {
      const r = calcRollover(
        inv(365),
        {
          letter: 'A',
          newEffectiveDate: addDays(EFFECTIVE, 365),
          newRate: '16',
          newTenorDays: 182,
        },
        false,
        env()
      );
      return [
        L('Roll amount', '11350000.00', r.rollAmt.value),
        L('Projected new interest', '905512.33', r.projectedInterest.value),
      ];
    },
  },
  {
    id: '6',
    name: 'Third party external ₦5,000,000',
    required: true,
    run: () => {
      const r = calcThirdParty('5000000', false, TEST_SETTINGS);
      return [
        L('Fee', '5000.00', r.fee.value),
        L('To beneficiary', '4995000.00', r.toBeneficiary.value),
      ];
    },
  },
  // ─── Extra cases ──────────────────────────────────────────────────────────
  {
    id: 'X1',
    name: 'Rollover C: roll ₦7,000,000 of ₦10,000,000, interest paid out',
    required: false,
    run: () => {
      const r = calcRollover(
        inv(365),
        {
          letter: 'C',
          newEffectiveDate: addDays(EFFECTIVE, 365),
          newRate: '15',
          newTenorDays: 90,
          rollAmt: '7000000',
        },
        false,
        env()
      );
      return [
        L('Roll amount', '7000000.00', r.rollAmt.value),
        L('Principal payout', '3000000.00', r.principalPayout.value),
        L('Interest payout', '1350000.00', r.interestPayout.value),
        L('Total payout', '4350000.00', r.totalPayout.value),
      ];
    },
  },
  {
    id: 'X2',
    name: 'Rollover C with interest rolled (ROLL policy)',
    required: false,
    run: () => {
      const r = calcRollover(
        inv(365),
        {
          letter: 'C',
          newEffectiveDate: addDays(EFFECTIVE, 365),
          newRate: '15',
          newTenorDays: 90,
          rollAmt: '7000000',
        },
        false,
        env({ rolloverCInterest: 'ROLL' })
      );
      return [
        L('Roll amount', '8350000.00', r.rollAmt.value),
        L('Total payout', '3000000.00', r.totalPayout.value),
      ];
    },
  },
  {
    id: 'X3',
    name: 'Maturity for a WHT-exempt customer',
    required: false,
    run: () => {
      const r = calcMaturity(inv(365), true, env());
      return [L('WHT', '0.00', r.wht.value), L('Net', '11500000.00', r.net.value)];
    },
  },
  {
    id: 'X4',
    name: 'Maturity date on a Saturday and on a public holiday',
    required: false,
    run: () => {
      // 2025-01-06 + 5 = Saturday 2025-01-11 → Monday 2025-01-13
      const sat = maturityDate(EFFECTIVE, 5, [], 'NEXT_BUSINESS_DAY');
      // 2025-06-12 (Democracy Day, Thursday) → Friday 2025-06-13
      const hol = maturityDate('2025-06-02', 10, ['2025-06-12'], 'NEXT_BUSINESS_DAY');
      const none = maturityDate(EFFECTIVE, 5, [], 'NONE');
      return [
        L('Weekend adjusted', '2025-01-13', sat.date),
        L('Holiday adjusted', '2025-06-13', hol.date),
        L('Rule NONE keeps date', '2025-01-11', none.date),
      ];
    },
  },
  {
    id: 'X5',
    name: 'Maturity on a 360-day basis',
    required: false,
    run: () => {
      const r = calcMaturity(inv(360), false, env({ dayCount: 360 }));
      return [L('Interest', '1500000.00', r.interest.value), L('Net', '11350000.00', r.net.value)];
    },
  },
  {
    id: 'X6',
    name: 'Partial pre-liquidation where the charge exceeds the remaining principal',
    required: false,
    run: () => {
      const r = calcPreliqPartial(
        inv(365, '1000000.00', '24'),
        { requested: '999000', liquidationDate: addDays(EFFECTIVE, 365) },
        false,
        env()
      );
      return [L('Validation error raised', 'yes', r.errors.amount ? 'yes' : 'no')];
    },
  },
  {
    id: 'X7',
    name: 'Third party: fee on top, and internal account',
    required: false,
    run: () => {
      const onTop = calcThirdParty('5000000', false, { ...TEST_SETTINGS, tpFeeMode: 'ON_TOP' });
      const internal = calcThirdParty('5000000', true, TEST_SETTINGS);
      return [
        L('ON_TOP to beneficiary', '5000000.00', onTop.toBeneficiary.value),
        L('ON_TOP total debit', '5005000.00', onTop.totalDebit.value),
        L('Internal fee', '0.00', internal.fee.value),
      ];
    },
  },
  {
    id: 'X8',
    name: 'Inflow ₦10,000,000 at 15% for 365 days',
    required: false,
    run: () => {
      const r = calcInflow(
        {
          principal: '10000000',
          rate: '15',
          tenorDays: 365,
          effectiveDate: EFFECTIVE,
          whtExempt: false,
        },
        env()
      );
      return [
        L('Projected interest', '1500000.00', r.projectedInterest.value),
        L('Net maturity value', '11350000.00', r.netMaturityValue.value),
      ];
    },
  },
  {
    id: 'X10',
    name: 'Withholding tax switched off for one transaction',
    required: false,
    run: () => {
      const on = calcPreliqFull(inv(365), addDays(EFFECTIVE, 180), false, env());
      const off = calcPreliqFull(inv(365), addDays(EFFECTIVE, 180), false, {
        ...env(),
        whtOn: false,
      });
      return [
        L('WHT with the switch on', '59178.08', on.wht.value),
        L('WHT with the switch off', '0.00', off.wht.value),
        // The customer keeps the tax that is no longer deducted.
        L('Payout with the switch off', '10591780.82', off.payout.value),
        L('Charge is untouched', on.charge.value, off.charge.value),
      ];
    },
  },
  {
    id: 'X11',
    name: 'Pre-liquidation charge switched off for one transaction',
    required: false,
    run: () => {
      const off = calcPreliqFull(inv(365), addDays(EFFECTIVE, 180), false, {
        ...env(),
        preliqChargeOn: false,
      });
      return [
        L('Charge', '0.00', off.charge.value),
        L('Net interest is the full accrual', '739726.03', off.netInterest.value),
        // WHT is charged on the larger net interest: 10% × 739,726.03.
        L('WHT', '73972.60', off.wht.value),
        L('Payout', '10665753.43', off.payout.value),
      ];
    },
  },
  {
    id: 'X9',
    name: 'Amount in words',
    required: false,
    run: () => [
      L(
        '₦10,532,602.74',
        'Ten million, five hundred and thirty-two thousand, six hundred and two naira, seventy-four kobo',
        amountInWords('10532602.74')
      ),
      L('₦1,000,005.00', 'One million and five naira', amountInWords('1000005')),
    ],
  },
];

export interface CaseResult {
  id: string;
  name: string;
  required: boolean;
  pass: boolean;
  lines: (CheckLine & { pass: boolean })[];
}

export function runCalcCases(): CaseResult[] {
  return CALC_CASES.map((c) => {
    let lines: (CheckLine & { pass: boolean })[];
    try {
      lines = c.run().map((l) => ({ ...l, pass: l.expected === l.actual }));
    } catch (e) {
      lines = [{ label: 'Error', expected: 'no error', actual: String(e), pass: false }];
    }
    return {
      id: c.id,
      name: c.name,
      required: c.required,
      pass: lines.every((l) => l.pass),
      lines,
    };
  });
}
