import type { Metadata } from 'next';
import { Suspense } from 'react';
import { SkeletonRows } from '@/components/ui';
import { CustomersList } from './CustomersList';

export const metadata: Metadata = { title: 'Customers' };

export default function CustomersPage() {
  return (
    <Suspense fallback={<SkeletonRows rows={10} />}>
      <CustomersList />
    </Suspense>
  );
}
