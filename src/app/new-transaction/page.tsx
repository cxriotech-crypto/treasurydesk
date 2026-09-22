import { redirect } from 'next/navigation';

export default function OldNewTransactionPage() {
  redirect('/transactions/new');
}