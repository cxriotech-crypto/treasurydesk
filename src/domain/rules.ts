/** Business rules shared by the workflow engine and the screens (pure functions). */
import type { Account, AppUser, Investment, Settings, TreasuryTxn } from './types';
import { SCENARIO_META, type PayDestination, type ScenarioCode } from './codes';
import {
  addDays,
  addHours,
  dateToUtc,
  followingBusinessDay,
  isBusinessDay,
  isoDatePart,
  isoTimePart,
  lagosDateTime,
  minutesBetween,
} from '@/lib/dates';
import { formatDate, formatDuration } from '@/lib/format';

export const DEMO_PIN = '1234';
/** Idle warning and automatic sign-out (minutes without activity). */
export const IDLE_WARN_MINUTES = 15;
export const IDLE_LOGOUT_MINUTES = 17;
export const DEMO_OTP = '123456';
export const INTERNAL_BANK_CODE = '000';
export const INTERNAL_BANK_NAME = 'First Marina Trust (internal)';
export const COMPANY_NAME = 'First Marina Trust Finance Company Limited';

/** Maturing investments can be actioned from this many days before maturity. */
export const MATURITY_WINDOW_DAYS = 7;
export const ANNIVERSARY_WINDOW_DAYS = 14;

/** Why an investment cannot be used for a scenario (null = eligible). */
export function investmentIneligibility(
  scenario: ScenarioCode,
  inv: Investment,
  today: string,
  hasOpenTxn: boolean
): string | null {
  const meta = SCENARIO_META[scenario];
  if (meta.subject !== 'INVESTMENT') return 'This transaction does not start from an investment';
  if (hasOpenTxn) return 'Another transaction is already in progress for this investment';
  if (inv.status !== 'ACTIVE' && inv.status !== 'MATURED') return 'Investment is no longer active';
  switch (meta.txnType) {
    case 'ROLLOVER':
    case 'MATURITY':
      if (inv.maturityDate > addDays(today, MATURITY_WINDOW_DAYS)) {
        return `Available from ${formatDate(addDays(inv.maturityDate, -MATURITY_WINDOW_DAYS))} (matures ${formatDate(inv.maturityDate)})`;
      }
      return null;
    case 'PRELIQ':
      if (inv.status !== 'ACTIVE' || inv.maturityDate <= today)
        return 'Investment has matured – use termination or rollover';
      if (inv.effectiveDate >= today) return 'Investment starts today – nothing to pre-liquidate';
      return null;
    case 'ANNIVERSARY':
      if (inv.status !== 'ACTIVE') return 'Investment is not active';
      if (!inv.annivFreqDays || !inv.nextAnnivDate)
        return 'Investment has no anniversary interest schedule';
      if (inv.nextAnnivDate >= inv.maturityDate) return 'No anniversary before maturity';
      if (inv.nextAnnivDate > addDays(today, ANNIVERSARY_WINDOW_DAYS)) {
        return `Next anniversary is ${formatDate(inv.nextAnnivDate)}`;
      }
      return null;
    default:
      return null;
  }
}

/** Why an account cannot be the source for a scenario (null = eligible). */
export function accountIneligibility(scenario: ScenarioCode, acc: Account): string | null {
  if (acc.status !== 'ACTIVE') return 'Account is inactive';
  switch (scenario) {
    case 'TRANSFER_SS_PA':
      return acc.productCode === 'SS' ? null : 'Source must be a Savings (SS) account';
    case 'TRANSFER_PA_CP':
    case 'TRANSFER_PA_CALL':
    case 'THIRD_PARTY_EXT':
    case 'THIRD_PARTY_INT':
      return acc.productCode === 'PA' ? null : 'Source must be a Personal Account (PA)';
    default:
      return 'This transaction does not start from an account';
  }
}

/** Why a completed transaction cannot be reversed (null = eligible). */
export function reversalIneligibility(
  txn: TreasuryTxn,
  resultInv: Investment | undefined,
  hasOpenReversal: boolean
): string | null {
  if (txn.status !== 'COMPLETED') return 'Only completed transactions can be reversed';
  if (!resultInv) return 'Transaction did not create an investment';
  if (txn.reversedByTxnId) return 'Transaction has already been reversed';
  if (hasOpenReversal) return 'A reversal is already in progress';
  if (resultInv.status !== 'ACTIVE') return 'The investment it created is no longer active';
  return null;
}

/** Does money leave the bank through GAPS? */
export function needsGaps(
  scenario: ScenarioCode,
  payDestination: PayDestination | null | undefined
): boolean {
  if (scenario === 'THIRD_PARTY_EXT') return true;
  if (scenario === 'THIRD_PARTY_INT') return false;
  const vouchers = SCENARIO_META[scenario].vouchers;
  if (!vouchers.includes('FO')) return false;
  return payDestination === 'EXTERNAL';
}

/** SLA due time: receivedAt + slaHours; after the cut-off (or on a non-business day) start next business day 08:00. */
export function computeSlaDue(receivedAt: string, settings: Settings, holidays: string[]): string {
  const date = isoDatePart(receivedAt);
  const time = isoTimePart(receivedAt);
  let start = receivedAt;
  if (!isBusinessDay(date, holidays)) {
    start = lagosDateTime(followingBusinessDay(addDays(date, -1), holidays), '08:00');
  } else if (time >= settings.slaCutoff) {
    start = lagosDateTime(followingBusinessDay(date, holidays), '08:00');
  } else if (time < '08:00') {
    start = lagosDateTime(date, '08:00');
  }
  return addHours(start, settings.slaHours);
}

export interface SlaState {
  breached: boolean;
  minutesLeft: number; // negative when breached
  label: string; // "2h 14m left" / "Breached by 2h 14m"
  band: 'green' | 'amber' | 'red';
}

export function slaState(
  slaDueAt: string | null,
  nowIso: string,
  completedAt?: string | null
): SlaState | null {
  if (!slaDueAt) return null;
  const ref = completedAt ?? nowIso;
  const left = minutesBetween(ref, slaDueAt);
  if (left < 0)
    return {
      breached: true,
      minutesLeft: left,
      label: `Breached by ${formatDuration(-left)}`,
      band: 'red',
    };
  const label = completedAt
    ? `Within SLA (${formatDuration(left)} to spare)`
    : `${formatDuration(left)} left`;
  return { breached: false, minutesLeft: left, label, band: left < 120 ? 'amber' : 'green' };
}

/** Name without honorifics, lower-case, single-spaced ("Mrs. Folake Adebayo" → "folake adebayo"). */
export function normaliseName(name: string): string {
  return name
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .replace(/^(mr|mrs|ms|miss|dr|chief|alhaji|alhaja)\.?\s+/, '');
}

export function signatureMatches(user: AppUser, name: string, pin: string): string | null {
  if (!name.trim()) return 'Type your full name to sign';
  if (normaliseName(name) !== normaliseName(user.fullName))
    return 'Name does not match your user profile';
  if (pin !== DEMO_PIN) return 'Incorrect PIN';
  return null;
}

/** Sort helper: ISO dates compare as strings; used where Date objects would be overkill. */
export function isOnOrBefore(a: string, b: string): boolean {
  return dateToUtc(a) <= dateToUtc(b);
}
