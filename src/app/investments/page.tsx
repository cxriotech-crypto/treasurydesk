import AppLayout from '@/components/AppLayout';
import InvestmentsClient from './components/InvestmentsClient';

export default function InvestmentsPage() {
  return (
    <AppLayout allowedRoles={['TREASURY_OFFICER', 'HEAD_TREASURY', 'MIS', 'MANAGING_DIRECTOR', 'SYSTEM_ADMIN']}>
      <InvestmentsClient />
    </AppLayout>
  );
}
