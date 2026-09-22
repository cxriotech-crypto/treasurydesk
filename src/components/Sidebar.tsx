'use client';
import React from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  LayoutDashboard, Plus, List, CheckSquare, Zap,
  TrendingUp, Calendar, Users, Phone, BarChart2,
  ScrollText, Settings, ChevronLeft, ChevronRight, Building2, FlaskConical
} from 'lucide-react';
import type { UserRole } from '@/types';
import Icon from '@/components/ui/AppIcon';


interface NavItem {
  id: string;
  label: string;
  href: string;
  icon: React.ElementType;
  badge?: number;
  roles: UserRole[];
}

const NAV_ITEMS: NavItem[] = [
  { id: 'nav-dashboard', label: 'Dashboard', href: '/dashboard', icon: LayoutDashboard, roles: ['TREASURY_OFFICER', 'ACCOUNT_OFFICER', 'HEAD_TREASURY', 'MIS', 'INTERNAL_AUDIT', 'MANAGING_DIRECTOR', 'OPERATIONS', 'SYSTEM_ADMIN'] },
  { id: 'nav-new-txn', label: 'New Transaction', href: '/transactions/new', icon: Plus, roles: ['TREASURY_OFFICER'] },
  { id: 'nav-transactions', label: 'Transactions', href: '/transactions', icon: List, roles: ['TREASURY_OFFICER', 'ACCOUNT_OFFICER', 'HEAD_TREASURY', 'MIS', 'INTERNAL_AUDIT', 'MANAGING_DIRECTOR', 'OPERATIONS', 'SYSTEM_ADMIN'] },
  { id: 'nav-approvals', label: 'My Approvals', href: '/my-approvals', icon: CheckSquare, roles: ['TREASURY_OFFICER', 'HEAD_TREASURY', 'MIS', 'INTERNAL_AUDIT', 'MANAGING_DIRECTOR'] },
  { id: 'nav-ops', label: 'Operations Queue', href: '/operations-queue', icon: Zap, roles: ['OPERATIONS', 'SYSTEM_ADMIN', 'HEAD_TREASURY', 'MANAGING_DIRECTOR'] },
  { id: 'nav-investments', label: 'Investments', href: '/investments', icon: TrendingUp, roles: ['TREASURY_OFFICER', 'HEAD_TREASURY', 'MIS', 'MANAGING_DIRECTOR', 'SYSTEM_ADMIN'] },
  { id: 'nav-calendar', label: 'Calendar', href: '/calendar', icon: Calendar, roles: ['TREASURY_OFFICER', 'ACCOUNT_OFFICER', 'HEAD_TREASURY', 'MANAGING_DIRECTOR', 'SYSTEM_ADMIN'] },
  { id: 'nav-customers', label: 'Customers', href: '/customers', icon: Users, roles: ['TREASURY_OFFICER', 'ACCOUNT_OFFICER', 'HEAD_TREASURY', 'SYSTEM_ADMIN'] },
  { id: 'nav-callback', label: 'Call-back Log', href: '/callback-log', icon: Phone, roles: ['TREASURY_OFFICER', 'ACCOUNT_OFFICER', 'HEAD_TREASURY', 'SYSTEM_ADMIN'] },
  { id: 'nav-reports', label: 'Reports', href: '/reports', icon: BarChart2, roles: ['HEAD_TREASURY', 'MIS', 'INTERNAL_AUDIT', 'MANAGING_DIRECTOR', 'SYSTEM_ADMIN'] },
  { id: 'nav-audit', label: 'Audit Trail', href: '/audit-trail', icon: ScrollText, roles: ['INTERNAL_AUDIT', 'MANAGING_DIRECTOR', 'SYSTEM_ADMIN'] },
  { id: 'nav-settings', label: 'Settings', href: '/settings', icon: Settings, roles: ['SYSTEM_ADMIN'] },
  { id: 'nav-calc-check', label: 'Calc Self-Check', href: '/settings/calc-self-check', icon: FlaskConical, roles: ['SYSTEM_ADMIN', 'INTERNAL_AUDIT'] },
];

interface SidebarProps {
  collapsed: boolean;
  onToggle: () => void;
  userRole: UserRole;
  pendingApprovalsCount?: number;
  pendingOpsCount?: number;
}

export default function Sidebar({ collapsed, onToggle, userRole, pendingApprovalsCount = 0, pendingOpsCount = 0 }: SidebarProps) {
  const pathname = usePathname();

  const visibleItems = NAV_ITEMS.filter((item) => item.roles.includes(userRole)).map((item) => {
    if (item.id === 'nav-approvals') return { ...item, badge: pendingApprovalsCount };
    if (item.id === 'nav-ops') return { ...item, badge: pendingOpsCount };
    return item;
  });

  const isActive = (href: string) => {
    if (href === '/') return pathname === '/';
    return pathname.startsWith(href);
  };

  return (
    <aside
      className={`fixed left-0 top-0 h-screen bg-primary flex flex-col z-30 sidebar-transition
        ${collapsed ? 'w-16' : 'w-[240px]'}`}
    >
      {/* Logo */}
      <div className={`flex items-center h-[60px] border-b border-white/10 px-3 shrink-0 ${collapsed ? 'justify-center' : 'gap-2.5'}`}>
        <div className="w-8 h-8 rounded-lg bg-accent flex items-center justify-center shrink-0">
          <Building2 size={16} className="text-white" />
        </div>
        {!collapsed && (
          <div className="overflow-hidden">
            <p className="text-white font-bold text-sm leading-none">TreasuryDesk</p>
            <p className="text-white/50 text-[10px] mt-0.5 leading-none truncate">First Marina Trust</p>
          </div>
        )}
      </div>

      {/* Nav */}
      <nav className="flex-1 overflow-y-auto scrollbar-thin py-3 px-2 space-y-0.5">
        {visibleItems.map((item) => {
          const Icon = item.icon;
          const active = isActive(item.href);
          return (
            <Link
              key={item.id}
              href={item.href}
              title={collapsed ? item.label : undefined}
              className={`flex items-center gap-2.5 px-2.5 py-2 rounded-lg text-sm font-medium transition-all duration-150 relative
                ${active
                  ? 'bg-accent text-white' :'text-white/60 hover:bg-white/10 hover:text-white'}`}
            >
              <Icon size={17} className="shrink-0" />
              {!collapsed && <span className="truncate">{item.label}</span>}
              {item.badge && item.badge > 0 && (
                <span className={`${collapsed ? 'absolute -top-0.5 -right-0.5' : 'ml-auto'} min-w-[18px] h-[18px] rounded-full bg-amber-400 text-primary text-[10px] font-bold flex items-center justify-center px-1`}>
                  {item.badge > 99 ? '99+' : item.badge}
                </span>
              )}
            </Link>
          );
        })}
      </nav>

      {/* Collapse Toggle */}
      <div className="px-2 pb-3 shrink-0">
        <button
          onClick={onToggle}
          className="w-full flex items-center justify-center p-2 rounded-lg text-white/50 hover:bg-white/10 hover:text-white transition-colors"
          aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
        >
          {collapsed ? <ChevronRight size={16} /> : <ChevronLeft size={16} />}
          {!collapsed && <span className="ml-2 text-xs">Collapse</span>}
        </button>
      </div>
    </aside>
  );
}