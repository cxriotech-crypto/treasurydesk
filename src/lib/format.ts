/**
 * Display formatting. Money: ₦10,532,602.74 · compact ₦10.53M / ₦1.2B · dates 22-Sep-2026 ·
 * date-time 22-Sep-2026 14:05 · durations 2h 14m.
 */
import { D, dec, type Num } from './money';
import { isoDatePart, isoTimePart, parseIso, toLagosIso } from './dates';

export const NAIRA = '₦';
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

function group(intPart: string): string {
  return intPart.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}

/** 1234567.8 → "1,234,567.80" (no currency sign). */
export function formatAmount(v: Num | null | undefined, dp = 2): string {
  const d = dec(v).toDecimalPlaces(dp, D.ROUND_HALF_UP);
  const neg = d.isNegative() && !d.isZero();
  const [i, f] = d.abs().toFixed(dp).split('.');
  return `${neg ? '-' : ''}${group(i)}${f ? `.${f}` : ''}`;
}

/** "₦10,532,602.74" (negative: "-₦1,000.00"). */
export function formatNaira(v: Num | null | undefined): string {
  const s = formatAmount(v);
  return s.startsWith('-') ? `-${NAIRA}${s.slice(1)}` : `${NAIRA}${s}`;
}

/** Signed delta: "+₦1,000.00" / "-₦1,000.00" / "₦0.00". */
export function formatNairaDelta(v: Num): string {
  const d = dec(v);
  if (d.isZero()) return formatNaira(0);
  return d.isPositive() ? `+${formatNaira(d)}` : formatNaira(d);
}

function trimZeros(s: string): string {
  return s.includes('.') ? s.replace(/\.?0+$/, '') : s;
}

/** Compact for tiles: ₦10.53M, ₦1.2B, ₦850K, ₦950. */
export function formatNairaCompact(v: Num | null | undefined): string {
  const d = dec(v);
  const sign = d.isNegative() ? '-' : '';
  const a = d.abs();
  let body: string;
  if (a.gte(1e12)) body = `${trimZeros(a.dividedBy(1e12).toFixed(2))}T`;
  else if (a.gte(1e9)) body = `${trimZeros(a.dividedBy(1e9).toFixed(2))}B`;
  else if (a.gte(1e6)) body = `${a.dividedBy(1e6).toFixed(2)}M`;
  else if (a.gte(1e3)) body = `${trimZeros(a.dividedBy(1e3).toFixed(1))}K`;
  else body = trimZeros(a.toFixed(2));
  return `${sign}${NAIRA}${body}`;
}

export function formatRate(v: Num | null | undefined): string {
  return `${trimZeros(dec(v).toFixed(2))}%`;
}

export function formatCount(n: number): string {
  return group(String(Math.trunc(n)));
}

/** "2026-09-22" → "22-Sep-2026". */
export function formatDate(date: string | null | undefined): string {
  if (!date) return '—';
  const d = date.length > 10 ? isoDatePart(date) : date;
  const [y, m, day] = d.split('-');
  return `${day}-${MONTHS[Number(m) - 1]}-${y}`;
}

/** ISO timestamp → "22-Sep-2026 14:05" (Lagos). */
export function formatDateTime(iso: string | null | undefined): string {
  if (!iso) return '—';
  return `${formatDate(isoDatePart(iso))} ${isoTimePart(iso)}`;
}

/** ISO timestamp → "14:05:22" (Lagos). */
export function formatTime(iso: string | null | undefined, withSeconds = true): string {
  if (!iso) return '—';
  const t = toLagosIso(parseIso(iso)).slice(11, 19);
  return withSeconds ? t : t.slice(0, 5);
}

/** Minutes → "2h 14m", "3d 4h", "45m". */
export function formatDuration(totalMinutes: number): string {
  const m = Math.max(0, Math.round(Math.abs(totalMinutes)));
  const days = Math.floor(m / 1440);
  const hours = Math.floor((m % 1440) / 60);
  const mins = m % 60;
  if (days > 0) return hours ? `${days}d ${hours}h` : `${days}d`;
  if (hours > 0) return `${hours}h ${mins}m`;
  return `${mins}m`;
}

export function monthLabel(date: string): string {
  const [y, m] = date.split('-');
  return `${MONTHS[Number(m) - 1]} ${y}`;
}

export function monthShort(date: string): string {
  return MONTHS[Number(date.split('-')[1]) - 1];
}
