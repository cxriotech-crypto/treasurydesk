'use client';

import { useEffect, useState, type ReactNode } from 'react';
import { PenLine } from 'lucide-react';
import { authService } from '@/services';
import { DEMO_PIN } from '@/domain/rules';
import { Button } from './Button';
import { Field, Input, Textarea } from './Field';
import { Modal } from './Overlay';

/** Confirmation dialog (replaces window.confirm). Optional required reason text. */
export function ConfirmDialog({
  open,
  onClose,
  onConfirm,
  title,
  description,
  confirmLabel = 'Confirm',
  tone = 'primary',
  reason,
  children,
}: {
  open: boolean;
  onClose: () => void;
  /** Receives the reason when `reason` is set. Throw to keep the dialog open (error shown). */
  onConfirm: (reason: string) => Promise<void> | void;
  title: string;
  description?: ReactNode;
  confirmLabel?: string;
  tone?: 'primary' | 'danger';
  reason?: { label: string; placeholder?: string; required?: boolean };
  children?: ReactNode;
}) {
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    if (open) {
      setText('');
      setError(null);
    }
  }, [open]);
  const submit = async () => {
    if (reason?.required !== false && reason && !text.trim()) {
      setError(`${reason.label} is required`);
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await onConfirm(text.trim());
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Something went wrong');
    } finally {
      setBusy(false);
    }
  };
  return (
    <Modal
      open={open}
      onClose={onClose}
      dismissible={!busy}
      size="sm"
      title={title}
      description={description}
      footer={
        <>
          <Button onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button variant={tone} onClick={submit} loading={busy}>
            {confirmLabel}
          </Button>
        </>
      }
    >
      {children}
      {reason ? (
        <Field label={reason.label} required={reason.required !== false} error={error}>
          <Textarea
            data-autofocus
            value={text}
            placeholder={reason.placeholder}
            onChange={(e) => setText(e.target.value)}
          />
        </Field>
      ) : error ? (
        <p role="alert" className="text-sm text-st-danger-fg">
          {error}
        </p>
      ) : null}
    </Modal>
  );
}

/**
 * Signature: the signed-in user types their full name and PIN.
 * `onSign` receives the typed values and performs the action (approve, submit, bulk approve…).
 */
export function SignatureModal({
  open,
  onClose,
  onSign,
  title = 'Sign',
  description,
  actionLabel = 'Sign',
  summary,
  withComment,
}: {
  open: boolean;
  onClose: () => void;
  onSign: (s: { signatureName: string; pin: string; comments: string }) => Promise<void>;
  title?: string;
  description?: ReactNode;
  actionLabel?: string;
  summary?: ReactNode;
  withComment?: boolean;
}) {
  const [name, setName] = useState('');
  const [pin, setPin] = useState('');
  const [comments, setComments] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<{ name?: string; pin?: string; form?: string }>({});
  useEffect(() => {
    if (open) {
      setName('');
      setPin('');
      setComments('');
      setErr({});
    }
  }, [open]);
  const user = authService.current();

  const submit = async () => {
    setBusy(true);
    setErr({});
    try {
      const check = await authService.checkSignature(name, pin);
      if (!check.ok) {
        setErr(
          check.error?.toLowerCase().includes('pin')
            ? { pin: check.error }
            : { name: check.error ?? 'Signature failed' }
        );
        return;
      }
      await onSign({ signatureName: name, pin, comments });
      onClose();
    } catch (e) {
      setErr({ form: e instanceof Error ? e.message : 'Something went wrong' });
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      dismissible={!busy}
      size="sm"
      title={title}
      description={description}
      footer={
        <>
          <Button onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button variant="primary" icon={PenLine} onClick={submit} loading={busy}>
            {actionLabel}
          </Button>
        </>
      }
    >
      <form
        className="space-y-3"
        onSubmit={(e) => {
          e.preventDefault();
          void submit();
        }}
      >
        {summary}
        <Field
          label="Full name"
          hint={user ? `Type “${user.fullName}”` : undefined}
          error={err.name}
          required
        >
          <Input
            data-autofocus
            autoComplete="off"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
        </Field>
        <Field label="PIN" hint={`Demo PIN is ${DEMO_PIN}`} error={err.pin} required>
          <Input
            type="password"
            inputMode="numeric"
            autoComplete="off"
            maxLength={8}
            value={pin}
            onChange={(e) => setPin(e.target.value)}
          />
        </Field>
        {withComment ? (
          <Field label="Comment (optional)">
            <Textarea rows={2} value={comments} onChange={(e) => setComments(e.target.value)} />
          </Field>
        ) : null}
        {err.form ? (
          <p role="alert" className="text-sm font-medium text-st-danger-fg">
            {err.form}
          </p>
        ) : null}
        <button type="submit" className="hidden" aria-hidden tabIndex={-1} />
      </form>
    </Modal>
  );
}
