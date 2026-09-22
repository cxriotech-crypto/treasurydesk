'use client';

import { Check, Circle, X } from 'lucide-react';
import { CONTROL_CODES, CONTROL_LABELS, type ControlCode, type ControlState } from '@/domain/codes';
import { formatDateTime } from '@/lib/format';
import { Icon, cn } from '@/components/ui';

export interface ControlLine {
  controlCode: ControlCode;
  state: ControlState;
  actorName?: string | null;
  actedAt?: string | null;
  note?: string | null;
}

/** The 12 SOP controls with who / when. Ticked automatically as each step completes. */
export function ControlsChecklist({
  controls,
  compact,
}: {
  controls: ControlLine[];
  compact?: boolean;
}) {
  const byCode = new Map(controls.map((c) => [c.controlCode, c]));
  return (
    <ol className="space-y-1.5">
      {CONTROL_CODES.map((code) => {
        const c = byCode.get(code) ?? { controlCode: code, state: 'PENDING' as ControlState };
        return (
          <li key={code} className="flex items-start gap-2.5">
            <span
              className={cn(
                'mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full border',
                c.state === 'PASSED' && 'border-teal-bright bg-teal-bright text-white dark:text-bg',
                c.state === 'FAILED' && 'border-st-danger-fg bg-st-danger-bg text-st-danger-fg',
                c.state === 'PENDING' && 'border-border-strong text-subtle'
              )}
              aria-label={c.state.toLowerCase()}
            >
              <Icon
                icon={c.state === 'PASSED' ? Check : c.state === 'FAILED' ? X : Circle}
                size={c.state === 'PENDING' ? 6 : 12}
              />
            </span>
            <span className="min-w-0 text-[13px] leading-5">
              <span className={cn(c.state === 'PENDING' && 'text-muted')}>
                <span className="num text-subtle">{code}</span> {CONTROL_LABELS[code]}
              </span>
              {!compact && (c.actorName || c.note) ? (
                <span className="block text-xs text-muted">
                  {c.actorName ? `${c.actorName} · ${formatDateTime(c.actedAt)}` : null}
                  {c.note ? (
                    <span className={cn('block', c.state === 'FAILED' && 'text-st-danger-fg')}>
                      {c.note}
                    </span>
                  ) : null}
                </span>
              ) : null}
            </span>
          </li>
        );
      })}
    </ol>
  );
}

export function controlsProgress(controls: ControlLine[]): string {
  return `${controls.filter((c) => c.state === 'PASSED').length}/12`;
}
