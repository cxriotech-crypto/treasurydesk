'use client';

import Link from 'next/link';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  CheckCircle2,
  CornerUpLeft,
  FilePenLine,
  PenLine,
  PhoneCall,
  PlayCircle,
  Printer,
  Undo2,
  XCircle,
  XOctagon,
} from 'lucide-react';
import {
  CHANNEL_LABELS,
  PENDING_APPROVAL_STATUSES,
  SCENARIO_META,
  VOUCHER_TYPE_META,
  levelForStatus,
  scenarioLabel,
} from '@/domain/codes';
import { formatDate, formatDateTime, formatNaira } from '@/lib/format';
import { approvalsService, transactionsService } from '@/services';
import { useCurrentUser, useData } from '@/services/useData';
import type { TxnDetail } from '@/services/transactionsService';
import { isReady } from '@/app/routes';
import {
  ActionBar,
  Badge,
  Button,
  Card,
  CardBody,
  ConfirmDialog,
  DescriptionList,
  ErrorState,
  InlineAlert,
  LinkButton,
  Modal,
  PageHeader,
  SignatureModal,
  SkeletonRows,
  SlaBadge,
  TabPanel,
  Tabs,
  TxnStatusBadge,
  buttonClass,
  toast,
  toastError,
} from '@/components/ui';
import { StageProgress } from '@/components/txn/StageProgress';
import { ControlsChecklist } from '@/components/txn/Controls';
import { VoucherView } from '@/components/txn/VoucherView';
import { CallbackForm, CallbackHistory } from '@/components/txn/CallbackForm';
import { DocumentPreview } from '@/components/txn/Specimen';
import { ExecuteDrawer } from '@/components/txn/ExecutePanel';
import { CommentsPanel, AuditList, Timeline } from './panels';

type TabKey =
  | 'summary'
  | 'vouchers'
  | 'instruction'
  | 'verification'
  | 'controls'
  | 'timeline'
  | 'comments'
  | 'audit';
type Dialog =
  null | 'approve' | 'return' | 'reject' | 'cancel' | 'confirm' | 'callback' | 'execute';

const yes = (v: boolean | undefined) => (v ? <Badge tone="success">Yes</Badge> : <Badge>No</Badge>);

