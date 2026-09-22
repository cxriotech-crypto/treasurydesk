'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { authService } from '@/services';
import { Brand } from '@/components/shell/Brand';

/** Entry: signed-in users go to their dashboard, everyone else to sign-in. */
export default function Home() {
  const router = useRouter();
  useEffect(() => {
    router.replace(authService.current() ? '/dashboard' : '/login');
  }, [router]);
  return (
    <main className="flex min-h-screen items-center justify-center">
      <Brand />
    </main>
  );
}
