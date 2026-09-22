'use client';

import { Check } from 'lucide-react';
import { cn } from './cn';
import { Icon } from './Icon';

export interface StepItem {
  key: string;
  label: string;
  /** done = completed, current = in progress, todo = not started, failed = blocked. */
  state: 'done' | 'current' | 'todo' | 'failed';
  hint?: string;
}

/**
 * Wizard stepper: vertical list on desktop (left rail), compact "Step 3 of 6" header with a
 * progress bar below 768 px.
 */
export function Stepper({
  steps,
  onSelect,
  canSelect,
  orientation = 'vertical',
}: {
  steps: StepItem[];
  onSelect?: (key: string) => void;
  canSelect?: (step: StepItem) => boolean;
  orientation?: 'vertical' | 'horizontal';
}) {
  const currentIdx = Math.max(
    0,
    steps.findIndex((s) => s.state === 'current')
  );
  const done = steps.filter((s) => s.state === 'done').length;
  return (
    <>
      {/* Phones: compact header */}
      <div className="md:hidden" aria-label="Progress">
        <p className="text-[13px] text-muted">
          Step <span className="num font-semibold text-fg">{currentIdx + 1}</span> of{' '}
          <span className="num">{steps.length}</span>
          <span className="text-fg"> · {steps[currentIdx]?.label}</span>
        </p>
        <div
          className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-surface-2"
          role="progressbar"
          aria-valuemin={0}
          aria-valuemax={steps.length}
          aria-valuenow={done}
        >
          <div
            className="h-full rounded-full bg-teal-bright transition-all"
            style={{ width: `${(Math.max(done, currentIdx) / steps.length) * 100}%` }}
          />
        </div>
      </div>

      {/* Tablet / desktop */}
      <ol
        className={cn(
          'hidden md:flex',
          orientation === 'vertical' ? 'flex-col gap-1' : 'flex-row flex-wrap gap-2'
        )}
      >
        {steps.map((s, i) => {
          const selectable = !!onSelect && (canSelect ? canSelect(s) : s.state !== 'todo');
          const body = (
            <>
              <span
                className={cn(
                  'num flex h-6 w-6 shrink-0 items-center justify-center rounded-full border text-xs font-semibold',
                  s.state === 'done' && 'border-teal-bright bg-teal-bright text-white dark:text-bg',
                  s.state === 'current' && 'border-brand bg-brand text-brand-fg',
                  s.state === 'todo' && 'border-border-strong text-muted',
                  s.state === 'failed' && 'border-st-danger-fg bg-st-danger-bg text-st-danger-fg'
                )}
              >
                {s.state === 'done' ? <Icon icon={Check} size={14} /> : i + 1}
              </span>
              <span className="min-w-0 text-left">
                <span
                  className={cn(
                    'block truncate text-sm',
                    s.state === 'current' ? 'font-semibold' : s.state === 'todo' ? 'text-muted' : ''
                  )}
                >
                  {s.label}
                </span>
                {s.hint ? (
                  <span className="block truncate text-xs text-muted">{s.hint}</span>
                ) : null}
              </span>
            </>
          );
          return (
            <li key={s.key} aria-current={s.state === 'current' ? 'step' : undefined}>
              {selectable ? (
                <button
                  type="button"
                  onClick={() => onSelect!(s.key)}
                  className="flex w-full items-center gap-2.5 rounded-md px-2 py-1.5 hover:bg-surface-2"
                >
                  {body}
                </button>
              ) : (
                <div className="flex items-center gap-2.5 px-2 py-1.5">{body}</div>
              )}
            </li>
          );
        })}
      </ol>
    </>
  );
}
