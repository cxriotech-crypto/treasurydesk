'use client';
import React, { useState, useEffect, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { ArrowLeft, TrendingUp, Clock, CheckCircle, AlertCircle, Info, Scissors, RotateCcw, Gift, Send } from 'lucide-react';
import { investmentService } from '@/services/investmentService';
import { transactionService } from '@/services/transactionService';
import { accruedInterest, daysBetween, maturityPayout, anniversary } from '@/lib/calc';
import { formatNaira, formatDate, formatRate, todayLagos } from '@/lib/format';
import StatusBadge from '@/components/ui/StatusBadge';
import { Skeleton } from '@/components/ui/LoadingSkeleton';
import type { Investment, TreasuryTxn } from '@/types';
import Decimal from 'decimal.js';
import Icon from '@/components/ui/AppIcon';


interface AnniversaryEntry {
  periodNo: number;
  dueDate: string;
  periodInterest: string;
  wht: string;
  net: string;
  status: 'PAID' | 'DUE' | 'UPCOMING';
}

function buildAnniversarySchedule(inv: Investment, today: string): AnniversaryEntry[] {
  if (!inv.anniversaryFrequencyDays) return [];
  const freq = inv.anniversaryFrequencyDays;
  const entries: AnniversaryEntry[] = [];
  let periodStart = inv.effectiveDate;
  let periodNo = 1;
  while (true) {
    const dueDate = addDays(periodStart, freq);
    if (dueDate > inv.maturityDate) break;
    const result = anniversary({ principalAmt: inv.principalAmt, intRate: inv.intRate, effectiveDate: periodStart }, freq);
    const status: AnniversaryEntry['status'] =
      dueDate < today ? 'PAID' : dueDate === today ? 'DUE' : 'UPCOMING';
    entries.push({
      periodNo,
      dueDate,
      periodInterest: result.periodInterest,
      wht: result.wht,
      net: result.net,
      status,
    });
    periodStart = dueDate;
    periodNo++;
    if (periodNo > 50) break; // safety cap
  }
  return entries;
}

function addDays(dateStr: string, days: number): string {
  const [y, m, d] = dateStr.split('-').map(Number);
  const date = new Date(y, m - 1, d);
  date.setDate(date.getDate() + days);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

interface ActionButton {
  id: string;
  label: string;
  icon: React.ElementType;
  txnType: string;
  disabled: boolean;
  disabledReason?: string;
  variant: 'primary' | 'secondary' | 'danger' | 'warning';
}

function getActionButtons(inv: Investment, today: string): ActionButton[] {
  const isActive = inv.status === 'ACTIVE';
  const isMatured = inv.status === 'MATURED' || inv.status === 'AWAITING_INSTRUCTION';
  const dtm = daysBetween(today, inv.maturityDate);
  const hasAnniversary = !!inv.anniversaryFrequencyDays;

  return [
    {
      id: 'terminate',
      label: 'Terminate at Maturity',
      icon: CheckCircle,
      txnType: 'MATURITY',
      disabled: !isMatured,
      disabledReason: !isMatured ? `Investment matures on ${formatDate(inv.maturityDate)} (${dtm} days remaining)` : undefined,
      variant: 'primary',
    },
    {
      id: 'preliq',
      label: 'Pre-Liquidate',
      icon: Scissors,
      txnType: 'PRELIQ',
      disabled: !isActive,
      disabledReason: !isActive ? `Pre-liquidation only available for active investments (current status: ${inv.status})` : undefined,
      variant: 'danger',
    },
    {
      id: 'rollover',
      label: 'Roll Over',
      icon: RotateCcw,
      txnType: 'ROLLOVER',
      disabled: !isMatured,
      disabledReason: !isMatured ? `Rollover available only at or after maturity (${dtm} days remaining)` : undefined,
      variant: 'secondary',
    },
    {
      id: 'anniversary',
      label: 'Pay Anniversary Interest',
      icon: Gift,
      txnType: 'ANNIVERSARY',
      disabled: !isActive || !hasAnniversary,
      disabledReason: !hasAnniversary ? 'No anniversary frequency set for this investment' : !isActive ? 'Investment is not active' : undefined,
      variant: 'warning',
    },
    {
      id: 'thirdparty',
      label: 'Third-Party Payment',
      icon: Send,
      txnType: 'THIRD_PARTY',
      disabled: !isActive && !isMatured,
      disabledReason: (!isActive && !isMatured) ? 'Investment must be active or matured for third-party payment' : undefined,
      variant: 'secondary',
    },
  ];
}

export default function InvestmentDetailClient() {
  const params = useParams();
  const router = useRouter();
  const today = todayLagos();
  const id = params?.id as string;

  const [inv, setInv] = useState<Investment | null>(null);
  const [txns, setTxns] = useState<TreasuryTxn[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'overview' | 'schedule' | 'transactions'>('overview');
  const [tooltip, setTooltip] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    setError(null);
    try {
      const [investment, txnResult] = await Promise.all([
        investmentService.getById(id),
        transactionService.list({ page: 1, pageSize: 50, filters: { investmentId: id } }),
      ]);
      if (!investment) { setError('Investment not found'); return; }
      setInv(investment);
      // Also fetch by customerId as fallback since investmentId may not be set on all txns
      const custTxns = await transactionService.list({ page: 1, pageSize: 50, filters: { customerId: investment.customerId } });
      setTxns(custTxns.items.slice(0, 10));
    } catch {
      setError('Failed to load investment details.');
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => { fetchData(); }, [fetchData]);

  if (loading) return (
    <div className="space-y-4">
      <Skeleton className="h-8 w-48" />
      <Skeleton className="h-48 w-full" />
      <Skeleton className="h-64 w-full" />
    </div>
  );

  if (error || !inv) return (
    <div className="flex flex-col items-center justify-center py-20 gap-4">
      <AlertCircle size={40} className="text-red-500" />
      <p className="text-sm text-muted-foreground">{error ?? 'Investment not found'}</p>
      <button onClick={() => router.back()} className="btn-secondary text-sm">Go Back</button>
    </div>
  );

  const accrued = accruedInterest(inv, today);
  const dtm = daysBetween(today, inv.maturityDate);
  const payout = maturityPayout({ principalAmt: inv.principalAmt, intRate: inv.intRate, tenorDays: inv.tenorDays });
  const totalDays = inv.tenorDays;
  const elapsedDays = daysBetween(inv.effectiveDate, today < inv.maturityDate ? today : inv.maturityDate);
  const progressPct = Math.min(100, Math.max(0, (elapsedDays / totalDays) * 100));
  const annSchedule = buildAnniversarySchedule(inv, today);
  const actions = getActionButtons(inv, today);

  function handleAction(action: ActionButton) {
    if (action.disabled) return;
    router.push(`/new-transaction?type=${action.txnType}&investmentId=${inv!.id}&customerId=${inv!.customerId}`);
  }

  return (
    <div className="flex flex-col gap-5">
      {/* Back + Title */}
      <div className="flex items-center gap-3">
        <button onClick={() => router.back()} className="p-1.5 rounded-lg hover:bg-muted transition-colors text-muted-foreground">
          <ArrowLeft size={16} />
        </button>
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-lg bg-accent/10 flex items-center justify-center">
            <TrendingUp size={16} className="text-accent" />
          </div>
          <div>
            <h1 className="text-base font-bold text-foreground leading-none">{inv.cbsRef}</h1>
            <p className="text-xs text-muted-foreground mt-0.5">{inv.customerName} · {inv.customerCif}</p>
          </div>
        </div>
        <div className="ml-auto">
          <StatusBadge status={inv.status} />
        </div>
      </div>

      {/* Header Card */}
      <div className="card rounded-xl border border-border p-5">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-5">
          <div>
            <p className="text-[10px] text-muted-foreground uppercase tracking-wide font-medium">Product</p>
            <p className="text-sm font-semibold text-foreground mt-0.5">{inv.product === 'TERM' ? 'Term Deposit' : inv.product === 'CP' ? 'Commercial Paper' : 'Call Placement'}</p>
          </div>
          <div>
            <p className="text-[10px] text-muted-foreground uppercase tracking-wide font-medium">Principal</p>
            <p className="text-sm font-bold text-foreground tabular-nums mt-0.5">{formatNaira(inv.principalAmt)}</p>
          </div>
          <div>
            <p className="text-[10px] text-muted-foreground uppercase tracking-wide font-medium">Interest Rate</p>
            <p className="text-sm font-semibold text-foreground tabular-nums mt-0.5">{formatRate(inv.intRate)} p.a.</p>
          </div>
          <div>
            <p className="text-[10px] text-muted-foreground uppercase tracking-wide font-medium">Tenor</p>
            <p className="text-sm font-semibold text-foreground mt-0.5">{inv.tenorDays} days</p>
          </div>
          <div>
            <p className="text-[10px] text-muted-foreground uppercase tracking-wide font-medium">Effective Date</p>
            <p className="text-sm font-semibold text-foreground mt-0.5">{formatDate(inv.effectiveDate)}</p>
          </div>
          <div>
            <p className="text-[10px] text-muted-foreground uppercase tracking-wide font-medium">Maturity Date</p>
            <p className={`text-sm font-semibold mt-0.5 ${dtm < 0 ? 'text-red-600' : dtm <= 7 ? 'text-amber-600' : 'text-foreground'}`}>{formatDate(inv.maturityDate)}</p>
          </div>
          <div>
            <p className="text-[10px] text-muted-foreground uppercase tracking-wide font-medium">Days to Maturity</p>
            <p className={`text-sm font-bold tabular-nums mt-0.5 ${dtm < 0 ? 'text-red-600' : dtm <= 7 ? 'text-amber-600' : 'text-foreground'}`}>
              {dtm < 0 ? `${Math.abs(dtm)}d overdue` : `${dtm}d`}
            </p>
          </div>
          <div>
            <p className="text-[10px] text-muted-foreground uppercase tracking-wide font-medium">NUBAN</p>
            <p className="text-sm font-mono text-foreground mt-0.5">{inv.nuban}</p>
          </div>
          <div>
            <p className="text-[10px] text-muted-foreground uppercase tracking-wide font-medium">Accrued Interest (Today)</p>
            <p className="text-sm font-bold text-teal-600 dark:text-teal-400 tabular-nums mt-0.5">{formatNaira(accrued)}</p>
          </div>
          <div>
            <p className="text-[10px] text-muted-foreground uppercase tracking-wide font-medium">Projected Maturity Value</p>
            <p className="text-sm font-bold text-foreground tabular-nums mt-0.5">{formatNaira(payout.net)}</p>
          </div>
          <div>
            <p className="text-[10px] text-muted-foreground uppercase tracking-wide font-medium">Gross Interest</p>
            <p className="text-sm font-semibold text-foreground tabular-nums mt-0.5">{formatNaira(payout.interest)}</p>
          </div>
          <div>
            <p className="text-[10px] text-muted-foreground uppercase tracking-wide font-medium">WHT</p>
            <p className="text-sm font-semibold text-foreground tabular-nums mt-0.5">{formatNaira(payout.wht)}</p>
          </div>
          {inv.anniversaryFrequencyDays && (
            <div>
              <p className="text-[10px] text-muted-foreground uppercase tracking-wide font-medium">Anniversary Freq.</p>
              <p className="text-sm font-semibold text-foreground mt-0.5">Every {inv.anniversaryFrequencyDays} days</p>
            </div>
          )}
          {inv.nextAnniversaryDate && (
            <div>
              <p className="text-[10px] text-muted-foreground uppercase tracking-wide font-medium">Next Anniversary</p>
              <p className="text-sm font-semibold text-amber-600 mt-0.5">{formatDate(inv.nextAnniversaryDate)}</p>
            </div>
          )}
        </div>

        {/* Accrual Progress Bar */}
        <div className="mt-2">
          <div className="flex items-center justify-between mb-1.5">
            <span className="text-[10px] text-muted-foreground font-medium">Accrual Progress</span>
            <span className="text-[10px] text-muted-foreground tabular-nums">{progressPct.toFixed(1)}% elapsed ({elapsedDays}/{totalDays} days)</span>
          </div>
          <div className="relative h-3 bg-muted rounded-full overflow-hidden">
            <div
              className="absolute left-0 top-0 h-full bg-gradient-to-r from-accent to-teal-400 rounded-full transition-all duration-500"
              style={{ width: `${progressPct}%` }}
            />
            {/* Today marker */}
            <div
              className="absolute top-0 h-full w-0.5 bg-amber-400"
              style={{ left: `${progressPct}%` }}
            />
          </div>
          <div className="flex justify-between mt-1">
            <span className="text-[9px] text-muted-foreground">{formatDate(inv.effectiveDate)}</span>
            <span className="text-[9px] text-amber-600 font-medium">Today</span>
            <span className="text-[9px] text-muted-foreground">{formatDate(inv.maturityDate)}</span>
          </div>
        </div>
      </div>

      {/* Action Buttons */}
      <div className="card rounded-xl border border-border p-4">
        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-3">Actions</p>
        <div className="flex flex-wrap gap-2">
          {actions.map((action) => {
            const Icon = action.icon;
            return (
              <div key={action.id} className="relative">
                <button
                  onClick={() => action.disabled ? setTooltip(tooltip === action.id ? null : action.id) : handleAction(action)}
                  className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium transition-all
                    ${action.disabled
                      ? 'opacity-40 cursor-not-allowed bg-muted text-muted-foreground border border-border'
                      : action.variant === 'primary' ? 'bg-accent text-white hover:bg-accent/90'
                      : action.variant === 'danger' ? 'bg-red-600 text-white hover:bg-red-700'
                      : action.variant === 'warning'? 'bg-amber-500 text-white hover:bg-amber-600' :'btn-secondary'
                    }`}
                >
                  <Icon size={13} />
                  {action.label}
                  {action.disabled && <Info size={11} className="ml-0.5" />}
                </button>
                {tooltip === action.id && action.disabledReason && (
                  <div className="absolute bottom-full left-0 mb-2 z-50 w-64 bg-foreground text-background text-[10px] rounded-lg px-3 py-2 shadow-lg">
                    {action.disabledReason}
                    <div className="absolute top-full left-4 w-0 h-0 border-l-4 border-r-4 border-t-4 border-transparent border-t-foreground" />
                  </div>
                )}
              </div>
            );
          })}
        </div>
        {tooltip && (
          <div className="fixed inset-0 z-40" onClick={() => setTooltip(null)} />
        )}
      </div>

      {/* Tabs */}
      <div className="card rounded-xl border border-border overflow-hidden">
        <div className="flex border-b border-border">
          {(['overview', 'schedule', 'transactions'] as const).map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`px-4 py-2.5 text-xs font-semibold capitalize transition-colors
                ${activeTab === tab ? 'border-b-2 border-accent text-accent' : 'text-muted-foreground hover:text-foreground'}`}
            >
              {tab === 'schedule' ? 'Anniversary Schedule' : tab === 'transactions' ? 'Linked Transactions' : 'Overview'}
              {tab === 'schedule' && annSchedule.length > 0 && (
                <span className="ml-1.5 px-1.5 py-0.5 rounded-full bg-accent/10 text-accent text-[9px]">{annSchedule.length}</span>
              )}
            </button>
          ))}
        </div>

        <div className="p-4">
          {activeTab === 'overview' && (
            <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
              <div className="p-3 rounded-lg bg-muted/30">
                <p className="text-[10px] text-muted-foreground uppercase tracking-wide font-medium">Outstanding Balance</p>
                <p className="text-base font-bold text-foreground tabular-nums mt-1">
                  {formatNaira(new Decimal(inv.principalAmt).plus(new Decimal(accrued)).toFixed(2))}
                </p>
              </div>
              <div className="p-3 rounded-lg bg-muted/30">
                <p className="text-[10px] text-muted-foreground uppercase tracking-wide font-medium">Net Maturity Value</p>
                <p className="text-base font-bold text-teal-600 dark:text-teal-400 tabular-nums mt-1">{formatNaira(payout.net)}</p>
              </div>
              <div className="p-3 rounded-lg bg-muted/30">
                <p className="text-[10px] text-muted-foreground uppercase tracking-wide font-medium">CBS Reference</p>
                <p className="text-sm font-mono text-foreground mt-1">{inv.cbsRef}</p>
              </div>
            </div>
          )}

          {activeTab === 'schedule' && (
            annSchedule.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground text-sm">
                No anniversary schedule — frequency not set for this investment.
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b border-border">
                      <th className="text-left py-2 px-3 text-muted-foreground font-semibold uppercase tracking-wide text-[10px]">#</th>
                      <th className="text-left py-2 px-3 text-muted-foreground font-semibold uppercase tracking-wide text-[10px]">Due Date</th>
                      <th className="text-right py-2 px-3 text-muted-foreground font-semibold uppercase tracking-wide text-[10px]">Period Interest</th>
                      <th className="text-right py-2 px-3 text-muted-foreground font-semibold uppercase tracking-wide text-[10px]">WHT</th>
                      <th className="text-right py-2 px-3 text-muted-foreground font-semibold uppercase tracking-wide text-[10px]">Net</th>
                      <th className="text-center py-2 px-3 text-muted-foreground font-semibold uppercase tracking-wide text-[10px]">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {annSchedule.map((entry) => (
                      <tr key={entry.periodNo} className={`border-b border-border/50 ${entry.periodNo % 2 === 0 ? 'bg-muted/20' : ''}`}>
                        <td className="py-2 px-3 text-muted-foreground">{entry.periodNo}</td>
                        <td className="py-2 px-3">{formatDate(entry.dueDate)}</td>
                        <td className="py-2 px-3 text-right tabular-nums">{formatNaira(entry.periodInterest)}</td>
                        <td className="py-2 px-3 text-right tabular-nums text-muted-foreground">{formatNaira(entry.wht)}</td>
                        <td className="py-2 px-3 text-right tabular-nums font-semibold">{formatNaira(entry.net)}</td>
                        <td className="py-2 px-3 text-center">
                          <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold
                            ${entry.status === 'PAID' ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400' :
                              entry.status === 'DUE'? 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400' : 'bg-muted text-muted-foreground'}`}>
                            {entry.status === 'PAID' ? <CheckCircle size={9} /> : entry.status === 'DUE' ? <AlertCircle size={9} /> : <Clock size={9} />}
                            {entry.status}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )
          )}

          {activeTab === 'transactions' && (
            txns.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground text-sm">No linked transactions found.</div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b border-border">
                      <th className="text-left py-2 px-3 text-muted-foreground font-semibold uppercase tracking-wide text-[10px]">Ref</th>
                      <th className="text-left py-2 px-3 text-muted-foreground font-semibold uppercase tracking-wide text-[10px]">Type</th>
                      <th className="text-right py-2 px-3 text-muted-foreground font-semibold uppercase tracking-wide text-[10px]">Principal</th>
                      <th className="text-left py-2 px-3 text-muted-foreground font-semibold uppercase tracking-wide text-[10px]">Date</th>
                      <th className="text-left py-2 px-3 text-muted-foreground font-semibold uppercase tracking-wide text-[10px]">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {txns.map((txn) => (
                      <tr key={txn.id} className="border-b border-border/50 hover:bg-muted/20 cursor-pointer" onClick={() => router.push(`/transactions`)}>
                        <td className="py-2 px-3 font-mono text-accent">{txn.ref}</td>
                        <td className="py-2 px-3">{txn.type}</td>
                        <td className="py-2 px-3 text-right tabular-nums">{formatNaira(txn.principalAmt)}</td>
                        <td className="py-2 px-3">{formatDate(txn.effectiveDate)}</td>
                        <td className="py-2 px-3"><StatusBadge status={txn.status} /></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )
          )}
        </div>
      </div>
    </div>
  );
}
