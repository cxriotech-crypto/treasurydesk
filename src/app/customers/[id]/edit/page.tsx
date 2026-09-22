'use client';
import { useParams } from 'next/navigation';
import { EditCustomerPage } from '../../CustomerForm';

export default function EditCustomerRoute() {
  const params = useParams();
  const id = params?.id as string;
  return <EditCustomerPage customerId={id} />;
}
