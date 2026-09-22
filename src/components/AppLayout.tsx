'use client';
import React, { useState, useEffect } from 'react';
import Sidebar from './Sidebar';
import Topbar from './Topbar';
import { getSession, clearSession } from '@/services/userService';
import { userService } from '@/services/userService';
import type { AppUser } from '@/types';
import { useRouter, usePathname } from 'next/navigation';
import type { UserRole } from '@/types';
import Modal from './ui/Modal';

interface AppLayoutProps {
  children: React.ReactNode;
  allowedRoles?: UserRole[];
}

export default function AppLayout({ children, allowedRoles }: AppLayoutProps) {
  const [collapsed, setCollapsed] = useState(false);
  const [isDark, setIsDark] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [allUsers, setAllUsers] = useState<AppUser[]>([]);
  const [idleWarning, setIdleWarning] = useState(false);
  const router = useRouter();
  const pathname = usePathname();

  const session = getSession();
  const user = session?.user;

  // Auth guard
  useEffect(() => {
    if (!session) {
      router.push('/login');
      return;
    }
    if (allowedRoles && user && !allowedRoles.includes(user.role)) {
      router.push('/403');
    }
  }, [pathname]);

  // Load all users for role switcher
  useEffect(() => {
    userService.listAll().then(setAllUsers).catch(() => {});
  }, []);

  // Dark mode persistence
  useEffect(() => {
    const saved = localStorage.getItem('td_dark');
    if (saved === 'true') {
      setIsDark(true);
      document.documentElement.classList.add('dark');
    }
    setMounted(true);
  }, []);

  function toggleDark() {
    const next = !isDark;
    setIsDark(next);
    localStorage.setItem('td_dark', String(next));
    document.documentElement.classList.toggle('dark', next);
  }

  // Idle timer: warn at 15 min, logout at 17 min
  useEffect(() => {
    let warnTimer: ReturnType<typeof setTimeout>;
    let logoutTimer: ReturnType<typeof setTimeout>;

    function resetTimers() {
      clearTimeout(warnTimer);
      clearTimeout(logoutTimer);
      setIdleWarning(false);
      warnTimer = setTimeout(() => setIdleWarning(true), 15 * 60 * 1000);
      logoutTimer = setTimeout(() => {
        clearSession();
        router.push('/login');
      }, 17 * 60 * 1000);
    }

    const events = ['mousemove', 'keydown', 'click', 'scroll'];
    events.forEach((e) => window.addEventListener(e, resetTimers));
    resetTimers();
    return () => {
      clearTimeout(warnTimer);
      clearTimeout(logoutTimer);
      events.forEach((e) => window.removeEventListener(e, resetTimers));
    };
  }, []);

  if (!user) return null;

  const sidebarWidth = collapsed ? 64 : 240;

  // Calculate pending counts for badges
  // Backend integration point: fetch real counts from notification service
  const pendingApprovalsCount = 3;
  const pendingOpsCount = 1;

  return (
    <div className={`min-h-screen bg-background${mounted && isDark ? ' dark' : ''}`} suppressHydrationWarning>
      <Sidebar
        collapsed={collapsed}
        onToggle={() => setCollapsed((v) => !v)}
        userRole={user.role}
        pendingApprovalsCount={pendingApprovalsCount}
        pendingOpsCount={pendingOpsCount}
      />
      <Topbar
        collapsed={collapsed}
        user={user}
        allUsers={allUsers}
        isDark={isDark}
        onToggleDark={toggleDark}
        notificationCount={4}
      />
      <main
        className="transition-all duration-300 pt-[60px]"
        style={{ marginLeft: `${sidebarWidth}px` }}
      >
        <div className="min-h-[calc(100vh-60px)] p-6 max-w-screen-2xl mx-auto">
          {children}
        </div>
      </main>

      {/* Idle Warning Modal */}
      <Modal
        open={idleWarning}
        onClose={() => setIdleWarning(false)}
        title="Session Expiring Soon"
        footer={
          <>
            <button onClick={() => { clearSession(); router.push('/login'); }} className="btn-secondary text-sm">
              Sign Out Now
            </button>
            <button onClick={() => setIdleWarning(false)} className="btn-primary text-sm">
              Stay Signed In
            </button>
          </>
        }
      >
        <div className="text-center py-4">
          <div className="w-14 h-14 rounded-full bg-amber-100 flex items-center justify-center mx-auto mb-3">
            <span className="text-2xl">⏱</span>
          </div>
          <p className="text-sm text-foreground font-medium mb-1">Your session will expire in 2 minutes</p>
          <p className="text-xs text-muted-foreground">
            You have been idle for 15 minutes. Click &quot;Stay Signed In&quot; to continue your session, or you will be automatically signed out.
          </p>
        </div>
      </Modal>
    </div>
  );
}