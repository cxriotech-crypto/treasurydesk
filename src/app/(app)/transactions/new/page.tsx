import type { Metadata } from 'next';
import { Suspense } from 'react';
import { SkeletonRows } from '@/components/ui';
import { Wizard } from './Wizard';

export const metadata: Metadata = { title: 'New transaction' };

export default function NewTransactionPage() {
  return (
    <Suspense fallback={<SkeletonRows rows={8} />}>
      <Wizard />
    </Suspense>
  );
}
