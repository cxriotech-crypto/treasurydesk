/**
 * Calculation engine — pure functions only.
 *
 * - Inputs and outputs are money strings; every output is rounded to 2 dp ROUND_HALF_UP.
 * - Settings are passed in explicitly, so changing a setting changes every result.
 * - Every figure comes with a human-readable formula using the real numbers (the "fx" hover).
 */
import type { Settings } from '@/domain/types';
import {
  addDays,
  daysBetween as dDaysBetween,
  isBusinessDay,
  isIsoDate,
  isWeekend,
  nextBusinessDay,
} from './dates';
import {
  D,
  dec,
  gt,
  gte,
  isPositive,
  isValidMoney,
  lt,
  sub,
  add,
  toMoney,
  ZERO,
  type Num,
} from './money';
import { formatDate, formatNaira, formatRate } from './format';

export const DEFAULT_SETTINGS: Settings = {
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
  slaHours: 8,
  slaCutoff: '15:00',
  demoLatencyMs: 400,
  gapsFailureRate: 10,
};

export const MAX_TENOR_DAYS = 1825;

/** A calculated figure and the formula that produced it. */
export interface Fig {
  value: string;
  formula: string;
}

export type Errors = Record<string, string>;

const fig = (value: string, formula: string): Fig => ({ value, formula });
const N = formatNaira;
const R = (r: Num) => formatRate(r);

/** Minimal view of an investment the calculations need. */
export interface InvestmentTerms {
  principalAmt: string;
  intRate: string;
  effectiveDate: string;
  tenorDays: number;
  maturityDate: string;
  intPaidToDate: string;
  nextAnnivDate?: string | null;
  annivFreqDays?: number;
}

export interface CalcEnv {
  settings: Settings;
  holidays: string[];
}

// ─── Primitives ──────────────────────────────────────────────────────────────

/** Actual days from → to. */
export function daysBetween(from: string, to: string): number {
  return dDaysBetween(from, to);
}

export interface MaturityDateResult {
  date: string;
  unadjusted: string;
  adjusted: boolean;
  reason: string | null;
}

/** effective + tenor; weekend/holiday moves to the next business day when rule = NEXT_BUSINESS_DAY. */
export function maturityDate(
  effectiveDate: string,
  tenorDays: number,
  holidays: string[],
  rule: Settings['maturityHolidayRule']
): MaturityDateResult {
  const unadjusted = addDays(effectiveDate, tenorDays);
  if (rule !== 'NEXT_BUSINESS_DAY' || isBusinessDay(unadjusted, holidays)) {
    return { date: unadjusted, unadjusted, adjusted: false, reason: null };
  }
  const date = nextBusinessDay(unadjusted, holidays);
  const why = isWeekend(unadjusted) ? 'falls on a weekend' : 'is a public holiday';
  return {
    date,
    unadjusted,
    adjusted: true,
    reason: `${formatDate(unadjusted)} ${why}; moved to next business day ${formatDate(date)}`,
  };
}

/** P × rate/100 × days / dayCount. */
export function interest(principal: Num, rate: Num, days: number, dayCount: number): Fig {
  const v = toMoney(dec(principal).times(dec(rate)).dividedBy(100).times(days).dividedBy(dayCount));
  return fig(v, `${N(principal)} × ${R(rate)} × ${days} / ${dayCount} = ${N(v)}`);
}

/** Days of interest earned by asOf, capped at the contract tenor. */
export function accruedDays(inv: InvestmentTerms, asOf: string): number {
  return Math.max(0, Math.min(dDaysBetween(inv.effectiveDate, asOf), inv.tenorDays));
}

