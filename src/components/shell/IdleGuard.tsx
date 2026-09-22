'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { LogOut } from 'lucide-react';
import { IDLE_LOGOUT_MINUTES, IDLE_WARN_MINUTES } from '@/domain/rules';
import { authService } from '@/services';
import { Button, Modal } from '@/components/ui';

const WARN_MS = IDLE_WARN_MINUTES * 60_000;
const LOGOUT_MS = IDLE_LOGOUT_MINUTES * 60_000;
const PING_EVERY_MS = 15_000;

function fmt(ms: number): string {
  const s = Math.max(0, Math.ceil(ms / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

/**
 * Idle timeout: warning after 15 minutes without activity, sign-out at 17 minutes.
 * Activity is recorded on the shared session, so any open tab keeps the others alive.
 */
export function IdleGuard() {
  const router = useRouter();
  const [remaining, setRemaining] = useState<number | null>(null);
  const warning = remaining !== null;
  const warningRef = useRef(false);
  warningRef.current = warning;
  const lastPing = useRef(0);

  useEffect(() => {
    const ping = () => {
      if (warningRef.current) return; // only the button dismisses the warning
      const now = Date.now();
      if (now - lastPing.current < PING_EVERY_MS) return;
      lastPing.current = now;
      authService.touch();
    };
    const events = ['pointerdown', 'keydown', 'wheel', 'touchstart'] as const;
    events.forEach((e) => window.addEventListener(e, ping, { passive: true }));
    const onVisible = () => document.visibilityState === 'visible' && ping();
    document.addEventListener('visibilitychange', onVisible);

    const tick = setInterval(() => {
      const last = authService.lastActivityAt();
      if (!last) return;
      const idle = Date.now() - new Date(last).getTime();
      if (idle >= LOGOUT_MS) {
        clearInterval(tick);
        void authService.logout('IDLE').then(() => router.replace('/login?reason=idle'));
      } else if (idle >= WARN_MS) {
        setRemaining(LOGOUT_MS - idle);
      } else if (warningRef.current) {
        setRemaining(null); // activity in another tab
      }
    }, 1000);

    return () => {
      events.forEach((e) => window.removeEventListener(e, ping));
      document.removeEventListener('visibilitychange', onVisible);
      clearInterval(tick);
    };
  }, [router]);

  const stay = () => {
    lastPing.current = Date.now();
    authService.touch();
    setRemaining(null);
  };

  return (
    <Modal
      open={warning}
      onClose={stay}
      size="sm"
      title="Are you still there?"
      description="For security, TreasuryDesk signs you out after 17 minutes without activity."
      footer={
        <>
          <Button
            icon={LogOut}
            onClick={() => void authService.logout('USER').then(() => router.replace('/login'))}
          >
            Sign out now
          </Button>
          <Button variant="primary" onClick={stay} data-autofocus>
            Stay signed in
          </Button>
        </>
      }
    >
      <p className="text-sm">
        You will be signed out in <span className="num font-semibold">{fmt(remaining ?? 0)}</span>.
      </p>
    </Modal>
  );
}
