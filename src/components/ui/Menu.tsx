'use client';

import Link from 'next/link';
import { useRef, useState, type ReactNode } from 'react';
import type { LucideIcon } from 'lucide-react';
import { useClickOutside, useEscape } from '../hooks';
import { cn } from './cn';
import { Icon } from './Icon';

/**
 * Anchored popover. `trigger` receives the open state and a toggle; the panel is positioned under it.
 * On phones the panel spans the viewport width (minus the gutter) so it never causes horizontal scroll.
 */
export function Popover({
  trigger,
  children,
  align = 'right',
  panelClassName,
  label,
}: {
  trigger: (p: { open: boolean; toggle: () => void; id: string }) => ReactNode;
  children: ReactNode | ((close: () => void) => ReactNode);
  align?: 'left' | 'right';
  panelClassName?: string;
  label: string;
}) {
  const [open, setOpen] = useState(false);
  const wrap = useRef<HTMLDivElement>(null);
  const close = () => setOpen(false);
  useClickOutside([wrap], open, close);
  useEscape(open, close);
  const id = `pop-${label.replace(/\W+/g, '-').toLowerCase()}`;
  return (
    <div ref={wrap} className="relative">
      {trigger({ open, toggle: () => setOpen((o) => !o), id })}
      {open ? (
        <div
          id={id}
          role="dialog"
          aria-label={label}
          className={cn(
            'fixed inset-x-4 top-[60px] z-40 mt-1 rounded-lg border border-border bg-surface shadow-pop',
            'sm:absolute sm:inset-x-auto sm:top-full sm:w-80',
            align === 'right' ? 'sm:right-0' : 'sm:left-0',
            panelClassName
          )}
        >
          {typeof children === 'function' ? children(close) : children}
        </div>
      ) : null}
    </div>
  );
}

export interface MenuItem {
  key: string;
  label: ReactNode;
  icon?: LucideIcon;
  href?: string;
  onSelect?: () => void;
  danger?: boolean;
  disabled?: boolean;
  active?: boolean;
  hint?: ReactNode;
}

export function MenuList({
  items,
  onDone,
}: {
  items: (MenuItem | 'divider' | { heading: string })[];
  onDone?: () => void;
}) {
  return (
    <ul role="menu" className="py-1">
      {items.map((it, i) => {
        if (it === 'divider')
          return <li key={`d${i}`} role="separator" className="my-1 border-t border-border" />;
        if ('heading' in it) {
          return (
            <li
              key={`h${i}`}
              className="px-3 pb-1 pt-2 text-[11px] font-semibold uppercase tracking-wide text-muted"
            >
              {it.heading}
            </li>
          );
        }
        const cls = cn(
          'flex min-h-10 w-full items-center gap-2.5 px-3 py-2 text-left text-sm md:min-h-9',
          it.disabled ? 'cursor-not-allowed text-muted' : 'hover:bg-surface-2',
          it.danger && 'text-st-danger-fg',
          it.active && 'font-semibold'
        );
        const content = (
          <>
            {it.icon ? <Icon icon={it.icon} className="shrink-0 text-muted" /> : null}
            <span className="min-w-0 flex-1 truncate">{it.label}</span>
            {it.hint ? <span className="shrink-0 text-xs text-muted">{it.hint}</span> : null}
          </>
        );
        return (
          <li key={it.key} role="none">
            {it.href && !it.disabled ? (
              <Link role="menuitem" href={it.href} className={cls} onClick={() => onDone?.()}>
                {content}
              </Link>
            ) : (
              <button
                role="menuitem"
                type="button"
                disabled={it.disabled}
                aria-current={it.active || undefined}
                className={cls}
                onClick={() => {
                  it.onSelect?.();
                  onDone?.();
                }}
              >
                {content}
              </button>
            )}
          </li>
        );
      })}
    </ul>
  );
}

/** Popover containing a menu. */
export function DropdownMenu({
  trigger,
  items,
  align = 'right',
  label,
  header,
}: {
  trigger: (p: { open: boolean; toggle: () => void; id: string }) => ReactNode;
  items: (MenuItem | 'divider' | { heading: string })[];
  align?: 'left' | 'right';
  label: string;
  header?: ReactNode;
}) {
  return (
    <Popover
      trigger={trigger}
      align={align}
      label={label}
      panelClassName="sm:w-64 max-h-[70vh] overflow-y-auto"
    >
      {(close) => (
        <>
          {header}
          <MenuList items={items} onDone={close} />
        </>
      )}
    </Popover>
  );
}

/** Hover / focus tooltip (pure CSS). Put the same text in the trigger's aria-label for screen readers. */
export function Tooltip({
  content,
  children,
  className,
}: {
  content: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <span className={cn('group relative inline-flex', className)}>
      {children}
      <span
        role="tooltip"
        className="pointer-events-none absolute bottom-full left-1/2 z-30 mb-1.5 hidden w-max max-w-[min(18rem,80vw)] -translate-x-1/2 rounded-md border border-border bg-surface px-2.5 py-1.5 text-xs font-normal text-fg shadow-pop group-focus-within:block group-hover:block"
      >
        {content}
      </span>
    </span>
  );
}
