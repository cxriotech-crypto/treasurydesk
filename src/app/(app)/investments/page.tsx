import type { Metadata } from 'next';
import { Suspense } from 'react';
import { SkeletonRows } from '@/components/ui';
import { InvestmentsList } from './InvestmentsList';

export const metadata: Metadata = { title: 'Investments' };

export default function InvestmentsPage() {
  return (
    <Suspense fallback={<SkeletonRows rows={10} />}>
      <InvestmentsList />
    </Suspense>
  );
}