function Summary({ d }: { d: TxnDetail }) {
  const t = d.txn;
  const figures = d.vouchers.length
    ? d.vouchers.map((v) => ({
        label: `${VOUCHER_TYPE_META[v.voucherType].label} ${v.voucherNo}`,
        value:
          v.voucherType === 'RO' ? v.rollAmt : v.voucherType === 'FO' ? v.netAmt : v.principalAmt,
      }))
    : (d.computation?.summary ?? [])
        .filter((s) => s.format === 'money')
        .map((s) => ({ label: s.label, value: s.value }));
  const subject = d.investment ? (
    isReady(`/investments/${d.investment.id}`) ? (
      <Link className="underline" href={`/investments/${d.investment.id}`}>
        {d.investment.investmentRef}
      </Link>
    ) : (
      d.investment.investmentRef
    )
  ) : d.sourceAccount ? (
    `${d.sourceAccount.accountNo} (${d.sourceAccount.productCode})`
  ) : (
    '—'
  );
  return (
    <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">
      <Card className="lg:col-span-2">
        <CardBody>
          <DescriptionList
            items={[
              { label: 'Customer', value: `${d.customer.customerName} (${d.customer.cifNo})` },
              { label: 'Transaction', value: scenarioLabel(t.scenarioCode) },
              {
                label:
                  SCENARIO_META[t.scenarioCode].subject === 'ACCOUNT'
                    ? 'Source account'
                    : 'Investment',
                value: subject,
              },
              { label: 'Maker', value: d.maker.fullName },
              { label: 'Created', value: formatDateTime(t.createdAt) },
              { label: 'Instruction received', value: formatDateTime(t.receivedAt) },
              { label: 'Submitted', value: formatDateTime(t.submittedAt) },
              {
                label: 'SLA due',
                value: t.slaDueAt ? (
                  <span className="flex flex-wrap items-center gap-2">
                    {formatDateTime(t.slaDueAt)} <SlaBadge sla={d.sla} />
                  </span>
                ) : (
                  '—'
                ),
              },
              { label: 'Completed', value: formatDateTime(t.completedAt) },
              { label: 'Approval cycle', value: t.cycleNo },
              ...(d.reversalOf
                ? [
                    {
                      label: 'Reverses',
                      value: (
                        <Link className="underline" href={`/transactions/${d.reversalOf.id}`}>
                          {d.reversalOf.txnRef}
                        </Link>
                      ),
                    },
                  ]
                : []),
              ...(d.reversedBy
                ? [
                    {
                      label: 'Reversed by',
                      value: (
                        <Link className="underline" href={`/transactions/${d.reversedBy.id}`}>
                          {d.reversedBy.txnRef}
                        </Link>
                      ),
                    },
                  ]
                : []),
              ...(d.resultInvestment
                ? [{ label: 'Created investment', value: d.resultInvestment.investmentRef }]
                : []),
            ]}
          />
        </CardBody>
      </Card>
      <Card>
        <CardBody className="space-y-3">
          <p className="text-[13px] font-semibold">Key figures</p>
          {figures.length ? (
            figures.map((f) => (
              <div key={f.label} className="flex items-center justify-between gap-3 text-sm">
                <span className="text-muted">{f.label}</span>
                <span className="num font-medium">{formatNaira(f.value)}</span>
              </div>
            ))
          ) : (
            <p className="text-sm text-muted">
              Figures appear once the voucher inputs are complete.
            </p>
          )}
          <div className="flex items-center justify-between gap-3 border-t border-border pt-3 text-sm">
            <span className="text-muted">Instructed amount</span>
            <span className="num font-semibold">
              {formatNaira(d.instruction?.amount ?? t.headlineAmt)}
            </span>
          </div>
        </CardBody>
      </Card>
    </div>
  );
}

function Vouchers({ d }: { d: TxnDetail }) {
  if (d.vouchers.length) {
    return (
      <div className="grid grid-cols-1 gap-5 xl:grid-cols-2">
        {d.vouchers.map((v) => (
          <Card key={v.id}>
            <CardBody className="space-y-3">
              <VoucherView v={v} />
              <a
                href={`/vouchers/${v.id}/print`}
                target="_blank"
                rel="noopener"
                className={buttonClass('secondary', 'sm')}
              >
                <Printer size={16} strokeWidth={1.75} aria-hidden /> Print voucher
              </a>
            </CardBody>
          </Card>
        ))}
      </div>
    );
  }
  if (!d.computation?.vouchers.length)
    return (
      <p className="text-sm text-muted">No voucher yet. It is raised in step 6 of the wizard.</p>
    );
  return (
    <div className="space-y-3">
      <InlineAlert tone="info">
        Draft voucher — figures are live and numbers are issued on submission.
      </InlineAlert>
      <div className="grid grid-cols-1 gap-5 xl:grid-cols-2">
        {d.computation.vouchers.map((v) => (
          <Card key={v.seqNo}>
            <CardBody className="space-y-3">
              <VoucherView v={v} />
              <a
                href={`/vouchers/draft/print?txn=${d.txn.id}&seq=${v.seqNo}`}
                target="_blank"
                rel="noopener"
                className={buttonClass('secondary', 'sm')}
              >
                <Printer size={16} strokeWidth={1.75} aria-hidden /> Print draft
              </a>
            </CardBody>
          </Card>
        ))}
      </div>
    </div>
  );
}

