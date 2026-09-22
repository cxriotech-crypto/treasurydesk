'use client';
import React, { useState, useEffect, useRef } from 'react';
import { userService } from '@/services/userService';
import type { AppUser } from '@/types';
import { ROLE_LABELS } from '@/types';
import { ShieldCheck, ArrowLeft, Loader2, AlertCircle, RefreshCw } from 'lucide-react';
import { toast } from 'sonner';

interface OtpStepProps {
  user: AppUser;
  onSuccess: () => void;
  onBack: () => void;
}

export default function OtpStep({ user, onSuccess, onBack }: OtpStepProps) {
  const [digits, setDigits] = useState(['', '', '', '', '', '']);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [resendSeconds, setResendSeconds] = useState(30);
  const inputRefs = useRef<(HTMLInputElement | null)[]>([]);

  useEffect(() => {
    inputRefs.current[0]?.focus();
  }, []);

  useEffect(() => {
    if (resendSeconds <= 0) return;
    const id = setInterval(() => setResendSeconds((v) => v - 1), 1000);
    return () => clearInterval(id);
  }, [resendSeconds]);

  function handleChange(i: number, val: string) {
    const cleaned = val.replace(/\D/g, '').slice(-1);
    const next = [...digits];
    next[i] = cleaned;
    setDigits(next);
    setError(null);
    if (cleaned && i < 5) {
      inputRefs.current[i + 1]?.focus();
    }
    if (next.every((d) => d !== '') && cleaned) {
      submitCode(next.join(''));
    }
  }

  function handleKeyDown(i: number, e: React.KeyboardEvent) {
    if (e.key === 'Backspace' && !digits[i] && i > 0) {
      inputRefs.current[i - 1]?.focus();
    }
  }

  function handlePaste(e: React.ClipboardEvent) {
    e.preventDefault();
    const pasted = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, 6);
    if (pasted.length === 6) {
      const next = pasted.split('');
      setDigits(next);
      submitCode(pasted);
    }
  }

  async function submitCode(code: string) {
    setLoading(true);
    setError(null);
    try {
      await userService.verifyOtp(user.id, code);
      onSuccess();
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Invalid OTP code.';
      setError(msg);
      setDigits(['', '', '', '', '', '']);
      inputRefs.current[0]?.focus();
      toast.error(msg);
    } finally {
      setLoading(false);
    }
  }

  function handleResend() {
    setResendSeconds(30);
    setDigits(['', '', '', '', '', '']);
    setError(null);
    inputRefs.current[0]?.focus();
    toast.info('A new OTP has been sent. Use code 123456 for the demo.');
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-background px-4">
      <div className="w-full max-w-sm">
        <div className="card p-8 text-center">
          <div className="w-14 h-14 rounded-full bg-primary flex items-center justify-center mx-auto mb-5">
            <ShieldCheck size={24} className="text-white" />
          </div>

          <h1 className="text-xl font-bold text-foreground mb-1">Two-Factor Authentication</h1>
          <p className="text-xs text-muted-foreground mb-1">
            Enter the 6-digit code sent to
          </p>
          <p className="text-sm font-semibold text-foreground mb-1">{user.email}</p>
          <p className="text-xs text-muted-foreground mb-6">
            Signed in as: <span className="text-foreground font-medium">{user.name}</span> · <span className="text-accent">{ROLE_LABELS[user.role]}</span>
          </p>

          {/* OTP Input */}
          <div className="flex gap-2 justify-center mb-4" onPaste={handlePaste}>
            {digits.map((d, i) => (
              <input
                key={`otp-${i}`}
                ref={(el) => { inputRefs.current[i] = el; }}
                type="text"
                inputMode="numeric"
                maxLength={1}
                value={d}
                onChange={(e) => handleChange(i, e.target.value)}
                onKeyDown={(e) => handleKeyDown(i, e)}
                disabled={loading}
                className={`w-11 h-12 text-center text-xl font-bold rounded-xl border-2 bg-input text-foreground
                  focus:outline-none focus:border-accent transition-all
                  ${error ? 'border-red-400' : d ? 'border-accent' : 'border-border'}
                  disabled:opacity-50`}
                aria-label={`OTP digit ${i + 1}`}
              />
            ))}
          </div>

          {error && (
            <p className="text-red-600 text-xs mb-3 flex items-center justify-center gap-1">
              <AlertCircle size={11} /> {error}
            </p>
          )}

          {loading && (
            <div className="flex items-center justify-center gap-2 text-sm text-muted-foreground mb-3">
              <Loader2 size={14} className="animate-spin" />
              Verifying…
            </div>
          )}

          {/* Demo hint */}
          <div className="bg-accent/10 rounded-lg px-3 py-2 mb-4">
            <p className="text-xs text-accent font-semibold">Demo OTP: <span className="font-mono tracking-widest">1 2 3 4 5 6</span></p>
          </div>

          {/* Resend */}
          <div className="flex items-center justify-center gap-1.5 mb-5">
            {resendSeconds > 0 ? (
              <p className="text-xs text-muted-foreground">
                Resend code in <span className="font-semibold tabular-nums">{resendSeconds}s</span>
              </p>
            ) : (
              <button onClick={handleResend} className="text-xs text-accent font-semibold flex items-center gap-1 hover:underline">
                <RefreshCw size={11} /> Resend OTP
              </button>
            )}
          </div>

          <button onClick={onBack} className="btn-ghost w-full text-sm">
            <ArrowLeft size={14} /> Back to Login
          </button>
        </div>
      </div>
    </div>
  );
}