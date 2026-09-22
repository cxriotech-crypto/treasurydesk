'use client';
import React, { useState, useEffect, useCallback } from 'react';
import AppLayout from '@/components/AppLayout';
import StatusBadge from '@/components/ui/StatusBadge';
import Modal from '@/components/ui/Modal';
import Stepper from '@/components/ui/Stepper';
import { transactionService } from '@/services/transactionService';
import { getSession } from '@/services/userService';
import type { TreasuryTxn, TxnStatus, ApprovalLevel, UserRole } from '@/types';
import { TXN_TYPE_LABELS, APPROVAL_LEVEL_LABELS } from '@/types';
import { formatNaira, formatNairaCompact, formatDate, formatDateTime } from '@/lib/format';
import { CheckCircle2, XCircle, RotateCcw, Loader2, AlertCircle, Clock, FileText } from 'lucide-react';
import { toast } from 'sonner';
import { Skeleton } from '@/components/ui/LoadingSkeleton';
import EmptyState from '@/components/ui/EmptyState';

// Map user role to approval level
const ROLE_TO_LEVEL: Partial<Record<UserRole, ApprovalLevel>> = {
  TREASURY_OFFICER: 'TO',
  HEAD_TREASURY: 'HT',
  MIS: 'MIS',
  INTERNAL_AUDIT: 'AUDIT',
  MANAGING_DIRECTOR: 'MD',
};

const PENDING_STATUS_FOR_LEVEL: Record<ApprovalLevel, TxnStatus> = {
  TO: 'PENDING_TO',
  HT: 'PENDING_HT',
  MIS: 'PENDING_MIS',
  AUDIT: 'PENDING_AUDIT',
  MD: 'PENDING_MD',
};

type Tab = 'pending' | 'approved' | 'rejected';

