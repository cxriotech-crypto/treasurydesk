'use client';

import { useEffect } from 'react';
import { RotateCw } from 'lucide-react';
import { Button, LinkButton } from '@/components/ui/Button';

/** Unexpected error boundary: friendly message with Retry. */
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);
  return (
    <main className="flex min-h-[60vh] flex-col items-center justify-center px-4 text-center">
      <h1 className="text-xl font-semibold">Something went wrong</h1>
      <p className="mt-2 max-w-md text-sm text-muted">
        {error.message || 'An unexpected error occurred.'}
      </p>
      <div className="mt-6 flex gap-2">
        <Button variant="primary" icon={RotateCw} onClick={reset}>
          Retry
        </Button>
        <LinkButton href="/dashboard">Go to dashboard</LinkButton>
      </div>
    </main>
  );
}
