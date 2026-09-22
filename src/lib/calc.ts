/**
 * src/lib/calc.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Pure financial calculation functions.
 * • decimal.js everywhere — all inputs and outputs are strings.
 * • Every output rounded to 2 dp ROUND_HALF_UP.
 * • Policy rates/options come from settingsService so changing a setting
 *   changes results everywhere.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import Decimal from 'decimal.js';
import { getSettings } from '@/services/settingsService';

Decimal.set({ rounding: Decimal.ROUND_HALF_UP, precision: 20 });

// ─── Helpers ──────────────────────────────────────────────────────────────────

function d(v: string | number): Decimal {
  return new Decimal(v);
}

function fmt(v: Decimal): string {
  return v.toDecimalPlaces(2, Decimal.ROUND_HALF_UP).toFixed(2);
}

// ─── 1. daysBetween ───────────────────────────────────────────────────────────

/**
 * Actual calendar days between two "YYYY-MM-DD" date strings.
 * from is inclusive, to is exclusive (standard day-count convention).
 */
export function daysBetween(from: string, to: string): number {
  const msPerDay = 86_400_000;
  const a = new Date(from).getTime();
  const b = new Date(to).getTime();
  return Math.round((b - a) / msPerDay);
}

// ─── 2. maturityDate ─────────────────────────────────────────────────────────

export interface MaturityDateResult {
  date: string;
  adjusted: boolean;
}

function isWeekend(dateStr: string): boolean {
  const d = new Date(dateStr);
  const day = d.getUTCDay();
  return day === 0 || day === 6;
}