/** Interest from effective date to min(asOf, maturity) less interest already paid (floor 0). */
export function accruedInterest(
  inv: InvestmentTerms,
  asOf: string,
  settings: Settings
): Fig & { days: number } {
  const days = accruedDays(inv, asOf);
  const gross = interest(inv.principalAmt, inv.intRate, days, settings.dayCount);
  const paid = toMoney(inv.intPaidToDate);
  const net = toMoney(D.max(dec(gross.value).minus(dec(paid)), 0));
  const formula = dec(paid).isZero()
    ? gross.formula
    : `${N(inv.principalAmt)} × ${R(inv.intRate)} × ${days} / ${settings.dayCount} − paid ${N(paid)} = ${N(net)}`;
  return { value: net, formula, days };
}

/** WHT on an amount: 0 when the customer is exempt or WHT does not apply. */
export function wht(amount: Num, whtExempt: boolean, applies: boolean, settings: Settings): Fig {
  if (whtExempt) return fig(ZERO, 'Customer is WHT-exempt');
  if (!applies) return fig(ZERO, 'WHT not applied');
  const v = toMoney(dec(amount).times(dec(settings.whtRate)).dividedBy(100));
  return fig(v, `${R(settings.whtRate)} × ${N(amount)} = ${N(v)}`);
}

// ─── Validation (7.3) ────────────────────────────────────────────────────────

export function validateAmount(v: string | undefined, label = 'Amount'): string | null {
  if (!v || !isValidMoney(v)) return `${label} is required`;
  if (!isPositive(v)) return `${label} must be greater than zero`;
  return null;
}

export function validateRate(v: string | undefined, label = 'Rate'): string | null {
  if (v === undefined || v === '' || !/^\d+(\.\d{1,4})?$/.test(String(v)))
    return `${label} is required`;
  if (lt(v, 0) || gt(v, 100)) return `${label} must be between 0 and 100`;
  return null;
}

export function validateTenor(v: number | undefined, label = 'Tenor'): string | null {
  if (v === undefined || v === null || Number.isNaN(v)) return `${label} is required`;
  if (!Number.isInteger(v) || v < 1 || v > MAX_TENOR_DAYS) return `${label} must be 1–1,825 days`;
  return null;
}

export function validateAccountNo(v: string | undefined | null): string | null {
  if (!v) return 'Account number is required';
  if (!/^\d{10}$/.test(v)) return 'Account number must be exactly 10 digits';
  return null;
}

export function validateTransferDate(
  v: string | undefined,
  today: string,
  holidays: string[]
): string | null {
  if (!v || !isIsoDate(v)) return 'Date is required';
  if (v < today) return 'Date cannot be in the past';
  if (isWeekend(v)) return 'Date falls on a weekend';
  if (holidays.includes(v)) return 'Date is a public holiday';
  return null;
}

function collect(errors: Errors, key: string, msg: string | null) {
  if (msg) errors[key] = msg;
}

// ─── Inflow ──────────────────────────────────────────────────────────────────

export interface InflowInput {
  principal: string;
  rate: string;
  tenorDays: number;
  effectiveDate: string;
  whtExempt: boolean;
}

export interface InflowResult {
  principal: Fig;
  projectedInterest: Fig;
  wht: Fig;
  netMaturityValue: Fig;
  maturity: MaturityDateResult;
  errors: Errors;
}

export function calcInflow(input: InflowInput, env: CalcEnv): InflowResult {
  const { settings } = env;
  const errors: Errors = {};
  collect(errors, 'amount', validateAmount(input.principal, 'Principal'));
  collect(errors, 'newRate', validateRate(input.rate));
  collect(errors, 'newTenorDays', validateTenor(input.tenorDays));
  const ok = !errors.amount && !errors.newRate && !errors.newTenorDays;
  const P = ok ? toMoney(input.principal) : ZERO;
  const tenor = ok ? input.tenorDays : 0;
  const projectedInterest = interest(P, ok ? input.rate : 0, tenor, settings.dayCount);
  const w = wht(projectedInterest.value, input.whtExempt, true, settings);
  const net = add(P, projectedInterest.value, `-${w.value}`);
  return {
    principal: fig(P, 'Amount received from customer'),
    projectedInterest,
    wht: w,
    netMaturityValue: fig(
      net,
      `${N(P)} + ${N(projectedInterest.value)} − ${N(w.value)} = ${N(net)}`
    ),
    maturity: maturityDate(input.effectiveDate, tenor, env.holidays, settings.maturityHolidayRule),
    errors,
  };
}

