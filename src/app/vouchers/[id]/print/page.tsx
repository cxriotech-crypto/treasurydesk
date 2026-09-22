import type { Metadata } from 'next';
import { Suspense } from 'react';
import { PrintVoucher } from './PrintVoucher';

export const metadata: Metadata = { title: 'Print voucher' };

export default function PrintPage() {
  return (
    <Suspense>
      <PrintVoucher />
    </Suspense>
  );
}
