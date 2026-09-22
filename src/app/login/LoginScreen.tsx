'use client';

import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { ArrowLeft, ChevronRight, KeyRound, LogIn } from 'lucide-react';
import type { AppUser } from '@/domain/types';
import { ROLE_CODES, ROLE_LABELS } from '@/domain/codes';
import { DEMO_OTP } from '@/domain/rules';
import { AppError, authService } from '@/services';
import { useData } from '@/services/useData';
import { Brand } from '@/components/shell/Brand';
import { Button, Card, Field, Icon, InlineAlert, Input, SkeletonRows } from '@/components/ui';

function safeNext(v: string | null): string {
  return v && v.startsWith('/') && !v.startsWith('//') && !v.startsWith('/login')
    ? v
    : '/dashboard';
}

export function LoginScreen() {
  const router = useRouter();
  const params = useSearchParams();
  const next = safeNext(params.get('next'));
  const reason = params.get('reason');

  const [step, setStep] = useState<'credentials' | 'otp'>('credentials');
  const [pendingUser, setPendingUser] = useState<{ fullName: string; email: string } | null>(null);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [code, setCode] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState<string | null>(null);

  // Already signed in, or waiting at the 2FA step.
  useEffect(() => {
    if (authService.current()) {
      router.replace(next);
      return;
    }
    const p = authService.pending();
    if (p) {
      setPendingUser({ fullName: p.fullName, email: p.email });
      setStep('otp');
    }
  }, [router, next]);

  const users = useData(() => authService.demoUsers(), []);
  const ordered = useMemo(
    () =>
      [...(users.data ?? [])].sort(
        (a, b) =>
          ROLE_CODES.indexOf(a.roleCode) - ROLE_CODES.indexOf(b.roleCode) ||
          a.fullName.localeCompare(b.fullName)
      ),
    [users.data]
  );

  const signIn = async (e: string, p: string, key: string) => {
    setBusy(key);
    setErrors({});
    try {
      const r = await authService.login(e, p);
      setPendingUser({ fullName: r.fullName, email: r.email });
      setCode('');
      setStep('otp');
    } catch (err) {
      setErrors(
        err instanceof AppError && Object.keys(err.fieldErrors).length
          ? err.fieldErrors
          : { form: (err as Error).message }
      );
    } finally {
      setBusy(null);
    }
  };

  const submitCredentials = (ev: FormEvent) => {
    ev.preventDefault();
    void signIn(email, password, 'form');
  };

  const quickPick = (u: AppUser) => {
    setEmail(u.email);
    setPassword('demo');
    void signIn(u.email, 'demo', u.id);
  };

  const submitOtp = async (ev: FormEvent) => {
    ev.preventDefault();
    setBusy('otp');
    setErrors({});
    try {
      await authService.verifyOtp(code);
      router.replace(next);
    } catch (err) {
      setErrors(
        err instanceof AppError && Object.keys(err.fieldErrors).length
          ? err.fieldErrors
          : { form: (err as Error).message }
      );
      setBusy(null);
    }
  };

  const back = async () => {
    await authService.logout();
    setStep('credentials');
    setCode('');
    setErrors({});
  };

  return (
    <main className="min-h-screen px-4 py-8 md:py-16">
      <div className="mx-auto w-full max-w-4xl">
        <Brand className="mb-8" />
        {reason === 'idle' ? (
          <div className="mb-4">
            <InlineAlert tone="warning" title="You were signed out">
              For security you are signed out after 17 minutes without activity. Sign in again to
              continue.
            </InlineAlert>
          </div>
        ) : null}

        <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
          <Card className="p-5 md:p-6">
            {step === 'credentials' ? (
              <form onSubmit={submitCredentials} noValidate className="space-y-4">
                <div>
                  <h1 className="text-xl font-semibold tracking-tight">Sign in</h1>
                  <p className="mt-1 text-sm text-muted">Use your staff email and password.</p>
                </div>
                <Field label="Email" error={errors.email} required>
                  <Input
                    type="email"
                    autoComplete="username"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="name@fmtfinance.com"
                  />
                </Field>
                <Field
                  label="Password"
                  error={errors.password}
                  hint="Any password works in the demo."
                  required
                >
                  <Input
                    type="password"
                    autoComplete="current-password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                  />
                </Field>
                {errors.form ? <InlineAlert tone="danger">{errors.form}</InlineAlert> : null}
                <Button
                  type="submit"
                  variant="primary"
                  icon={LogIn}
                  loading={busy === 'form'}
                  className="w-full"
                >
                  Continue
                </Button>
              </form>
            ) : (
              <form onSubmit={submitOtp} noValidate className="space-y-4">
                <div>
                  <h1 className="text-xl font-semibold tracking-tight">Two-factor verification</h1>
                  <p className="mt-1 text-sm text-muted">
                    Enter the 6-digit code sent to{' '}
                    {pendingUser ? (
                      <span className="font-medium text-fg">{pendingUser.email}</span>
                    ) : (
                      'your phone'
                    )}
                    .
                  </p>
                </div>
                <Field
                  label="Verification code"
                  error={errors.code}
                  hint={`Use ${DEMO_OTP} in the demo.`}
                  required
                >
                  <Input
                    data-autofocus
                    autoFocus
                    inputMode="numeric"
                    autoComplete="one-time-code"
                    maxLength={6}
                    value={code}
                    onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                    className="num text-center text-lg tracking-[0.5em]"
                    aria-label="6-digit code"
                  />
                </Field>
                {errors.form ? <InlineAlert tone="danger">{errors.form}</InlineAlert> : null}
                <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-between">
                  <Button icon={ArrowLeft} onClick={back} disabled={busy === 'otp'}>
                    Back
                  </Button>
                  <Button
                    type="submit"
                    variant="primary"
                    icon={KeyRound}
                    loading={busy === 'otp'}
                    disabled={code.length !== 6}
                  >
                    Verify and sign in
                  </Button>
                </div>
              </form>
            )}
          </Card>

          <Card>
            <div className="border-b border-border px-5 py-3">
              <h2 className="text-[15px] font-semibold">Demo users</h2>
              <p className="mt-0.5 text-[13px] text-muted">Pick a user to sign in as that role.</p>
            </div>
            {users.loading ? (
              <SkeletonRows rows={8} className="p-5" />
            ) : (
              <ul className="max-h-[420px] divide-y divide-border overflow-y-auto">
                {ordered.map((u) => (
                  <li key={u.id}>
                    <button
                      type="button"
                      disabled={!!busy || step === 'otp'}
                      onClick={() => quickPick(u)}
                      className="flex min-h-12 w-full items-center gap-3 px-5 py-2.5 text-left hover:bg-surface-2 disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-medium">{u.fullName}</span>
                        <span className="block truncate text-xs text-muted">{u.email}</span>
                      </span>
                      <span className="shrink-0 rounded bg-surface-2 px-1.5 py-0.5 text-xs font-medium text-muted">
                        {ROLE_LABELS[u.roleCode]}
                      </span>
                      <Icon icon={ChevronRight} className="shrink-0 text-subtle" />
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>
        <p className="mt-8 text-center text-xs text-muted">
          First Marina Trust Finance Company Limited · Demo environment with sample data
        </p>
      </div>
    </main>
  );
}
