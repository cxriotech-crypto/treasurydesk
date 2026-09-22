/**
 * Money helpers. All money is a 2-dp string; all maths is decimal.js (never JS floats).
 */
import DecimalBase from 'decimal.js';

export const D = DecimalBase.clone({ precision: 40, rounding: DecimalBase.ROUND_HALF_UP });
export type Dec = InstanceType<typeof D>;
export type Num = string | number | Dec;

export const ZERO = '0.00';

export function dec(v: Num | null | undefined): Dec {
  if (v === null || v === undefined || v === '') return new D(0);
  if (v instanceof D) return v;
  return new D(typeof v === 'string' ? v.replace(/,/g, '') : v);
}

/** Round to 2 dp ROUND_HALF_UP and return the canonical money string. */
export function toMoney(v: Num | null | undefined): string {
  return dec(v).toDecimalPlaces(2, D.ROUND_HALF_UP).toFixed(2);
}

export function add(...vals: Num[]): string {
  return toMoney(vals.reduce<Dec>((acc, v) => acc.plus(dec(v)), new D(0)));
}

export function sub(a: Num, b: Num): string {
  return toMoney(dec(a).minus(dec(b)));
}

export function mul(a: Num, b: Num): string {
  return toMoney(dec(a).times(dec(b)));
}

/** a × rate% (rate is a percentage, e.g. "10" for 10%). */
export function pct(a: Num, rate: Num): string {
  return toMoney(dec(a).times(dec(rate)).dividedBy(100));
}

export function sum(vals: Num[]): string {
  return add(...vals);
}

export function neg(a: Num): string {
  return toMoney(dec(a).negated());
}

export function max(a: Num, b: Num): string {
  return toMoney(DecimalBase.max(dec(a), dec(b)));
}

export function min(a: Num, b: Num): string {
  return toMoney(DecimalBase.min(dec(a), dec(b)));
}

export function cmp(a: Num, b: Num): number {
  return dec(a).comparedTo(dec(b));
}

export const gt = (a: Num, b: Num) => cmp(a, b) > 0;
export const gte = (a: Num, b: Num) => cmp(a, b) >= 0;
export const lt = (a: Num, b: Num) => cmp(a, b) < 0;
export const lte = (a: Num, b: Num) => cmp(a, b) <= 0;
export const eq = (a: Num, b: Num) => cmp(a, b) === 0;
export const isZero = (a: Num) => dec(a).isZero();
export const isPositive = (a: Num) => dec(a).greaterThan(0);

/** True for a finite number string with at most 2 decimals. */
export function isValidMoney(v: string | null | undefined): boolean {
  if (v === null || v === undefined) return false;
  const s = v.replace(/,/g, '').trim();
  return /^-?\d+(\.\d{1,2})?$/.test(s);
}

/** True when v is exactly in canonical 2-dp form. */
export function isCanonicalMoney(v: unknown): boolean {
  return typeof v === 'string' && /^-?\d+\.\d{2}$/.test(v);
}

/** Normalise a rate string to 2 dp (rates are percentages). */
export function toRate(v: Num): string {
  return dec(v).toDecimalPlaces(2, D.ROUND_HALF_UP).toFixed(2);
}