// ─── Maturity (termination) ──────────────────────────────────────────────────

export interface MaturityResult {
  principal: Fig;
  interest: Fig;
  wht: Fig;
  net: Fig;
  errors: Errors;
}

export function calcMaturity(
  inv: InvestmentTerms,
  whtExempt: boolean,
  env: CalcEnv
): MaturityResult {
  const { settings } = env;
  const full = interest(inv.principalAmt, inv.intRate, inv.tenorDays, settings.dayCount);
  const I = toMoney(D.max(dec(full.value).minus(dec(inv.intPaidToDate)), 0));
  const iFormula = dec(inv.intPaidToDate).isZero()
    ? full.formula
    : `${full.formula.replace(/ = .*$/, '')} − paid ${N(inv.intPaidToDate)} = ${N(I)}`;
  const w = wht(I, whtExempt, true, settings);
  const net = add(inv.principalAmt, I, `-${w.value}`);
  return {
    principal: fig(toMoney(inv.principalAmt), 'Principal per Eazybankz'),
    interest: fig(I, iFormula),
    wht: w,
    net: fig(net, `${N(inv.principalAmt)} + ${N(I)} − ${N(w.value)} = ${N(net)}`),
    errors: {},
  };
}

// ─── Pre-liquidation ─────────────────────────────────────────────────────────

export interface PreliqFullResult {
  daysElapsed: number;
  principal: Fig;
  accrued: Fig;
  charge: Fig;
  netInterest: Fig;
  wht: Fig;
  payout: Fig;
  errors: Errors;
}

export function calcPreliqFull(
  inv: InvestmentTerms,
  liquidationDate: string,
  whtExempt: boolean,
  env: CalcEnv
): PreliqFullResult {
  const { settings } = env;
  const errors: Errors = {};
  if (!isIsoDate(liquidationDate)) errors.valueDate = 'Liquidation date is required';
  else if (liquidationDate < inv.effectiveDate)
    errors.valueDate = 'Liquidation date is before the effective date';
  const ai = accruedInterest(inv, liquidationDate, settings);
  const charge = toMoney(dec(ai.value).times(dec(settings.preliqChargeRate)).dividedBy(100));
  const netInterest = sub(ai.value, charge);
  const whtBase = settings.whtBasisPreliq === 'GROSS' ? ai.value : netInterest;
  const w = wht(whtBase, whtExempt, true, settings);
  const payout = add(inv.principalAmt, netInterest, `-${w.value}`);
  return {
    daysElapsed: ai.days,
    principal: fig(toMoney(inv.principalAmt), 'Principal per Eazybankz'),
    accrued: fig(ai.value, ai.formula),
    charge: fig(charge, `${R(settings.preliqChargeRate)} × ${N(ai.value)} = ${N(charge)}`),
    netInterest: fig(netInterest, `${N(ai.value)} − ${N(charge)} = ${N(netInterest)}`),
    wht: w,
    payout: fig(
      payout,
      `${N(inv.principalAmt)} + ${N(netInterest)} − ${N(w.value)} = ${N(payout)}`
    ),
    errors,
  };
}

export interface PreliqPartialInput {
  requested: string;
  liquidationDate: string;
  newRate?: string;
  newTenorDays?: number;
}

export interface PreliqPartialResult {
  daysElapsed: number;
  principal: Fig;
  requested: Fig;
  accrued: Fig;
  charge: Fig;
  payout: Fig;
  remaining: Fig;
  rebooked: Fig;
  interestPaidOut: Fig; // PAID_OUT mode, else 0
  interestWht: Fig;
  totalPayout: Fig;
  newRate: string;
  newTenorDays: number;
  newMaturity: MaturityDateResult;
  projectedInterest: Fig;
  policyNote: string;
  errors: Errors;
}

