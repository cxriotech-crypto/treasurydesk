'use client';

import { useRef, type KeyboardEvent, type ReactNode } from 'react';
import { cn } from './cn';

export interface TabItem<K extends string> {
  key: K;
  label: ReactNode;
  count?: number;
  disabled?: boolean;
}

/** Accessible tab list (arrow keys move between tabs). Scrolls horizontally inside itself on phones. */
export function Tabs<K extends string>({
  tabs,
  value,
  onChange,
  label,
  className,
}: {
  tabs: TabItem<K>[];
  value: K;
  onChange: (k: K) => void;
  label: string;
  className?: string;
}) {
  const refs = useRef<(HTMLButtonElement | null)[]>([]);
  const onKey = (e: KeyboardEvent, i: number) => {
    if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return;
    e.preventDefault();
    const dir = e.key === 'ArrowRight' ? 1 : -1;
    for (let n = 1; n <= tabs.length; n++) {
      const j = (i + dir * n + tabs.length) % tabs.length;
      if (!tabs[j].disabled) {
        refs.current[j]?.focus();
        onChange(tabs[j].key);
        break;
      }
    }
  };
  return (
    <div className={cn('-mx-4 overflow-x-auto px-4 scrollbar-thin md:mx-0 md:px-0', className)}>
      <div
        role="tablist"
        aria-label={label}
        className="flex min-w-max gap-1 border-b border-border"
      >
        {tabs.map((t, i) => {
          const active = t.key === value;
          return (
            <button
              key={t.key}
              ref={(el) => {
                refs.current[i] = el;
              }}
              role="tab"
              type="button"
              id={`tab-${t.key}`}
              aria-selected={active}
              aria-controls={`panel-${t.key}`}
              tabIndex={active ? 0 : -1}
              disabled={t.disabled}
              onKeyDown={(e) => onKey(e, i)}
              onClick={() => onChange(t.key)}
              className={cn(
                '-mb-px flex h-10 items-center gap-1.5 whitespace-nowrap border-b-2 px-3 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring',
                active ? 'border-brand text-fg' : 'border-transparent text-muted hover:text-fg',
                t.disabled && 'cursor-not-allowed opacity-50'
              )}
            >
              {t.label}
              {t.count !== undefined ? (
                <span
                  className={cn(
                    'num rounded px-1.5 text-xs',
                    active ? 'bg-brand-soft text-fg' : 'bg-surface-2 text-muted'
                  )}
                >
                  {t.count}
                </span>
              ) : null}
            </button>
          );
        })}
      </div>
    </div>
  );
}

export function TabPanel({
  id,
  children,
  className,
}: {
  id: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      role="tabpanel"
      id={`panel-${id}`}
      aria-labelledby={`tab-${id}`}
      className={cn('pt-4', className)}
    >
      {children}
    </div>
  );
}
