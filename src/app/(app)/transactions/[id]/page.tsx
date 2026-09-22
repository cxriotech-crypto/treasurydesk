'use client';

import { useParams } from 'next/navigation';
import { TxnDetailView } from './TxnDetailView';

export default function TransactionPage() {
  const { id } = useParams<{ id: string }>();
  return <TxnDetailView id={id} />;
}
