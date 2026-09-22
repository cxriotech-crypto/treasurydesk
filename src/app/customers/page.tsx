import AppLayout from '@/components/AppLayout';
import CustomersClient from './components/CustomersClient';

export default function CustomersPage() {
  return (
    <AppLayout allowedRoles={['TREASURY_OFFICER', 'ACCOUNT_OFFICER', 'HEAD_TREASURY', 'SYSTEM_ADMIN']}>
      <CustomersClient />
    </AppLayout>
  );
}
