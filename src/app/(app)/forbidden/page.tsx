'use client';

import { Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';
import { ROLE_LABELS } from '@/domain/codes';
import { matchRoute } from '@/app/routes';
import { useCurrentUser } from '@/services/useData';
import { LinkButton } from '@/components/ui';

function Forbidden() {
  const user = useCurrentUser();
  const from = useSearchParams().get('from');
  const route = from ? matchRoute(from) : undefined;
  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center text-center">
      <p className="num text-sm font-semibold text-muted">403</p>
      <h1 className="mt-1 text-xl font-semibold">You don’t have access to this page</h1>
      <p className="mt-2 max-w-md text-sm text-muted">
        {route ? <>“{route.label}” is not available</> : <>This page is not available</>}
        {user ? <> to the {ROLE_LABELS[user.roleCode]} role</> : null}. Use the role switcher in the
        user menu to sign in as another demo user.
      </p>
      <LinkButton href="/dashboard" variant="primary" icon={ArrowLeft} className="mt-6">
        Back to dashboard
      </LinkButton>
    </div>
  );
}

export default function ForbiddenPage() {
  return (
    <Suspense>
      <Forbidden />
    </Suspense>
  );
}
