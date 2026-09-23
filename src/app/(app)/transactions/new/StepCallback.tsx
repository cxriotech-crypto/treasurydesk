'use client';

import { ArrowLeft, ArrowRight } from 'lucide-react';
import { Button, InlineAlert } from '@/components/ui';
import { CallbackForm, CallbackHistory } from '@/components/txn/CallbackForm';
import type { StepProps } from './Wizard';

export function StepCallback({ detail, goTo }: StepProps) {
  const confirmed = detail.controls.find((c) => c.controlCode === 'C03')?.state === 'PASSED';
  const last = detail.callbacks[0];
  // SOP step 3: only the customer's Account Officer may make and log this call.
  const mine = !detail.actions.logCallback;
  return (
    <div className="space-y-5">
      <p className="text-sm text-muted">
        {detail.accountOfficerName} calls {detail.customer.customerName} on{' '}
        {detail.customer.regPhone} and confirms the amount, instruction, beneficiary and purpose.
      </p>
      {!confirmed && !mine ? (
        <InlineAlert tone="info" title="Waiting for the Account Officer">
          {detail.actions.logCallback}. {detail.accountOfficerName} has been notified and can log
          the call from their call-back list. The transaction stays in verification until the
          customer confirms.
        </InlineAlert>
      ) : null}
      {confirmed ? (
        <InlineAlert tone="success" title="Customer confirmed the instruction">
          {detail.controls.find((c) => c.controlCode === 'C03')?.note}
        </InlineAlert>
      ) : last ? (
        <InlineAlert tone="warning" title="Not yet confirmed">
          Last call: {last.outcome.toLowerCase()} — {last.notes}. Try again; the transaction stays
          in verification.
        </InlineAlert>
      ) : null}
      {!confirmed && mine ? (
        <CallbackForm
          txnId={detail.txn.id}
          customer={detail.customer}
          onSaved={(l) => l.outcome === 'CONFIRMED' && goTo(5)}
        />
      ) : null}
      <div>
        <h3 className="mb-2 text-[13px] font-semibold">Call history</h3>
        <CallbackHistory logs={detail.callbacks} />
      </div>
      <div className="flex flex-col-reverse gap-2 border-t border-border pt-4 sm:flex-row sm:justify-between">
        <Button icon={ArrowLeft} onClick={() => goTo(3)}>
          Back
        </Button>
        {confirmed ? (
          <Button variant="primary" iconRight={ArrowRight} onClick={() => goTo(5)}>
            Continue
          </Button>
        ) : null}
      </div>
    </div>
  );
}
