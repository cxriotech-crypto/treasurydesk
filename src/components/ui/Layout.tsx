import Link from 'next/link';
import type { ReactNode } from 'react';
import { ChevronRight, type LucideIcon } from 'lucide-react';
import { cn } from './cn';
import { Icon } from './Icon';

export function Card({
  children,
  className,
  as: As = 'section',
}: {
  children: ReactNode;
  className?: string;
  as?: 'section' | 'div' | 'article';
}) {
  return (
    <As className={cn('min-w-0 rounded-lg border border-border bg-surface', className)}>
      {children}
    </As>
  );
}

export function CardHeader({
  title,
  description,
  actions,
  className,
}: {
  title: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        'flex flex-wrap items-start justify-between gap-2 border-b border-border px-4 py-3',
        className
      )}
    >
      <div className="min-w-0">
        <h2 className="text-[15px] font-semibold">{title}</h2>
        {description ? <p className="mt-0.5 text-[13px] text-muted">{description}</p> : null}
      </div>
      {actions ? <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div> : null}
    </div>
  );
}

export function CardBody({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn('p-4', className)}>{children}</div>;
}

export interface Crumb {
  label: string;
  href?: string;
}

export function PageHeader({
  title,
  description,
  crumbs,
  actions,
  meta,
}: {
  title: ReactNode;
  description?: ReactNode;
  crumbs?: Crumb[];
  actions?: ReactNode;
  meta?: ReactNode;
}) {
  return (
    <header className="mb-5 min-w-0">
      {crumbs?.length ? (
        <nav aria-label="Breadcrumb" className="mb-1.5">
          <ol className="flex flex-wrap items-center gap-1 text-[13px] text-muted">
            {crumbs.map((c, i) => (
              <li key={`${c.label}-${i}`} className="flex items-center gap-1">
                {i > 0 ? <Icon icon={ChevronRight} size={14} /> : null}
                {c.href ? (
                  <Link href={c.href} className="hover:text-fg hover:underline">
                    {c.label}
                  </Link>
                ) : (
                  <span aria-current="page">{c.label}</span>
                )}
              </li>
            ))}
          </ol>
        </nav>
      ) : null}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <h1 className="text-xl font-semibold tracking-tight md:text-[22px]">{title}</h1>
          {description ? <p className="mt-1 text-sm text-muted">{description}</p> : null}
          {meta ? <div className="mt-2 flex flex-wrap items-center gap-2">{meta}</div> : null}
        </div>
        {actions ? (
          <div className="flex flex-wrap items-center gap-2 sm:justify-end">{actions}</div>
        ) : null}
      </div>
    </header>
  );
}

/** Key/value list for detail panels. */
export function DescriptionList({
  items,
  columns = 2,
}: {
  items: { label: ReactNode; value: ReactNode }[];
  columns?: 1 | 2 | 3;
}) {
  return (
    <dl
      className={cn(
        'grid grid-cols-1 gap-x-6 gap-y-3',
        columns >= 2 && 'sm:grid-cols-2',
        columns === 3 && 'lg:grid-cols-3'
      )}
    >
      {items.map((it, i) => (
        <div key={i} className="min-w-0">
          <dt className="text-xs font-medium text-muted">{it.label}</dt>
          <dd className="mt-0.5 break-words text-sm">{it.value}</dd>
        </div>
      ))}
    </dl>
  );
}

/** Sticky bottom action bar for primary actions on phones (inline on larger screens). */
export function ActionBar({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div
      className={cn(
        'sticky bottom-0 z-20 -mx-4 mt-4 flex flex-col-reverse gap-2 border-t border-border bg-surface px-4 py-3',
        'sm:flex-row sm:flex-wrap sm:justify-end md:static md:mx-0 md:border-0 md:bg-transparent md:px-0 md:py-0',
        className
      )}
    >
      {children}
    </div>
  );
}

export function SectionTitle({
  icon,
  children,
  actions,
}: {
  icon?: LucideIcon;
  children: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <div className="mb-2 flex items-center justify-between gap-2">
      <h3 className="flex items-center gap-2 text-[15px] font-semibold">
        {icon ? <Icon icon={icon} className="text-muted" /> : null}
        {children}
      </h3>
      {actions}
    </div>
  );
}