function addCalendarDays(dateStr: string, n: number): string {
  const d = new Date(dateStr);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

/**
 * Compute maturity date = effectiveDate + tenorDays.
 * If the result falls on a weekend or public holiday and rule = NEXT_BUSINESS_DAY,
 * advance to the next business day.
 */
export function maturityDate(
  effectiveDate: string,
  tenorDays: number,
  holidays: string[] = [],
  rule?: string
): MaturityDateResult {
  const settings = getSettings();
  const appliedRule = rule ?? settings['MATURITY_HOLIDAY_RULE'] ?? 'NEXT_BUSINESS_DAY';
  const holidaySet = new Set(holidays);

  let date = addCalendarDays(effectiveDate, tenorDays);
  const original = date;

  if (appliedRule === 'NEXT_BUSINESS_DAY') {
    while (isWeekend(date) || holidaySet.has(date)) {
      date = addCalendarDays(date, 1);
    }
  }

  return { date, adjusted: date !== original };
}

// ─── 3. interest ─────────────────────────────────────────────────────────────

/**
 * Simple interest: P × r/100 × days/dayCount
 */
export function interest(
  principal: string,
  ratePct: string,
  days: number,
  dayCount?: number
): string {
  const settings = getSettings();
  const dc = dayCount ?? Number(settings['DAY_COUNT'] ?? 365);
  return fmt(d(principal).mul(d(ratePct).div(100)).mul(d(days).div(dc)));
}

// ─── 4. accruedInterest ──────────────────────────────────────────────────────

export interface InvestmentForAccrual {
  principalAmt: string;
  intRate: string;
  effectiveDate: string;
  maturityDate: string;
  intPaidToDate?: string;
}

/**
 * Interest accrued from effectiveDate to min(asOfDate, maturityDate),
 * minus any interest already paid.
 */
export function accruedInterest(
  investment: InvestmentForAccrual,
  asOfDate: string
): string {
  const capDate = asOfDate < investment.maturityDate ? asOfDate : investment.maturityDate;
  const days = daysBetween(investment.effectiveDate, capDate);
  const gross = interest(investment.principalAmt, investment.intRate, days);
  const paid = investment.intPaidToDate ?? '0';
  return fmt(d(gross).minus(d(paid)));
}

// ─── 5. wht ──────────────────────────────────────────────────────────────────

export interface CustomerForWht {
  isWhtExempt: boolean;
}

/**
 * Withholding tax on an amount.
 * Returns '0.00' if customer is WHT-exempt or applies=false.
 */
export function wht(
  amount: string,
  customer: CustomerForWht,
  applies: boolean
): string {
  if (!applies || customer.isWhtExempt) return '0.00';
  const settings = getSettings();
  const rate = settings['WHT_RATE'] ?? '10';
  return fmt(d(amount).mul(d(rate).div(100)));
}

// ─── 6. inflow ───────────────────────────────────────────────────────────────

export interface InflowInput {
  principal: string;
  rate: string;
  tenorDays: number;
  effectiveDate: string;
  customer?: CustomerForWht;
}

export interface InflowResult {
  maturityDate: string;
  projectedInterest: string;
  wht: string;
  netMaturityValue: string;
}

/**
 * Project maturity values for a new inflow.
 */
export function inflow(input: InflowInput): InflowResult {
  const settings = getSettings();
  const holidays: string[] = [];
  const mat = maturityDate(input.effectiveDate, input.tenorDays, holidays);
  const projInterest = interest(input.principal, input.rate, input.tenorDays);
  const customer = input.customer ?? { isWhtExempt: false };
  const whtAmt = wht(projInterest, customer, true);
  const net = fmt(d(input.principal).plus(d(projInterest)).minus(d(whtAmt)));
  return {
    maturityDate: mat.date,
    projectedInterest: projInterest,
    wht: whtAmt,
    netMaturityValue: net,
  };
}

// ─── 7. maturityPayout ───────────────────────────────────────────────────────

export interface InvestmentForPayout {
  principalAmt: string;
  intRate: string;
  tenorDays: number;
  customer?: CustomerForWht;
}

export interface MaturityPayoutResult {
  principal: string;
  interest: string;
  wht: string;
  net: string;
}

/**
 * Full maturity payout breakdown.
 */
export function maturityPayout(inv: InvestmentForPayout): MaturityPayoutResult {
  const interestAmt = interest(inv.principalAmt, inv.intRate, inv.tenorDays);
  const customer = inv.customer ?? { isWhtExempt: false };
  const whtAmt = wht(interestAmt, customer, true);
  const net = fmt(d(inv.principalAmt).plus(d(interestAmt)).minus(d(whtAmt)));
  return {
    principal: fmt(d(inv.principalAmt)),
    interest: interestAmt,
    wht: whtAmt,
    net,
  };
}

// ─── 8. preliqFull ───────────────────────────────────────────────────────────

export interface InvestmentForPreliq {
  principalAmt: string;
  intRate: string;
  effectiveDate: string;
  maturityDate: string;
  intPaidToDate?: string;
  customer?: CustomerForWht;
}

export interface PreliqFullResult {
  accrued: string;
  charge: string;
  netInterest: string;
  wht: string;
  payout: string;
}

/**
 * Full pre-liquidation at liqDate.
 * WHT basis controlled by WHT_BASIS_PRELIQ setting:
 *   AFTER_CHARGE  → WHT on netInterest (accrued - charge)
 *   BEFORE_CHARGE → WHT on accrued
 */
export function preliqFull(
  inv: InvestmentForPreliq,
  liqDate: string
): PreliqFullResult {
  const settings = getSettings();
  const chargeRate = settings['PRELIQ_CHARGE_RATE'] ?? '20';
  const whtBasis = settings['WHT_BASIS_PRELIQ'] ?? 'AFTER_CHARGE';

  const accrued = accruedInterest(inv, liqDate);
  const charge = fmt(d(accrued).mul(d(chargeRate).div(100)));
  const netInt = fmt(d(accrued).minus(d(charge)));

  const customer = inv.customer ?? { isWhtExempt: false };
  const whtBase = whtBasis === 'AFTER_CHARGE' ? netInt : accrued;
  const whtAmt = wht(whtBase, customer, true);

  const payout = fmt(d(inv.principalAmt).plus(d(netInt)).minus(d(whtAmt)));

  return { accrued, charge, netInterest: netInt, wht: whtAmt, payout };
}

// ─── 9. preliqPartial ────────────────────────────────────────────────────────

export interface PreliqPartialResult {
  accrued: string;
  charge: string;
  payout: string;
  remaining: string;
  rebookedPrincipal: string;
  interestTreatment: string;
}

/**
 * Partial pre-liquidation.
 * requested < principal; charge is on accrued interest.
 * rebookedPrincipal = remaining - charge.
 * Throws if requested >= principal or charge >= remaining.
 */
export function preliqPartial(
  inv: InvestmentForPreliq,
  liqDate: string,
  requested: string
): PreliqPartialResult {
  const settings = getSettings();
  const chargeRate = settings['PRELIQ_CHARGE_RATE'] ?? '20';
  const interestTreatment = settings['PARTIAL_PRELIQ_INTEREST'] ?? 'NOT_PAID';

  const reqD = d(requested);
  const principalD = d(inv.principalAmt);

  if (reqD.gte(principalD)) {
    throw new Error('Requested amount must be less than principal');
  }

  const accrued = accruedInterest(inv, liqDate);
  const charge = fmt(d(accrued).mul(d(chargeRate).div(100)));
  const remaining = fmt(principalD.minus(reqD));
  const rebookedPrincipal = fmt(d(remaining).minus(d(charge)));

  if (d(charge).gte(d(remaining))) {
    throw new Error('Charge exceeds remaining principal');
  }

  return {
    accrued,
    charge,
    payout: fmt(reqD),
    remaining,
    rebookedPrincipal,
    interestTreatment,
  };
}

// ─── 10. anniversary ─────────────────────────────────────────────────────────

export interface InvestmentForAnniversary {
  principalAmt: string;
  intRate: string;
  effectiveDate: string;
  customer?: CustomerForWht;
}

export interface AnniversaryResult {
  periodInterest: string;
  wht: string;
  net: string;
  nextAnniversaryDate: string;
}

/**
 * Anniversary payment for a given periodDays.
 * WHT only applied if WHT_ON_ANNIVERSARY = 'true'.
 */
export function anniversary(
  inv: InvestmentForAnniversary,
  periodDays: number
): AnniversaryResult {
  const settings = getSettings();
  const applyWht = settings['WHT_ON_ANNIVERSARY'] === 'true';

  const periodInterest = interest(inv.principalAmt, inv.intRate, periodDays);
  const customer = inv.customer ?? { isWhtExempt: false };
  const whtAmt = wht(periodInterest, customer, applyWht);
  const net = fmt(d(periodInterest).minus(d(whtAmt)));
  const nextAnniversaryDate = addCalendarDays(inv.effectiveDate, periodDays);

  return { periodInterest, wht: whtAmt, net, nextAnniversaryDate };
}

// ─── 11. rolloverA ───────────────────────────────────────────────────────────

export interface InvestmentForRollover {
  principalAmt: string;
  intRate: string;
  tenorDays: number;
  effectiveDate: string;
  maturityDate: string;
  customer?: CustomerForWht;
}

export interface RolloverAResult {
  principal: string;
  interest: string;
  wht: string;
  rollAmount: string;
  newMaturityDate: string;
  projectedNewInterest: string;
}

/**
 * Rollover A: roll principal + interest (net or gross per ROLLOVER_A_BASIS).
 */
export function rolloverA(
  inv: InvestmentForRollover,
  newRate: string,
  newTenor: number,
  newEffective: string
): RolloverAResult {
  const settings = getSettings();
  const basis = settings['ROLLOVER_A_BASIS'] ?? 'NET';

  const interestAmt = interest(inv.principalAmt, inv.intRate, inv.tenorDays);
  const customer = inv.customer ?? { isWhtExempt: false };
  const whtAmt = wht(interestAmt, customer, true);

  let rollAmount =
    basis === 'GROSS'
      ? fmt(d(inv.principalAmt).plus(d(interestAmt)))
      : fmt(d(inv.principalAmt).plus(d(interestAmt)).minus(d(whtAmt)));

  const mat = maturityDate(newEffective, newTenor);
  const projectedNewInterest = interest(rollAmount, newRate, newTenor);

  return {
    principal: fmt(d(inv.principalAmt)),
    interest: interestAmt,
    wht: whtAmt,
    rollAmount,
    newMaturityDate: mat.date,
    projectedNewInterest,
  };
}

// ─── 12. rolloverB ───────────────────────────────────────────────────────────

export interface RolloverBResult {
  rollAmount: string;
  payout: string;
  newMaturityDate: string;
  projectedNewInterest: string;
}

/**
 * Rollover B: roll principal only; pay out interest - WHT.
 */
export function rolloverB(
  inv: InvestmentForRollover,
  newRate: string,
  newTenor: number,
  newEffective: string
): RolloverBResult {
  const interestAmt = interest(inv.principalAmt, inv.intRate, inv.tenorDays);
  const customer = inv.customer ?? { isWhtExempt: false };
  const whtAmt = wht(interestAmt, customer, true);
  const payout = fmt(d(interestAmt).minus(d(whtAmt)));
  let rollAmount = fmt(d(inv.principalAmt));
  const mat = maturityDate(newEffective, newTenor);
  const projectedNewInterest = interest(rollAmount, newRate, newTenor);

  return { rollAmount, payout, newMaturityDate: mat.date, projectedNewInterest };
}

// ─── 13. rolloverD ───────────────────────────────────────────────────────────

export interface RolloverDResult {
  rollAmount: string;
  payout: string;
  newMaturityDate: string;
  projectedNewInterest: string;
}

/**
 * Rollover D: same maths as Rollover B, different label.
 */
export function rolloverD(
  inv: InvestmentForRollover,
  newRate: string,
  newTenor: number,
  newEffective: string
): RolloverDResult {
  return rolloverB(inv, newRate, newTenor, newEffective);
}

// ─── 14. rolloverC ───────────────────────────────────────────────────────────

export interface RolloverCResult {
  rollAmount: string;
  principalPayout: string;
  interestPayout: string;
  totalPayout: string;
  newMaturityDate: string;
  projectedNewInterest: string;
}

/**
 * Rollover C: roll a portion (rollPrincipal) of principal.
 * If ROLLOVER_C_INTEREST = PAY_OUT: interest - WHT is paid out.
 * If ROLLOVER_C_INTEREST = CAPITALISE: interest is added to rollAmount.
 * Throws if rollPrincipal >= principal.
 */
export function rolloverC(
  inv: InvestmentForRollover,
  rollPrincipal: string,
  newRate: string,
  newTenor: number,
  newEffective: string
): RolloverCResult {
  const settings = getSettings();
  const interestTreatment = settings['ROLLOVER_C_INTEREST'] ?? 'PAY_OUT';

  const rollD = d(rollPrincipal);
  const principalD = d(inv.principalAmt);

  if (rollD.gte(principalD)) {
    throw new Error('Roll principal must be less than total principal');
  }

  const interestAmt = interest(inv.principalAmt, inv.intRate, inv.tenorDays);
  const customer = inv.customer ?? { isWhtExempt: false };
  const whtAmt = wht(interestAmt, customer, true);
  const netInterestAmt = fmt(d(interestAmt).minus(d(whtAmt)));

  const principalPayout = fmt(principalD.minus(rollD));

  let rollAmount: string;
  let interestPayout: string;

  if (interestTreatment === 'CAPITALISE') {
    rollAmount = fmt(rollD.plus(d(netInterestAmt)));
    interestPayout = '0.00';
  } else {
    rollAmount = fmt(rollD);
    interestPayout = netInterestAmt;
  }

  const totalPayout = fmt(d(principalPayout).plus(d(interestPayout)));
  const mat = maturityDate(newEffective, newTenor);
  const projectedNewInterest = interest(rollAmount, newRate, newTenor);

  return {
    rollAmount,
    principalPayout,
    interestPayout,
    totalPayout,
    newMaturityDate: mat.date,
    projectedNewInterest,
  };
}

// ─── 15. thirdParty ──────────────────────────────────────────────────────────

export interface ThirdPartyResult {
  fee: string;
  amountToBeneficiary: string;
  totalDebit: string;
}

/**
 * Third-party transfer fee calculation.
 * isInternal = true → fee is 0.
 * TP_FEE_MODE = DEDUCT → fee deducted from amount (beneficiary gets less).
 * TP_FEE_MODE = ADD    → fee added on top (customer debited more).
 */
export function thirdParty(amount: string, isInternal: boolean): ThirdPartyResult {
  if (isInternal) {
    return { fee: '0.00', amountToBeneficiary: fmt(d(amount)), totalDebit: fmt(d(amount)) };
  }
  const settings = getSettings();
  const feeRate = settings['TRANSFER_FEE_RATE'] ?? '0.10';
  const tpFeeMode = settings['TP_FEE_MODE'] ?? 'DEDUCT';

  const fee = fmt(d(amount).mul(d(feeRate).div(100)));

  let amountToBeneficiary: string;
  let totalDebit: string;

  if (tpFeeMode === 'DEDUCT') {
    amountToBeneficiary = fmt(d(amount).minus(d(fee)));
    totalDebit = fmt(d(amount));
  } else {
    amountToBeneficiary = fmt(d(amount));
    totalDebit = fmt(d(amount).plus(d(fee)));
  }

  return { fee, amountToBeneficiary, totalDebit };
}

// ─── 16. transfer ────────────────────────────────────────────────────────────

export interface TransferResult {
  valid: boolean;
  sourceAfter: string;
  error?: string;
}

/**
 * Internal transfer validation.
 */
export function transfer(sourceAvailable: string, amount: string): TransferResult {
  const avail = d(sourceAvailable);
  const amt = d(amount);
  if (amt.lte(0)) {
    return { valid: false, sourceAfter: fmt(avail), error: 'Amount must be greater than zero' };
  }
  if (amt.gt(avail)) {
    return { valid: false, sourceAfter: fmt(avail), error: 'Insufficient funds' };
  }
  return { valid: true, sourceAfter: fmt(avail.minus(amt)) };
}

// ─── 17. reversalDiff ────────────────────────────────────────────────────────

export interface ReversalDiffResult {
  rateDelta: string;
  tenorDelta: number;
  amountDelta: string;
  projectedInterestDelta: string;
}

export interface ReversalRecord {
  principalAmt: string;
  intRate: string;
  tenorDays: number;
  interestAmt: string;
}

/**
 * Compute deltas between original and corrected transaction records.
 */
export function reversalDiff(
  original: ReversalRecord,
  corrected: ReversalRecord
): ReversalDiffResult {
  return {
    rateDelta: fmt(d(corrected.intRate).minus(d(original.intRate))),
    tenorDelta: corrected.tenorDays - original.tenorDays,
    amountDelta: fmt(d(corrected.principalAmt).minus(d(original.principalAmt))),
    projectedInterestDelta: fmt(d(corrected.interestAmt).minus(d(original.interestAmt))),
  };
}

// ─── Legacy exports (backward compat with seed.ts and existing code) ──────────

export function getCalcSettings() {
  return getSettings();
}

export function calcInterest(
  principal: string,
  annualRate: string,
  tenorDays: number,
  dayCount = 365
): string {
  return interest(principal, annualRate, tenorDays, dayCount);
}

export function calcWHT(interestAmt: string, whtRate = '10'): string {
  return fmt(d(interestAmt).mul(d(whtRate).div(100)));
}

export function calcNetInterest(interestAmt: string, whtRate = '10'): string {
  const w = d(interestAmt).mul(d(whtRate).div(100));
  return fmt(d(interestAmt).minus(w));
}

export function calcTotalPayout(principal: string, netInterest: string): string {
  return fmt(d(principal).plus(d(netInterest)));
}

export function calcInvestment(
  principal: string,
  annualRate: string,
  tenorDays: number,
  whtRate = '10',
  dayCount = 365
): {
  interestAmt: string;
  withholdingTax: string;
  netInterest: string;
  totalPayout: string;
} {
  const interestAmt = calcInterest(principal, annualRate, tenorDays, dayCount);
  const withholdingTax = calcWHT(interestAmt, whtRate);
  const netInterest = calcNetInterest(interestAmt, whtRate);
  const totalPayout = calcTotalPayout(principal, netInterest);
  return { interestAmt, withholdingTax, netInterest, totalPayout };
}

export function calcPreliq(
  principal: string,
  annualRate: string,
  daysElapsed: number,
  preliqChargeRate = '20',
  whtRate = '10',
  whtBasis: 'AFTER_CHARGE' | 'BEFORE_CHARGE' = 'AFTER_CHARGE',
  dayCount = 365
): {
  accruedInterest: string;
  preliqCharge: string;
  interestAfterCharge: string;
  withholdingTax: string;
  netInterest: string;
  totalPayout: string;
} {
  const accruedInterest = calcInterest(principal, annualRate, daysElapsed, dayCount);
  const preliqCharge = fmt(d(accruedInterest).mul(d(preliqChargeRate).div(100)));
  const interestAfterCharge = fmt(d(accruedInterest).minus(d(preliqCharge)));
  const whtBase = whtBasis === 'AFTER_CHARGE' ? interestAfterCharge : accruedInterest;
  const withholdingTax = fmt(d(whtBase).mul(d(whtRate).div(100)));
  const netInterest = fmt(d(interestAfterCharge).minus(d(withholdingTax)));
  const totalPayout = calcTotalPayout(principal, netInterest);
  return { accruedInterest, preliqCharge, interestAfterCharge, withholdingTax, netInterest, totalPayout };
}

export function calcAnniversaryPayment(
  principal: string,
  annualRate: string,
  frequencyDays: number,
  applyWht = false,
  whtRate = '10',
  dayCount = 365
): {
  grossInterest: string;
  withholdingTax: string;
  netPayment: string;
} {
  const grossInterest = calcInterest(principal, annualRate, frequencyDays, dayCount);
  const withholdingTax = applyWht ? fmt(d(grossInterest).mul(d(whtRate).div(100))) : '0.00';
  const netPayment = fmt(d(grossInterest).minus(d(withholdingTax)));
  return { grossInterest, withholdingTax, netPayment };
}

export function calcRollover(
  principal: string,
  interestAmt: string,
  withholdingTax: string,
  rolloverCInterest: 'PAY_OUT' | 'CAPITALISE' = 'PAY_OUT',
  rolloverABasis: 'NET' | 'GROSS' = 'NET'
): {
  newPrincipal: string;
  interestPaidOut: string;
} {
  const p = d(principal);
  const intD = d(interestAmt);
  const whtD = d(withholdingTax);
  const netInterest = intD.minus(whtD);
  if (rolloverCInterest === 'CAPITALISE') {
    const addBack = rolloverABasis === 'NET' ? netInterest : intD;
    return { newPrincipal: fmt(p.plus(addBack)), interestPaidOut: '0.00' };
  }
  return { newPrincipal: fmt(p), interestPaidOut: fmt(rolloverABasis === 'NET' ? netInterest : intD) };
}

export function calcTransferFee(principal: string, transferFeeRate = '0.10'): string {
  return fmt(d(principal).mul(d(transferFeeRate).div(100)));
}

export function isSlaBreached(
  initiatedAt: string,
  currentStatus: string,
  slaCutoff = '15:00',
  slaHours = 8
): boolean {
  const terminalStatuses = ['COMPLETED', 'REJECTED', 'CANCELLED', 'CONFIRMED', 'CLOSED'];
  if (terminalStatuses.includes(currentStatus)) return false;
  try {
    const initiated = new Date(initiatedAt);
    const now = new Date();
    const diffHours = (now.getTime() - initiated.getTime()) / (1000 * 60 * 60);
    return diffHours > slaHours;
  } catch {
    return false;
  }
}

export function isValidPrincipal(value: string): boolean {
  try { return new Decimal(value).gt(0); } catch { return false; }
}

export function isValidRate(value: string): boolean {
  try {
    const dv = new Decimal(value);
    return dv.gt(0) && dv.lte(100);
  } catch { return false; }
}

export const DEFAULT_SETTINGS = {
  WHT_RATE: '10',
  PRELIQ_CHARGE_RATE: '20',
  TRANSFER_FEE_RATE: '0.10',
  DAY_COUNT: '365',
  WHT_ON_ANNIVERSARY: 'false',
  WHT_BASIS_PRELIQ: 'AFTER_CHARGE',
  PARTIAL_PRELIQ_INTEREST: 'NOT_PAID',
  TP_FEE_MODE: 'DEDUCT',
  ROLLOVER_C_INTEREST: 'PAY_OUT',
  ROLLOVER_A_BASIS: 'NET',
  MATURITY_HOLIDAY_RULE: 'NEXT_BUSINESS_DAY',
  SLA_CUTOFF: '15:00',
  SLA_HOURS: '8',
};
