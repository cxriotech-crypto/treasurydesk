'use client';

import Link from 'next/link';
import { useEffect, type ReactNode } from 'react';
import { usePathname } from 'next/navigation';
import { Menu } from 'lucide-react';
import type { AppUser } from '@/domain/types';
import { onStoreError } from '@/services';
import { useDisclosure } from '@/components/hooks';
import { Drawer, IconButton, toast } from '@/components/ui';
import { Brand } from './Brand';
import { GlobalSearch } from './GlobalSearch';
import { IdleGuard } from './IdleGuard';
import { NotificationsBell } from './NotificationsBell';
import { NavList, Sidebar, UserBlock } from './Sidebar';
import { UserMenu } from './UserMenu';

export function AppShell({ user, children }: { user: AppUser; children: ReactNode }) {
  const nav = useDisclosure();
  const pathname = usePathname();

  // Close the mobile drawer whenever the route changes.
  const closeNav = nav.onClose;
  useEffect(() => closeNav(), [pathname, closeNav]);
  useEffect(() => onStoreError((m) => toast.warning('Storage is full', m)), []);

  return (
    <div className="min-h-screen">
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:fixed focus:left-3 focus:top-3 focus:z-[60] focus:rounded-md focus:bg-surface focus:px-3 focus:py-2 focus:shadow-pop"
      >
        Skip to content
      </a>
      <Sidebar user={user} />

      <Drawer
        open={nav.open}
        onClose={nav.onClose}
        side="left"
        width="max-w-[18rem]"
        title={<Brand />}
        ariaLabel="Navigation"
        footer={
          <div className="w-full">
            <UserBlock user={user} />
          </div>
        }
      >
        <NavList user={user} onNavigate={nav.onClose} />
      </Drawer>

      <div className="lg:pl-60">
        <header className="sticky top-0 z-20 flex h-14 items-center gap-2 border-b border-border bg-surface px-2 sm:px-4 lg:px-6">
          <IconButton
            icon={Menu}
            label="Open navigation"
            className="lg:hidden"
            onClick={nav.onOpen}
            aria-expanded={nav.open}
          />
          <Link href="/dashboard" className="min-w-0 lg:hidden" aria-label="TreasuryDesk home">
            <Brand compact className="sm:hidden" />
            <Brand className="hidden sm:flex" />
          </Link>
          <div className="flex min-w-0 flex-1 justify-end lg:justify-start">
            <GlobalSearch />
          </div>
          <div className="flex shrink-0 items-center gap-1">
            <NotificationsBell />
            <UserMenu user={user} />
          </div>
        </header>
        <main
          id="main"
          tabIndex={-1}
          className="mx-auto w-full max-w-[1600px] px-4 py-5 focus:outline-none md:px-6 lg:px-8 lg:py-6"
        >
          {children}
        </main>
      </div>
      <IdleGuard />
    </div>
  );
}

/** Frame shown while the guard resolves the session (no protected content leaks). */
export function ShellSkeleton() {
  return (
    <div className="min-h-screen" aria-busy="true">
      <div className="fixed inset-y-0 left-0 hidden w-60 border-r border-border bg-surface lg:block" />
      <div className="lg:pl-60">
        <div className="h-14 border-b border-border bg-surface" />
      </div>
    </div>
  );
}
