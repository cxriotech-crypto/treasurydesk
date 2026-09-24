'use client';

import { useState } from 'react';
import { ArrowLeft, ArrowRight } from 'lucide-react';
import { Button, InlineAlert, toastError } from '@/components/ui';
import { transactionsService } from '@/services';
import { CallbackForm, CallbackHistory } from '@/components/txn/CallbackForm';
import type { StepProps } from './Wizard';

export function StepCallback({ detail, goTo }: StepProps) {
  const confirmed = detail.controls.find((c) => c.controlCode === 'C03')?.state === 'PASSED';
  const last = detail.callbacks[0];
  // SOP step 3: only the customer's Account Officer may make and log this call.
  const mine = !detail.actions.logCallback;
  const [busy, setBusy] = useState(false);

  // The call-back is recorded but does not block, so the maker can go on and come back to it.
  const skip = async () => {
    setBusy(true);
    try {
      await transactionsService.saveDraft(detail.txn.id, { wizardStep: 5 });
      goTo(5);
    } catch (e) {
      toastError(e);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-5">
      <p className="text-sm text-muted">
        {detail.accountOfficerName} calls {detail.customer.customerName} on{' '}
        {detail.customer.regPhone} and confirms the amount, instruction, beneficiary and purpose.
      </p>
      {!confirmed && !mine ? (
        <InlineAlert tone="info" title="Waiting for the Account Officer">
          {detail.actions.logCallback}. {detail.accountOfficerName} has been notified and can log
          the call from their call-back list. You can carry on with the voucher meanwhile — the
          outstanding call-back is shown to every approver.
        </InlineAlert>
      ) : null}
      {confirmed ? (
        <InlineAlert tone="success" title="Customer confirmed the instruction">
          {detail.controls.find((c) => c.controlCode === 'C03')?.note}
        </InlineAlert>
      ) : last ? (
        <InlineAlert tone="warning" title="Not yet confirmed">
          Last call: {last.outcome.toLowerCase()} — {last.notes}. Try again; the control stays
          outstanding until the customer confirms.
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
        ) : !detail.actions.continueDraft ? (
          <Button iconRight={ArrowRight} loading={busy} onClick={() => void skip()}>
            Continue without the call-back
          </Button>
        ) : null}
      </div>
    </div>
  );
}
