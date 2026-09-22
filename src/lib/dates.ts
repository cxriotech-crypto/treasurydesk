/**
 * Date helpers. Business dates are "YYYY-MM-DD" strings; timestamps are ISO strings with +01:00
 * (Africa/Lagos, UTC+1, no daylight saving). All arithmetic is done in UTC on the date parts so the
 * host machine's time zone never matters.
 */

export const LAGOS_OFFSET = '+01:00';
const LAGOS_OFFSET_MS = 60 * 60 * 1000;
const DAY_MS = 86_400_000;

function pad(n: number, w = 2): string {
  return String(n).padStart(w, '0');
}

/** Parse "YYYY-MM-DD" into a UTC epoch (midnight). */
export function dateToUtc(date: string): number {
  const [y, m, d] = date.split('-').map(Number);
  return Date.UTC(y, m - 1, d);
}

export function utcToDate(ms: number): string {
  const dt = new Date(ms);
  return `${dt.getUTCFullYear()}-${pad(dt.getUTCMonth() + 1)}-${pad(dt.getUTCDate())}`;
}

export function isIsoDate(v: unknown): v is string {
  if (typeof v !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(v)) return false;
  return utcToDate(dateToUtc(v)) === v;
}

/** Epoch ms → Lagos ISO timestamp "2026-09-22T14:05:22+01:00". */
export function toLagosIso(ms: number): string {
  const dt = new Date(ms + LAGOS_OFFSET_MS);
  return (
    `${dt.getUTCFullYear()}-${pad(dt.getUTCMonth() + 1)}-${pad(dt.getUTCDate())}` +
    `T${pad(dt.getUTCHours())}:${pad(dt.getUTCMinutes())}:${pad(dt.getUTCSeconds())}${LAGOS_OFFSET}`
  );
}

export function parseIso(iso: string): number {
  return new Date(iso).getTime();
}

export function nowIso(): string {
  return toLagosIso(Date.now());
}

/** Today's business date in Lagos. */
export function todayLagos(nowMs: number = Date.now()): string {
  return toLagosIso(nowMs).slice(0, 10);
}

/** Lagos date part of an ISO timestamp. */
export function isoDatePart(iso: string): string {
  return toLagosIso(parseIso(iso)).slice(0, 10);
}

/** Lagos "HH:mm" of an ISO timestamp. */
export function isoTimePart(iso: string): string {
  return toLagosIso(parseIso(iso)).slice(11, 16);
}

/** Build a Lagos timestamp from a business date and "HH:mm[:ss]". */
export function lagosDateTime(date: string, time = '00:00'): string {
  const [hh, mm, ss] = time.split(':').map(Number);
  const ms =
    dateToUtc(date) + ((hh || 0) * 3600 + (mm || 0) * 60 + (ss || 0)) * 1000 - LAGOS_OFFSET_MS;
  return toLagosIso(ms);
}

export function addDays(date: string, n: number): string {
  return utcToDate(dateToUtc(date) + n * DAY_MS);
}

export function addMinutes(iso: string, n: number): string {
  return toLagosIso(parseIso(iso) + n * 60_000);
}

export function addHours(iso: string, n: number): string {
  return addMinutes(iso, n * 60);
}

/** Actual days from → to (to − from). */
export function daysBetween(from: string, to: string): number {
  return Math.round((dateToUtc(to) - dateToUtc(from)) / DAY_MS);
}

export function minutesBetween(fromIso: string, toIso: string): number {
  return Math.round((parseIso(toIso) - parseIso(fromIso)) / 60_000);
}

export function compareDates(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

export function minDate(a: string, b: string): string {
  return a <= b ? a : b;
}

export function maxDate(a: string, b: string): string {
  return a >= b ? a : b;
}

/** 0 = Sunday … 6 = Saturday. */
export function dayOfWeek(date: string): number {
  return new Date(dateToUtc(date)).getUTCDay();
}

export function isWeekend(date: string): boolean {
  const d = dayOfWeek(date);
  return d === 0 || d === 6;
}

export function isBusinessDay(date: string, holidays: Iterable<string>): boolean {
  const set = holidays instanceof Set ? holidays : new Set(holidays);
  return !isWeekend(date) && !set.has(date);
}

/** The date itself if it is a business day, else the next business day. */
export function nextBusinessDay(date: string, holidays: Iterable<string>): string {
  const set = new Set(holidays);
  let d = date;
  while (!isBusinessDay(d, set)) d = addDays(d, 1);
  return d;
}

/** Strictly after `date`. */
export function followingBusinessDay(date: string, holidays: Iterable<string>): string {
  return nextBusinessDay(addDays(date, 1), holidays);
}

export function startOfMonth(date: string): string {
  return `${date.slice(0, 7)}-01`;
}

export function endOfMonth(date: string): string {
  const [y, m] = date.split('-').map(Number);
  return utcToDate(Date.UTC(y, m, 0));
}

export function addMonths(date: string, n: number): string {
  const [y, m, d] = date.split('-').map(Number);
  const target = new Date(Date.UTC(y, m - 1 + n, 1));
  const last = new Date(
    Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0)
  ).getUTCDate();
  target.setUTCDate(Math.min(d, last));
  return utcToDate(target.getTime());
}

/** Monday of the week containing date. */
export function startOfWeek(date: string): string {
  const dow = dayOfWeek(date);
  return addDays(date, dow === 0 ? -6 : 1 - dow);
}

export function yearOf(date: string): number {
  return Number(date.slice(0, 4));
}

/** Gregorian Easter Sunday (Anonymous Gregorian algorithm). */
export function easterSunday(year: number): string {
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31);
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  return `${year}-${pad(month)}-${pad(day)}`;
}
