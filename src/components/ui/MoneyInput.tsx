'use client';

import { forwardRef, useEffect, useState, type InputHTMLAttributes } from 'react';
import { formatAmount } from '@/lib/format';
import { isValidMoney, toMoney } from '@/lib/money';
import { Input } from './Field';

export interface MoneyInputProps extends Omit<
  InputHTMLAttributes<HTMLInputElement>,
  'value' | 'onChange' | 'type' | 'prefix'
> {
  /** Canonical money string ("3000000.00") or "" when empty. */
  value: string;
  onValueChange: (value: string) => void;
  invalid?: boolean;
}

/** Strip everything but digits and one decimal point; at most 2 decimals. */
function clean(text: string): string {
  let s = text.replace(/[^\d.]/g, '');
  const dot = s.indexOf('.');
  if (dot >= 0)
    s =
      s.slice(0, dot + 1) +
      s
        .slice(dot + 1)
        .replace(/\./g, '')
        .slice(0, 2);
  return s.replace(/^0+(?=\d)/, '');
}

function display(value: string): string {
  return value && isValidMoney(value) ? formatAmount(value) : '';
}

/**
 * ₦ amount input. Shows thousands separators while you type and always reports a canonical
 * 2-dp string (never a JS number), so money maths stays in decimal.js.
 */
export const MoneyInput = forwardRef<HTMLInputElement, MoneyInputProps>(function MoneyInput(
  { value, onValueChange, onBlur, onFocus, ...rest },
  ref
) {
  const [text, setText] = useState(() => display(value));
  const [focused, setFocused] = useState(false);

  useEffect(() => {
    if (!focused) setText(display(value));
  }, [value, focused]);

  return (
    <Input
      ref={ref}
      inputMode="decimal"
      autoComplete="off"
      prefix="₦"
      className="num text-right"
      value={text}
      onFocus={(e) => {
        setFocused(true);
        onFocus?.(e);
      }}
      onChange={(e) => {
        const raw = clean(e.target.value);
        const [i, f] = raw.split('.');
        const grouped = i
          ? i.replace(/\B(?=(\d{3})+(?!\d))/g, ',')
          : raw.startsWith('.')
            ? '0'
            : '';
        setText(raw.includes('.') ? `${grouped}.${f ?? ''}` : grouped);
        onValueChange(raw && raw !== '.' ? toMoney(raw) : '');
      }}
      onBlur={(e) => {
        setFocused(false);
        setText(display(value));
        onBlur?.(e);
      }}
      {...rest}
    />
  );
});
