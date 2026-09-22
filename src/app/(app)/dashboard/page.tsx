import type { Metadata } from 'next';
import { RoleHome } from './RoleHome';

export const metadata: Metadata = { title: 'Dashboard' };

export default function DashboardPage() {
  return <RoleHome />;
}
