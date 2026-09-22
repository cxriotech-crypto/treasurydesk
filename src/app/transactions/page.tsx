import React, { Suspense } from 'react';
import TransactionsClient from './components/TransactionsClient';

export default function TransactionsPage() {
  return (
    <Suspense fallback={<div className="flex items-center justify-center h-64" />}>
      <TransactionsClient />
    </Suspense>
  );
}