/**
 * Amount in words for vouchers:
 * 10532602.74 → "Ten million, five hundred and thirty-two thousand, six hundred and two naira,
 * seventy-four kobo".
 */
import { D, dec, type Num } from './money';

const ONES = [
  'zero',
  'one',
  'two',
  'three',
  'four',
  'five',
  'six',
  'seven',
  'eight',
  'nine',
  'ten',
  'eleven',
  'twelve',
  'thirteen',
  'fourteen',
  'fifteen',
  'sixteen',
  'seventeen',
  'eighteen',
  'nineteen',
];
const TENS = ['', '', 'twenty', 'thirty', 'forty', 'fifty', 'sixty', 'seventy', 'eighty', 'ninety'];
const SCALES = ['', 'thousand', 'million', 'billion', 'trillion'];

function underHundred(n: number): string {
  if (n < 20) return ONES[n];
  const t = TENS[Math.floor(n / 10)];
  return n % 10 ? `${t}-${ONES[n % 10]}` : t;
}

function underThousand(n: number): string {
  const h = Math.floor(n / 100);
  const r = n % 100;
  if (h && r) return `${ONES[h]} hundred and ${underHundred(r)}`;
  if (h) return `${ONES[h]} hundred`;
  return underHundred(r);
}

/** Integer (as digit string, up to trillions) to words. */
export function integerToWords(digits: string): string {
  const s = digits.replace(/^0+/, '') || '0';
  if (s === '0') return 'zero';
  const groups: number[] = [];
  for (let end = s.length; end > 0; end -= 3) {
    groups.unshift(Number(s.slice(Math.max(0, end - 3), end)));
  }
  const parts: string[] = [];
  groups.forEach((g, idx) => {
    if (!g) return;
    const scale = SCALES[groups.length - 1 - idx];
    const isLast = idx === groups.length - 1;
    let words = underThousand(g);
    // British style: "one million and five" when the last group has no hundreds.
    if (isLast && parts.length && g < 100) words = `and ${words}`;
    parts.push(scale ? `${words} ${scale}` : words);
  });
  return parts.join(', ').replace(/, and /g, ' and ');
}

export function amountInWords(v: Num): string {
  const d = dec(v).abs().toDecimalPlaces(2, D.ROUND_HALF_UP);
  const [naira, kobo] = d.toFixed(2).split('.');
  let out = `${integerToWords(naira)} naira`;
  if (Number(kobo) > 0) out += `, ${underHundred(Number(kobo))} kobo`;
  if (dec(v).isNegative() && !d.isZero()) out = `minus ${out}`;
  return out.charAt(0).toUpperCase() + out.slice(1);
}