export function calcPreliqPartial(
  inv: InvestmentTerms,
  input: PreliqPartialInput,
  whtExempt: boolean,
  env: CalcEnv
): PreliqPartialResult {
  const { settings } = env;
  const errors: Errors = {};
  collect(errors, 'amount', validateAmount(input.requested, 'Requested amount'));
  if (!errors.amount && gte(input.requested, inv.principalAmt)) {
    errors.amount = `Requested amount must be less than the principal ${N(inv.principalAmt)}`;
  }
  if (!isIsoDate(input.liquidationDate)) errors.valueDate = 'Liquidation date is required';
  const Rq = errors.amount ? ZERO : toMoney(input.requested);
  const ai = accruedInterest(inv, input.liquidationDate, settings);
  const charge = toMoney(dec(ai.value).times(dec(settings.preliqChargeRate)).dividedBy(100));
  const remaining = sub(inv.principalAmt, Rq);
  let rebooked = sub(remaining, charge);
  let rebookedFormula = `${N(remaining)} − ${N(charge)} = ${N(rebooked)}`;
  if (!errors.amount && gte(charge, remaining)) {
    errors.amount = `Charge ${N(charge)} is not covered by the remaining principal ${N(remaining)}`;
  }

  const iw = wht(ai.value, whtExempt, settings.partialPreliqInterest !== 'NOT_PAID', settings);
  const netAi = sub(ai.value, iw.value);
  let interestPaidOut = fig(ZERO, 'Interest not paid (policy: NOT_PAID)');
  if (settings.partialPreliqInterest === 'PAID_OUT') {
    interestPaidOut = fig(netAi, `${N(ai.value)} − ${N(iw.value)} = ${N(netAi)}`);
  } else if (settings.partialPreliqInterest === 'CAPITALISED') {
    rebooked = add(rebooked, netAi);
    rebookedFormula = `${N(remaining)} − ${N(charge)} + ${N(netAi)} = ${N(rebooked)}`;
  }
  const totalPayout = add(Rq, interestPaidOut.value);

  const remainingTenor = dDaysBetween(input.liquidationDate, inv.maturityDate);
  const newRate = input.newRate ?? inv.intRate;
  const newTenorDays = input.newTenorDays ?? (remainingTenor > 0 ? remainingTenor : inv.tenorDays);
  collect(errors, 'newRate', validateRate(newRate, 'New rate'));
  collect(errors, 'newTenorDays', validateTenor(newTenorDays, 'New tenor'));
  const newMaturity = maturityDate(
    input.liquidationDate,
    newTenorDays,
    env.holidays,
    settings.maturityHolidayRule
  );
  const projectedInterest = interest(
    gt(rebooked, 0) ? rebooked : 0,
    errors.newRate ? 0 : newRate,
    errors.newTenorDays ? 0 : newTenorDays,
    settings.dayCount
  );

  const policyNote = {
    NOT_PAID:
      'Current policy: accrued interest is not paid on partial pre-liquidation (SOP example).',
    PAID_OUT: 'Current policy: accrued interest less WHT is paid out with the requested amount.',
    CAPITALISED: 'Current policy: accrued interest less WHT is added to the rebooked principal.',
  }[settings.partialPreliqInterest];

  return {
    daysElapsed: ai.days,
    principal: fig(toMoney(inv.principalAmt), 'Principal per Eazybankz'),
    requested: fig(Rq, 'Amount requested by the customer'),
    accrued: fig(ai.value, ai.formula),
    charge: fig(charge, `${R(settings.preliqChargeRate)} × ${N(ai.value)} = ${N(charge)}`),
    payout: fig(Rq, `Requested amount = ${N(Rq)}`),
    remaining: fig(remaining, `${N(inv.principalAmt)} − ${N(Rq)} = ${N(remaining)}`),
    rebooked: fig(rebooked, rebookedFormula),
    interestPaidOut,
    interestWht: iw,
    totalPayout: fig(totalPayout, `${N(Rq)} + ${N(interestPaidOut.value)} = ${N(totalPayout)}`),
    newRate,
    newTenorDays,
    newMaturity,
    projectedInterest,
    policyNote,
    errors,
  };
}

