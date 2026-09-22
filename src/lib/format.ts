import Decimal from 'decimal.js';

Decimal.set({ rounding: Decimal.ROUND_HALF_UP });

/** Format a money string or number as Nigerian Naira with ₦ symbol */
export function formatNaira(value: string | number | null | undefined): string {
  if (value === null || value === undefined || value === '') return '₦0.00';
  try {
    const d = new Decimal(value);
    const abs = d.abs();
    const formatted = abs.toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
    return d.isNegative() ? `-₦${formatted}` : `₦${formatted}`;
  } catch {
    return '₦0.00';
  }
}

/** Compact Naira: ₦10.53M, ₦450K, ₦2.1B */
export function formatNairaCompact(value: string | number | null | undefined): string {
  if (value === null || value === undefined || value === '') return '₦0';
  try {
    const d = new Decimal(value).abs();
    const sign = new Decimal(value).isNegative() ? '-' : '';
    if (d.gte(1_000_000_000)) {
      return `${sign}₦${d.div(1_000_000_000).toFixed(2)}B`;
    }
    if (d.gte(1_000_000)) {
      return `${sign}₦${d.div(1_000_000).toFixed(2)}M`;
    }
    if (d.gte(1_000)) {
      return `${sign}₦${d.div(1_000).toFixed(1)}K`;
    }
    return `${sign}₦${d.toFixed(2)}`;
  } catch {
    return '₦0';
  }
}

/** Format a YYYY-MM-DD string as 22-Sep-2026 */
export function formatDate(dateStr: string | null | undefined): string {
  if (!dateStr) return '—';
  try {
    const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
    const [year, month, day] = dateStr.split('-').map(Number);
    return `${String(day).padStart(2, '0')}-${months[month - 1]}-${year}`;
  } catch {
    return dateStr ?? '—';
  }
}

/** Format ISO timestamp as 22-Sep-2026 14:05 */
export function formatDateTime(iso: string | null | undefined): string {
  if (!iso) return '—';
  try {
    const d = new Date(iso);
    const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
    const day = String(d.getDate()).padStart(2, '0');
    const mon = months[d.getMonth()];
    const year = d.getFullYear();
    const hh = String(d.getHours()).padStart(2, '0');
    const mm = String(d.getMinutes()).padStart(2, '0');
    return `${day}-${mon}-${year} ${hh}:${mm}`;
  } catch {
    return iso;
  }
}

/** Format a percentage string */
export function formatRate(value: string | number | null | undefined): string {
  if (value === null || value === undefined || value === '') return '0.00%';
  try {
    return `${new Decimal(value).toFixed(2)}%`;
  } catch {
    return '0.00%';
  }
}

/** Add days to a YYYY-MM-DD string, return YYYY-MM-DD */
export function addDays(dateStr: string, days: number): string {
  const [y, m, d] = dateStr.split('-').map(Number);
  const date = new Date(y, m - 1, d);
  date.setDate(date.getDate() + days);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

/** Today as YYYY-MM-DD in Lagos time */
export function todayLagos(): string {
  const now = new Date();
  // UTC+1
  const lagosOffset = 60;
  const lagosMs = now.getTime() + (lagosOffset - now.getTimezoneOffset()) * 60000;
  const d = new Date(lagosMs);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** Now as ISO string with +01:00 */
export function nowLagosISO(): string {
  const now = new Date();
  const lagosOffset = 60;
  const lagosMs = now.getTime() + (lagosOffset - now.getTimezoneOffset()) * 60000;
  const d = new Date(lagosMs);
  const pad = (n: number) => String(n).padStart(2, '0');
  const ms = String(d.getMilliseconds()).padStart(3, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}.${ms}+01:00`;
}

/** Truncate long strings */
export function truncate(str: string, maxLen: number): string {
  if (!str) return '';
  return str.length > maxLen ? str.slice(0, maxLen) + '…' : str;
}