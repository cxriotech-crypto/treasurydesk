'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { ListChecks, XCircle } from 'lucide-react';
import { scenarioLabel, SCENARIO_META, VOUCHER_TYPE_META } from '@/domain/codes';
import { transactionsService } from '@/services';
import { useData } from '@/services/useData';
import type { TxnDetail } from '@/services/transactionsService';
import {
  BottomSheet,
  Button,
  Card,
  ConfirmDialog,
  ErrorState,
  InlineAlert,
  LinkButton,
  PageHeader,
  SkeletonRows,
  Stepper,
  TxnStatusBadge,
  toast,
  type StepItem,
} from '@/components/ui';
import { ControlsChecklist, controlsProgress } from '@/components/txn/Controls';
import { useDisclosure } from '@/components/hooks';
import { StepSubject } from './StepSubject';
import { StepInstruction } from './StepInstruction';
import { StepSignature } from './StepSignature';
import { StepCallback } from './StepCallback';
import { StepCbs } from './StepCbs';
import { StepVoucher } from './StepVoucher';

const STEP_LABELS = [
  'Type & scenario',
  'Instruction',
  'Signature & mandate',
  'Call-back',
  'Eazybankz',
  'Voucher',
];

/** Furthest step the maker may open, from the controls already passed. */
function reachable(d: TxnDetail | null | undefined): number {
  if (!d) return 1;
  const ok = (code: string) => d.controls.find((c) => c.controlCode === code)?.state === 'PASSED';
  if (d.txn.status === 'RETURNED') return 6;
  if (ok('C04')) return 6;
  if (ok('C03')) return 5;
  if (ok('C02')) return 4;
  if (ok('C01')) return 3;
  return 2;
}

export interface StepProps {
  detail: TxnDetail;
  goTo: (step: number) => void;
}

