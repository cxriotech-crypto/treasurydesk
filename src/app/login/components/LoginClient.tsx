'use client';
import React, { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { userService } from '@/services/userService';
import type { AppUser } from '@/types';

import { Building2, Eye, EyeOff, Copy, Check, Loader2, ShieldCheck, AlertCircle } from 'lucide-react';
import { toast } from 'sonner';
import { useRouter } from 'next/navigation';
import OtpStep from './OtpStep';

const loginSchema = z.object({
  email: z.string().email('Enter a valid email address'),
  password: z.string().min(1, 'Password is required'),
});
type LoginForm = z.infer<typeof loginSchema>;

const DEMO_USERS = [
  { name: 'Adaeze Okonkwo', role: 'Treasury Officer', email: 'adaeze.okonkwo@firstmarina.ng' },
  { name: 'Tunde Bakare', role: 'Account Officer', email: 'tunde.bakare@firstmarina.ng' },
  { name: 'Ibrahim Musa', role: 'Head Treasury', email: 'ibrahim.musa@firstmarina.ng' },
  { name: 'Chiamaka Eze', role: 'MIS', email: 'chiamaka.eze@firstmarina.ng' },
  { name: 'Olumide Adeyemi', role: 'Internal Audit', email: 'olumide.adeyemi@firstmarina.ng' },
  { name: 'Mrs. Folake Adebayo', role: 'Managing Director', email: 'folake.adebayo@firstmarina.ng' },
  { name: 'Emeka Nwosu', role: 'Operations', email: 'emeka.nwosu@firstmarina.ng' },
  { name: 'Kelechi Obi', role: 'System Admin', email: 'kelechi.obi@firstmarina.ng' },
];

export default function LoginClient() {
  const [showPassword, setShowPassword] = useState(false);
  const [pendingUser, setPendingUser] = useState<AppUser | null>(null);
  const [copiedEmail, setCopiedEmail] = useState<string | null>(null);
  const router = useRouter();

  const { register, handleSubmit, setValue, formState: { errors, isSubmitting } } = useForm<LoginForm>({
    resolver: zodResolver(loginSchema),
  });

  async function onSubmit(data: LoginForm) {
    try {
      const user = await userService.login(data.email, data.password);
      setPendingUser(user);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Login failed.';
      toast.error(msg.includes('No active') ? 'Invalid credentials — use the demo accounts below to sign in' : msg);
    }
  }

  function handleUseCredential(email: string) {
    setValue('email', email);
    setValue('password', 'Demo@2026!');
  }

  async function handleCopy(email: string) {
    await navigator.clipboard.writeText(email).catch(() => {});
    setCopiedEmail(email);
    setTimeout(() => setCopiedEmail(null), 2000);
  }

  function handleOtpSuccess() {
    toast.success('Signed in successfully. Welcome to TreasuryDesk.');
    router.push('/');
  }

  if (pendingUser) {
    return (
      <OtpStep
        user={pendingUser}
        onSuccess={handleOtpSuccess}
        onBack={() => setPendingUser(null)}
      />
    );
  }

  return (
    <div className="min-h-screen flex bg-background">
      {/* Left Brand Panel */}
      <div className="hidden lg:flex lg:w-[420px] xl:w-[480px] bg-primary flex-col justify-between p-10 shrink-0">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-accent flex items-center justify-center">
            <Building2 size={20} className="text-white" />
          </div>
          <div>
            <p className="text-white font-bold text-base leading-none">TreasuryDesk</p>
            <p className="text-white/50 text-xs mt-0.5">First Marina Trust Finance Co. Ltd</p>
          </div>
        </div>

        <div>
          <h2 className="text-white text-3xl font-bold leading-tight mb-4">
            Treasury Operations<br />Workflow Platform
          </h2>
          <p className="text-white/60 text-sm leading-relaxed mb-8">
            End-to-end digitisation of your treasury SOP — from customer instruction capture through 5-level approval workflow to operations execution and investment confirmation.
          </p>

          {/* SOP Steps */}
          <div className="space-y-2.5">
            {[
              'Customer Instruction',
              'Mandate Verification',
              'Customer Callback',
              'CBS Verification (Eazybankz)',
              'Treasury Voucher',
              '5-Level Approval Workflow',
              'Operations Execution',
              'Treasury Confirmation',
            ].map((step, i) => (
              <div key={`sop-${i}`} className="flex items-center gap-3">
                <span className="w-5 h-5 rounded-full bg-accent/20 text-accent text-[10px] font-bold flex items-center justify-center shrink-0">
                  {i + 1}
                </span>
                <span className="text-white/70 text-xs">{step}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="flex items-center gap-2">
          <ShieldCheck size={14} className="text-accent" />
          <p className="text-white/40 text-xs">Secured • Audited • Role-based access control</p>
        </div>
      </div>

      {/* Right Form Panel */}
      <div className="flex-1 flex flex-col items-center justify-center px-6 py-10 overflow-y-auto">
        <div className="w-full max-w-md">
          {/* Mobile logo */}
          <div className="flex items-center gap-2 mb-8 lg:hidden">
            <div className="w-8 h-8 rounded-lg bg-primary flex items-center justify-center">
              <Building2 size={16} className="text-white" />
            </div>
            <span className="font-bold text-foreground">TreasuryDesk</span>
          </div>

          <h1 className="text-2xl font-bold text-foreground mb-1">Sign in</h1>
          <p className="text-sm text-muted-foreground mb-7">Access your treasury operations workspace</p>

          <form onSubmit={handleSubmit(onSubmit)} className="space-y-4" noValidate>
            <div>
              <label htmlFor="email" className="label-text">Email Address</label>
              <input
                id="email"
                type="email"
                autoComplete="email"
                placeholder="adaeze.okonkwo@firstmarina.ng"
                className={`input-field ${errors.email ? 'border-red-400 focus:ring-red-300' : ''}`}
                {...register('email')}
              />
              {errors.email && (
                <p className="text-red-600 text-xs mt-1 flex items-center gap-1">
                  <AlertCircle size={11} /> {errors.email.message}
                </p>
              )}
            </div>

            <div>
              <label htmlFor="password" className="label-text">Password</label>
              <div className="relative">
                <input
                  id="password"
                  type={showPassword ? 'text' : 'password'}
                  autoComplete="current-password"
                  placeholder="••••••••"
                  className={`input-field pr-10 ${errors.password ? 'border-red-400 focus:ring-red-300' : ''}`}
                  {...register('password')}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((v) => !v)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                >
                  {showPassword ? <EyeOff size={15} /> : <Eye size={15} />}
                </button>
              </div>
              {errors.password && (
                <p className="text-red-600 text-xs mt-1 flex items-center gap-1">
                  <AlertCircle size={11} /> {errors.password.message}
                </p>
              )}
            </div>

            <div className="flex items-center justify-between">
              <label className="flex items-center gap-2 cursor-pointer">
                <input type="checkbox" className="rounded border-border" />
                <span className="text-xs text-muted-foreground">Remember me</span>
              </label>
              <button type="button" className="text-xs text-accent hover:underline font-medium">
                Forgot password?
              </button>
            </div>

            <button
              type="submit"
              disabled={isSubmitting}
              className="btn-primary w-full py-2.5"
            >
              {isSubmitting ? (
                <><Loader2 size={14} className="animate-spin" /> Verifying…</>
              ) : (
                'Continue to 2FA'
              )}
            </button>
          </form>

          {/* Demo Credentials Table */}
          <div className="mt-8 border border-border rounded-xl overflow-hidden">
            <div className="bg-secondary px-4 py-2.5 border-b border-border">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                Demo Accounts — Any password works
              </p>
            </div>
            <div className="divide-y divide-border">
              {DEMO_USERS.map((u) => (
                <div key={`demo-${u.email}`} className="flex items-center justify-between px-4 py-2 hover:bg-muted/40 transition-colors">
                  <div className="min-w-0 flex-1">
                    <p className="text-xs font-semibold text-foreground truncate">{u.name}</p>
                    <p className="text-[10px] text-muted-foreground">{u.role} • {u.email}</p>
                  </div>
                  <div className="flex items-center gap-1 ml-2 shrink-0">
                    <button
                      type="button"
                      onClick={() => handleCopy(u.email)}
                      className="p-1 rounded text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
                      aria-label="Copy email"
                    >
                      {copiedEmail === u.email ? <Check size={12} className="text-green-600" /> : <Copy size={12} />}
                    </button>
                    <button
                      type="button"
                      onClick={() => handleUseCredential(u.email)}
                      className="text-[10px] text-accent font-semibold hover:underline px-1"
                    >
                      Use
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <p className="text-center text-[10px] text-muted-foreground mt-6">
            © 2026 First Marina Trust Finance Company Limited. All rights reserved.
          </p>
        </div>
      </div>
    </div>
  );
}