// ─── Anniversary ─────────────────────────────────────────────────────────────

export interface AnniversaryResult {
  period: number;
  periodInterest: Fig;
  wht: Fig;
  net: Fig;
  currentAnnivDate: string;
  nextAnnivDate: string;
  errors: Errors;
}

export function calcAnniversary(
  inv: InvestmentTerms,
  period: number,
  whtExempt: boolean,
  env: CalcEnv
): AnniversaryResult {
  const { settings } = env;
  const errors: Errors = {};
  if (![30, 60, 90].includes(period)) errors.annivPeriod = 'Period must be 30, 60 or 90 days';
  const pi = interest(
    inv.principalAmt,
    inv.intRate,
    errors.annivPeriod ? 0 : period,
    settings.dayCount
  );
  const w = wht(pi.value, whtExempt, settings.whtOnAnniversary, settings);
  const net = sub(pi.value, w.value);
  const current = inv.nextAnnivDate ?? addDays(inv.effectiveDate, period);
  return {
    period,
    periodInterest: pi,
    wht:
      w.formula === 'WHT not applied'
        ? fig(ZERO, 'WHT not required on anniversary interest (policy)')
        : w,
    net: fig(net, `${N(pi.value)} − ${N(w.value)} = ${N(net)}`),
    currentAnnivDate: current,
    nextAnnivDate: addDays(current, period),
    errors,
  };
}

// ─── Rollover ────────────────────────────────────────────────────────────────

export type RolloverLetter = 'A' | 'B' | 'C' | 'D';

export interface RolloverInput {
  letter: RolloverLetter;
  newEffectiveDate: string;
  newRate: string;
  newTenorDays: number;
  rollAmt?: string; // C: X
}

export interface RolloverResult {
  principal: Fig;
  interest: Fig;
  wht: Fig;
  netInterest: Fig;
  rollAmt: Fig;
  principalPayout: Fig;
  interestPayout: Fig;
  totalPayout: Fig;
  newEffectiveDate: string;
  newRate: string;
  newTenorDays: number;
  newMaturity: MaturityDateResult;
  projectedInterest: Fig;
  errors: Errors;
}