function Instruction({ d }: { d: TxnDetail }) {
  const i = d.instruction;
  if (!i) return <p className="text-sm text-muted">No instruction recorded yet.</p>;
  return (
    <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
      <DescriptionList
        items={[
          { label: 'Channel', value: CHANNEL_LABELS[i.channel] },
          { label: 'Received', value: `${formatDate(i.receivedDate)} ${i.receivedTime}` },
          { label: 'Amount', value: <span className="num">{formatNaira(i.amount)}</span> },
          { label: 'Purpose', value: i.purpose },
          {
            label: 'Destination',
            value: i.payDestination === 'EXTERNAL' ? 'Another bank (GAPS)' : 'Internal',
          },
          ...(i.benefName
            ? [
                { label: 'Beneficiary', value: i.benefName },
                {
                  label: 'Account',
                  value: `${i.accountNo ?? ''} · ${i.accountType === 'CURRENT' ? 'Current' : 'Savings'}`,
                },
              ]
            : []),
        ]}
      />
      <DocumentPreview name={i.documentName} data={i.documentData} />
    </div>
  );
}

function Verification({ d }: { d: TxnDetail }) {
  const v = d.verification;
  return (
    <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
      <DescriptionList
        columns={1}
        items={[
          { label: 'Signature matches specimen', value: yes(v?.sigOk) },
          { label: 'Signed according to mandate', value: yes(v?.mandateOk) },
          { label: 'Account ownership confirmed', value: yes(v?.ownershipOk) },
          { label: 'Instruction complete', value: yes(v?.completeOk) },
          {
            label: 'Verified by',
            value: v?.verifiedBy ? `${d.maker.fullName} · ${formatDateTime(v.verifiedAt)}` : '—',
          },
          {
            label: 'Confirmed in Eazybankz',
            value: v?.cbsConfirmed ? `Yes · synced ${formatDateTime(v.cbsSyncedAt)}` : 'No',
          },
          ...(d.txn.scenarioCode === 'INFLOW'
            ? [
                {
                  label: 'Funds received / source confirmed',
                  value: (
                    <>
                      {yes(v?.fundsReceived)} {yes(v?.sourceConfirmed)}
                    </>
                  ),
                },
              ]
            : []),
        ]}
      />
      <div>
        <p className="mb-2 text-[13px] font-semibold">Call-backs</p>
        <CallbackHistory logs={d.callbacks} />
      </div>
    </div>
  );
}

