'use client';

import { useId, type ReactNode } from 'react';
import { cn } from './cn';

export function Checkbox({
  checked,
  onChange,
  label,
  description,
  disabled,
  id,
  className,
}: {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label: ReactNode;
  description?: ReactNode;
  disabled?: boolean;
  id?: string;
  className?: string;
}) {
  const auto = useId();
  const cid = id ?? auto;
  return (
    <div className={cn('flex min-h-10 items-start gap-3 py-1.5 md:min-h-0', className)}>
      <input
        id={cid}
        type="checkbox"
        checked={checked}
        disabled={disabled}
        onChange={(e) => onChange(e.target.checked)}
        className="form-checkbox mt-0.5 h-4 w-4 shrink-0 rounded border-border-strong bg-surface text-brand focus:ring-2 focus:ring-ring focus:ring-offset-0 disabled:opacity-50"
      />
      <label htmlFor={cid} className={cn('text-sm leading-5', disabled && 'text-muted')}>
        <span className="font-medium">{label}</span>
        {description ? <span className="block text-xs text-muted">{description}</span> : null}
      </label>
    </div>
  );
}

export interface RadioOption<T extends string> {
  value: T;
  label: ReactNode;
  description?: ReactNode;
  disabled?: boolean;
}

export function RadioGroup<T extends string>({
  name,
  value,
  onChange,
  options,
  label,
  orientation = 'vertical',
  className,
}: {
  name: string;
  value: T | '';
  onChange: (v: T) => void;
  options: RadioOption<T>[];
  label?: ReactNode;
  orientation?: 'vertical' | 'horizontal';
  className?: string;
}) {
  const gid = useId();
  return (
    <fieldset className={cn('min-w-0', className)}>
      {label ? <legend className="mb-1 text-[13px] font-medium text-muted">{label}</legend> : null}
      <div className={cn('flex gap-x-5', orientation === 'vertical' ? 'flex-col' : 'flex-wrap')}>
        {options.map((o) => {
          const id = `${gid}-${o.value}`;
          return (
            <div key={o.value} className="flex min-h-10 items-start gap-2.5 py-1.5 md:min-h-0">
              <input
                id={id}
                type="radio"
                name={name}
                value={o.value}
                checked={value === o.value}
                disabled={o.disabled}
                onChange={() => onChange(o.value)}
                className="form-radio mt-0.5 h-4 w-4 shrink-0 border-border-strong bg-surface text-brand focus:ring-2 focus:ring-ring focus:ring-offset-0"
              />
              <label htmlFor={id} className={cn('text-sm leading-5', o.disabled && 'text-muted')}>
                {o.label}
                {o.description ? (
                  <span className="block text-xs text-muted">{o.description}</span>
                ) : null}
              </label>
            </div>
          );
        })}
      </div>
    </fieldset>
  );
}

export function Switch({
  checked,
  onChange,
  label,
  description,
  disabled,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label: ReactNode;
  description?: ReactNode;
  disabled?: boolean;
}) {
  const id = useId();
  return (
    <div className="flex min-h-10 items-center justify-between gap-4 py-1">
      <label htmlFor={id} className="text-sm">
        <span className="font-medium">{label}</span>
        {description ? <span className="block text-xs text-muted">{description}</span> : null}
      </label>
      <button
        id={id}
        type="button"
        role="switch"
        aria-checked={checked}
        disabled={disabled}
        onClick={() => onChange(!checked)}
        className={cn(
          'relative inline-flex h-6 w-10 shrink-0 items-center rounded-full transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50',
          checked ? 'bg-teal-bright' : 'bg-border-strong'
        )}
      >
        <span
          className={cn(
            'inline-block h-5 w-5 rounded-full bg-white shadow transition-transform',
            checked ? 'translate-x-[18px]' : 'translate-x-0.5'
          )}
        />
      </button>
    </div>
  );
}

/** Segmented two/three-way toggle (e.g. Confirmed / Not confirmed). */
export function Segmented<T extends string>({
  value,
  onChange,
  options,
  label,
}: {
  value: T | '';
  onChange: (v: T) => void;
  options: { value: T; label: string }[];
  label: string;
}) {
  return (
    <div
      role="radiogroup"
      aria-label={label}
      className="inline-flex rounded-md border border-border-strong bg-surface p-0.5"
    >
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          role="radio"
          aria-checked={value === o.value}
          onClick={() => onChange(o.value)}
          className={cn(
            'h-9 rounded px-3 text-[13px] font-medium transition-colors md:h-7',
            value === o.value ? 'bg-brand text-brand-fg' : 'text-muted hover:text-fg'
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}