export function calcRollover(
  inv: InvestmentTerms,
  input: RolloverInput,
  whtExempt: boolean,
  env: CalcEnv
): RolloverResult {
  const { settings } = env;
  const errors: Errors = {};
  if (!isIsoDate(input.newEffectiveDate)) errors.valueDate = 'New effective date is required';
  collect(errors, 'newRate', validateRate(input.newRate, 'New rate'));
  collect(errors, 'newTenorDays', validateTenor(input.newTenorDays, 'New tenor'));

  const ai = accruedInterest(inv, input.newEffectiveDate, settings);
  const I = ai.value;
  const w = wht(I, whtExempt, true, settings);
  const netI = sub(I, w.value);
  const P = toMoney(inv.principalAmt);
  const zero = (why: string) => fig(ZERO, why);

  let rollAmt: Fig;
  let principalPayout = zero('No principal paid out');
  let interestPayout = zero('No interest paid out');

  switch (input.letter) {
    case 'A':
      rollAmt =
        settings.rolloverABasis === 'NET'
          ? fig(add(P, netI), `${N(P)} + ${N(I)} − ${N(w.value)} = ${N(add(P, netI))}`)
          : fig(add(P, I), `${N(P)} + ${N(I)} = ${N(add(P, I))} (gross basis)`);
      break;
    case 'B':
    case 'D':
      rollAmt = fig(P, `Principal rolled = ${N(P)}`);
      interestPayout = fig(netI, `${N(I)} − ${N(w.value)} = ${N(netI)}`);
      break;
    case 'C': {
      collect(errors, 'rollAmt', validateAmount(input.rollAmt, 'Amount to roll'));
      if (!errors.rollAmt && gte(input.rollAmt!, P)) {
        errors.rollAmt = `Amount to roll must be less than the principal ${N(P)}`;
      }
      const X = errors.rollAmt ? ZERO : toMoney(input.rollAmt!);
      const pp = sub(P, X);
      principalPayout = fig(pp, `${N(P)} − ${N(X)} = ${N(pp)}`);
      if (settings.rolloverCInterest === 'PAY_OUT') {
        rollAmt = fig(X, `Amount rolled = ${N(X)}`);
        interestPayout = fig(netI, `${N(I)} − ${N(w.value)} = ${N(netI)}`);
      } else {
        const ra = add(X, netI);
        rollAmt = fig(ra, `${N(X)} + ${N(I)} − ${N(w.value)} = ${N(ra)}`);
      }
      break;
    }
  }

  const total = add(principalPayout.value, interestPayout.value);
  const newMaturity = maturityDate(
    input.newEffectiveDate,
    errors.newTenorDays ? 0 : input.newTenorDays,
    env.holidays,
    settings.maturityHolidayRule
  );
  const projectedInterest = interest(
    rollAmt.value,
    errors.newRate ? 0 : input.newRate,
    errors.newTenorDays ? 0 : input.newTenorDays,
    settings.dayCount
  );

  return {
    principal: fig(P, 'Principal per Eazybankz'),
    interest: fig(I, ai.formula),
    wht: w,
    netInterest: fig(netI, `${N(I)} − ${N(w.value)} = ${N(netI)}`),
    rollAmt,
    principalPayout,
    interestPayout,
    totalPayout: fig(
      total,
      `${N(principalPayout.value)} + ${N(interestPayout.value)} = ${N(total)}`
    ),
    newEffectiveDate: input.newEffectiveDate,
    newRate: input.newRate,
    newTenorDays: input.newTenorDays,
    newMaturity,
    projectedInterest,
    errors,
  };
}

// ─── Third-party payment ─────────────────────────────────────────────────────

export interface ThirdPartyResult {
  amount: Fig;
  fee: Fig;
  toBeneficiary: Fig;
  totalDebit: Fig;
  errors: Errors;
}

export function calcThirdParty(
  amount: string,
  internal: boolean,
  settings: Settings,
  available?: string
): ThirdPartyResult {
  const errors: Errors = {};
  collect(errors, 'amount', validateAmount(amount));
  const A = errors.amount ? ZERO : toMoney(amount);
  const fee = internal
    ? fig(ZERO, 'Internal transfer – no charge')
    : (() => {
        const v = toMoney(dec(A).times(dec(settings.transferFeeRate)).dividedBy(100));
        return fig(v, `${R(settings.transferFeeRate)} × ${N(A)} = ${N(v)}`);
      })();
  let toBeneficiary: Fig;
  let totalDebit: Fig;
  if (settings.tpFeeMode === 'DEDUCT') {
    const tb = sub(A, fee.value);
    toBeneficiary = fig(tb, `${N(A)} − ${N(fee.value)} = ${N(tb)}`);
    totalDebit = fig(A, `Amount debited = ${N(A)} (charge deducted from payment)`);
  } else {
    const td = add(A, fee.value);
    toBeneficiary = fig(A, `Beneficiary receives the full ${N(A)}`);
    totalDebit = fig(td, `${N(A)} + ${N(fee.value)} = ${N(td)}`);
  }
  if (!errors.amount && available !== undefined && gt(totalDebit.value, available)) {
    errors.amount = `Total debit ${N(totalDebit.value)} exceeds available balance ${N(available)}`;
  }
  return { amount: fig(A, 'Amount instructed'), fee, toBeneficiary, totalDebit, errors };
}

