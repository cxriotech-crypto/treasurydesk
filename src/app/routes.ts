/**
 * Route registry (brief section 11). Navigation, search results, notification links and the route guard
 * all read from here. A route is linked only when `ready` — later build phases flip their routes on,
 * so the app never shows a link to a page that does not exist yet.
 */
import {
  ArrowLeftRight,
  Bell,
  CalendarDays,
  ClipboardCheck,
  FileBarChart,
  LayoutDashboard,
  PhoneCall,
  PlayCircle,
  Plus,
  ScrollText,
  Settings,
  Users,
  Wallet,
  type LucideIcon,
} from 'lucide-react';
import { ROLE_CODES, type RoleCode } from '@/domain/codes';

export type NavGroup = 'Overview' | 'Work' | 'Registers' | 'Oversight';

export interface RouteDef {
  /** Pattern, e.g. /transactions/[id]. */
  path: string;
  label: string;
  roles: readonly RoleCode[];
  ready: boolean;
  icon?: LucideIcon;
  nav?: NavGroup;
  /** Outside the app shell (login, print). */
  bare?: boolean;
}

const ALL = ROLE_CODES;
const APPROVERS: RoleCode[] = ['HT', 'MIS', 'AUD', 'MD'];

export const ROUTES: RouteDef[] = [
  {
    path: '/dashboard',
    label: 'Dashboard',
    roles: ALL,
    ready: true,
    icon: LayoutDashboard,
    nav: 'Overview',
  },
  {
    path: '/calendar',
    label: 'Calendar',
    roles: ALL,
    ready: true,
    icon: CalendarDays,
    nav: 'Overview',
  },
  {
    path: '/notifications',
    label: 'Notifications',
    roles: ALL,
    ready: true,
    icon: Bell,
    nav: 'Overview',
  },
  {
    path: '/transactions',
    label: 'Transactions',
    roles: ALL,
    ready: true,
    icon: ArrowLeftRight,
    nav: 'Work',
  },
  {
    path: '/transactions/new',
    label: 'New transaction',
    roles: ['TO'],
    ready: true,
    icon: Plus,
    nav: 'Work',
  },
  { path: '/transactions/[id]', label: 'Transaction', roles: ALL, ready: true },
  {
    path: '/approvals',
    label: 'Approvals',
    roles: APPROVERS,
    ready: true,
    icon: ClipboardCheck,
    nav: 'Work',
  },
  {
    path: '/operations',
    label: 'Operations',
    roles: ['OPS'],
    ready: true,
    icon: PlayCircle,
    nav: 'Work',
  },
  {
    path: '/callbacks',
    label: 'Call-backs',
    roles: ALL,
    ready: true,
    icon: PhoneCall,
    nav: 'Work',
  },
  {
    path: '/investments',
    label: 'Investments',
    roles: ALL,
    ready: true,
    icon: Wallet,
    nav: 'Registers',
  },
  { path: '/investments/[id]', label: 'Investment', roles: ALL, ready: true },
  {
    path: '/customers',
    label: 'Customers',
    roles: ALL,
    ready: true,
    icon: Users,
    nav: 'Registers',
  },
  { path: '/customers/[id]', label: 'Customer', roles: ALL, ready: true },
  {
    path: '/reports',
    label: 'Reports',
    roles: ['HT', 'MIS', 'AUD', 'MD', 'ADM'],
    ready: true,
    icon: FileBarChart,
    nav: 'Oversight',
  },
  {
    path: '/audit',
    label: 'Audit trail',
    roles: ['AUD', 'MD', 'ADM'],
    ready: true,
    icon: ScrollText,
    nav: 'Oversight',
  },
  {
    path: '/settings',
    label: 'Settings',
    roles: ['ADM', 'HT', 'MIS', 'AUD', 'MD'],
    ready: true,
    icon: Settings,
    nav: 'Oversight',
  },
  {
    path: '/settings/self-check',
    label: 'Calculation self-check',
    roles: ['AUD', 'ADM'],
    ready: true,
  },
  { path: '/vouchers/[id]/print', label: 'Print voucher', roles: ALL, ready: true, bare: true },
  { path: '/forbidden', label: 'Not allowed', roles: ALL, ready: true },
  // Development-only component gallery (404 in production builds).
  {
    path: '/ui',
    label: 'Component gallery',
    roles: ALL,
    ready: process.env.NODE_ENV !== 'production',
  },
];

export const NAV_GROUPS: NavGroup[] = ['Overview', 'Work', 'Registers', 'Oversight'];

function toRegex(pattern: string): RegExp {
  return new RegExp(`^${pattern.replace(/\[[^\]]+\]/g, '[^/]+')}/?$`);
}

/** The registry entry for a concrete pathname (most specific match). */
export function matchRoute(pathname: string): RouteDef | undefined {
  const clean = pathname.split('?')[0].split('#')[0];
  return ROUTES.filter((r) => toRegex(r.path).test(clean)).sort(
    (a, b) => b.path.length - a.path.length
  )[0];
}

/** Can this role open this pathname? (Unknown paths fall through to not-found.) */
export function canAccess(pathname: string, role: RoleCode): boolean {
  const r = matchRoute(pathname);
  return !r || r.roles.includes(role);
}

/** Is there a built page for this href? Links to unbuilt pages are not rendered. */
export function isReady(href: string | null | undefined): boolean {
  if (!href) return false;
  const r = matchRoute(href);
  return !!r && r.ready;
}

export function navFor(role: RoleCode): { group: NavGroup; items: RouteDef[] }[] {
  return NAV_GROUPS.map((group) => ({
    group,
    items: ROUTES.filter((r) => r.nav === group && r.ready && r.roles.includes(role)),
  })).filter((g) => g.items.length > 0);
}