export default function MyApprovalsClient() {
  const session = getSession();
  const userRole = session?.user.role ?? 'TREASURY_OFFICER';
  const approvalLevel = ROLE_TO_LEVEL[userRole];

  const [activeTab, setActiveTab] = useState<Tab>('pending');
  const [allTxns, setAllTxns] = useState<TreasuryTxn[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedTxn, setSelectedTxn] = useState<TreasuryTxn | null>(null);
  const [actionModal, setActionModal] = useState<{ type: 'approve' | 'reject' | 'return' } | null>(null);
  const [comment, setComment] = useState('');
  const [actionLoading, setActionLoading] = useState(false);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const { items } = await transactionService.list({ pageSize: 9999 });
      setAllTxns(items);
    } catch {
      setError('Failed to load approvals. Check your connection and try again.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  const pendingTxns = approvalLevel
    ? allTxns.filter((t) => t.status === PENDING_STATUS_FOR_LEVEL[approvalLevel])
    : [];

  const approvedTxns = approvalLevel
    ? allTxns.filter((t) =>
        t.approvals.some((a) => a.level === approvalLevel && a.action === 'APPROVED' && a.approverId === session?.user.id)
      )
    : [];

  const rejectedTxns = approvalLevel
    ? allTxns.filter((t) =>
        t.approvals.some((a) => a.level === approvalLevel && a.action === 'REJECTED' && a.approverId === session?.user.id)
      )
    : [];

  const tabData: Record<Tab, TreasuryTxn[]> = {
    pending: pendingTxns,
    approved: approvedTxns,
    rejected: rejectedTxns,
  };

  async function handleAction(action: 'APPROVED' | 'REJECTED' | 'RETURNED') {
    if (!selectedTxn || !approvalLevel || !session) return;
    if (action === 'REJECTED' && !comment.trim()) {
      toast.error('A rejection comment is required.');
      return;
    }
    setActionLoading(true);
    try {
      const updated = await transactionService.approve(
        selectedTxn.id,
        approvalLevel,
        action,
        comment,
        session.user.id,
        session.user.name
      );
      setAllTxns((prev) => prev.map((t) => t.id === updated.id ? updated : t));
      setSelectedTxn(updated);
      setActionModal(null);
      setComment('');
      const msgs = { APPROVED: 'Transaction approved and forwarded.', REJECTED: 'Transaction rejected.', RETURNED: 'Transaction returned to Treasury Officer.' };
      toast.success(msgs[action]);
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : 'Action failed. Please try again.');
    } finally {
      setActionLoading(false);
    }
  }

  function getApprovalSteps(txn: TreasuryTxn) {
    return txn.approvals.map((a) => ({
      id: `ap-step-${a.id}`,
      label: APPROVAL_LEVEL_LABELS[a.level],
      description: a.action
        ? `${a.action} by ${a.approver} at ${formatDateTime(a.actionAt)}`
        : a.status === 'SKIPPED' ? 'Skipped' : 'Awaiting approval',
      status: (
        a.status === 'APPROVED' ? 'completed' :
        a.status === 'REJECTED' ? 'error' :
        a.status === 'PENDING'&& txn.currentApprovalLevel === a.level ? 'current' : 'pending' ) as'completed' | 'current' | 'pending' | 'error',
    }));
  }

  const canAct = selectedTxn && approvalLevel &&
    selectedTxn.status === PENDING_STATUS_FOR_LEVEL[approvalLevel];

  const TABS: { id: Tab; label: string; count: number }[] = [
    { id: 'pending', label: 'Pending My Action', count: pendingTxns.length },
    { id: 'approved', label: 'Approved', count: approvedTxns.length },
    { id: 'rejected', label: 'Rejected', count: rejectedTxns.length },
  ];

  if (!approvalLevel) {
    return (
      <AppLayout>
        <div className="flex items-center justify-center h-96">
          <EmptyState
            icon={<AlertCircle size={24} />}
            title="No approval access"
            description={`Your role (${userRole}) does not have approval authority in the treasury workflow.`}
          />
        </div>
      </AppLayout>
    );
  }

  return (
    <AppLayout>
      <div className="flex items-center justify-between mb-6 gap-4 flex-wrap">
        <div>
          <h1 className="page-title">My Approvals</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Approval authority: <span className="font-semibold text-foreground">{APPROVAL_LEVEL_LABELS[approvalLevel]}</span> — Level {['TO','HT','MIS','AUDIT','MD'].indexOf(approvalLevel) + 1} of 5
          </p>
        </div>
        {pendingTxns.length > 0 && (
          <div className="flex items-center gap-2 px-3 py-2 rounded-xl bg-amber-50 border border-amber-200">
            <Clock size={14} className="text-amber-600" />
            <span className="text-xs font-semibold text-amber-700">{pendingTxns.length} transaction{pendingTxns.length > 1 ? 's' : ''} awaiting your approval</span>
          </div>
        )}
      </div>

      {/* Tabs */}
      <div className="flex gap-1 mb-4 bg-secondary rounded-xl p-1 w-fit">
        {TABS.map((tab) => (
          <button
            key={`tab-${tab.id}`}
            onClick={() => { setActiveTab(tab.id); setSelectedTxn(null); }}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all
              ${activeTab === tab.id ? 'bg-card shadow-sm text-foreground' : 'text-muted-foreground hover:text-foreground'}`}
          >
            {tab.label}
            {tab.count > 0 && (
              <span className={`min-w-[20px] h-5 rounded-full text-[10px] font-bold flex items-center justify-center px-1
                ${activeTab === tab.id
                  ? tab.id === 'pending' ? 'bg-amber-100 text-amber-700' : tab.id === 'rejected' ? 'bg-red-100 text-red-700' : 'bg-green-100 text-green-700' :'bg-muted text-muted-foreground'}`}>
                {tab.count}
              </span>
            )}
          </button>
        ))}
      </div>

      {error && (
        <div className="flex items-center gap-3 px-4 py-3 rounded-xl border bg-red-50 border-red-200 mb-4">
          <AlertCircle size={16} className="text-red-600" />
          <p className="text-sm text-red-700">{error}</p>
          <button onClick={fetchData} className="ml-auto btn-secondary text-xs">Retry</button>
        </div>
      )}

      <div className="grid grid-cols-1 xl:grid-cols-5 2xl:grid-cols-5 gap-4" style={{ minHeight: 'calc(100vh - 280px)' }}>
        {/* Left: Transaction List */}
        <div className="xl:col-span-2 card overflow-hidden flex flex-col">
          <div className="px-4 py-3 border-b border-border bg-secondary/50 shrink-0">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
              {activeTab === 'pending' ? 'Awaiting Action' : activeTab === 'approved' ? 'Approved by Me' : 'Rejected by Me'}
              {' '}({tabData[activeTab].length})
            </p>
          </div>
          <div className="flex-1 overflow-y-auto scrollbar-thin">
            {loading ? (
              <div className="p-3 space-y-2">
                {Array.from({ length: 5 }).map((_, i) => <Skeleton key={`appr-skel-${i}`} className="h-20 w-full" />)}
              </div>
            ) : tabData[activeTab].length === 0 ? (
              <EmptyState
                icon={activeTab === 'pending' ? <Clock size={24} /> : activeTab === 'approved' ? <CheckCircle2 size={24} /> : <XCircle size={24} />}
                title={activeTab === 'pending' ? 'No pending approvals' : activeTab === 'approved' ? 'No approved transactions' : 'No rejected transactions'}
                description={activeTab === 'pending' ? 'All transactions at your approval level have been actioned.' : undefined}
              />
            ) : (
              tabData[activeTab].map((txn) => (
                <div
                  key={`appr-item-${txn.id}`}
                  onClick={() => setSelectedTxn(txn)}
                  className={`px-4 py-3 border-b border-border cursor-pointer transition-colors
                    ${selectedTxn?.id === txn.id ? 'bg-accent/10 border-l-2 border-l-accent' : 'hover:bg-muted/40'}`}
                >
                  <div className="flex items-start justify-between gap-2 mb-1">
                    <span className="font-mono text-xs text-accent font-semibold">{txn.ref}</span>
                    <StatusBadge status={txn.status} size="sm" />
                  </div>
                  <p className="text-xs font-semibold text-foreground truncate mb-0.5">{txn.customerName}</p>
                  <div className="flex items-center gap-3 text-[10px] text-muted-foreground">
                    <span className="px-1.5 py-0.5 rounded bg-primary/10 text-primary font-semibold">{txn.type}</span>
                    <span className="tabular-nums font-semibold text-foreground">{formatNairaCompact(txn.principalAmt)}</span>
                    <span>{txn.intRate}% · {txn.tenorDays}d</span>
                  </div>
                  <p className="text-[10px] text-muted-foreground mt-1">{formatDateTime(txn.initiatedAt)}</p>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Right: Transaction Detail */}
        <div className="xl:col-span-3 card flex flex-col overflow-hidden">
          {!selectedTxn ? (
            <div className="flex-1 flex items-center justify-center">
              <EmptyState
                icon={<FileText size={24} />}
                title="Select a transaction"
                description="Click a transaction on the left to view its details and take action."
              />
            </div>
          ) : (
            <>
              {/* Detail Header */}
              <div className="px-5 py-4 border-b border-border bg-secondary/30 shrink-0">
                <div className="flex items-center justify-between gap-3 flex-wrap">
                  <div>
                    <div className="flex items-center gap-2 mb-1">
                      <span className="font-mono text-sm font-bold text-accent">{selectedTxn.ref}</span>
                      <StatusBadge status={selectedTxn.status} />
                    </div>
                    <p className="text-base font-bold text-foreground">{selectedTxn.customerName}</p>
                    <p className="text-xs text-muted-foreground">{selectedTxn.customerCif} · {selectedTxn.accountNumber}</p>
                  </div>
                  {canAct && (
                    <div className="flex gap-2 flex-wrap">
                      <button
                        onClick={() => setActionModal({ type: 'return' })}
                        className="btn-secondary text-xs gap-1.5"
                      >
                        <RotateCcw size={12} /> Return
                      </button>
                      <button
                        onClick={() => setActionModal({ type: 'reject' })}
                        className="btn-danger text-xs gap-1.5"
                      >
                        <XCircle size={12} /> Reject
                      </button>
                      <button
                        onClick={() => setActionModal({ type: 'approve' })}
                        className="btn-accent text-xs gap-1.5"
                      >
                        <CheckCircle2 size={12} /> Approve & Forward
                      </button>
                    </div>
                  )}
                </div>
              </div>

              {/* Detail Body */}
              <div className="flex-1 overflow-y-auto scrollbar-thin px-5 py-4 space-y-5">
                {/* Type & Instrument */}
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-xs px-2 py-0.5 rounded-full bg-primary/10 text-primary font-semibold">
                    {selectedTxn.type} — {TXN_TYPE_LABELS[selectedTxn.type]}
                  </span>
                  {selectedTxn.voucherNo && (
                    <span className="text-xs px-2 py-0.5 rounded-full bg-teal-100 text-teal-700 font-semibold font-mono">
                      {selectedTxn.voucherNo}
                    </span>
                  )}
                  {selectedTxn.cbsRef && (
                    <span className="text-xs px-2 py-0.5 rounded-full bg-blue-100 text-blue-700 font-semibold font-mono">
                      {selectedTxn.cbsRef}
                    </span>
                  )}
                </div>

                {/* Financial Grid */}
                <div className="grid grid-cols-2 gap-3">
                  {[
                    { label: 'Principal Amount', value: formatNaira(selectedTxn.principalAmt), highlight: true },
                    { label: 'Annual Rate', value: `${selectedTxn.intRate}%` },
                    { label: 'Tenor', value: `${selectedTxn.tenorDays} days` },
                    { label: 'Effective Date', value: formatDate(selectedTxn.effectiveDate) },
                    { label: 'Maturity Date', value: formatDate(selectedTxn.maturityDate) },
                    { label: 'Gross Interest', value: formatNaira(selectedTxn.interestAmt) },
                    { label: 'WHT (10%)', value: `(${formatNaira(selectedTxn.withholdingTax)})`, danger: true },
                    { label: 'Net Interest', value: formatNaira(selectedTxn.netInterest) },
                  ].map(({ label, value, highlight, danger }) => (
                    <div key={`appr-detail-${label}`} className="bg-secondary/50 rounded-xl px-3 py-2.5">
                      <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide mb-0.5">{label}</p>
                      <p className={`text-sm font-bold tabular-nums ${highlight ? 'text-primary' : danger ? 'text-red-600' : 'text-foreground'}`}>{value}</p>
                    </div>
                  ))}
                </div>

                {/* Total Payout Hero */}
                <div className="bg-accent/10 border border-accent/30 rounded-xl px-4 py-3 flex items-center justify-between">
                  <span className="text-sm font-semibold text-foreground">Total Payout at Maturity</span>
                  <span className="text-xl font-bold tabular-nums text-accent">{formatNaira(selectedTxn.totalPayout)}</span>
                </div>

                {/* SOP Checks */}
                <div>
                  <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">SOP Verification</p>
                  <div className="flex gap-2 flex-wrap">
                    {[
                      { label: 'Mandate Verified', done: selectedTxn.mandateVerified },
                      { label: 'Callback Done', done: selectedTxn.callbackDone },
                      { label: 'CBS Verified', done: selectedTxn.cbsVerified },
                    ].map(({ label, done }) => (
                      <div
                        key={`sop-v-${label}`}
                        className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl border text-xs font-semibold
                          ${done ? 'bg-green-50 border-green-200 text-green-700' : 'bg-amber-50 border-amber-200 text-amber-700'}`}
                      >
                        {done ? <CheckCircle2 size={12} /> : <Clock size={12} />}
                        {label}
                      </div>
                    ))}
                  </div>
                </div>

                {/* Approval Chain */}
                <div>
                  <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-3">Approval Chain Progress</p>
                  <Stepper steps={getApprovalSteps(selectedTxn)} orientation="vertical" />
                </div>

                {/* Comments from previous approvers */}
                {selectedTxn.approvals.some((a) => a.comment && a.comment.trim()) && (
                  <div>
                    <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">Approver Comments</p>
                    <div className="space-y-2">
                      {selectedTxn.approvals
                        .filter((a) => a.comment && a.comment.trim() && a.action)
                        .map((a) => (
                          <div key={`comment-${a.id}`} className={`px-3 py-2.5 rounded-xl border text-xs
                            ${a.action === 'APPROVED' ? 'bg-green-50 border-green-200' : a.action === 'REJECTED' ? 'bg-red-50 border-red-200' : 'bg-amber-50 border-amber-200'}`}>
                            <div className="flex items-center justify-between mb-1">
                              <span className="font-semibold text-foreground">{a.approver} — {APPROVAL_LEVEL_LABELS[a.level]}</span>
                              <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full ${a.action === 'APPROVED' ? 'bg-green-100 text-green-700' : a.action === 'REJECTED' ? 'bg-red-100 text-red-700' : 'bg-amber-100 text-amber-700'}`}>
                                {a.action}
                              </span>
                            </div>
                            <p className="text-muted-foreground">{a.comment}</p>
                            <p className="text-[10px] text-muted-foreground mt-1">{formatDateTime(a.actionAt)}</p>
                          </div>
                        ))}
                    </div>
                  </div>
                )}

                {/* Metadata */}
                <div className="text-xs text-muted-foreground pt-2 border-t border-border">
                  <p>Initiated by <span className="font-semibold text-foreground">{selectedTxn.initiatedBy}</span></p>
                  <p className="mt-0.5">{formatDateTime(selectedTxn.initiatedAt)}</p>
                </div>
              </div>
            </>
          )}
        </div>
      </div>

      {/* Action Modal */}
      <Modal
        open={!!actionModal}
        onClose={() => { setActionModal(null); setComment(''); }}
        title={
          actionModal?.type === 'approve' ? 'Approve & Forward Transaction' :
          actionModal?.type === 'reject'? 'Reject Transaction' : 'Return Transaction to Treasury Officer'
        }
        size="md"
        footer={
          <>
            <button
              onClick={() => { setActionModal(null); setComment(''); }}
              className="btn-secondary text-sm"
              disabled={actionLoading}
            >
              Cancel
            </button>
            <button
              onClick={() => handleAction(
                actionModal?.type === 'approve' ? 'APPROVED' :
                actionModal?.type === 'reject' ? 'REJECTED' : 'RETURNED'
              )}
              disabled={actionLoading}
              className={`text-sm gap-1.5 ${actionModal?.type === 'approve' ? 'btn-accent' : actionModal?.type === 'reject' ? 'btn-danger' : 'btn-secondary'}`}
            >
              {actionLoading ? (
                <><Loader2 size={13} className="animate-spin" /> Processing…</>
              ) : actionModal?.type === 'approve' ? (
                <><CheckCircle2 size={13} /> Approve & Forward</>
              ) : actionModal?.type === 'reject' ? (
                <><XCircle size={13} /> Confirm Rejection</>
              ) : (
                <><RotateCcw size={13} /> Return to Treasury Officer</>
              )}
            </button>
          </>
        }
      >
        {selectedTxn && actionModal && (
          <div className="space-y-4">
            {/* Transaction Summary */}
            <div className="bg-secondary rounded-xl px-4 py-3 space-y-1">
              <div className="flex items-center justify-between">
                <span className="font-mono text-xs font-bold text-accent">{selectedTxn.ref}</span>
                <StatusBadge status={selectedTxn.status} size="sm" />
              </div>
              <p className="text-sm font-semibold text-foreground">{selectedTxn.customerName}</p>
              <div className="flex gap-3 text-xs text-muted-foreground">
                <span>{selectedTxn.type}</span>
                <span className="font-bold tabular-nums text-foreground">{formatNaira(selectedTxn.principalAmt)}</span>
                <span>{selectedTxn.intRate}% · {selectedTxn.tenorDays}d</span>
              </div>
            </div>

            {/* Context-specific warning */}
            {actionModal.type === 'reject' && (
              <div className="flex items-start gap-2 bg-red-50 border border-red-200 rounded-xl px-3 py-2.5 text-xs text-red-700">
                <AlertCircle size={13} className="shrink-0 mt-0.5" />
                <span>Rejection will stop the transaction and notify the initiator. A comment explaining the reason is mandatory.</span>
              </div>
            )}
            {actionModal.type === 'return' && (
              <div className="flex items-start gap-2 bg-amber-50 border border-amber-200 rounded-xl px-3 py-2.5 text-xs text-amber-700">
                <AlertCircle size={13} className="shrink-0 mt-0.5" />
                <span>Returning will reset the approval chain to Level 1 (Treasury Officer) for correction and re-submission.</span>
              </div>
            )}
            {actionModal.type === 'approve' && (
              <div className="flex items-start gap-2 bg-green-50 border border-green-200 rounded-xl px-3 py-2.5 text-xs text-green-700">
                <CheckCircle2 size={13} className="shrink-0 mt-0.5" />
                <span>
                  {approvalLevel === 'MD' ?'This is the final approval level. Approving will route the transaction to Operations for execution.'
                    : `Approving will forward the transaction to the next approval level.`}
                </span>
              </div>
            )}

            {/* Comment */}
            <div>
              <label className="label-text">
                Comment {actionModal.type === 'reject' ? <span className="text-red-500">*</span> : '(Optional)'}
              </label>
              <p className="text-[10px] text-muted-foreground mb-1">
                {actionModal.type === 'reject' ? 'Explain why this transaction is being rejected.' : 'Add any notes for the next approver or initiator.'}
              </p>
              <textarea
                rows={3}
                value={comment}
                onChange={(e) => setComment(e.target.value)}
                placeholder={
                  actionModal.type === 'reject' ? 'Mandate signature mismatch — requires re-verification…' :
                  actionModal.type === 'return' ? 'CBS reference appears incorrect — please re-verify…' :
                  'Rate confirmed with market desk. Proceeding…'
                }
                className="input-field resize-none"
              />
            </div>
          </div>
        )}
      </Modal>
    </AppLayout>
  );
}