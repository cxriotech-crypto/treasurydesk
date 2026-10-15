'use client';

import { CHANNEL_LABELS, MANDATE_RULE_LABELS } from '@/domain/codes';
import { formatDate, formatNaira } from '@/lib/format';
import { customersService } from '@/services';
import type { TxnDetail } from '@/services/transactionsService';
import type { SignatureChecks } from '@/services/workflow';
import { useData } from '@/services/useData';
import { Checkbox, DescriptionList, InlineAlert, SkeletonRows } from '@/components/ui';
import { DocumentList } from './Documents';
import { SpecimenCard } from './Specimen';

/**
 * What a signature check is made against: the instruction documents beside the specimen
 * signatures and the mandate. The Treasury Officer and Internal Audit see exactly the same view.
 */
export function SignatureComparison({ detail }: { detail: TxnDetail }) {
  const { txn, instruction } = detail;
  const cust = useData(() => customersService.get(txn.customerId), [txn.customerId]);
  const sigs = cust.data?.signatories.filter((s) => s.active) ?? [];
  const mandate = cust.data?.mandate;
  const docs = detail.attachments
    .filter((a) => a.kind === 'INSTRUCTION')
    .map((a) => ({ ...a, caption: `uploaded by ${a.uploadedByName}` }));
  return (
    <div className="grid grid-cols-1 gap-5 xl:grid-cols-2">
      <section className="min-w-0 space-y-3">
        <h3 className="text-[13px] font-semibold">Instruction received</h3>
        <DocumentList items={docs} empty="No instruction documents attached." />
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
  );
}

/** The four signature checks from SOP step 2. */
export function SignatureChecklist({
  value,
  onChange,
  disabled,
}: {
  value: SignatureChecks;
  onChange: (v: SignatureChecks) => void;
  disabled?: boolean;
}) {
  return (
    <fieldset className="rounded-md border border-border p-3" disabled={disabled}>
      <legend className="px-1 text-[13px] font-semibold">Checks</legend>
      <Checkbox
        checked={value.sigOk}
        onChange={(v) => onChange({ ...value, sigOk: v })}
        label="Signature matches the specimen"
      />
      <Checkbox
        checked={value.mandateOk}
        onChange={(v) => onChange({ ...value, mandateOk: v })}
        label="Signed according to the mandate"
      />
      <Checkbox
        checked={value.ownershipOk}
        onChange={(v) => onChange({ ...value, ownershipOk: v })}
        label="Account ownership confirmed"
      />
      <Checkbox
        checked={value.completeOk}
        onChange={(v) => onChange({ ...value, completeOk: v })}
        label="Instruction is complete"
        description="Beneficiary name, bank, account number, amount and purpose where money leaves the bank"
      />
    </fieldset>
  );
}
