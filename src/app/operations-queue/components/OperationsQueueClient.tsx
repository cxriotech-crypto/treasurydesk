'use client';
import React, { useState, useEffect, useCallback } from 'react';
import AppLayout from '@/components/AppLayout';
import StatusBadge from '@/components/ui/StatusBadge';
import Drawer from '@/components/ui/Drawer';
import Modal from '@/components/ui/Modal';
import { Skeleton } from '@/components/ui/LoadingSkeleton';
import EmptyState from '@/components/ui/EmptyState';
import { transactionService } from '@/services/transactionService';
import { getSession } from '@/services/userService';
import type { TreasuryTxn } from '@/types';
import { TXN_TYPE_LABELS } from '@/types';
import { formatNaira, formatNairaCompact, formatDate, formatDateTime, todayLagos } from '@/lib/format';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Zap, CheckCircle2, AlertCircle, Loader2, ChevronRight, RefreshCw, Check } from 'lucide-react';
import { toast } from 'sonner';
import Stepper from '@/components/ui/Stepper';
import { APPROVAL_LEVEL_LABELS } from '@/types';

const executionSchema = z.object({
  executionRef: z.string().min(5, 'Enter NIBSS/RTGS reference (min 5 chars)'),
  cbsPostingRef: z.string().min(5, 'Enter Eazybankz posting reference'),
  valueDate: z.string().min(1, 'Value date is required'),
  channel: z.enum(['NIBSS_NEFT', 'NIBSS_NIP', 'RTGS', 'INTERNAL'] as const),
  executionNotes: z.string().min(5, 'Add execution notes (min 5 chars)'),
});
type ExecutionForm = z.infer<typeof executionSchema>;

