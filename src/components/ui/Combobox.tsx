'use client';

import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { Check, ChevronsUpDown, X } from 'lucide-react';
import { useClickOutside } from '../hooks';
import { cn } from './cn';
import { controlClass } from './Field';
import { Icon } from './Icon';

export interface ComboOption {
  value: string;
  label: string;
  sublabel?: string;
  /** Extra text that search matches (e.g. CIF, account no.). */
  keywords?: string;
  disabled?: boolean;
  /** Why the option cannot be picked (shown under it). */
  disabledReason?: string | null;
}

/** Searchable select with keyboard support (↑ ↓ Enter Esc). */
export function Combobox({
  options,
  value,
  onChange,
  placeholder = 'Search…',
  id,
  invalid,
  disabled,
  emptyText = 'No matches',
  clearable,
  ...aria
}: {
  options: ComboOption[];
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  id?: string;
  invalid?: boolean;
  disabled?: boolean;
  emptyText?: string;
  clearable?: boolean;
  'aria-invalid'?: boolean;
  'aria-describedby'?: string;
}) {
  const auto = useId();
  const inputId = id ?? auto;
  const listId = `${inputId}-list`;
  const selected = options.find((o) => o.value === value);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [active, setActive] = useState(0);
  const wrap = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLUListElement>(null);
  useClickOutside([wrap], open, () => setOpen(false));

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const list = q
      ? options.filter((o) =>
          `${o.label} ${o.sublabel ?? ''} ${o.keywords ?? ''}`.toLowerCase().includes(q)
        )
      : options;
    return list.slice(0, 100);
  }, [options, query]);

  useEffect(() => setActive(0), [query, open]);
  useEffect(() => {
    listRef.current
      ?.querySelector<HTMLElement>(`[data-idx="${active}"]`)
      ?.scrollIntoView({ block: 'nearest' });
  }, [active]);

  const pick = (o: ComboOption) => {
    if (o.disabled) return;
    onChange(o.value);
    setOpen(false);
    setQuery('');
  };

  return (
    <div ref={wrap} className="relative min-w-0">
      <input
        id={inputId}
        role="combobox"
        aria-expanded={open}
        aria-controls={listId}
        aria-autocomplete="list"
        aria-activedescendant={open && filtered[active] ? `${listId}-${active}` : undefined}
        aria-invalid={aria['aria-invalid']}
        aria-describedby={aria['aria-describedby']}
        disabled={disabled}
        autoComplete="off"
        placeholder={selected ? selected.label : placeholder}
        value={open ? query : (selected?.label ?? '')}
        onFocus={() => setOpen(true)}
        onClick={() => setOpen(true)}
        onChange={(e) => {
          setQuery(e.target.value);
          setOpen(true);
        }}
        onKeyDown={(e) => {
          if (e.key === 'ArrowDown') {
            e.preventDefault();
            setOpen(true);
            setActive((a) => Math.min(a + 1, filtered.length - 1));
          } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            setActive((a) => Math.max(a - 1, 0));
          } else if (e.key === 'Enter' && open && filtered[active]) {
            e.preventDefault();
            pick(filtered[active]);
          } else if (e.key === 'Escape') {
            setOpen(false);
          }
        }}
        className={controlClass(invalid || aria['aria-invalid'], 'pr-16')}
      />
      <span className="absolute inset-y-0 right-1 flex items-center gap-0.5">
        {clearable && value && !disabled ? (
          <button
            type="button"
            aria-label="Clear"
            onClick={() => onChange('')}
            className="flex h-8 w-8 items-center justify-center rounded text-muted hover:text-fg"
          >
            <Icon icon={X} size={14} />
          </button>
        ) : null}
        <Icon icon={ChevronsUpDown} className="pointer-events-none mr-2 text-muted" />
      </span>
      {open ? (
        <ul
          ref={listRef}
          id={listId}
          role="listbox"
          className="absolute z-30 mt-1 max-h-72 w-full overflow-y-auto rounded-lg border border-border bg-surface py-1 shadow-pop"
        >
          {filtered.length === 0 ? (
            <li className="px-3 py-2 text-sm text-muted">{emptyText}</li>
          ) : null}
          {filtered.map((o, i) => (
            <li
              key={o.value}
              id={`${listId}-${i}`}
              data-idx={i}
              role="option"
              aria-selected={o.value === value}
              aria-disabled={o.disabled || undefined}
              onMouseEnter={() => setActive(i)}
              onMouseDown={(e) => {
                e.preventDefault();
                pick(o);
              }}
              className={cn(
                'flex cursor-pointer items-start gap-2 px-3 py-2 text-sm',
                i === active && !o.disabled && 'bg-surface-2',
                o.disabled && 'cursor-not-allowed text-muted'
              )}
            >
              <span className="mt-0.5 w-4 shrink-0">
                {o.value === value ? <Icon icon={Check} size={14} /> : null}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate">{o.label}</span>
                {o.sublabel ? (
                  <span className="block truncate text-xs text-muted">{o.sublabel}</span>
                ) : null}
                {o.disabled && o.disabledReason ? (
                  <span className="block text-xs text-st-warning-fg">{o.disabledReason}</span>
                ) : null}
              </span>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
