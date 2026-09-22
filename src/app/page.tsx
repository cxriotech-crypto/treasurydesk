'use client';
import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { getSession } from '@/services/userService';

export default function HomePage() {
  const router = useRouter();
  useEffect(() => {
    const session = getSession();
    if (session) {
      router?.replace('/dashboard');
    } else {
      router?.replace('/login');
    }
  }, [router]);
  return null;
}