export default function OperationsQueueClient() {
  const session = getSession();
  const [queue, setQueue] = useState<TreasuryTxn[]>([]);
  const [executedTxns, setExecutedTxns] = useState<TreasuryTxn[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedTxn, setSelectedTxn] = useState<TreasuryTxn | null>(null);
  const [showExecuteDrawer, setShowExecuteDrawer] = useState(false);
  const [confirmModal, setConfirmModal] = useState<TreasuryTxn | null>(null);
  const [executing, setExecuting] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [activeTab, setActiveTab] = useState<'queue' | 'executed'>('queue');

  const form = useForm<ExecutionForm>({
    resolver: zodResolver(executionSchema),
    defaultValues: { channel: 'NIBSS_NEFT', valueDate: todayLagos() },
  });

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const { items } = await transactionService.list({ pageSize: 9999 });
      setQueue(items.filter((t) => t.status === 'PENDING_OPS'));
      setExecutedTxns(items.filter((t) => t.status === 'EXECUTED' || t.status === 'CONFIRMED'));
    } catch {
      setError('Failed to load operations queue. Check your connection and try again.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  async function handleExecute(data: ExecutionForm) {
    if (!selectedTxn || !session) return;
    setExecuting(true);
    try {
      const updated = await transactionService.execute(
        selectedTxn.id,
        `${data.executionRef} [${data.channel}] CBS:${data.cbsPostingRef}`,
        data.executionNotes,
        session.user.id,
        session.user.name
      );
      setQueue((prev) => prev.filter((t) => t.id !== updated.id));
      setExecutedTxns((prev) => [updated, ...prev]);
      setShowExecuteDrawer(false);
      setSelectedTxn(null);
      form.reset();
      toast.success(`${selectedTxn.ref} executed successfully via ${data.channel}.`);
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : 'Execution failed. Please try again.');
    } finally {
      setExecuting(false);
    }
  }

  async function handleConfirm() {
    if (!confirmModal) return;
    setConfirming(true);
    try {
      const updated = await transactionService.confirm(confirmModal.id);
      setExecutedTxns((prev) => prev.map((t) => t.id === updated.id ? updated : t));
      setConfirmModal(null);
      toast.success(`${confirmModal.ref} confirmed. Treasury cycle complete.`);
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : 'Confirmation failed. Please try again.');
    } finally {
      setConfirming(false);
    }
  }

  function getApprovalSteps(txn: TreasuryTxn) {
    return txn.approvals.map((a) => ({
      id: `ops-step-${a.id}`,
      label: APPROVAL_LEVEL_LABELS[a.level],
      description: a.action ? `${a.action} — ${a.approver}` : 'Completed',
      status: (a.status === 'APPROVED' ? 'completed' : a.status === 'REJECTED' ? 'error' : 'pending') as 'completed' | 'current' | 'pending' | 'error',
    }));
  }

  const CHANNEL_LABELS: Record<string, string> = {
    NIBSS_NEFT: 'NIBSS NEFT',
    NIBSS_NIP: 'NIBSS NIP',
    RTGS: 'RTGS',
    INTERNAL: 'Internal Transfer',
  };

  const displayList = activeTab === 'queue' ? queue : executedTxns;

  return (
    <AppLayout allowedRoles={['OPERATIONS', 'SYSTEM_ADMIN', 'HEAD_TREASURY', 'MANAGING_DIRECTOR']}>
      <div className="flex items-start justify-between mb-6 gap-4 flex-wrap">
        <div>
          <h1 className="page-title">Operations Queue</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Execute approved transactions and record confirmation
          </p>
        </div>
        <div className="flex items-center gap-2">
          {queue.length > 0 && (
            <div className="flex items-center gap-2 px-3 py-2 rounded-xl bg-orange-50 border border-orange-200">
              <Zap size={14} className="text-orange-600" />
              <span className="text-xs font-semibold text-orange-700">{queue.length} transaction{queue.length > 1 ? 's' : ''} awaiting execution</span>
            </div>
          )}
          <button onClick={fetchData} disabled={loading} className="btn-secondary text-xs gap-1.5">
            <RefreshCw size={12} className={loading ? 'animate-spin' : ''} />
            Refresh
          </button>
        </div>
      </div>

      {error && (
        <div className="flex items-center gap-3 px-4 py-3 rounded-xl border bg-red-50 border-red-200 mb-4">
          <AlertCircle size={16} className="text-red-600" />
          <p className="text-sm text-red-700">{error}</p>
          <button onClick={fetchData} className="ml-auto btn-secondary text-xs">Retry</button>
        </div>
      )}

      {/* Tabs */}
      <div className="flex gap-1 mb-4 bg-secondary rounded-xl p-1 w-fit">
        {[
          { id: 'queue' as const, label: 'Pending Execution', count: queue.length },
          { id: 'executed' as const, label: 'Executed / Confirmed', count: executedTxns.length },
        ].map((tab) => (
          <button
            key={`ops-tab-${tab.id}`}
            onClick={() => { setActiveTab(tab.id); setSelectedTxn(null); }}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all
              ${activeTab === tab.id ? 'bg-card shadow-sm text-foreground' : 'text-muted-foreground hover:text-foreground'}`}
          >
            {tab.label}
            {tab.count > 0 && (
              <span className={`min-w-[20px] h-5 rounded-full text-[10px] font-bold flex items-center justify-center px-1
                ${activeTab === tab.id
                  ? tab.id === 'queue' ? 'bg-orange-100 text-orange-700' : 'bg-green-100 text-green-700' :'bg-muted text-muted-foreground'}`}>
                {tab.count}
              </span>
            )}
          </button>
        ))}
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-5 2xl:grid-cols-5 gap-4">
        {/* Left: Queue List */}
        <div className="xl:col-span-2 card overflow-hidden flex flex-col" style={{ maxHeight: 'calc(100vh - 300px)' }}>
          <div className="px-4 py-3 border-b border-border bg-secondary/50 shrink-0">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
              {activeTab === 'queue' ? 'Awaiting Execution' : 'Executed / Confirmed'} ({displayList.length})
            </p>
          </div>
          <div className="flex-1 overflow-y-auto scrollbar-thin">
            {loading ? (
              <div className="p-3 space-y-2">
                {Array.from({ length: 4 }).map((_, i) => <Skeleton key={`ops-skel-${i}`} className="h-24 w-full" />)}
              </div>
            ) : displayList.length === 0 ? (
              <EmptyState
                icon={<Zap size={24} />}
                title={activeTab === 'queue' ? 'No transactions pending execution' : 'No executed transactions today'}
                description={activeTab === 'queue' ? 'All approved transactions have been executed.' : undefined}
              />
            ) : (
              displayList.map((txn) => (
                <div
                  key={`ops-item-${txn.id}`}
                  onClick={() => setSelectedTxn(txn)}
                  className={`px-4 py-3 border-b border-border cursor-pointer transition-colors
                    ${selectedTxn?.id === txn.id ? 'bg-accent/10 border-l-2 border-l-accent' : 'hover:bg-muted/40'}`}
                >
                  <div className="flex items-start justify-between gap-2 mb-1">
                    <span className="font-mono text-xs text-accent font-semibold">{txn.ref}</span>
                    <StatusBadge status={txn.status} size="sm" />
                  </div>
                  <p className="text-xs font-semibold text-foreground truncate mb-1">{txn.customerName}</p>
                  <div className="flex items-center gap-2 text-[10px] text-muted-foreground mb-1">
                    <span className="px-1.5 py-0.5 rounded bg-primary/10 text-primary font-semibold">{txn.type}</span>
                    <span className="tabular-nums font-bold text-foreground">{formatNairaCompact(txn.principalAmt)}</span>
                    <span>{txn.intRate}% · {txn.tenorDays}d</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] text-muted-foreground">Maturity: {formatDate(txn.maturityDate)}</span>
                    {txn.status === 'PENDING_OPS' && (
                      <button
                        onClick={(e) => { e.stopPropagation(); setSelectedTxn(txn); setShowExecuteDrawer(true); }}
                        className="text-[10px] font-semibold text-accent flex items-center gap-0.5 hover:underline"
                      >
                        Execute <ChevronRight size={10} />
                      </button>
                    )}
                    {txn.status === 'EXECUTED' && (
                      <button
                        onClick={(e) => { e.stopPropagation(); setConfirmModal(txn); }}
                        className="text-[10px] font-semibold text-green-600 flex items-center gap-0.5 hover:underline"
                      >
                        Confirm <ChevronRight size={10} />
                      </button>
                    )}
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Right: Detail Panel */}
        <div className="xl:col-span-3 card flex flex-col overflow-hidden" style={{ maxHeight: 'calc(100vh - 300px)' }}>
          {!selectedTxn ? (
            <div className="flex-1 flex items-center justify-center">
              <EmptyState
                icon={<Zap size={24} />}
                title="Select a transaction"
                description="Click a transaction to view details and execute."
              />
            </div>
          ) : (
            <>
              <div className="px-5 py-4 border-b border-border bg-secondary/30 shrink-0">
                <div className="flex items-center justify-between gap-3 flex-wrap">
                  <div>
                    <div className="flex items-center gap-2 mb-1">
                      <span className="font-mono text-sm font-bold text-accent">{selectedTxn.ref}</span>
                      <StatusBadge status={selectedTxn.status} />
                    </div>
                    <p className="text-base font-bold text-foreground">{selectedTxn.customerName}</p>
                    <p className="text-xs text-muted-foreground">{selectedTxn.customerCif} · Acc: {selectedTxn.accountNumber}</p>
                  </div>
                  <div className="flex gap-2">
                    {selectedTxn.status === 'PENDING_OPS' && (
                      <button
                        onClick={() => setShowExecuteDrawer(true)}
                        className="btn-accent text-xs gap-1.5"
                      >
                        <Zap size={12} /> Execute Transaction
                      </button>
                    )}
                    {selectedTxn.status === 'EXECUTED' && (
                      <button
                        onClick={() => setConfirmModal(selectedTxn)}
                        className="btn-accent text-xs gap-1.5"
                      >
                        <Check size={12} /> Mark Confirmed
                      </button>
                    )}
                    {selectedTxn.status === 'CONFIRMED' && (
                      <div className="flex items-center gap-2 px-3 py-2 rounded-xl bg-green-50 border border-green-200">
                        <CheckCircle2 size={13} className="text-green-600" />
                        <span className="text-xs font-semibold text-green-700">Confirmed at {formatDateTime(selectedTxn.confirmedAt)}</span>
                      </div>
                    )}
                  </div>
                </div>
              </div>

              <div className="flex-1 overflow-y-auto scrollbar-thin px-5 py-4 space-y-5">
                {/* Instrument & Voucher */}
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-xs px-2 py-0.5 rounded-full bg-primary/10 text-primary font-semibold">
                    {selectedTxn.type} — {TXN_TYPE_LABELS[selectedTxn.type]}
                  </span>
                  {selectedTxn.voucherNo && (
                    <span className="text-xs px-2 py-0.5 rounded-full bg-teal-100 text-teal-700 font-mono font-semibold">{selectedTxn.voucherNo}</span>
                  )}
                  {selectedTxn.cbsRef && (
                    <span className="text-xs px-2 py-0.5 rounded-full bg-blue-100 text-blue-700 font-mono font-semibold">{selectedTxn.cbsRef}</span>
                  )}
                </div>

                {/* Financial Summary Grid */}
                <div className="grid grid-cols-2 gap-3">
                  {[
                    { label: 'Principal', value: formatNaira(selectedTxn.principalAmt), big: true },
                    { label: 'Total Payout', value: formatNaira(selectedTxn.totalPayout), big: true },
                    { label: 'Annual Rate', value: `${selectedTxn.intRate}%` },
                    { label: 'Tenor', value: `${selectedTxn.tenorDays} days` },
                    { label: 'Effective Date', value: formatDate(selectedTxn.effectiveDate) },
                    { label: 'Maturity Date', value: formatDate(selectedTxn.maturityDate) },
                    { label: 'Net Interest', value: formatNaira(selectedTxn.netInterest) },
                    { label: 'WHT (10%)', value: `(${formatNaira(selectedTxn.withholdingTax)})`, danger: true },
                  ].map(({ label, value, big, danger }) => (
                    <div key={`ops-detail-${label}`} className="bg-secondary/50 rounded-xl px-3 py-2.5">
                      <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide mb-0.5">{label}</p>
                      <p className={`font-bold tabular-nums ${big ? 'text-base text-primary' : 'text-sm'} ${danger ? 'text-red-600' : 'text-foreground'}`}>{value}</p>
                    </div>
                  ))}
                </div>

                {/* Execution Details (if executed) */}
                {selectedTxn.executionRef && (
                  <div className="bg-teal-50 border border-teal-200 rounded-xl p-4 space-y-2">
                    <p className="text-xs font-semibold text-teal-800 uppercase tracking-wide mb-2">Execution Record</p>
                    {[
                      ['Execution Ref', selectedTxn.executionRef],
                      ['Executed By', selectedTxn.executedBy ?? '—'],
                      ['Executed At', formatDateTime(selectedTxn.executedAt)],
                      ['Notes', selectedTxn.executionNotes ?? '—'],
                    ].map(([k, v]) => (
                      <div key={`exec-rec-${k}`} className="flex justify-between text-xs">
                        <span className="text-teal-700">{k}</span>
                        <span className="font-semibold text-teal-900 text-right max-w-[200px] truncate">{v}</span>
                      </div>
                    ))}
                  </div>
                )}

                {/* 5-Level Approval Summary */}
                <div>
                  <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-3">Approval Chain (All 5 Levels Cleared)</p>
                  <Stepper steps={getApprovalSteps(selectedTxn)} orientation="vertical" />
                </div>

                <div className="text-xs text-muted-foreground pt-2 border-t border-border">
                  <p>Initiated by <span className="font-semibold text-foreground">{selectedTxn.initiatedBy}</span> · {formatDateTime(selectedTxn.initiatedAt)}</p>
                </div>
              </div>
            </>
          )}
        </div>
      </div>

      {/* Execution Drawer */}
      <Drawer
        open={showExecuteDrawer}
        onClose={() => { setShowExecuteDrawer(false); form.reset(); }}
        title={`Execute — ${selectedTxn?.ref ?? ''}`}
        subtitle={selectedTxn?.customerName}
        width="w-[520px]"
        footer={
          <>
            <button onClick={() => { setShowExecuteDrawer(false); form.reset(); }} className="btn-secondary text-sm" disabled={executing}>
              Cancel
            </button>
            <button
              onClick={form.handleSubmit(handleExecute)}
              disabled={executing}
              className="btn-accent text-sm gap-1.5"
            >
              {executing ? <><Loader2 size={13} className="animate-spin" /> Processing…</> : <><Zap size={13} /> Confirm Execution</>}
            </button>
          </>
        }
      >
        {selectedTxn && (
          <div className="space-y-5">
            {/* Transaction Summary */}
            <div className="bg-secondary rounded-xl px-4 py-3 space-y-2">
              <div className="flex items-center justify-between">
                <span className="font-mono text-xs font-bold text-accent">{selectedTxn.ref}</span>
                <span className="text-xs px-2 py-0.5 rounded-full bg-primary/10 text-primary font-semibold">{selectedTxn.type}</span>
              </div>
              <p className="text-sm font-bold text-foreground">{selectedTxn.customerName}</p>
              <div className="flex gap-3 text-xs">
                <span className="text-muted-foreground">Principal:</span>
                <span className="font-bold tabular-nums text-foreground">{formatNaira(selectedTxn.principalAmt)}</span>
              </div>
              <div className="flex gap-3 text-xs">
                <span className="text-muted-foreground">Total Payout:</span>
                <span className="font-bold tabular-nums text-accent">{formatNaira(selectedTxn.totalPayout)}</span>
              </div>
            </div>

            <div className="bg-amber-50 border border-amber-200 rounded-xl px-3 py-2.5 text-xs text-amber-800 flex items-start gap-2">
              <AlertCircle size={13} className="shrink-0 mt-0.5" />
              <span>Ensure all posting references are captured accurately. This action cannot be undone without a reversal instruction.</span>
            </div>

            {/* Execution Form */}
            <div>
              <label className="label-text">Payment Channel</label>
              <select className="input-field" {...form.register('channel')}>
                {Object.entries(CHANNEL_LABELS).map(([k, v]) => (
                  <option key={`channel-${k}`} value={k}>{v}</option>
                ))}
              </select>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="label-text">NIBSS / RTGS Reference</label>
                <p className="text-[10px] text-muted-foreground mb-1">From payment platform</p>
                <input
                  type="text"
                  placeholder="NIBSS-2026-XXXXXX"
                  className={`input-field ${form.formState.errors.executionRef ? 'border-red-400' : ''}`}
                  {...form.register('executionRef')}
                />
                {form.formState.errors.executionRef && (
                  <p className="text-red-600 text-xs mt-1">{form.formState.errors.executionRef.message}</p>
                )}
              </div>
              <div>
                <label className="label-text">Eazybankz Posting Ref</label>
                <p className="text-[10px] text-muted-foreground mb-1">CBS posting reference</p>
                <input
                  type="text"
                  placeholder="EZB-POST-XXXXXX"
                  className={`input-field ${form.formState.errors.cbsPostingRef ? 'border-red-400' : ''}`}
                  {...form.register('cbsPostingRef')}
                />
                {form.formState.errors.cbsPostingRef && (
                  <p className="text-red-600 text-xs mt-1">{form.formState.errors.cbsPostingRef.message}</p>
                )}
              </div>
            </div>

            <div>
              <label className="label-text">Value Date</label>
              <input
                type="date"
                className={`input-field ${form.formState.errors.valueDate ? 'border-red-400' : ''}`}
                {...form.register('valueDate')}
              />
              {form.formState.errors.valueDate && (
                <p className="text-red-600 text-xs mt-1">{form.formState.errors.valueDate.message}</p>
              )}
            </div>

            <div>
              <label className="label-text">Execution Notes</label>
              <p className="text-[10px] text-muted-foreground mb-1">Record any relevant execution details</p>
              <textarea
                rows={3}
                placeholder="Processed via NIBSS NEFT. Funds credited to customer account…"
                className={`input-field resize-none ${form.formState.errors.executionNotes ? 'border-red-400' : ''}`}
                {...form.register('executionNotes')}
              />
              {form.formState.errors.executionNotes && (
                <p className="text-red-600 text-xs mt-1">{form.formState.errors.executionNotes.message}</p>
              )}
            </div>

            {/* Checklist */}
            <div className="border border-border rounded-xl p-3 space-y-2">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Pre-Execution Checklist</p>
              {[
                'Payment channel confirmed and available',
                'Beneficiary account details verified',
                'Amount matches approved voucher figure',
                'Value date is a valid business day',
              ].map((item, i) => (
                <label key={`checklist-exec-${i}`} className="flex items-center gap-2 cursor-pointer">
                  <input type="checkbox" className="rounded border-border accent-accent" />
                  <span className="text-xs text-foreground">{item}</span>
                </label>
              ))}
            </div>
          </div>
        )}
      </Drawer>

      {/* Confirmation Modal */}
      <Modal
        open={!!confirmModal}
        onClose={() => setConfirmModal(null)}
        title="Confirm Treasury Transaction"
        size="md"
        footer={
          <>
            <button onClick={() => setConfirmModal(null)} className="btn-secondary text-sm" disabled={confirming}>
              Cancel
            </button>
            <button onClick={handleConfirm} disabled={confirming} className="btn-accent text-sm gap-1.5">
              {confirming ? <><Loader2 size={13} className="animate-spin" /> Confirming…</> : <><CheckCircle2 size={13} /> Mark as Confirmed</>}
            </button>
          </>
        }
      >
        {confirmModal && (
          <div className="space-y-4">
            <div className="bg-secondary rounded-xl px-4 py-3 space-y-1.5">
              <div className="flex items-center justify-between">
                <span className="font-mono text-xs font-bold text-accent">{confirmModal.ref}</span>
                <StatusBadge status={confirmModal.status} size="sm" />
              </div>
              <p className="text-sm font-semibold text-foreground">{confirmModal.customerName}</p>
              <div className="flex gap-3 text-xs">
                <span className="text-muted-foreground">Principal:</span>
                <span className="font-bold tabular-nums">{formatNaira(confirmModal.principalAmt)}</span>
              </div>
              {confirmModal.executionRef && (
                <div className="flex gap-3 text-xs">
                  <span className="text-muted-foreground">Execution Ref:</span>
                  <span className="font-mono font-semibold">{confirmModal.executionRef}</span>
                </div>
              )}
            </div>
            <div className="flex items-start gap-2 bg-green-50 border border-green-200 rounded-xl px-3 py-2.5 text-xs text-green-700">
              <CheckCircle2 size={13} className="shrink-0 mt-0.5" />
              <span>
                Marking as Confirmed closes the treasury cycle for this transaction. Ensure the customer has received the funds and the CBS posting is final.
              </span>
            </div>
          </div>
        )}
      </Modal>
    </AppLayout>
  );
}