export function TxnDetailView({ id }: { id: string }) {
  const router = useRouter();
  const me = useCurrentUser();
  const q = useData(() => transactionsService.get(id), [id]);
  const [tab, setTab] = useState<TabKey>('summary');
  const [dialog, setDialog] = useState<Dialog>(null);
  const close = () => setDialog(null);

  if (q.error && !q.data) return <ErrorState error={q.error} onRetry={q.reload} />;
  if (!q.data) return <SkeletonRows rows={12} />;
  const d = q.data;
  const t = d.txn;
  const a = d.actions;
  const role = me?.roleCode;
  const pendingApproval = PENDING_APPROVAL_STATUSES.includes(t.status);
  const level = levelForStatus(t.status);
  const isApprover = role === 'HT' || role === 'MIS' || role === 'AUD' || role === 'MD';

  const raiseReversal = async () => {
    try {
      const r = await transactionsService.raiseReversal(t.id);
      toast.success(`Reversal ${r.txnRef} created`);
      router.push(`/transactions/new?id=${r.id}`);
    } catch (e) {
      toastError(e);
    }
  };

  const approvalButtons =
    pendingApproval && isApprover ? (
      <>
        <Button
          variant="danger"
          icon={XOctagon}
          disabled={!!a.approve}
          onClick={() => setDialog('reject')}
        >
          Reject
        </Button>
        <Button icon={CornerUpLeft} disabled={!!a.approve} onClick={() => setDialog('return')}>
          Return to maker
        </Button>
        <Button
          variant="primary"
          icon={PenLine}
          disabledReason={a.approve}
          onClick={() => setDialog('approve')}
        >
          Approve &amp; sign
        </Button>
      </>
    ) : null;

  const tabs: { key: TabKey; label: string; count?: number }[] = [
    { key: 'summary', label: 'Summary' },
    { key: 'vouchers', label: 'Vouchers', count: d.vouchers.length || undefined },
    { key: 'instruction', label: 'Instruction' },
    { key: 'verification', label: 'Verification & call-back' },
    {
      key: 'controls',
      label: 'Controls',
      count: d.controls.filter((c) => c.state === 'PASSED').length,
    },
    { key: 'timeline', label: 'Timeline' },
    { key: 'comments', label: 'Comments', count: d.comments.length },
    { key: 'audit', label: 'Audit', count: d.audit.length },
  ];

  return (
    <>
      <PageHeader
        title={t.txnRef}
        description={`${scenarioLabel(t.scenarioCode)} · ${d.customer.customerName}`}
        crumbs={[
          {
            label: pendingApproval && isApprover ? 'Approvals' : 'Transactions',
            href: pendingApproval && isApprover ? '/approvals' : '/transactions',
          },
          { label: t.txnRef },
        ]}
        meta={
          <>
            <TxnStatusBadge status={t.status} />
            <SlaBadge sla={d.sla} />
            <span className="num text-sm font-semibold">{formatNaira(t.headlineAmt)}</span>
          </>
        }
        actions={
          <>
            {!a.continueDraft ? (
              <LinkButton
                href={`/transactions/new?id=${t.id}`}
                variant="primary"
                icon={FilePenLine}
              >
                {t.status === 'RETURNED' ? 'Correct and resubmit' : 'Continue draft'}
              </LinkButton>
            ) : null}
            {!a.logCallback ? (
              <Button icon={PhoneCall} onClick={() => setDialog('callback')}>
                Log call-back
              </Button>
            ) : null}
            {!a.cancel ? (
              <Button variant="ghost" icon={XCircle} onClick={() => setDialog('cancel')}>
                Cancel
              </Button>
            ) : null}
            {role === 'OPS' && ['PENDING_OPERATIONS', 'EXEC_FAILED'].includes(t.status) ? (
              <Button
                variant="primary"
                icon={PlayCircle}
                disabledReason={a.execute}
                onClick={() => setDialog('execute')}
              >
                {t.status === 'EXEC_FAILED' ? 'Retry execution' : 'Execute'}
              </Button>
            ) : null}
            {role === 'TO' && t.status === 'EXECUTED' ? (
              <Button variant="primary" icon={CheckCircle2} onClick={() => setDialog('confirm')}>
                Confirm completion
              </Button>
            ) : null}
            {role === 'TO' && t.status === 'COMPLETED' && d.resultInvestment ? (
              <Button icon={Undo2} disabledReason={a.reverse} onClick={raiseReversal}>
                Raise reversal
              </Button>
            ) : null}
            <span className="hidden md:contents">{approvalButtons}</span>
          </>
        }
      />

      {t.status === 'RETURNED' && t.returnComment ? (
        <div className="mb-4">
          <InlineAlert tone="warning" title="Returned for correction">
            {t.returnComment}
          </InlineAlert>
        </div>
      ) : null}
      {t.status === 'STOPPED' ? (
        <div className="mb-4">
          <InlineAlert tone="danger" title="Stopped – signature mismatch">
            {t.stopReason}
          </InlineAlert>
        </div>
      ) : null}
      {t.status === 'REJECTED' || t.status === 'CANCELLED' ? (
        <div className="mb-4">
          <InlineAlert tone="danger" title={t.status === 'REJECTED' ? 'Rejected' : 'Cancelled'}>
            {t.rejectReason}
          </InlineAlert>
        </div>
      ) : null}
      {pendingApproval && isApprover && a.approve && level ? (
        <div className="mb-4">
          <InlineAlert tone="info">{a.approve}.</InlineAlert>
        </div>
      ) : null}
      {t.status === 'EXEC_FAILED' ? (
        <div className="mb-4">
          <InlineAlert tone="danger" title="Execution failed">
            {d.executions.filter((e) => e.status === 'FAILED').pop()?.failureReason}. Operations
            will retry.
          </InlineAlert>
        </div>
      ) : null}

      <Card className="mb-5 p-4">
        <StageProgress stages={d.stages} />
      </Card>

      <Tabs label="Transaction sections" value={tab} onChange={setTab} tabs={tabs} />
      <TabPanel id={tab}>
        {tab === 'summary' ? <Summary d={d} /> : null}
        {tab === 'vouchers' ? <Vouchers d={d} /> : null}
        {tab === 'instruction' ? <Instruction d={d} /> : null}
        {tab === 'verification' ? <Verification d={d} /> : null}
        {tab === 'controls' ? (
          <Card>
            <CardBody>
              <ControlsChecklist controls={d.controls} />
            </CardBody>
          </Card>
        ) : null}
        {tab === 'timeline' ? <Timeline d={d} /> : null}
        {tab === 'comments' ? <CommentsPanel d={d} /> : null}
        {tab === 'audit' ? <AuditList events={d.audit} /> : null}
      </TabPanel>

      {approvalButtons ? <ActionBar className="md:hidden">{approvalButtons}</ActionBar> : null}

      <SignatureModal
        open={dialog === 'approve'}
        onClose={close}
        title={`Approve ${t.txnRef}`}
        description={
          level ? `You are signing at level ${level.levelNo} of 5 (${level.label}).` : undefined
        }
        actionLabel="Approve & sign"
        withComment
        summary={
          <div className="rounded-md bg-surface-2 px-3 py-2 text-[13px]">
            <p className="flex justify-between gap-3">
              <span className="text-muted">{scenarioLabel(t.scenarioCode)}</span>
              <span className="num font-medium">{formatNaira(t.headlineAmt)}</span>
            </p>
            <p className="text-muted">{d.customer.customerName}</p>
          </div>
        }
        onSign={async (s) => {
          const r = await approvalsService.approve(t.id, s, t.version);
          toast.success(
            `${t.txnRef} approved`,
            r.status === 'PENDING_OPERATIONS'
              ? 'Fully approved — sent to Operations.'
              : `Now ${levelForStatus(r.status)?.label ?? ''}.`
          );
        }}
      />
      <ConfirmDialog
        open={dialog === 'return'}
        onClose={close}
        title={`Return ${t.txnRef} to the maker?`}
        description="The Treasury Officer corrects it and resubmits; approval restarts at Head, Treasury."
        confirmLabel="Return to maker"
        reason={{ label: 'Comment to the maker', placeholder: 'What needs to be corrected?' }}
        onConfirm={async (c) => {
          await approvalsService.returnToMaker(t.id, c, t.version);
          toast.success(`${t.txnRef} returned to ${d.maker.fullName}`);
        }}
      />
      <ConfirmDialog
        open={dialog === 'reject'}
        onClose={close}
        title={`Reject ${t.txnRef}?`}
        description="Rejected transactions are closed and cannot be resubmitted."
        confirmLabel="Reject"
        tone="danger"
        reason={{ label: 'Reason', placeholder: 'Why is it rejected?' }}
        onConfirm={async (r) => {
          await approvalsService.reject(t.id, r, t.version);
          toast.success(`${t.txnRef} rejected`);
        }}
      />
      <ConfirmDialog
        open={dialog === 'cancel'}
        onClose={close}
        title={`Cancel ${t.txnRef}?`}
        confirmLabel="Cancel transaction"
        tone="danger"
        reason={{ label: 'Reason' }}
        onConfirm={async (r) => {
          await transactionsService.cancel(t.id, r, t.version);
          toast.success(`${t.txnRef} cancelled`);
        }}
      />
      <ConfirmDialog
        open={dialog === 'confirm'}
        onClose={close}
        title="Confirm completion?"
        description="Confirm that the customer has received value. The SLA result (control C12) is recorded now."
        confirmLabel="Confirm completion"
        onConfirm={async () => {
          const r = await transactionsService.confirmCompletion(t.id, t.version);
          toast.success(`${r.txnRef} completed`);
        }}
      />
      <Modal
        open={dialog === 'callback'}
        onClose={close}
        title="Log call-back"
        description={`${d.customer.customerName} · ${d.customer.regPhone}`}
        size="lg"
      >
        <CallbackForm txnId={t.id} customer={d.customer} onSaved={close} />
      </Modal>
      <ExecuteDrawer
        txnId={dialog === 'execute' ? t.id : null}
        open={dialog === 'execute'}
        onClose={close}
      />
    </>
  );
}