// ─── Transfer ────────────────────────────────────────────────────────────────

export interface TransferResult {
  amount: Fig;
  available: Fig;
  sourceAfter: Fig;
  valid: boolean;
  errors: Errors;
}

export function calcTransfer(amount: string, available: string): TransferResult {
  const errors: Errors = {};
  collect(errors, 'amount', validateAmount(amount));
  const A = errors.amount ? ZERO : toMoney(amount);
  if (!errors.amount && gt(A, available)) {
    errors.amount = `Amount exceeds available balance ${N(available)}`;
  }
  const after = sub(available, A);
  return {
    amount: fig(A, 'Amount instructed'),
    available: fig(toMoney(available), 'Available balance per Eazybankz'),
    sourceAfter: fig(after, `${N(available)} − ${N(A)} = ${N(after)}`),
    valid: Object.keys(errors).length === 0,
    errors,
  };
}

// ─── Reversal ────────────────────────────────────────────────────────────────

export interface BookingTerms {
  amount: string;
  rate: string;
  tenorDays: number;
  effectiveDate: string;
}

export interface ReversalResult {
  original: {
    amount: string;
    rate: string;
    tenorDays: number;
    projectedInterest: Fig;
    maturity: MaturityDateResult;
  };
  corrected: {
    amount: string;
    rate: string;
    tenorDays: number;
    projectedInterest: Fig;
    maturity: MaturityDateResult;
  };
  deltaAmount: Fig;
  deltaRate: string;
  deltaTenor: number;
  deltaInterest: Fig;
  errors: Errors;
}

export function calcReversal(
  original: BookingTerms,
  corrected: BookingTerms,
  env: CalcEnv
): ReversalResult {
  const { settings } = env;
  const errors: Errors = {};
  collect(errors, 'correctedAmount', validateAmount(corrected.amount, 'Corrected amount'));
  collect(errors, 'correctedRate', validateRate(corrected.rate, 'Corrected rate'));
  collect(errors, 'correctedTenorDays', validateTenor(corrected.tenorDays, 'Corrected tenor'));
  const cAmt = errors.correctedAmount ? toMoney(original.amount) : toMoney(corrected.amount);
  const cRate = errors.correctedRate ? original.rate : corrected.rate;
  const cTenor = errors.correctedTenorDays ? original.tenorDays : corrected.tenorDays;
  if (
    Object.keys(errors).length === 0 &&
    dec(cAmt).eq(dec(original.amount)) &&
    dec(cRate).eq(dec(original.rate)) &&
    cTenor === original.tenorDays
  ) {
    errors.correctedAmount = 'Change at least one of amount, rate or tenor';
  }
  const oI = interest(original.amount, original.rate, original.tenorDays, settings.dayCount);
  const cI = interest(cAmt, cRate, cTenor, settings.dayCount);
  const dA = sub(cAmt, original.amount);
  const dI = sub(cI.value, oI.value);
  const rule = settings.maturityHolidayRule;
  return {
    original: {
      amount: toMoney(original.amount),
      rate: original.rate,
      tenorDays: original.tenorDays,
      projectedInterest: oI,
      maturity: maturityDate(original.effectiveDate, original.tenorDays, env.holidays, rule),
    },
    corrected: {
      amount: cAmt,
      rate: cRate,
      tenorDays: cTenor,
      projectedInterest: cI,
      maturity: maturityDate(original.effectiveDate, cTenor, env.holidays, rule),
    },
    deltaAmount: fig(dA, `${N(cAmt)} − ${N(original.amount)} = ${N(dA)}`),
    deltaRate: dec(cRate).minus(dec(original.rate)).toFixed(2),
    deltaTenor: cTenor - original.tenorDays,
    deltaInterest: fig(dI, `${N(cI.value)} − ${N(oI.value)} = ${N(dI)}`),
    errors,
  };
}
