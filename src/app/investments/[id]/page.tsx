import AppLayout from '@/components/AppLayout';
import InvestmentDetailClient from './components/InvestmentDetailClient';

export default function InvestmentDetailPage() {
  return (
    <AppLayout allowedRoles={['TREASURY_OFFICER', 'HEAD_TREASURY', 'MIS', 'MANAGING_DIRECTOR', 'SYSTEM_ADMIN']}>
      <InvestmentDetailClient />
    </AppLayout>
  );
}
