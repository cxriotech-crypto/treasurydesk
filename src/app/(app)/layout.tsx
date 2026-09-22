'use client';

import { useEffect, type ReactNode } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { authService } from '@/services';
import { useCurrentUser } from '@/services/useData';
import { canAccess } from '@/app/routes';
import { useMounted } from '@/components/hooks';
import { AppShell, ShellSkeleton } from '@/components/shell/AppShell';

/**
 * Route guard for everything inside the shell:
 * no session → sign-in (with ?next=), 2FA pending → 2FA step, role not allowed → /forbidden.
 */
export default function AppLayout({ children }: { children: ReactNode }) {
  const mounted = useMounted();
  const user = useCurrentUser();
  const router = useRouter();
  const pathname = usePathname();
  const allowed = !!user && canAccess(pathname, user.roleCode);

  useEffect(() => {
    if (!mounted) return;
    if (!user) {
      const pending = authService.pending();
      router.replace(pending ? '/login' : `/login?next=${encodeURIComponent(pathname)}`);
    } else if (!allowed) {
      router.replace(`/forbidden?from=${encodeURIComponent(pathname)}`);
    }
  }, [mounted, user, allowed, pathname, router]);

  if (!mounted || !user || !allowed) return <ShellSkeleton />;
  return <AppShell user={user}>{children}</AppShell>;
}
