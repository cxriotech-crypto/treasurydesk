import type { Metadata } from 'next';
import AppLayout from '@/components/AppLayout';
import CalcSelfCheckClient from './components/CalcSelfCheckClient';

export const metadata: Metadata = { title: 'Calculation Self-Check | TreasuryDesk' };

export default function CalcSelfCheckPage() {
  return (
    <AppLayout allowedRoles={['SYSTEM_ADMIN', 'INTERNAL_AUDIT']}>
      <CalcSelfCheckClient />
    </AppLayout>
  );
}
