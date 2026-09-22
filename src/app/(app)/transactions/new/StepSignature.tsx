'use client';

import { useState } from 'react';
import { ArrowLeft, ArrowRight, OctagonX } from 'lucide-react';
import { CHANNEL_LABELS, MANDATE_RULE_LABELS } from '@/domain/codes';
import { formatDate, formatNaira } from '@/lib/format';
import { customersService, transactionsService } from '@/services';
import { useData } from '@/services/useData';
import {
  Button,
  Checkbox,
  ConfirmDialog,
  DescriptionList,
  InlineAlert,
  SkeletonRows,
  toast,
} from '@/components/ui';
import { DocumentPreview, SpecimenCard } from '@/components/txn/Specimen';
import type { StepProps } from './Wizard';

export function StepSignature({ detail, goTo }: StepProps) {
  const { txn, instruction, verification } = detail;
  const cust = useData(() => customersService.get(txn.customerId), [txn.customerId]);
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

  const sigs = cust.data?.signatories.filter((s) => s.active) ?? [];
  const mandate = cust.data?.mandate;

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-1 gap-5 xl:grid-cols-2">
        <section className="min-w-0 space-y-3">
          <h3 className="text-[13px] font-semibold">Instruction received</h3>
          <DocumentPreview
            name={instruction?.documentName ?? null}
            data={instruction?.documentData ?? null}
          />
          {instruction ? (
            <DescriptionList
              items={[
                { label: 'Channel', value: CHANNEL_LABELS[instruction.channel] },
                {
                  label: 'Received',
                  value: `${formatDate(instruction.receivedDate)} ${instruction.receivedTime}`,
                },
                {
                  label: 'Amount',
                  value: <span className="num">{formatNaira(instruction.amount)}</span>,
                },
                { label: 'Purpose', value: instruction.purpose },
                ...(instruction.benefName
                  ? [
                      {
                        label: 'Beneficiary',
                        value: `${instruction.benefName} · ${instruction.accountNo}`,
                      },
                    ]
                  : []),
              ]}
            />
          ) : null}
        </section>
        <section className="min-w-0 space-y-3">
          <h3 className="text-[13px] font-semibold">Specimen signatures on file</h3>
          {cust.loading ? (
            <SkeletonRows rows={3} />
          ) : (
            <>
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                {sigs.map((s) => (
                  <SpecimenCard key={s.id} s={s} />
                ))}
              </div>
              {mandate ? (
                <InlineAlert tone="info" title="Mandate">
                  {MANDATE_RULE_LABELS[mandate.ruleCode]}.
                </InlineAlert>
              ) : null}
            </>
          )}
        </section>
      </div>

      <fieldset className="rounded-md border border-border p-3">
        <legend className="px-1 text-[13px] font-semibold">Checks</legend>
        <Checkbox
          checked={c.sigOk}
          onChange={(v) => setC({ ...c, sigOk: v })}
          label="Signature matches the specimen"
        />
        <Checkbox
          checked={c.mandateOk}
          onChange={(v) => setC({ ...c, mandateOk: v })}
          label="Signed according to the mandate"
        />
        <Checkbox
          checked={c.ownershipOk}
          onChange={(v) => setC({ ...c, ownershipOk: v })}
          label="Account ownership confirmed"
        />
        <Checkbox
          checked={c.completeOk}
          onChange={(v) => setC({ ...c, completeOk: v })}
          label="Instruction is complete"
          description="Beneficiary name, bank, account number, amount and purpose where money leaves the bank"
        />
      </fieldset>

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
