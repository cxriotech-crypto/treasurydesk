'use client';

import { Check, X } from 'lucide-react';
import type { Stage } from '@/services/transactionsService';
import { formatDateTime } from '@/lib/format';
import { Icon, cn } from '@/components/ui';

/** Instruction → … → Confirmed. Horizontal on wide screens; scrolls inside itself on phones. */
export function StageProgress({ stages }: { stages: Stage[] }) {
  return (
    <div className="-mx-4 overflow-x-auto px-4 scrollbar-thin md:mx-0 md:px-0">
      <ol className="flex min-w-max items-start">
        {stages.map((s, i) => (
          <li key={s.key} className="flex items-start">
            <div
              className="flex w-[84px] flex-col items-center text-center"
              title={s.at ? `${s.by} · ${formatDateTime(s.at)}` : undefined}
            >
              <span
                className={cn(
                  'flex h-6 w-6 items-center justify-center rounded-full border text-[11px] font-semibold',
                  s.state === 'done' && 'border-teal-bright bg-teal-bright text-white dark:text-bg',
                  s.state === 'current' && 'border-brand bg-brand text-brand-fg',
                  s.state === 'todo' && 'border-border-strong bg-surface text-muted',
                  s.state === 'failed' && 'border-st-danger-fg bg-st-danger-bg text-st-danger-fg'
                )}
                aria-label={`${s.label}: ${s.state}`}
              >
                {s.state === 'done' ? (
                  <Icon icon={Check} size={13} />
                ) : s.state === 'failed' ? (
                  <Icon icon={X} size={13} />
                ) : (
                  i + 1
                )}
              </span>
              <span
                className={cn(
                  'mt-1 text-[11px] leading-tight',
                  s.state === 'current' ? 'font-semibold' : s.state === 'todo' ? 'text-muted' : ''
                )}
              >
                {s.label}
              </span>
            </div>
            {i < stages.length - 1 ? (
              <span
                aria-hidden
                className={cn(
                  'mt-3 h-px w-3 shrink-0',
                  s.state === 'done' ? 'bg-teal-bright' : 'bg-border-strong'
                )}
              />
            ) : null}
          </li>
        ))}
      </ol>
    </div>
  );
}
