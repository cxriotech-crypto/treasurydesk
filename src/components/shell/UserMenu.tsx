'use client';

import { usePathname, useRouter } from 'next/navigation';
import { ChevronDown, LogOut, UserRound } from 'lucide-react';
import type { AppUser } from '@/domain/types';
import { ROLE_CODES, ROLE_LABELS } from '@/domain/codes';
import { authService } from '@/services';
import { useData } from '@/services/useData';
import { canAccess } from '@/app/routes';
import { useTheme, type ThemePref } from '@/components/theme';
import {
  DropdownMenu,
  Icon,
  Segmented,
  cn,
  toast,
  toastError,
  type MenuItem,
} from '@/components/ui';
import { UserBlock, initials } from './Sidebar';

export function UserMenu({ user }: { user: AppUser }) {
  const router = useRouter();
  const pathname = usePathname();
  const [theme, setTheme] = useTheme();
  const users = useData(() => authService.demoUsers(), []);

  const switchTo = async (u: AppUser) => {
    try {
      const next = await authService.switchUser(u.id);
      toast.success(`Now signed in as ${next.fullName}`, ROLE_LABELS[next.roleCode]);
      if (!canAccess(pathname, next.roleCode)) router.push('/dashboard');
    } catch (e) {
      toastError(e);
    }
  };

  const signOut = async () => {
    await authService.logout('USER');
    router.replace('/login');
  };

  const others = [...(users.data ?? [])].sort(
    (a, b) =>
      ROLE_CODES.indexOf(a.roleCode) - ROLE_CODES.indexOf(b.roleCode) ||
      a.fullName.localeCompare(b.fullName)
  );

  const items: (MenuItem | 'divider' | { heading: string })[] = [
    { heading: 'Switch user (demo)' },
    ...others.map<MenuItem>((u) => ({
      key: u.id,
      label: u.fullName,
      hint: u.roleCode,
      icon: UserRound,
      active: u.id === user.id,
      disabled: u.id === user.id,
      onSelect: () => void switchTo(u),
    })),
    'divider',
    { key: 'logout', label: 'Sign out', icon: LogOut, onSelect: () => void signOut() },
  ];

  return (
    <DropdownMenu
      label="User menu"
      items={items}
      header={
        <div className="space-y-3 border-b border-border px-3 py-3">
          <UserBlock user={user} />
          <div className="flex items-center justify-between gap-2">
            <span className="text-xs font-medium text-muted">Theme</span>
            <Segmented<ThemePref>
              label="Theme"
              value={theme}
              onChange={setTheme}
              options={[
                { value: 'system', label: 'Auto' },
                { value: 'light', label: 'Light' },
                { value: 'dark', label: 'Dark' },
              ]}
            />
          </div>
        </div>
      }
      trigger={({ toggle, open, id }) => (
        <button
          type="button"
          onClick={toggle}
          aria-expanded={open}
          aria-controls={id}
          aria-label={`User menu for ${user.fullName}`}
          className="flex h-10 items-center gap-2 rounded-md px-1.5 hover:bg-surface-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <span className="flex h-8 w-8 items-center justify-center rounded-full bg-brand text-xs font-semibold text-brand-fg">
            {initials(user.fullName)}
          </span>
          <span className="hidden min-w-0 text-left leading-tight xl:block">
            <span className="block max-w-[10rem] truncate text-[13px] font-medium">
              {user.fullName}
            </span>
            <span className="block text-xs text-muted">{ROLE_LABELS[user.roleCode]}</span>
          </span>
          <Icon
            icon={ChevronDown}
            className={cn('hidden text-muted sm:block', open && 'rotate-180')}
          />
        </button>
      )}
    />
  );
}
