'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import type { AppUser } from '@/domain/types';
import { ROLE_LABELS } from '@/domain/codes';
import { matchRoute, navFor } from '@/app/routes';
import { cn } from '@/components/ui/cn';
import { Icon } from '@/components/ui/Icon';
import { Brand } from './Brand';

export function NavList({ user, onNavigate }: { user: AppUser; onNavigate?: () => void }) {
  const pathname = usePathname();
  const current = matchRoute(pathname);
  const groups = navFor(user.roleCode);
  return (
    <nav aria-label="Main" className="space-y-5">
      {groups.map(({ group, items }) => (
        <div key={group}>
          <p className="mb-1 px-3 text-[11px] font-semibold uppercase tracking-wide text-subtle">
            {group}
          </p>
          <ul className="space-y-0.5">
            {items.map((r) => {
              const active = current?.path === r.path || pathname.startsWith(`${r.path}/`);
              return (
                <li key={r.path}>
                  <Link
                    href={r.path}
                    onClick={onNavigate}
                    aria-current={active ? 'page' : undefined}
                    className={cn(
                      'flex min-h-10 items-center gap-2.5 rounded-md px-3 text-sm transition-colors md:min-h-9',
                      active
                        ? 'bg-brand-soft font-medium text-fg'
                        : 'text-muted hover:bg-surface-2 hover:text-fg'
                    )}
                  >
                    {r.icon ? <Icon icon={r.icon} className={active ? 'text-fg' : ''} /> : null}
                    {r.label}
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </nav>
  );
}

export function UserBlock({ user }: { user: AppUser }) {
  return (
    <div className="flex min-w-0 items-center gap-2.5">
      <span
        aria-hidden
        className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-surface-2 text-xs font-semibold text-muted"
      >
        {initials(user.fullName)}
      </span>
      <span className="min-w-0 leading-tight">
        <span className="block truncate text-[13px] font-medium">{user.fullName}</span>
        <span className="block truncate text-xs text-muted">{ROLE_LABELS[user.roleCode]}</span>
      </span>
    </div>
  );
}

export function initials(name: string): string {
  const parts = name
    .replace(/^(mr|mrs|ms|dr)\.?\s+/i, '')
    .split(/\s+/)
    .filter(Boolean);
  return ((parts[0]?.[0] ?? '') + (parts[parts.length - 1]?.[0] ?? '')).toUpperCase();
}

/** Fixed sidebar from 1024 px. */
export function Sidebar({ user }: { user: AppUser }) {
  return (
    <aside className="fixed inset-y-0 left-0 z-30 hidden w-60 flex-col border-r border-border bg-surface lg:flex">
      <div className="flex h-14 items-center border-b border-border px-4">
        <Link href="/dashboard" aria-label="TreasuryDesk home">
          <Brand />
        </Link>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto px-2 py-4">
        <NavList user={user} />
      </div>
      <div className="border-t border-border px-4 py-3">
        <UserBlock user={user} />
      </div>
    </aside>
  );
}
