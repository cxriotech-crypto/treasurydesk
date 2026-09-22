import AppLayout from '@/components/AppLayout';
import CustomerDetailClient from './components/CustomerDetailClient';

export default function CustomerDetailPage() {
  return (
    <AppLayout allowedRoles={['TREASURY_OFFICER', 'ACCOUNT_OFFICER', 'HEAD_TREASURY', 'SYSTEM_ADMIN']}>
      <CustomerDetailClient />
    </AppLayout>
  );
}
