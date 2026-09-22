'use client';
import React, { useState, useEffect, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { ArrowLeft, Phone, Mail, Shield, CreditCard, History, PhoneCall, Plus, Edit2, Trash2, CheckCircle, AlertCircle, Loader2, Check } from 'lucide-react';
import { customerService, getBanks } from '@/services/customerService';
import { investmentService } from '@/services/investmentService';
import { transactionService } from '@/services/transactionService';
import { accruedInterest, daysBetween } from '@/lib/calc';
import { formatNaira, formatDate, formatDateTime, todayLagos, nowLagosISO } from '@/lib/format';
import StatusBadge from '@/components/ui/StatusBadge';
import { Skeleton } from '@/components/ui/LoadingSkeleton';
import Modal from '@/components/ui/Modal';
import type { Customer, Signatory, Mandate, Account, Beneficiary, CallbackLog, Investment, TreasuryTxn, Bank } from '@/types';
import { getSession } from '@/services/userService';
import Decimal from 'decimal.js';

type TabId = 'profile' | 'signatories' | 'accounts' | 'investments' | 'beneficiaries' | 'transactions' | 'callbacks';

const MANDATE_PLAIN: Record<string, string> = {
  SOLE: 'Any single signatory may authorise transactions independently.',
  ANY_TWO: 'Any two signatories must both sign to authorise a transaction.',
  A_AND_B: 'One Class A signatory and one Class B signatory must both sign.',
};

function nubanValid(v: string) {
  return /^\d{10}$/.test(v);
}

export default function CustomerDetailClient() {
  const params = useParams();
  const router = useRouter();
  const today = todayLagos();
  const id = params?.id as string;
  const session = getSession();
  const canEdit = session?.user?.role === 'SYSTEM_ADMIN' || session?.user?.role === 'TREASURY_OFFICER';

  const [customer, setCustomer] = useState<Customer | null>(null);
  const [signatories, setSignatories] = useState<Signatory[]>([]);
  const [mandate, setMandate] = useState<Mandate | null>(null);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [investments, setInvestments] = useState<Investment[]>([]);
  const [transactions, setTransactions] = useState<TreasuryTxn[]>([]);
  const [beneficiaries, setBeneficiaries] = useState<Beneficiary[]>([]);
  const [callbacks, setCallbacks] = useState<CallbackLog[]>([]);
  const [banks, setBanks] = useState<Bank[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<TabId>('profile');

  // Callback modal
  const [showCallbackModal, setShowCallbackModal] = useState(false);
  const [callbackNotes, setCallbackNotes] = useState('');
  const [callbackOutcome, setCallbackOutcome] = useState<'CONFIRMED' | 'NO_ANSWER' | 'DISPUTED' | 'RESCHEDULED'>('CONFIRMED');
  const [savingCallback, setSavingCallback] = useState(false);

  // Beneficiary modal
  const [showBenModal, setShowBenModal] = useState(false);
  const [editingBen, setEditingBen] = useState<Beneficiary | null>(null);
  const [benForm, setBenForm] = useState({ accountNumber: '', bankId: '', beneficiaryName: '', accountName: '' });
  const [benErrors, setBenErrors] = useState<Record<string, string>>({});
  const [enquiring, setEnquiring] = useState(false);
  const [savingBen, setSavingBen] = useState(false);
  const [deletingBenId, setDeletingBenId] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    setError(null);
    try {
      const [cust, sigs, mnd, accs, invs, txnRes, bens, cbs, bnks] = await Promise.all([
        customerService.getById(id),
        customerService.getSignatories(id),
        customerService.getMandate(id),
        customerService.getAccounts(id),
        investmentService.getByCustomerId(id),
        transactionService.list({ page: 1, pageSize: 20, filters: { customerId: id } }),
        customerService.getBeneficiaries(id),
        customerService.getCallbackLogs(id),
        getBanks(),
      ]);
      if (!cust) { setError('Customer not found'); return; }
      setCustomer(cust);
      setSignatories(sigs);
      setMandate(mnd);
      setAccounts(accs);
      setInvestments(invs);
      setTransactions(txnRes.items);
      setBeneficiaries(bens);
      setCallbacks(cbs);
      setBanks(bnks);
    } catch {
      setError('Failed to load customer details.');
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => { fetchData(); }, [fetchData]);

  async function handleSaveCallback() {
    if (!customer) return;
    setSavingCallback(true);
    try {
      const log = await customerService.addCallbackLog({
        txnId: '',
        customerId: customer.id,
        calledBy: session?.user?.name ?? 'Unknown',
        calledAt: nowLagosISO(),
        phoneUsed: customer.phone,
        outcome: callbackOutcome,
        notes: callbackNotes,
      });
      setCallbacks((prev) => [log, ...prev]);
      setShowCallbackModal(false);
      setCallbackNotes('');
    } finally {
      setSavingCallback(false);
    }
  }

  async function handleEnquire() {
    if (!nubanValid(benForm.accountNumber)) {
      setBenErrors((e) => ({ ...e, accountNumber: 'Must be exactly 10 digits' }));
      return;
    }
    if (!benForm.bankId) {
      setBenErrors((e) => ({ ...e, bankId: 'Select a bank' }));
      return;
    }
    setEnquiring(true);
    try {
      const name = await customerService.enquireAccountName(benForm.accountNumber, benForm.bankId);
      setBenForm((f) => ({ ...f, accountName: name }));
      setBenErrors((e) => ({ ...e, accountNumber: '', bankId: '' }));
    } finally {
      setEnquiring(false);
    }
  }

  function validateBenForm() {
    const errs: Record<string, string> = {};
    if (!nubanValid(benForm.accountNumber)) errs.accountNumber = 'Must be exactly 10 digits';
    if (!benForm.bankId) errs.bankId = 'Select a bank';
    if (!benForm.beneficiaryName.trim()) errs.beneficiaryName = 'Required';
    if (!benForm.accountName.trim()) errs.accountName = 'Run name enquiry first';
    setBenErrors(errs);
    return Object.keys(errs).length === 0;
  }

  async function handleSaveBen() {
    if (!validateBenForm() || !customer) return;
    setSavingBen(true);
    try {
      const bank = banks.find((b) => b.id === benForm.bankId);
      if (editingBen) {
        const updated = await customerService.updateBeneficiary(editingBen.id, {
          accountNumber: benForm.accountNumber,
          bankId: benForm.bankId,
          bankName: bank?.name ?? '',
          beneficiaryName: benForm.beneficiaryName,
          accountName: benForm.accountName,
        });
        setBeneficiaries((prev) => prev.map((b) => b.id === updated.id ? updated : b));
      } else {
        const newBen = await customerService.addBeneficiary({
          customerId: customer.id,
          customerName: customer.name,
          accountNumber: benForm.accountNumber,
          bankId: benForm.bankId,
          bankName: bank?.name ?? '',
          beneficiaryName: benForm.beneficiaryName,
          accountName: benForm.accountName,
          isActive: true,
        });
        setBeneficiaries((prev) => [newBen, ...prev]);
      }
      setShowBenModal(false);
      setEditingBen(null);
      setBenForm({ accountNumber: '', bankId: '', beneficiaryName: '', accountName: '' });
    } finally {
      setSavingBen(false);
    }
  }

  async function handleDeleteBen(benId: string) {
    setDeletingBenId(benId);
    try {
      await customerService.deleteBeneficiary(benId);
      setBeneficiaries((prev) => prev.filter((b) => b.id !== benId));
    } finally {
      setDeletingBenId(null);
    }
  }

  function openEditBen(ben: Beneficiary) {
    setEditingBen(ben);
    setBenForm({ accountNumber: ben.accountNumber, bankId: ben.bankId, beneficiaryName: ben.beneficiaryName, accountName: ben.accountName });
    setBenErrors({});
    setShowBenModal(true);
  }

  function openNewBen() {
    setEditingBen(null);
    setBenForm({ accountNumber: '', bankId: '', beneficiaryName: '', accountName: '' });
    setBenErrors({});
    setShowBenModal(true);
  }

  if (loading) return (
    <div className="space-y-4">
      <Skeleton className="h-8 w-48" />
      <Skeleton className="h-32 w-full" />
      <Skeleton className="h-64 w-full" />
    </div>
  );

  if (error || !customer) return (
    <div className="flex flex-col items-center justify-center py-20 gap-4">
      <AlertCircle size={40} className="text-red-500" />
      <p className="text-sm text-muted-foreground">{error ?? 'Customer not found'}</p>
      <button onClick={() => router.back()} className="btn-secondary text-sm">Go Back</button>
    </div>
  );

  const activeInvestments = investments.filter((i) => i.status === 'ACTIVE' || i.status === 'AWAITING_INSTRUCTION');
  const totalInvested = activeInvestments.reduce((s, i) => s.plus(new Decimal(i.principalAmt)), new Decimal(0)).toFixed(2);

  const tabs: { id: TabId; label: string; count?: number }[] = [
    { id: 'profile', label: 'Profile' },
    { id: 'signatories', label: 'Signatories & Mandate', count: signatories.length },
    { id: 'accounts', label: 'Accounts', count: accounts.length },
    { id: 'investments', label: 'Investments', count: activeInvestments.length },
    { id: 'beneficiaries', label: 'Beneficiaries', count: beneficiaries.length },
    { id: 'transactions', label: 'Transactions', count: transactions.length },
    { id: 'callbacks', label: 'Call-back History', count: callbacks.length },
  ];

  return (
    <div className="flex flex-col gap-5">
      {/* Back + Title */}
      <div className="flex items-center gap-3">
        <button onClick={() => router.back()} className="p-1.5 rounded-lg hover:bg-muted transition-colors text-muted-foreground">
          <ArrowLeft size={16} />
        </button>
        <div className="flex items-center gap-2.5">
          <div className="w-9 h-9 rounded-full bg-accent flex items-center justify-center text-white font-bold text-sm">
            {customer.name.split(' ').map((w) => w[0]).slice(0, 2).join('')}
          </div>
          <div>
            <h1 className="text-base font-bold text-foreground leading-none">{customer.name}</h1>
            <p className="text-xs text-muted-foreground mt-0.5">{customer.cif} · {customer.customerType === 'CORPORATE' ? 'Corporate' : 'Individual'}</p>
          </div>
        </div>
        <div className="ml-auto flex items-center gap-2">
          {customer.isWhtExempt && (
            <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400">WHT Exempt</span>
          )}
          {canEdit && (
            <button onClick={() => router.push(`/customers/${customer.id}/edit`)} className="btn-secondary text-xs flex items-center gap-1.5">
              <Edit2 size={12} /> Edit
            </button>
          )}
        </div>
      </div>

      {/* KPI Strip */}
      <div className="grid grid-cols-3 gap-3">
        <div className="card p-3 rounded-xl border border-border">
          <p className="text-[10px] text-muted-foreground uppercase tracking-wide font-medium">Active Investments</p>
          <p className="text-xl font-bold text-foreground tabular-nums mt-0.5">{activeInvestments.length}</p>
        </div>
        <div className="card p-3 rounded-xl border border-border">
          <p className="text-[10px] text-muted-foreground uppercase tracking-wide font-medium">Total Invested</p>
          <p className="text-xl font-bold text-foreground tabular-nums mt-0.5">{formatNaira(totalInvested)}</p>
        </div>
        <div className="card p-3 rounded-xl border border-border">
          <p className="text-[10px] text-muted-foreground uppercase tracking-wide font-medium">KYC Status</p>
          <p className={`text-sm font-bold mt-0.5 ${customer.kycStatus === 'VERIFIED' ? 'text-green-600' : customer.kycStatus === 'PENDING' ? 'text-amber-600' : 'text-red-600'}`}>
            {customer.kycStatus}
          </p>
        </div>
      </div>

      {/* Tabs */}
      <div className="card rounded-xl border border-border overflow-hidden">
        <div className="flex border-b border-border overflow-x-auto scrollbar-thin">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`px-4 py-2.5 text-xs font-semibold whitespace-nowrap transition-colors flex items-center gap-1.5
                ${activeTab === tab.id ? 'border-b-2 border-accent text-accent' : 'text-muted-foreground hover:text-foreground'}`}
            >
              {tab.label}
              {tab.count !== undefined && tab.count > 0 && (
                <span className="px-1.5 py-0.5 rounded-full bg-accent/10 text-accent text-[9px] font-bold">{tab.count}</span>
              )}
            </button>
          ))}
        </div>

        <div className="p-5">
          {/* PROFILE TAB */}
          {activeTab === 'profile' && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="space-y-4">
                <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Contact Information</h3>
                <div className="space-y-3">
                  <div className="flex items-center gap-3 p-3 rounded-lg bg-muted/30">
                    <Phone size={15} className="text-accent shrink-0" />
                    <div className="flex-1">
                      <p className="text-[10px] text-muted-foreground">Phone</p>
                      <p className="text-sm font-semibold text-foreground">{customer.phone}</p>
                    </div>
                    <button
                      onClick={() => setShowCallbackModal(true)}
                      className="btn-primary text-xs flex items-center gap-1.5 py-1.5"
                    >
                      <PhoneCall size={11} /> Call
                    </button>
                  </div>
                  <div className="flex items-center gap-3 p-3 rounded-lg bg-muted/30">
                    <Mail size={15} className="text-accent shrink-0" />
                    <div>
                      <p className="text-[10px] text-muted-foreground">Email</p>
                      <p className="text-sm font-semibold text-foreground">{customer.email}</p>
                    </div>
                  </div>
                </div>
              </div>
              <div className="space-y-4">
                <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Registration Details</h3>
                <div className="grid grid-cols-2 gap-3">
                  {[
                    { label: 'CIF', value: customer.cif },
                    { label: 'Type', value: customer.customerType },
                    { label: 'Account Officer', value: customer.accountOfficerName },
                    { label: 'BVN', value: customer.bvn },
                    { label: 'Member Since', value: formatDate(customer.createdAt.slice(0, 10)) },
                    { label: 'WHT Exempt', value: customer.isWhtExempt ? 'Yes' : 'No' },
                  ].map((item) => (
                    <div key={item.label} className="p-2.5 rounded-lg bg-muted/30">
                      <p className="text-[10px] text-muted-foreground">{item.label}</p>
                      <p className="text-xs font-semibold text-foreground mt-0.5">{item.value}</p>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* SIGNATORIES & MANDATE TAB */}
          {activeTab === 'signatories' && (
            <div className="space-y-5">
              {mandate && (
                <div className="p-4 rounded-xl bg-accent/5 border border-accent/20">
                  <div className="flex items-center gap-2 mb-2">
                    <Shield size={14} className="text-accent" />
                    <span className="text-xs font-bold text-accent uppercase tracking-wide">Mandate Rule: {mandate.rule}</span>
                  </div>
                  <p className="text-sm text-foreground font-medium">{MANDATE_PLAIN[mandate.rule] ?? mandate.description}</p>
                </div>
              )}
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {signatories.map((sig) => (
                  <div key={sig.id} className="card border border-border rounded-xl p-4">
                    <div className="flex items-center justify-between mb-3">
                      <div>
                        <p className="text-xs font-semibold text-foreground">{sig.name}</p>
                        <span className={`inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold mt-1
                          ${sig.signatoryClass === 'A' ? 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400' : 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400'}`}>
                          Class {sig.signatoryClass}
                        </span>
                      </div>
                    </div>
                    {/* Specimen Signature */}
                    <div className="border border-border rounded-lg p-2 bg-white dark:bg-gray-900">
                      <p className="text-[9px] text-muted-foreground mb-1 uppercase tracking-wide">Specimen Signature</p>
                      <div
                        className="w-full"
                        dangerouslySetInnerHTML={{ __html: sig.specimenSvg }}
                      />
                    </div>
                  </div>
                ))}
                {signatories.length === 0 && (
                  <div className="col-span-3 text-center py-8 text-muted-foreground text-sm">No signatories on record.</div>
                )}
              </div>
            </div>
          )}

          {/* ACCOUNTS TAB */}
          {activeTab === 'accounts' && (
            <div className="space-y-3">
              {accounts.map((acc) => (
                <div key={acc.id} className="flex items-center justify-between p-4 rounded-xl border border-border bg-muted/20">
                  <div className="flex items-center gap-3">
                    <div className="w-9 h-9 rounded-lg bg-accent/10 flex items-center justify-center">
                      <CreditCard size={15} className="text-accent" />
                    </div>
                    <div>
                      <p className="text-xs font-semibold text-foreground">{acc.accountTypeLabel}</p>
                      <p className="text-[10px] font-mono text-muted-foreground">{acc.nuban}</p>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="text-sm font-bold text-foreground tabular-nums">{formatNaira(acc.balance)}</p>
                    <p className="text-[10px] text-muted-foreground">{acc.currency}</p>
                  </div>
                </div>
              ))}
              {accounts.length === 0 && (
                <div className="text-center py-8 text-muted-foreground text-sm">No accounts found.</div>
              )}
            </div>
          )}

          {/* INVESTMENTS TAB */}
          {activeTab === 'investments' && (
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-border">
                    {['CBS Ref', 'Product', 'Principal', 'Rate', 'Effective', 'Maturity', 'DTM', 'Accrued', 'Status'].map((h) => (
                      <th key={h} className="text-left py-2 px-3 text-muted-foreground font-semibold uppercase tracking-wide text-[10px]">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {investments.map((inv) => {
                    const accrued = accruedInterest(inv, today);
                    const dtm = daysBetween(today, inv.maturityDate);
                    return (
                      <tr key={inv.id} className="border-b border-border/50 hover:bg-muted/20 cursor-pointer" onClick={() => router.push(`/investments/${inv.id}`)}>
                        <td className="py-2 px-3 font-mono text-accent">{inv.cbsRef}</td>
                        <td className="py-2 px-3">{inv.product}</td>
                        <td className="py-2 px-3 tabular-nums">{formatNaira(inv.principalAmt)}</td>
                        <td className="py-2 px-3 tabular-nums">{inv.intRate}%</td>
                        <td className="py-2 px-3">{formatDate(inv.effectiveDate)}</td>
                        <td className="py-2 px-3">{formatDate(inv.maturityDate)}</td>
                        <td className={`py-2 px-3 tabular-nums font-semibold ${dtm < 0 ? 'text-red-600' : dtm <= 7 ? 'text-amber-600' : ''}`}>{dtm < 0 ? `${Math.abs(dtm)}d over` : `${dtm}d`}</td>
                        <td className="py-2 px-3 tabular-nums text-teal-600 dark:text-teal-400">{formatNaira(accrued)}</td>
                        <td className="py-2 px-3"><StatusBadge status={inv.status} /></td>
                      </tr>
                    );
                  })}
                  {investments.length === 0 && (
                    <tr><td colSpan={9} className="text-center py-8 text-muted-foreground">No investments found.</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          )}

          {/* BENEFICIARIES TAB */}
          {activeTab === 'beneficiaries' && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <p className="text-xs text-muted-foreground">{beneficiaries.length} beneficiar{beneficiaries.length === 1 ? 'y' : 'ies'} on record</p>
                {canEdit && (
                  <button onClick={openNewBen} className="btn-primary text-xs flex items-center gap-1.5">
                    <Plus size={12} /> Add Beneficiary
                  </button>
                )}
              </div>
              <div className="space-y-2">
                {beneficiaries.map((ben) => (
                  <div key={ben.id} className="flex items-center justify-between p-3 rounded-xl border border-border bg-muted/20">
                    <div>
                      <p className="text-xs font-semibold text-foreground">{ben.beneficiaryName}</p>
                      <p className="text-[10px] text-muted-foreground">{ben.bankName} · {ben.accountNumber}</p>
                      <p className="text-[10px] text-muted-foreground font-mono">{ben.accountName}</p>
                    </div>
                    {canEdit && (
                      <div className="flex items-center gap-1.5">
                        <button onClick={() => openEditBen(ben)} className="p-1.5 rounded-lg hover:bg-muted text-muted-foreground hover:text-foreground transition-colors">
                          <Edit2 size={12} />
                        </button>
                        <button
                          onClick={() => handleDeleteBen(ben.id)}
                          disabled={deletingBenId === ben.id}
                          className="p-1.5 rounded-lg hover:bg-red-50 text-muted-foreground hover:text-red-600 transition-colors disabled:opacity-50"
                        >
                          {deletingBenId === ben.id ? <Loader2 size={12} className="animate-spin" /> : <Trash2 size={12} />}
                        </button>
                      </div>
                    )}
                  </div>
                ))}
                {beneficiaries.length === 0 && (
                  <div className="text-center py-8 text-muted-foreground text-sm">No beneficiaries added yet.</div>
                )}
              </div>
            </div>
          )}

          {/* TRANSACTIONS TAB */}
          {activeTab === 'transactions' && (
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-border">
                    {['Ref', 'Type', 'Principal', 'Effective Date', 'Status'].map((h) => (
                      <th key={h} className="text-left py-2 px-3 text-muted-foreground font-semibold uppercase tracking-wide text-[10px]">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {transactions.map((txn) => (
                    <tr key={txn.id} className="border-b border-border/50 hover:bg-muted/20 cursor-pointer" onClick={() => router.push('/transactions')}>
                      <td className="py-2 px-3 font-mono text-accent">{txn.ref}</td>
                      <td className="py-2 px-3">{txn.type}</td>
                      <td className="py-2 px-3 tabular-nums">{formatNaira(txn.principalAmt)}</td>
                      <td className="py-2 px-3">{formatDate(txn.effectiveDate)}</td>
                      <td className="py-2 px-3"><StatusBadge status={txn.status} /></td>
                    </tr>
                  ))}
                  {transactions.length === 0 && (
                    <tr><td colSpan={5} className="text-center py-8 text-muted-foreground">No transactions found.</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          )}

          {/* CALLBACKS TAB */}
          {activeTab === 'callbacks' && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <p className="text-xs text-muted-foreground">{callbacks.length} call-back record{callbacks.length !== 1 ? 's' : ''}</p>
                <button onClick={() => setShowCallbackModal(true)} className="btn-primary text-xs flex items-center gap-1.5">
                  <PhoneCall size={12} /> Log Call
                </button>
              </div>
              <div className="space-y-2">
                {callbacks.map((cb) => (
                  <div key={cb.id} className="p-3 rounded-xl border border-border bg-muted/20">
                    <div className="flex items-center justify-between mb-1">
                      <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold
                        ${cb.outcome === 'CONFIRMED' ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400' :
                          cb.outcome === 'NO_ANSWER' ? 'bg-muted text-muted-foreground' :
                          cb.outcome === 'DISPUTED'? 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400' : 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400'}`}>
                        {cb.outcome.replace('_', ' ')}
                      </span>
                      <span className="text-[10px] text-muted-foreground">{formatDateTime(cb.calledAt)}</span>
                    </div>
                    <p className="text-xs text-foreground">{cb.notes}</p>
                    <p className="text-[10px] text-muted-foreground mt-1">Called by {cb.calledBy} · {cb.phoneUsed}</p>
                  </div>
                ))}
                {callbacks.length === 0 && (
                  <div className="text-center py-8 text-muted-foreground text-sm">No call-back history.</div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Callback Modal */}
      <Modal
        open={showCallbackModal}
        onClose={() => setShowCallbackModal(false)}
        title="Log Customer Call-back"
        footer={
          <>
            <button onClick={() => setShowCallbackModal(false)} className="btn-secondary text-sm">Cancel</button>
            <button onClick={handleSaveCallback} disabled={savingCallback} className="btn-primary text-sm flex items-center gap-1.5">
              {savingCallback ? <Loader2 size={13} className="animate-spin" /> : <Check size={13} />}
              Save Call Log
            </button>
          </>
        }
      >
        <div className="space-y-4">
          <div className="p-3 rounded-lg bg-accent/5 border border-accent/20">
            <p className="text-xs text-muted-foreground">Calling</p>
            <p className="text-sm font-bold text-foreground">{customer.name}</p>
            <p className="text-sm font-mono text-accent">{customer.phone}</p>
          </div>
          <div>
            <label className="block text-xs font-medium text-foreground mb-1.5">Outcome</label>
            <select value={callbackOutcome} onChange={(e) => setCallbackOutcome(e.target.value as typeof callbackOutcome)} className="input-field text-sm">
              <option value="CONFIRMED">Confirmed</option>
              <option value="NO_ANSWER">No Answer</option>
              <option value="DISPUTED">Disputed</option>
              <option value="RESCHEDULED">Rescheduled</option>
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-foreground mb-1.5">Notes</label>
            <textarea value={callbackNotes} onChange={(e) => setCallbackNotes(e.target.value)} rows={3} placeholder="Enter call notes…" className="input-field text-sm resize-none" />
          </div>
        </div>
      </Modal>

      {/* Beneficiary Modal */}
      <Modal
        open={showBenModal}
        onClose={() => setShowBenModal(false)}
        title={editingBen ? 'Edit Beneficiary' : 'Add Beneficiary'}
        footer={
          <>
            <button onClick={() => setShowBenModal(false)} className="btn-secondary text-sm">Cancel</button>
            <button onClick={handleSaveBen} disabled={savingBen} className="btn-primary text-sm flex items-center gap-1.5">
              {savingBen ? <Loader2 size={13} className="animate-spin" /> : <Check size={13} />}
              Save
            </button>
          </>
        }
      >
        <div className="space-y-4">
          <div>
            <label className="block text-xs font-medium text-foreground mb-1.5">Beneficiary Name</label>
            <input value={benForm.beneficiaryName} onChange={(e) => setBenForm((f) => ({ ...f, beneficiaryName: e.target.value }))} placeholder="Full name" className={`input-field text-sm ${benErrors.beneficiaryName ? 'border-red-500' : ''}`} />
            {benErrors.beneficiaryName && <p className="text-[10px] text-red-600 mt-1">{benErrors.beneficiaryName}</p>}
          </div>
          <div>
            <label className="block text-xs font-medium text-foreground mb-1.5">Bank</label>
            <select value={benForm.bankId} onChange={(e) => setBenForm((f) => ({ ...f, bankId: e.target.value }))} className={`input-field text-sm ${benErrors.bankId ? 'border-red-500' : ''}`}>
              <option value="">Select bank…</option>
              {banks.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
            </select>
            {benErrors.bankId && <p className="text-[10px] text-red-600 mt-1">{benErrors.bankId}</p>}
          </div>
          <div>
            <label className="block text-xs font-medium text-foreground mb-1.5">Account Number (NUBAN)</label>
            <div className="flex gap-2">
              <input
                value={benForm.accountNumber}
                onChange={(e) => setBenForm((f) => ({ ...f, accountNumber: e.target.value.replace(/\D/g, '').slice(0, 10) }))}
                placeholder="10-digit NUBAN"
                maxLength={10}
                className={`input-field text-sm font-mono flex-1 ${benErrors.accountNumber ? 'border-red-500' : ''}`}
              />
              <button onClick={handleEnquire} disabled={enquiring} className="btn-secondary text-xs flex items-center gap-1.5 whitespace-nowrap">
                {enquiring ? <Loader2 size={12} className="animate-spin" /> : <CheckCircle size={12} />}
                Name Enquiry
              </button>
            </div>
            {benErrors.accountNumber && <p className="text-[10px] text-red-600 mt-1">{benErrors.accountNumber}</p>}
          </div>
          {benForm.accountName && (
            <div className="p-3 rounded-lg bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800">
              <p className="text-[10px] text-green-600 font-medium uppercase tracking-wide">Account Name</p>
              <p className="text-sm font-bold text-green-700 dark:text-green-400 mt-0.5">{benForm.accountName}</p>
            </div>
          )}
          {benErrors.accountName && <p className="text-[10px] text-red-600">{benErrors.accountName}</p>}
        </div>
      </Modal>
    </div>
  );
}
