'use client';

import type { ReactNode } from 'react';
import { Sigma } from 'lucide-react';
import type { Tone } from '@/domain/codes';
import {
  formatDate,
  formatDateTime,
  formatNaira,
  formatNairaCompact,
  formatRate,
} from '@/lib/format';
import { cn } from './cn';
import { Icon } from './Icon';
import { Tooltip } from './Menu';

/** ₦ amount, tabular figures; compact mode shows the exact value on hover. */
export function Money({
  value,
  compact,
  className,
}: {
  value: string | null | undefined;
  compact?: boolean;
  className?: string;
}) {
  if (value === null || value === undefined || value === '')
    return <span className={cn('num text-muted', className)}>—</span>;
  if (compact) {
    return (
      <span className={cn('num', className)} title={formatNaira(value)}>
        {formatNairaCompact(value)}
      </span>
    );
  }
  return <span className={cn('num whitespace-nowrap', className)}>{formatNaira(value)}</span>;
}

export function DateText({ value, time }: { value: string | null | undefined; time?: boolean }) {
  return (
    <span className="num whitespace-nowrap">
      {time ? formatDateTime(value) : formatDate(value)}
    </span>
  );
}

export function RateText({ value }: { value: string | null | undefined }) {
  return <span className="num">{value ? formatRate(value) : '—'}</span>;
}

/** "fx" marker: hover or focus shows the formula with real numbers. */
export function FormulaHint({ formula, className }: { formula: string; className?: string }) {
  return (
    <Tooltip content={<span className="num">{formula}</span>} className={className}>
      <button
        type="button"
        aria-label={`Formula: ${formula}`}
        className="inline-flex h-5 items-center gap-0.5 rounded border border-border px-1 text-[10px] font-semibold uppercase tracking-wide text-muted hover:text-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <Icon icon={Sigma} size={11} />
        fx
      </button>
    </Tooltip>
  );
}

/** Read-only calculated value: shaded, right-aligned, with the fx marker. */
export function CalcValue({
  label,
  value,
  formula,
  total,
}: {
  label: ReactNode;
  value: ReactNode;
  formula?: string;
  total?: boolean;
}) {
  return (
    <div
      className={cn(
        'flex items-center justify-between gap-3 rounded-md bg-surface-2 px-3 py-2',
        total && 'ring-1 ring-border-strong'
      )}
    >
      <span className={cn('text-[13px] text-muted', total && 'font-semibold text-fg')}>
        {label}
      </span>
      <span className="flex items-center gap-2">
        <span className={cn('num text-sm', total && 'font-semibold')}>{value}</span>
        {formula ? <FormulaHint formula={formula} /> : null}
      </span>
    </div>
  );
}

export const TONE_CLASS: Record<Tone, string> = {
  neutral: 'bg-st-neutral-bg text-st-neutral-fg',
  info: 'bg-st-info-bg text-st-info-fg',
  warning: 'bg-st-warning-bg text-st-warning-fg',
  accent: 'bg-st-accent-bg text-st-accent-fg',
  success: 'bg-st-success-bg text-st-success-fg',
  danger: 'bg-st-danger-bg text-st-danger-fg',
};

export function Badge({
  tone = 'neutral',
  children,
  className,
}: {
  tone?: Tone;
  children: ReactNode;
  className?: string;
}) {
  return (
    <span
      className={cn(
        'inline-flex max-w-full items-center gap-1 truncate rounded px-1.5 py-0.5 text-xs font-medium leading-4',
        TONE_CLASS[tone],
        className
      )}
    >
      {children}
    </span>
  );
}

/** Small coloured dot for dense lists. */
export function Dot({ tone }: { tone: Tone }) {
  const c: Record<Tone, string> = {
    neutral: 'bg-subtle',
    info: 'bg-st-info-fg',
    warning: 'bg-st-warning-fg',
    accent: 'bg-teal-bright',
    success: 'bg-st-success-fg',
    danger: 'bg-st-danger-fg',
  };
  return <span aria-hidden className={cn('inline-block h-2 w-2 shrink-0 rounded-full', c[tone])} />;
}
