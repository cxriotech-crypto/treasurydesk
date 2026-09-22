'use client';
import React, { useState, useEffect, useRef } from 'react';
import { Bell, Moon, Sun, LogOut, ChevronDown, Search, UserCog, Clock } from 'lucide-react';

import { ROLE_LABELS } from '@/types';
import type { AppUser } from '@/types';
import { clearSession, switchRole } from '@/services/userService';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';

interface TopbarProps {
  collapsed: boolean;
  user: AppUser;
  allUsers: AppUser[];
  isDark: boolean;
  onToggleDark: () => void;
  notificationCount?: number;
}

export default function Topbar({ collapsed, user, allUsers, isDark, onToggleDark, notificationCount = 0 }: TopbarProps) {
  const [lagosTime, setLagosTime] = useState('');
  const [showUserMenu, setShowUserMenu] = useState(false);
  const [showNotifications, setShowNotifications] = useState(false);
  const userMenuRef = useRef<HTMLDivElement>(null);
  const router = useRouter();

  useEffect(() => {
    function updateTime() {
      const now = new Date();
      const lagosOffset = 60;
      const lagosMs = now.getTime() + (lagosOffset - now.getTimezoneOffset()) * 60000;
      const d = new Date(lagosMs);
      const pad = (n: number) => String(n).padStart(2, '0');
      const hh = pad(d.getHours());
      const mm = pad(d.getMinutes());
      const ss = pad(d.getSeconds());
      setLagosTime(`${hh}:${mm}:${ss} WAT`);
    }
    updateTime();
    const id = setInterval(updateTime, 1000);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (userMenuRef.current && !userMenuRef.current.contains(e.target as Node)) {
        setShowUserMenu(false);
      }
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  function handleRoleSwitch(targetUser: AppUser) {
    switchRole(targetUser.id);
    setShowUserMenu(false);
    toast.success(`Switched to ${targetUser.name} (${ROLE_LABELS[targetUser.role]})`);
    router.refresh();
    window.location.reload();
  }

  function handleLogout() {
    clearSession();
    router.push('/login');
  }

  const MOCK_NOTIFICATIONS = [
    { id: 'notif-001', text: 'TXN-2026-09-003 approved by MD — ready for execution', time: '10:45', type: 'success' },
    { id: 'notif-002', text: 'TXN-2026-09-006 rejected by Head Treasury', time: '09:05', type: 'danger' },
    { id: 'notif-003', text: 'TXN-2026-09-004 awaiting your callback confirmation', time: '10:05', type: 'warning' },
    { id: 'notif-004', text: 'TXN-2026-09-001 forwarded to Head Treasury for approval', time: '09:15', type: 'info' },
  ];

  const sidebarWidth = collapsed ? 64 : 240;

  return(
    <header
      className="fixed top-0 right-0 h-[60px] bg-card border-b border-border z-20 flex items-center justify-between px-4 gap-4 transition-all duration-300"
      style={{ left: `${sidebarWidth}px` }}
    >
      {/* Left: Search */}
      <div className="flex items-center gap-2 flex-1 max-w-md">
        <div className="relative flex-1">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <input
            type="text"
            placeholder="Search customer, CIF, ref, voucher…"
            className="input-field pl-8 py-1.5 text-xs"
          />
        </div>
      </div>

      {/* Right: Clock, Theme, Notifications, User */}
      <div className="flex items-center gap-1">
        {/* Lagos Clock */}
        <div className="hidden md:flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-muted text-xs font-mono text-muted-foreground">
          <Clock size={12} />
          <span>{lagosTime}</span>
        </div>

        {/* Theme Toggle */}
        <button
          onClick={onToggleDark}
          className="p-2 rounded-lg text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
          aria-label="Toggle theme"
        >
          {isDark ? <Sun size={16} /> : <Moon size={16} />}
        </button>

        {/* Notifications */}
        <div className="relative">
          <button
            onClick={() => { setShowNotifications((v) => !v); setShowUserMenu(false); }}
            className="p-2 rounded-lg text-muted-foreground hover:bg-muted hover:text-foreground transition-colors relative"
            aria-label="Notifications"
          >
            <Bell size={16} />
            {notificationCount > 0 && (
              <span className="absolute top-1 right-1 w-4 h-4 rounded-full bg-red-500 text-white text-[9px] font-bold flex items-center justify-center">
                {notificationCount > 9 ? '9+' : notificationCount}
              </span>
            )}
          </button>
          {showNotifications && (
            <div className="absolute right-0 top-10 w-80 bg-card border border-border rounded-xl shadow-2xl z-50 overflow-hidden slide-up">
              <div className="px-4 py-3 border-b border-border flex items-center justify-between">
                <p className="text-sm font-semibold text-foreground">Notifications</p>
                <span className="text-xs text-muted-foreground">{MOCK_NOTIFICATIONS.length} new</span>
              </div>
              <div className="max-h-72 overflow-y-auto scrollbar-thin">
                {MOCK_NOTIFICATIONS.map((n) => (
                  <div key={n.id} className="px-4 py-3 border-b border-border hover:bg-muted/50 cursor-pointer transition-colors">
                    <div className="flex items-start gap-2">
                      <div className={`w-2 h-2 rounded-full mt-1.5 shrink-0
                        ${n.type === 'success' ? 'bg-green-500' : n.type === 'danger' ? 'bg-red-500' : n.type === 'warning' ? 'bg-amber-500' : 'bg-blue-500'}`}
                      />
                      <div className="flex-1 min-w-0">
                        <p className="text-xs text-foreground leading-snug">{n.text}</p>
                        <p className="text-[10px] text-muted-foreground mt-0.5">{n.time} WAT today</p>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
              <div className="px-4 py-2.5">
                <button
                  onClick={() => setShowNotifications(false)}
                  className="text-xs text-accent font-medium hover:underline"
                >
                  Mark all as read
                </button>
              </div>
            </div>
          )}
        </div>

        {/* User Menu */}
        <div className="relative" ref={userMenuRef}>
          <button
            onClick={() => { setShowUserMenu((v) => !v); setShowNotifications(false); }}
            className="flex items-center gap-2 px-2 py-1.5 rounded-lg hover:bg-muted transition-colors"
          >
            <div className="w-7 h-7 rounded-full bg-primary text-primary-foreground text-xs font-bold flex items-center justify-center shrink-0">
              {user.avatarInitials}
            </div>
            <div className="hidden md:block text-left">
              <p className="text-xs font-semibold text-foreground leading-none">{user.name.split(' ')[0]}</p>
              <p className="text-[10px] text-muted-foreground leading-none mt-0.5">{ROLE_LABELS[user.role]}</p>
            </div>
            <ChevronDown size={12} className="text-muted-foreground hidden md:block" />
          </button>

          {showUserMenu && (
            <div className="absolute right-0 top-11 w-72 bg-card border border-border rounded-xl shadow-2xl z-50 overflow-hidden slide-up">
              {/* Current user */}
              <div className="px-4 py-3 border-b border-border bg-secondary/50">
                <p className="text-xs font-semibold text-foreground">{user.name}</p>
                <p className="text-[10px] text-muted-foreground">{user.email}</p>
                <span className="inline-flex mt-1 px-2 py-0.5 rounded-full bg-accent/10 text-accent text-[10px] font-semibold">
                  {ROLE_LABELS[user.role]}
                </span>
              </div>

              {/* Role Switcher */}
              <div className="px-4 py-2 border-b border-border">
                <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide mb-2 flex items-center gap-1">
                  <UserCog size={10} /> Demo — Switch Role
                </p>
                <div className="space-y-0.5">
                  {allUsers.map((u) => (
                    <button
                      key={`role-switch-${u.id}`}
                      onClick={() => handleRoleSwitch(u)}
                      className={`w-full flex items-center gap-2 px-2 py-1.5 rounded-lg text-xs transition-colors text-left
                        ${u.id === user.id ? 'bg-accent/10 text-accent font-semibold' : 'text-foreground hover:bg-muted'}`}
                    >
                      <div className="w-5 h-5 rounded-full bg-primary/10 text-primary text-[9px] font-bold flex items-center justify-center shrink-0">
                        {u.avatarInitials}
                      </div>
                      <div className="min-w-0">
                        <span className="font-medium truncate block">{u.name}</span>
                        <span className="text-muted-foreground text-[10px]">{ROLE_LABELS[u.role]}</span>
                      </div>
                    </button>
                  ))}
                </div>
              </div>

              {/* Logout */}
              <div className="px-4 py-2">
                <button
                  onClick={handleLogout}
                  className="w-full flex items-center gap-2 px-2 py-1.5 rounded-lg text-xs text-red-600 hover:bg-red-50 transition-colors"
                >
                  <LogOut size={13} />
                  Sign out
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}