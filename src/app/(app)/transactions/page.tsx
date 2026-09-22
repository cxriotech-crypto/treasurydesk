import type { Metadata } from 'next';
import { Suspense } from 'react';
import { SkeletonRows } from '@/components/ui';
import { TransactionsList } from './TransactionsList';

export const metadata: Metadata = { title: 'Transactions' };

export default function TransactionsPage() {
  return (
    <Suspense fallback={<SkeletonRows rows={10} />}>
      <TransactionsList />
    </Suspense>
  );
}
