'use client';

import { useState } from 'react';
import { PhoneCall } from 'lucide-react';
import type { CallbackLog, Customer } from '@/domain/types';
import { CALLBACK_OUTCOME_LABELS, type CallbackOutcome } from '@/domain/codes';
import { isoDatePart, isoTimePart, nowIso } from '@/lib/dates';
import { formatDateTime } from '@/lib/format';
import { AppError, callbacksService } from '@/services';
import { useCurrentUser } from '@/services/useData';
import type { NamedCallback } from '@/services/transactionsService';
import {
  Badge,
  Button,
  DateInput,
  Field,
  InlineAlert,
  Input,
  RadioGroup,
  Segmented,
  Textarea,
  TimeInput,
  toast,
} from '@/components/ui';

type YN = 'Y' | 'N' | '';
const CHECKS = [
  ['amountOk', 'Amount'],
  ['instrOk', 'Instruction'],
  ['benefOk', 'Beneficiary'],
  ['purposeOk', 'Purpose'],
] as const;

export function CallbackHistory({ logs }: { logs: NamedCallback[] }) {
  if (!logs.length) return <p className="text-[13px] text-muted">No calls logged yet.</p>;
  return (
    <ul className="divide-y divide-border rounded-md border border-border">
      {logs.map((l) => (
        <li key={l.id} className="px-3 py-2 text-[13px]">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="font-medium">
              {l.officerName} called {l.phoneCalled}
            </span>
            <Badge
              tone={
                l.outcome === 'CONFIRMED'
                  ? 'success'
                  : l.outcome === 'DISPUTED'
                    ? 'danger'
                    : 'warning'
              }
            >
              {CALLBACK_OUTCOME_LABELS[l.outcome]}
            </Badge>
          </div>
          <p className="num text-xs text-muted">
            {formatDateTime(`${l.callDate}T${l.callTime}:00+01:00`)}
          </p>
          {l.notes ? <p className="mt-0.5 text-muted">{l.notes}</p> : null}
        </li>
      ))}
    </ul>
  );
}

/** Customer call-back (SOP step 3): confirms amount, instruction, beneficiary and purpose. */
export function CallbackForm({
  txnId,
  customer,
  onSaved,
}: {
  txnId: string;
  customer: Customer;
  onSaved?: (log: CallbackLog) => void;
}) {
  const me = useCurrentUser();
  const now = nowIso();
  const [phone, setPhone] = useState(customer.regPhone);
  const [date, setDate] = useState(isoDatePart(now));
  const [time, setTime] = useState(isoTimePart(now));
  // SOP step 3: the call is made by the customer's own Account Officer, so the officer is fixed.
  const officerId = me?.id ?? customer.accountOfficerId;
  const [checks, setChecks] = useState<Record<(typeof CHECKS)[number][0], YN>>({
    amountOk: '',
    instrOk: '',
    benefOk: '',
    purposeOk: '',
  });
  const [outcome, setOutcome] = useState<CallbackOutcome | ''>('');
  const [notes, setNotes] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);

  const allYes = CHECKS.every(([k]) => checks[k] === 'Y');

  const submit = async () => {
    const e: Record<string, string> = {};
    if (CHECKS.some(([k]) => !checks[k])) e.checks = 'Mark each item as Confirmed or Not confirmed';
    if (!outcome) e.outcome = 'Choose the outcome of the call';
    if (outcome === 'CONFIRMED' && !allYes)
      e.outcome = 'Outcome can only be Confirmed when all four items are confirmed';
    if (Object.keys(e).length) {
      setErrors(e);
      return;
    }
    setBusy(true);
    setErrors({});
    try {
      const log = await callbacksService.log(txnId, {
        phoneCalled: phone,
        callDate: date,
        callTime: time,
        officerId,
        amountOk: checks.amountOk === 'Y',
        instrOk: checks.instrOk === 'Y',
        benefOk: checks.benefOk === 'Y',
        purposeOk: checks.purposeOk === 'Y',
        outcome: outcome as CallbackOutcome,
        notes,
      });
      if (log.outcome === 'CONFIRMED')
        toast.success('Call-back confirmed', `${customer.customerName} confirmed the instruction.`);
      else
        toast.warning(
          'Call-back logged',
          'The transaction stays in verification until the customer confirms.'
        );
      setChecks({ amountOk: '', instrOk: '', benefOk: '', purposeOk: '' });
      setOutcome('');
      setNotes('');
      onSaved?.(log);
    } catch (err) {
      setErrors(
        err instanceof AppError && Object.keys(err.fieldErrors).length
          ? err.fieldErrors
          : { form: (err as Error).message }
      );
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Field
          label="Registered phone"
          hint="Call only the number on file"
          error={errors.phoneCalled}
          required
        >
          <Input value={phone} onChange={(e) => setPhone(e.target.value)} inputMode="tel" />
        </Field>
        <Field label="Officer" hint="The Account Officer who made the call">
          <Input value={me?.fullName ?? ''} readOnly />
        </Field>
        <Field label="Date" error={errors.callDate} required>
          <DateInput value={date} onChange={(e) => setDate(e.target.value)} />
        </Field>
        <Field label="Time" error={errors.callTime} required>
          <TimeInput value={time} onChange={(e) => setTime(e.target.value)} />
        </Field>
      </div>
      <div className="rounded-md border border-border">
        {CHECKS.map(([k, label]) => (
          <div
            key={k}
            className="flex flex-wrap items-center justify-between gap-2 border-b border-border px-3 py-2 last:border-0"
          >
            <span className="text-sm">{label} confirmed by the customer</span>
            <Segmented<'Y' | 'N'>
              label={`${label} confirmed`}
              value={checks[k]}
              onChange={(v) => setChecks((c) => ({ ...c, [k]: v }))}
              options={[
                { value: 'Y', label: 'Confirmed' },
                { value: 'N', label: 'Not confirmed' },
              ]}
            />
          </div>
        ))}
      </div>
      {errors.checks ? (
        <p className="text-xs font-medium text-st-danger-fg">{errors.checks}</p>
      ) : null}
      <RadioGroup<CallbackOutcome>
        name={`outcome-${txnId}`}
        label="Outcome"
        orientation="horizontal"
        value={outcome}
        onChange={setOutcome}
        options={(['CONFIRMED', 'UNREACHABLE', 'DISPUTED'] as CallbackOutcome[]).map((o) => ({
          value: o,
          label: CALLBACK_OUTCOME_LABELS[o],
          disabled: o === 'CONFIRMED' && !allYes,
        }))}
      />
      {errors.outcome ? (
        <p className="text-xs font-medium text-st-danger-fg">{errors.outcome}</p>
      ) : null}
      <Field
        label="Notes"
        hint={
          outcome && outcome !== 'CONFIRMED' ? 'Required: what happened on the call' : undefined
        }
        error={errors.notes}
      >
        <Textarea rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} />
      </Field>
      {errors.form ? <InlineAlert tone="danger">{errors.form}</InlineAlert> : null}
      <div className="flex justify-end">
        <Button variant="primary" icon={PhoneCall} loading={busy} onClick={submit}>
          Save call-back
        </Button>
      </div>
    </div>
  );
}