export function Wizard() {
  const router = useRouter();
  const params = useSearchParams();
  const id = params.get('id');
  const detail = useData(() => (id ? transactionsService.get(id) : Promise.resolve(null)), [id]);
  const [step, setStep] = useState<number | null>(id ? null : 1);
  const controls = useDisclosure();
  const [cancelOpen, setCancelOpen] = useState(false);
  const d = detail.data ?? null;
  const max = reachable(d);

  // Resume where the draft left off.
  useEffect(() => {
    if (id && d && step === null) setStep(reachable(d));
  }, [id, d, step]);

  // Submitted transactions are not edited here.
  useEffect(() => {
    if (d && !['DRAFT', 'VERIFICATION', 'RETURNED', 'STOPPED'].includes(d.txn.status)) {
      router.replace(`/transactions/${d.txn.id}`);
    }
  }, [d, router]);

  const goTo = (n: number) => {
    setStep(n);
    if (typeof window !== 'undefined') window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  if (id && detail.error) return <ErrorState error={detail.error} onRetry={detail.reload} />;
  if (id && (detail.loading || !d || step === null)) return <SkeletonRows rows={10} />;

  const current = step ?? 1;
  const stopped = d?.txn.status === 'STOPPED';
  const notMaker = d && d.actions.continueDraft && !stopped;
  const stepItems: StepItem[] = STEP_LABELS.map((label, i) => {
    const n = i + 1;
    const done = n < max;
    return { key: String(n), label, state: n === current ? 'current' : done ? 'done' : 'todo' };
  });

  const controlsList = d?.controls ?? [];

  return (
    <>
      <PageHeader
        title={d ? `${d.txn.txnRef}` : 'New transaction'}
        description={
          d
            ? `${scenarioLabel(d.txn.scenarioCode)} · ${d.customer.customerName}`
            : 'Record a customer instruction and raise the voucher.'
        }
        crumbs={[
          { label: 'Transactions', href: '/transactions' },
          { label: d ? d.txn.txnRef : 'New' },
        ]}
        meta={d ? <TxnStatusBadge status={d.txn.status} /> : null}
        actions={
          d ? (
            <>
              <Button icon={ListChecks} className="lg:hidden" onClick={controls.onOpen}>
                Controls {controlsProgress(controlsList)}
              </Button>
              {!d.actions.cancel ? (
                <Button variant="ghost" icon={XCircle} onClick={() => setCancelOpen(true)}>
                  Cancel transaction
                </Button>
              ) : null}
              <LinkButton href={`/transactions/${d.txn.id}`}>Open details</LinkButton>
            </>
          ) : null
        }
      />

      {stopped ? (
        <div className="mb-4">
          <InlineAlert tone="danger" title="Stopped – signature mismatch">
            {d?.txn.stopReason}. Processing has stopped as required by the SOP.
          </InlineAlert>
        </div>
      ) : null}
      {d?.txn.status === 'RETURNED' ? (
        <div className="mb-4">
          <InlineAlert tone="warning" title="Returned for correction">
            {d.txn.returnComment} — correct the voucher and sign again. Approval restarts at Head,
            Treasury.
          </InlineAlert>
        </div>
      ) : null}
      {notMaker ? (
        <div className="mb-4">
          <InlineAlert tone="info" title="Read only">
            {d?.actions.continueDraft}.
          </InlineAlert>
        </div>
      ) : null}

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-[200px_minmax(0,1fr)_260px]">
        <div className="lg:sticky lg:top-20 lg:self-start">
          <Stepper
            steps={stepItems}
            onSelect={(k) => goTo(Number(k))}
            canSelect={(s) => !!d && Number(s.key) <= max && !stopped}
          />
        </div>

        <Card className="min-w-0 p-4 md:p-5">
          <h2 className="mb-4 text-[15px] font-semibold">
            <span className="num text-muted">{current}.</span> {STEP_LABELS[current - 1]}
          </h2>
          {current === 1 || !d ? (
            <StepSubject
              detail={d}
              onCreated={(t) => router.replace(`/transactions/new?id=${t.id}`)}
              goTo={goTo}
            />
          ) : stopped || notMaker ? (
            <p className="text-sm text-muted">
              This transaction cannot be edited here.{' '}
              <Link className="font-medium text-fg underline" href={`/transactions/${d.txn.id}`}>
                Open the details
              </Link>
              .
            </p>
          ) : current === 2 ? (
            <StepInstruction detail={d} goTo={goTo} />
          ) : current === 3 ? (
            <StepSignature detail={d} goTo={goTo} />
          ) : current === 4 ? (
            <StepCallback detail={d} goTo={goTo} />
          ) : current === 5 ? (
            <StepCbs detail={d} goTo={goTo} />
          ) : (
            <StepVoucher detail={d} goTo={goTo} />
          )}
        </Card>

        <aside className="hidden lg:sticky lg:top-20 lg:block lg:self-start">
          <Card className="p-4">
            <p className="mb-3 flex items-center justify-between text-[13px] font-semibold">
              Controls{' '}
              <span className="num font-normal text-muted">{controlsProgress(controlsList)}</span>
            </p>
            <ControlsChecklist controls={controlsList} compact />
            {d ? (
              <p className="mt-3 border-t border-border pt-3 text-xs text-muted">
                Voucher:{' '}
                {SCENARIO_META[d.txn.scenarioCode].vouchers
                  .map((v) => VOUCHER_TYPE_META[v].label)
                  .join(' + ')}
              </p>
            ) : null}
          </Card>
        </aside>
      </div>

      <BottomSheet
        open={controls.open}
        onClose={controls.onClose}
        title={`Controls ${controlsProgress(controlsList)}`}
      >
        <ControlsChecklist controls={controlsList} />
      </BottomSheet>

      {d ? (
        <ConfirmDialog
          open={cancelOpen}
          onClose={() => setCancelOpen(false)}
          title={`Cancel ${d.txn.txnRef}?`}
          description="The transaction is closed and cannot be resumed."
          confirmLabel="Cancel transaction"
          tone="danger"
          reason={{ label: 'Reason', placeholder: 'Why is it being cancelled?' }}
          onConfirm={async (reason) => {
            await transactionsService.cancel(d.txn.id, reason, d.txn.version);
            toast.success(`${d.txn.txnRef} cancelled`);
            router.push(`/transactions/${d.txn.id}`);
          }}
        />
      ) : null}
    </>
  );
}
