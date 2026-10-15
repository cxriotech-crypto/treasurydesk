'use client';

import { useState } from 'react';
import { ArrowLeft, ArrowRight, OctagonX } from 'lucide-react';
import { transactionsService } from '@/services';
import { Button, ConfirmDialog, InlineAlert, toast } from '@/components/ui';
import { SignatureChecklist, SignatureComparison } from '@/components/txn/SignatureCheck';
import type { StepProps } from './Wizard';

export function StepSignature({ detail, goTo }: StepProps) {
  const { txn, verification } = detail;
  const [c, setC] = useState({
    sigOk: verification?.sigOk ?? false,
    mandateOk: verification?.mandateOk ?? false,
    ownershipOk: verification?.ownershipOk ?? false,
    completeOk: verification?.completeOk ?? false,
  });
  const [stopOpen, setStopOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const all = c.sigOk && c.mandateOk && c.ownershipOk && c.completeOk;

  const submit = async () => {
    setBusy(true);
    setError(null);
    try {
      await transactionsService.verifySignature(txn.id, c);
      toast.success('Signature and mandate verified');
      goTo(4);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-5">
      <SignatureComparison detail={detail} />
      <SignatureChecklist value={c} onChange={setC} />

      {error ? <InlineAlert tone="danger">{error}</InlineAlert> : null}

      <div className="flex flex-col-reverse gap-2 border-t border-border pt-4 sm:flex-row sm:justify-between">
        <Button icon={ArrowLeft} onClick={() => goTo(2)}>
          Back
        </Button>
        <div className="flex flex-col-reverse gap-2 sm:flex-row">
          <Button variant="danger" icon={OctagonX} onClick={() => setStopOpen(true)}>
            Signature differs — stop processing
          </Button>
          <Button
            variant="primary"
            iconRight={ArrowRight}
            disabled={!all}
            loading={busy}
            onClick={submit}
          >
            Verified, continue
          </Button>
        </div>
      </div>

      <ConfirmDialog
        open={stopOpen}
        onClose={() => setStopOpen(false)}
        title="Stop processing?"
        description="The SOP requires processing to stop when the signature differs. The transaction will be closed as Stopped and Head, Treasury notified."
        confirmLabel="Stop processing"
        tone="danger"
        reason={{
          label: 'What differs',
          placeholder: 'e.g. signature does not match the specimen on file',
        }}
        onConfirm={async (reason) => {
          await transactionsService.stop(txn.id, reason);
          toast.error(`${txn.txnRef} stopped`, 'Signature mismatch recorded.');
        }}
      />
    </div>
  );
}
