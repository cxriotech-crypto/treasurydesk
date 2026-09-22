'use client';
import React, { useState, useEffect, useCallback, useRef, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import AppLayout from '@/components/AppLayout';
import Modal from '@/components/ui/Modal';
import { ChevronLeft, ChevronRight, AlertTriangle, CheckCircle2, XCircle, RefreshCw, ChevronDown, ChevronUp, Phone, Upload, X, Search, Eye, AlertCircle, Loader2, Check, Info, FileText, ShieldAlert } from 'lucide-react';
import { transactionService } from '@/services/transactionService';
import { investmentService } from '@/services/investmentService';
import { customerService, getBanks } from '@/services/customerService';
import { getSession } from '@/services/userService';
import { accruedInterest, transfer } from '@/lib/calc';
import { formatNaira, formatDate, todayLagos, nowLagosISO } from '@/lib/format';
import type { TxnType, Customer, Investment, Beneficiary, Signatory, Mandate, Account, Bank, TreasuryTxn } from '@/types';
import { TXN_TYPE_LABELS } from '@/types';
import VoucherStep from './VoucherStep';

// ─── Constants ────────────────────────────────────────────────────────────────

const TXN_TYPES: { type: TxnType; label: string; description: string; icon: string; color: string }[] = [
  { type: 'ROLLOVER', label: 'Rollover', description: 'Roll principal into a new investment', icon: '🔄', color: 'border-blue-400 bg-blue-50 dark:bg-blue-950/30' },
  { type: 'MATURITY', label: 'Maturity Payout', description: 'Pay out a matured investment', icon: '🏦', color: 'border-green-400 bg-green-50 dark:bg-green-950/30' },
  { type: 'PRELIQ', label: 'Pre-Liquidation', description: 'Early liquidation of investment', icon: '💸', color: 'border-orange-400 bg-orange-50 dark:bg-orange-950/30' },
  { type: 'ANNIVERSARY', label: 'Anniversary Payment', description: 'Periodic interest payment', icon: '📅', color: 'border-purple-400 bg-purple-50 dark:bg-purple-950/30' },
  { type: 'THIRD_PARTY', label: 'Third-Party Transfer', description: 'Transfer to external/internal account', icon: '🏛️', color: 'border-cyan-400 bg-cyan-50 dark:bg-cyan-950/30' },
  { type: 'TRANSFER', label: 'Internal Transfer', description: 'Move funds between accounts', icon: '↔️', color: 'border-indigo-400 bg-indigo-50 dark:bg-indigo-950/30' },
  { type: 'INFLOW', label: 'New Inflow', description: 'Book a new investment', icon: '📥', color: 'border-emerald-400 bg-emerald-50 dark:bg-emerald-950/30' },
];

const SCENARIOS: Record<TxnType, { id: string; label: string; description: string }[]> = {
  ROLLOVER: [
    { id: 'A', label: 'A – Principal + Interest', description: 'Roll both principal and net interest' },
    { id: 'B', label: 'B – Principal rolled / Interest paid out', description: 'Roll principal, pay out net interest' },
    { id: 'C', label: 'C – Partial principal', description: 'Roll a portion of principal' },
    { id: 'D', label: 'D – Interest payment only', description: 'Pay out interest, keep principal' },
  ],
  MATURITY: [
    { id: 'FULL', label: 'Principal + Interest', description: 'Full maturity payout' },
  ],
  PRELIQ: [
    { id: 'FULL', label: 'Full Pre-Liquidation', description: 'Liquidate entire investment' },
    { id: 'PARTIAL', label: 'Partial Pre-Liquidation', description: 'Liquidate a portion' },
  ],
  ANNIVERSARY: [
    { id: '30', label: '30-Day Anniversary', description: 'Monthly interest payment' },
    { id: '60', label: '60-Day Anniversary', description: 'Bi-monthly interest payment' },
    { id: '90', label: '90-Day Anniversary', description: 'Quarterly interest payment' },
  ],
  THIRD_PARTY: [
    { id: 'A', label: 'A – External Bank', description: 'Transfer to another bank' },
    { id: 'B', label: 'B – Internal Account', description: 'Transfer within the bank' },
  ],
  TRANSFER: [
    { id: 'A', label: 'A – Savings → Personal Account', description: 'Move from savings to personal' },
    { id: 'B', label: 'B – Personal Account → Commercial Paper', description: 'Fund a CP investment' },
    { id: 'C', label: 'C – Personal Account → Call Placement', description: 'Fund a call placement' },
    { id: 'REV', label: 'Reversal', description: 'Reverse a previous transfer' },
  ],
  INFLOW: [
    { id: 'NEW', label: 'New Investment', description: 'Book a fresh investment' },
  ],
};

const VOUCHER_MAP: Record<TxnType, string> = {
  INFLOW: 'Funds-In Voucher',
  ROLLOVER: 'Roll-over Slip',
  MATURITY: 'Funds-Out Voucher',
  PRELIQ: 'Funds-Out Voucher',
  ANNIVERSARY: 'Funds-Out Voucher',
  THIRD_PARTY: 'Funds-Out Voucher',
  TRANSFER: 'Transfer Slip',
};

const INSTRUCTION_CHANNELS = ['Letter', 'Email', 'Signed instruction form', 'Mandated instruction'];

const CONTROL_CHECKS_DEF = [
  { code: 'C01', label: 'Instruction received', step: 2 },
  { code: 'C02', label: 'Signature verified', step: 3 },
  { code: 'C03', label: 'Telephone confirmation', step: 4 },
  { code: 'C04', label: 'Investment confirmed (Eazybankz)', step: 5 },
  { code: 'C05', label: 'Mandate satisfied', step: 3 },
  { code: 'C06', label: 'Account ownership confirmed', step: 3 },
  { code: 'C07', label: 'Instruction complete', step: 3 },
  { code: 'C08', label: 'Amount confirmed by customer', step: 4 },
  { code: 'C09', label: 'Beneficiary confirmed', step: 4 },
  { code: 'C10', label: 'Purpose confirmed', step: 4 },
  { code: 'C11', label: 'Investment details match CBS', step: 5 },
  { code: 'C12', label: 'Voucher generated', step: 6 },
];

// ─── Wizard State ─────────────────────────────────────────────────────────────

interface WizardState {
  txnId: string | null;
  // Step 1
  txnType: TxnType | null;
  scenario: string | null;
  customerId: string | null;
  investmentId: string | null;
  sourceAccountId: string | null;
  // Step 2
  channel: string;
  dateReceived: string;
  timeReceived: string;
  instructionScanDataUrl: string | null;
  amount: string;
  purpose: string;
  beneficiaryName: string;
  beneficiaryBank: string;
  beneficiaryAccount: string;
  beneficiaryAmount: string;
  beneficiaryPurpose: string;
  // Step 3
  sigVerified: boolean;
  mandateSatisfied: boolean;
  ownershipConfirmed: boolean;
  instructionComplete: boolean;
  // Step 4
  callDate: string;
  callTime: string;
  callOfficer: string;
  confirmAmount: boolean;
  confirmInstruction: boolean;
  confirmBeneficiary: boolean;
  confirmPurpose: boolean;
  callOutcome: 'CONFIRMED' | 'UNREACHABLE' | 'DISPUTED' | '';
  callNotes: string;
  // Step 5
  cbsConfirmed: boolean;
  // Controls
  controlChecks: Record<string, boolean>;
}

const initialState: WizardState = {
  txnId: null,
  txnType: null, scenario: null, customerId: null, investmentId: null, sourceAccountId: null,
  channel: '', dateReceived: '', timeReceived: '', instructionScanDataUrl: null,
  amount: '', purpose: '',
  beneficiaryName: '', beneficiaryBank: '', beneficiaryAccount: '', beneficiaryAmount: '', beneficiaryPurpose: '',
  sigVerified: false, mandateSatisfied: false, ownershipConfirmed: false, instructionComplete: false,
  callDate: '', callTime: '', callOfficer: '', confirmAmount: false, confirmInstruction: false,
  confirmBeneficiary: false, confirmPurpose: false, callOutcome: '', callNotes: '',
  cbsConfirmed: false,
  controlChecks: {},
};

// ─── Step validation ──────────────────────────────────────────────────────────

function isStep1Valid(s: WizardState): boolean {
  return !!(s.txnType && s.scenario && s.customerId && (s.txnType === 'INFLOW' || s.investmentId || s.sourceAccountId));
}

function isStep2Valid(s: WizardState): boolean {
  const base = !!(s.channel && s.dateReceived && s.timeReceived && s.amount && s.purpose);
  const needsBeneficiary = s.txnType === 'THIRD_PARTY' && s.scenario === 'A';
  if (needsBeneficiary) {
    return base && !!(s.beneficiaryName && s.beneficiaryBank && s.beneficiaryAccount.length === 10);
  }
  return base;
}

function isStep3Valid(s: WizardState): boolean {
  return s.sigVerified && s.mandateSatisfied && s.ownershipConfirmed && s.instructionComplete;
}

function isStep4Valid(s: WizardState): boolean {
  return s.callOutcome === 'CONFIRMED' && s.confirmAmount && s.confirmInstruction && s.confirmBeneficiary && s.confirmPurpose;
}

function isStep5Valid(s: WizardState): boolean {
  return s.cbsConfirmed;
}

// ─── Main Component ───────────────────────────────────────────────────────────

function TxnWizardInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const session = getSession();

  const [step, setStep] = useState(0); // 0-5
  const [state, setState] = useState<WizardState>({ ...initialState });
  const [saving, setSaving] = useState(false);
  const [lastSaved, setLastSaved] = useState<string | null>(null);
  const [checklistOpen, setChecklistOpen] = useState(true);

  // Data
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [investments, setInvestments] = useState<Investment[]>([]);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [signatories, setSignatories] = useState<Signatory[]>([]);
  const [mandate, setMandate] = useState<Mandate | null>(null);
  const [beneficiaries, setBeneficiaries] = useState<Beneficiary[]>([]);
  const [banks, setBanks] = useState<Bank[]>([]);

  // UI state
  const [customerSearch, setCustomerSearch] = useState('');
  const [showCustomerDrop, setShowCustomerDrop] = useState(false);
  const [showBeneficiaryDrop, setShowBeneficiaryDrop] = useState(false);
  const [nameEnquiryLoading, setNameEnquiryLoading] = useState(false);
  const [nameEnquiryResult, setNameEnquiryResult] = useState('');
  const [cbsRefreshing, setCbsRefreshing] = useState(false);
  const [cbsLastSynced, setCbsLastSynced] = useState<string | null>(null);
  const [cbsData, setCbsData] = useState<Record<string, string>>({});
  const [showStopModal, setShowStopModal] = useState(false);
  const [stopping, setStopping] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);

  // ─── Load initial data ───────────────────────────────────────────────────────
  useEffect(() => {
    customerService.list({ page: 1, pageSize: 200 }).then((r) => setCustomers(r.items));
    getBanks().then(setBanks);
  }, []);

  // ─── Query param pre-fill ────────────────────────────────────────────────────
  useEffect(() => {
    const typeParam = searchParams.get('type') as TxnType | null;
    const invId = searchParams.get('investmentId');
    if (typeParam && TXN_TYPES.find((t) => t.type === typeParam)) {
      setState((prev) => ({ ...prev, txnType: typeParam }));
    }
    if (invId) {
      setState((prev) => ({ ...prev, investmentId: invId }));
      investmentService.getById(invId).then((inv) => {
        if (inv) {
          setState((prev) => ({ ...prev, customerId: inv.customerId }));
          loadCustomerData(inv.customerId);
        }
      });
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ─── Load customer-specific data ────────────────────────────────────────────
  const loadCustomerData = useCallback(async (customerId: string) => {
    const [sigs, mnd, accs, bens] = await Promise.all([
      customerService.getSignatories(customerId),
      customerService.getMandate(customerId),
      customerService.getAccounts(customerId),
      customerService.getBeneficiaries(customerId),
    ]);
    setSignatories(sigs);
    setMandate(mnd);
    setAccounts(accs);
    setBeneficiaries(bens);
  }, []);

  // ─── Load investments when type + customer selected ──────────────────────────
  useEffect(() => {
    if (!state.customerId || !state.txnType) return;
    investmentService.list({ page: 1, pageSize: 200, filters: { customerId: state.customerId } }).then((r) => {
      let filtered = r.items;
      if (state.txnType === 'MATURITY') filtered = filtered.filter((i) => i.status === 'MATURED' || i.status === 'AWAITING_INSTRUCTION');
      else if (state.txnType === 'PRELIQ') filtered = filtered.filter((i) => i.status === 'ACTIVE');
      else if (state.txnType === 'ROLLOVER') filtered = filtered.filter((i) => i.status === 'ACTIVE' || i.status === 'MATURED');
      else if (state.txnType === 'ANNIVERSARY') filtered = filtered.filter((i) => i.status === 'ACTIVE' && !!i.anniversaryFrequencyDays);
      else if (state.txnType === 'THIRD_PARTY') filtered = filtered.filter((i) => i.status === 'ACTIVE');
      setInvestments(filtered);
    });
  }, [state.customerId, state.txnType]);

  // ─── Autosave ────────────────────────────────────────────────────────────────
  const autosave = useCallback(async (s: WizardState) => {
    if (!s.customerId || !s.txnType) return;
    setSaving(true);
    try {
      const customer = customers.find((c) => c.id === s.customerId);
      if (!customer) return;
      const now = nowLagosISO();
      const patch: Partial<TreasuryTxn> = {
        status: 'DRAFT',
        type: s.txnType,
        customerId: s.customerId,
        customerName: customer.name,
        customerCif: customer.cif,
        accountNumber: accounts[0]?.nuban ?? '',
        investmentId: s.investmentId ?? undefined,
        principalAmt: s.amount || '0',
        intRate: '0',
        tenorDays: 0,
        effectiveDate: s.dateReceived || todayLagos(),
        maturityDate: todayLagos(),
        interestAmt: '0',
        withholdingTax: '0',
        netInterest: '0',
        totalPayout: '0',
        mandateVerified: s.sigVerified,
        callbackDone: s.callOutcome === 'CONFIRMED',
        cbsVerified: s.cbsConfirmed,
        initiatedBy: session?.user.name ?? 'Unknown',
        initiatedById: session?.user.id ?? 'usr-001',
        initiatedAt: now,
        updatedAt: now,
        approvals: [],
      };
      if (s.txnId) {
        await transactionService.update(s.txnId, patch);
      } else {
        const ref = `TXN-DRAFT-${Date.now()}`;
        const created = await transactionService.create({ ...patch, ref } as Omit<TreasuryTxn, 'id' | 'version'>);
        setState((prev) => ({ ...prev, txnId: created.id }));
      }
      setLastSaved(nowLagosISO());
    } catch { /* silent */ } finally {
      setSaving(false);
    }
  }, [customers, accounts, session]);

  // ─── Autosave on step advance ────────────────────────────────────────────────
  const advanceStep = useCallback((newStep: number, updatedState: WizardState) => {
    setStep(newStep);
    autosave(updatedState);
  }, [autosave]);

  // ─── CBS Refresh ─────────────────────────────────────────────────────────────
  const refreshCbs = useCallback(async () => {
    if (!state.investmentId) return;
    setCbsRefreshing(true);
    await new Promise((r) => setTimeout(r, 1000));
    const inv = await investmentService.getById(state.investmentId);
    if (inv) {
      const today = todayLagos();
      let accrued = '0';
      try { accrued = accruedInterest(inv, today); } catch { /* */ }
      setCbsData({
        principal: inv.principalAmt,
        accrued,
        rate: inv.intRate,
        effectiveDate: inv.effectiveDate,
        maturityDate: inv.maturityDate,
        outstanding: inv.principalAmt,
        available: inv.principalAmt,
      });
    }
    const now = new Date();
    setCbsLastSynced(`${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}:${String(now.getSeconds()).padStart(2, '0')}`);
    setCbsRefreshing(false);
  }, [state.investmentId]);

  // ─── Stop processing ─────────────────────────────────────────────────────────
  const handleStopProcessing = useCallback(async () => {
    setStopping(true);
    try {
      if (state.txnId) {
        await transactionService.update(state.txnId, {
          status: 'STOPPED',
          updatedAt: nowLagosISO(),
          controlChecks: [
            { id: `cc-stop-${Date.now()}`, version: 1, txnId: state.txnId, checkCode: 'C02', checkLabel: 'Signature verified', passed: false, checkedAt: nowLagosISO(), checkedBy: session?.user.name ?? 'Unknown', notes: 'Signature differs - stopped by officer' },
          ],
        });
      }
      setShowStopModal(false);
      router.push('/transactions?stopped=1');
    } catch { /* */ } finally {
      setStopping(false);
    }
  }, [state.txnId, session, router]);

  // ─── Name enquiry ─────────────────────────────────────────────────────────────
  const handleNameEnquiry = useCallback(async () => {
    if (!state.beneficiaryAccount || state.beneficiaryAccount.length !== 10 || !state.beneficiaryBank) return;
    setNameEnquiryLoading(true);
    setNameEnquiryResult('');
    await new Promise((r) => setTimeout(r, 1000));
    const names = ['ADEBAYO OLUWASEUN MICHAEL', 'OKAFOR CHUKWUEMEKA JAMES', 'IBRAHIM FATIMA AISHA', 'NWOSU CHIDINMA GRACE', 'ADELEKE TAIWO SAMUEL'];
    setNameEnquiryResult(names[Math.floor(Math.random() * names.length)]);
    setNameEnquiryLoading(false);
  }, [state.beneficiaryAccount, state.beneficiaryBank]);

  // ─── File upload ──────────────────────────────────────────────────────────────
  const handleFileUpload = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      setState((prev) => ({ ...prev, instructionScanDataUrl: ev.target?.result as string }));
    };
    reader.readAsDataURL(file);
  }, []);

  // ─── Computed control checks ──────────────────────────────────────────────────
  const controlPassed = useCallback((code: string): boolean => {
    if (code === 'C01') return step > 1 && !!state.channel;
    if (code === 'C02') return step > 2 && state.sigVerified;
    if (code === 'C03') return step > 3 && state.callOutcome === 'CONFIRMED';
    if (code === 'C04') return step > 4 && state.cbsConfirmed;
    if (code === 'C05') return step > 2 && state.mandateSatisfied;
    if (code === 'C06') return step > 2 && state.ownershipConfirmed;
    if (code === 'C07') return step > 2 && state.instructionComplete;
    if (code === 'C08') return step > 3 && state.confirmAmount;
    if (code === 'C09') return step > 3 && state.confirmBeneficiary;
    if (code === 'C10') return step > 3 && state.confirmPurpose;
    if (code === 'C11') return step > 4 && state.cbsConfirmed;
    if (code === 'C12') return step >= 5;
    return false;
  }, [step, state]);

  // ─── Selected data helpers ────────────────────────────────────────────────────
  const selectedCustomer = customers.find((c) => c.id === state.customerId) ?? null;
  const selectedInvestment = investments.find((i) => i.id === state.investmentId) ?? null;
  const filteredCustomers = customers.filter((c) =>
    c.isActive && (
      c.name.toLowerCase().includes(customerSearch.toLowerCase()) ||
      c.cif.toLowerCase().includes(customerSearch.toLowerCase())
    )
  );

  const needsBeneficiary = state.txnType === 'THIRD_PARTY' && state.scenario === 'A';

  // ─── Step validity ────────────────────────────────────────────────────────────
  const stepValid = [
    isStep1Valid(state),
    isStep2Valid(state),
    isStep3Valid(state),
    isStep4Valid(state),
    isStep5Valid(state),
    true, // step 6 — VoucherStep manages its own validation
  ];

  // ─── Render helpers ───────────────────────────────────────────────────────────
  const STEP_LABELS = ['Type & Scenario', 'Instruction', 'Signature Verify', 'Call-Back', 'CBS Verify', 'Voucher'];

  return (
    <AppLayout allowedRoles={['TREASURY_OFFICER']}>
      <div className="mb-4 flex items-center justify-between">
        <div>
          <h1 className="page-title">New Treasury Transaction</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            {state.txnType ? `${TXN_TYPE_LABELS[state.txnType]} — Step ${step + 1} of 6` : '6-step SOP wizard'}
          </p>
        </div>
        <div className="flex items-center gap-3">
          {saving && <span className="text-xs text-muted-foreground flex items-center gap-1"><Loader2 size={12} className="animate-spin" /> Saving…</span>}
          {!saving && lastSaved && <span className="text-xs text-muted-foreground">Saved {lastSaved.slice(11, 16)}</span>}
          <button onClick={() => router.push('/transactions')} className="btn-secondary text-sm px-3 py-1.5">
            <X size={14} className="mr-1" /> Cancel
          </button>
        </div>
      </div>

      {/* Left stepper + main content + right checklist */}
      <div className="flex gap-4 items-start">
        {/* Left vertical stepper */}
        <div className="hidden lg:flex flex-col w-44 shrink-0 card p-4 gap-0">
          {STEP_LABELS.map((label, i) => (
            <div key={`wstep-${i}`} className="flex gap-2.5">
              <div className="flex flex-col items-center">
                <div className={`w-7 h-7 rounded-full flex items-center justify-center shrink-0 border-2 text-xs font-bold
                  ${i < step ? 'bg-emerald-500 border-emerald-500 text-white' : i === step ? 'bg-primary border-primary text-white' : 'bg-card border-border text-muted-foreground'}`}>
                  {i < step ? <Check size={12} /> : i + 1}
                </div>
                {i < STEP_LABELS.length - 1 && (
                  <div className={`w-0.5 h-8 my-0.5 ${i < step ? 'bg-emerald-500' : 'bg-border'}`} />
                )}
              </div>
              <div className="pb-4 pt-0.5">
                <p className={`text-xs font-semibold leading-tight ${i === step ? 'text-primary' : i < step ? 'text-foreground' : 'text-muted-foreground'}`}>{label}</p>
              </div>
            </div>
          ))}
        </div>

        {/* Main content */}
        <div className="flex-1 min-w-0">
          <div className="card p-6">
            {/* ── STEP 1: Type & Scenario ── */}
            {step === 0 && (
              <Step1
                state={state}
                setState={setState}
                customers={filteredCustomers}
                customerSearch={customerSearch}
                setCustomerSearch={setCustomerSearch}
                showCustomerDrop={showCustomerDrop}
                setShowCustomerDrop={setShowCustomerDrop}
                selectedCustomer={selectedCustomer}
                selectedInvestment={selectedInvestment}
                investments={investments}
                accounts={accounts}
                loadCustomerData={loadCustomerData}
              />
            )}

            {/* ── STEP 2: Instruction ── */}
            {step === 1 && (
              <Step2
                state={state}
                setState={setState}
                needsBeneficiary={needsBeneficiary}
                beneficiaries={beneficiaries}
                banks={banks}
                showBeneficiaryDrop={showBeneficiaryDrop}
                setShowBeneficiaryDrop={setShowBeneficiaryDrop}
                nameEnquiryLoading={nameEnquiryLoading}
                nameEnquiryResult={nameEnquiryResult}
                handleNameEnquiry={handleNameEnquiry}
                fileInputRef={fileInputRef}
                handleFileUpload={handleFileUpload}
              />
            )}

            {/* ── STEP 3: Signature & Mandate ── */}
            {step === 2 && (
              <Step3
                state={state}
                setState={setState}
                signatories={signatories}
                mandate={mandate}
                onStopProcessing={() => setShowStopModal(true)}
              />
            )}

            {/* ── STEP 4: Call-Back ── */}
            {step === 3 && (
              <Step4
                state={state}
                setState={setState}
                selectedCustomer={selectedCustomer}
                session={session}
              />
            )}

            {/* ── STEP 5: CBS Verify ── */}
            {step === 4 && (
              <Step5
                state={state}
                setState={setState}
                selectedInvestment={selectedInvestment}
                cbsData={cbsData}
                cbsRefreshing={cbsRefreshing}
                cbsLastSynced={cbsLastSynced}
                onRefresh={refreshCbs}
                accounts={accounts}
              />
            )}

            {/* ── STEP 6: Voucher ── */}
            {step === 5 && (
              <VoucherStep
                state={state as Parameters<typeof VoucherStep>[0]['state'] & Record<string, unknown>}
                setState={setState as Parameters<typeof VoucherStep>[0]['setState']}
                selectedInvestment={selectedInvestment}
                selectedCustomer={selectedCustomer}
                accounts={accounts}
                banks={banks}
                onBack={() => setStep(4)}
                onComplete={() => router.push('/transactions?submitted=1')}
              />
            )}

            {/* Navigation buttons — hidden on step 6 (VoucherStep has its own bar) */}
            {step !== 5 && (
            <div className="flex items-center justify-between mt-8 pt-4 border-t border-border">
              <button
                onClick={() => setStep((s) => Math.max(0, s - 1))}
                disabled={step === 0}
                className="btn-secondary flex items-center gap-2 disabled:opacity-40"
              >
                <ChevronLeft size={16} /> Back
              </button>
              <div className="flex items-center gap-2">
                {/* Mobile step indicator */}
                <span className="lg:hidden text-xs text-muted-foreground">Step {step + 1}/6</span>
                <button
                  onClick={() => {
                    if (!stepValid[step]) return;
                    const next = step + 1;
                    advanceStep(next, state);
                  }}
                  disabled={!stepValid[step]}
                  className="btn-primary flex items-center gap-2 disabled:opacity-40 disabled:cursor-not-allowed"
                  title={!stepValid[step] ? 'Complete all required fields to continue' : ''}
                >
                  Next <ChevronRight size={16} />
                </button>
              </div>
            </div>
            )}
          </div>
        </div>

        {/* Right: 12-point control checklist */}
        <div className="hidden xl:block w-64 shrink-0">
          <div className="card p-4">
            <button
              onClick={() => setChecklistOpen((o) => !o)}
              className="flex items-center justify-between w-full text-sm font-semibold text-foreground mb-2"
            >
              <span>Control Checklist</span>
              {checklistOpen ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
            </button>
            {checklistOpen && (
              <div className="space-y-1.5">
                {CONTROL_CHECKS_DEF.map((c) => {
                  const passed = controlPassed(c.code);
                  const active = c.step <= step + 1;
                  return (
                    <div key={c.code} className={`flex items-start gap-2 text-xs rounded-lg px-2 py-1.5 transition-colors
                      ${passed ? 'bg-emerald-50 dark:bg-emerald-950/30' : active ? 'bg-amber-50 dark:bg-amber-950/20' : 'bg-muted/30'}`}>
                      <div className={`mt-0.5 shrink-0 w-4 h-4 rounded-full flex items-center justify-center
                        ${passed ? 'bg-emerald-500' : active ? 'bg-amber-400' : 'bg-muted'}`}>
                        {passed ? <Check size={9} className="text-white" /> : <span className="text-white text-[8px] font-bold">{c.code.slice(1)}</span>}
                      </div>
                      <div>
                        <span className={`font-mono font-bold ${passed ? 'text-emerald-700 dark:text-emerald-400' : 'text-muted-foreground'}`}>{c.code}</span>
                        <span className={` ml-1 ${passed ? 'text-emerald-700 dark:text-emerald-400' : 'text-muted-foreground'}`}>{c.label}</span>
                      </div>
                    </div>
                  );
                })}
                <div className="mt-2 pt-2 border-t border-border text-xs text-muted-foreground text-center">
                  {CONTROL_CHECKS_DEF.filter((c) => controlPassed(c.code)).length}/{CONTROL_CHECKS_DEF.length} passed
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Stop Processing Modal */}
      <Modal
        open={showStopModal}
        onClose={() => setShowStopModal(false)}
        title="⚠️ Stop Processing — Confirm"
        size="md"
        footer={
          <>
            <button onClick={() => setShowStopModal(false)} className="btn-secondary">Cancel</button>
            <button onClick={handleStopProcessing} disabled={stopping} className="bg-red-600 hover:bg-red-700 text-white px-4 py-2 rounded-lg text-sm font-medium flex items-center gap-2 disabled:opacity-60">
              {stopping ? <Loader2 size={14} className="animate-spin" /> : <ShieldAlert size={14} />}
              Confirm — Stop Processing
            </button>
          </>
        }
      >
        <div className="space-y-3">
          <div className="flex items-start gap-3 p-3 bg-red-50 dark:bg-red-950/30 rounded-lg border border-red-200 dark:border-red-800">
            <AlertTriangle size={20} className="text-red-600 shrink-0 mt-0.5" />
            <div>
              <p className="text-sm font-semibold text-red-700 dark:text-red-400">Signature verification failed</p>
              <p className="text-xs text-red-600 dark:text-red-400 mt-1">
                This action will set the transaction status to <strong>STOPPED</strong>, fail control C02, and log an audit event. The transaction cannot be processed further.
              </p>
            </div>
          </div>
          <p className="text-sm text-muted-foreground">Are you sure you want to stop processing this transaction? This action cannot be undone.</p>
        </div>
      </Modal>
    </AppLayout>
  );
}

// ─── Step 1 ───────────────────────────────────────────────────────────────────

interface Step1Props {
  state: WizardState;
  setState: React.Dispatch<React.SetStateAction<WizardState>>;
  customers: Customer[];
  customerSearch: string;
  setCustomerSearch: (v: string) => void;
  showCustomerDrop: boolean;
  setShowCustomerDrop: (v: boolean) => void;
  selectedCustomer: Customer | null;
  selectedInvestment: Investment | null;
  investments: Investment[];
  accounts: Account[];
  loadCustomerData: (id: string) => Promise<void>;
}

function Step1({ state, setState, customers, customerSearch, setCustomerSearch, showCustomerDrop, setShowCustomerDrop, selectedCustomer, selectedInvestment, investments, accounts, loadCustomerData }: Step1Props) {
  const scenarios = state.txnType ? SCENARIOS[state.txnType] : [];

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-base font-semibold text-foreground mb-1">Step 1 — Type & Scenario</h2>
        <p className="text-sm text-muted-foreground">Select the transaction type, scenario, customer, and investment.</p>
      </div>

      {/* Transaction type cards */}
      <div>
        <label className="block text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">Transaction Type</label>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2">
          {TXN_TYPES.map((t) => (
            <button
              key={t.type}
              onClick={() => setState((prev) => ({ ...prev, txnType: t.type, scenario: null, investmentId: null }))}
              className={`flex flex-col items-start p-3 rounded-xl border-2 text-left transition-all hover:shadow-md
                ${state.txnType === t.type ? `${t.color} border-opacity-100 shadow-md` : 'border-border bg-card hover:border-primary/40'}`}
            >
              <span className="text-2xl mb-1.5">{t.icon}</span>
              <span className="text-xs font-semibold text-foreground leading-tight">{t.label}</span>
              <span className="text-[10px] text-muted-foreground mt-0.5 leading-tight">{t.description}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Scenario selection */}
      {state.txnType && scenarios.length > 0 && (
        <div>
          <label className="block text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">Scenario</label>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {scenarios.map((sc) => (
              <button
                key={sc.id}
                onClick={() => setState((prev) => ({ ...prev, scenario: sc.id }))}
                className={`flex items-start gap-3 p-3 rounded-xl border-2 text-left transition-all
                  ${state.scenario === sc.id ? 'border-primary bg-primary/5' : 'border-border bg-card hover:border-primary/40'}`}
              >
                <div className={`w-5 h-5 rounded-full border-2 shrink-0 mt-0.5 flex items-center justify-center
                  ${state.scenario === sc.id ? 'border-primary bg-primary' : 'border-border'}`}>
                  {state.scenario === sc.id && <Check size={10} className="text-white" />}
                </div>
                <div>
                  <p className="text-xs font-semibold text-foreground">{sc.label}</p>
                  <p className="text-[10px] text-muted-foreground">{sc.description}</p>
                </div>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Customer picker */}
      <div>
        <label className="block text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">Customer</label>
        <div className="relative">
          {selectedCustomer ? (
            <div className="flex items-center justify-between p-3 rounded-xl border-2 border-primary bg-primary/5">
              <div>
                <p className="text-sm font-semibold text-foreground">{selectedCustomer.name}</p>
                <p className="text-xs text-muted-foreground">{selectedCustomer.cif} · {selectedCustomer.phone}</p>
              </div>
              <button onClick={() => { setState((prev) => ({ ...prev, customerId: null, investmentId: null })); setCustomerSearch(''); }} className="text-muted-foreground hover:text-foreground">
                <X size={14} />
              </button>
            </div>
          ) : (
            <div className="relative">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <input
                type="text"
                placeholder="Search by name or CIF…"
                value={customerSearch}
                onChange={(e) => { setCustomerSearch(e.target.value); setShowCustomerDrop(true); }}
                onFocus={() => setShowCustomerDrop(true)}
                className="input-field pl-8 w-full"
              />
              {showCustomerDrop && customers.length > 0 && (
                <div className="absolute z-20 top-full left-0 right-0 mt-1 bg-card border border-border rounded-xl shadow-xl max-h-52 overflow-y-auto">
                  {customers.slice(0, 20).map((c) => (
                    <button
                      key={c.id}
                      className="w-full flex items-start gap-2 px-3 py-2.5 hover:bg-muted text-left"
                      onClick={() => {
                        setState((prev) => ({ ...prev, customerId: c.id }));
                        setCustomerSearch('');
                        setShowCustomerDrop(false);
                        loadCustomerData(c.id);
                      }}
                    >
                      <div className="w-7 h-7 rounded-full bg-primary/10 flex items-center justify-center text-xs font-bold text-primary shrink-0">{c.name[0]}</div>
                      <div>
                        <p className="text-xs font-semibold text-foreground">{c.name}</p>
                        <p className="text-[10px] text-muted-foreground">{c.cif} · {c.customerType}</p>
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Investment / account picker */}
      {state.customerId && state.txnType && state.txnType !== 'INFLOW' && (
        <div>
          <label className="block text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">
            {state.txnType === 'TRANSFER' ? 'Source Account' : 'Investment'}
          </label>
          {state.txnType === 'TRANSFER' ? (
            <select
              value={state.sourceAccountId ?? ''}
              onChange={(e) => setState((prev) => ({ ...prev, sourceAccountId: e.target.value }))}
              className="input-field w-full"
            >
              <option value="">Select account…</option>
              {accounts.map((a) => (
                <option key={a.id} value={a.id}>{a.accountTypeLabel} — {a.nuban} ({formatNaira(a.balance)})</option>
              ))}
            </select>
          ) : (
            <select
              value={state.investmentId ?? ''}
              onChange={(e) => setState((prev) => ({ ...prev, investmentId: e.target.value }))}
              className="input-field w-full"
            >
              <option value="">Select investment…</option>
              {investments.map((inv) => (
                <option key={inv.id} value={inv.id}>
                  {inv.cbsRef} — {inv.product} {formatNaira(inv.principalAmt)} @ {inv.intRate}% — {inv.status}
                </option>
              ))}
            </select>
          )}
          {investments.length === 0 && state.txnType !== 'TRANSFER' && (
            <p className="text-xs text-amber-600 mt-1 flex items-center gap-1"><AlertCircle size={12} /> No valid investments found for this transaction type.</p>
          )}
        </div>
      )}

      {/* Voucher preview */}
      {state.txnType && (
        <div className="flex items-center gap-2 p-3 bg-muted/40 rounded-xl border border-border text-sm">
          <FileText size={16} className="text-primary shrink-0" />
          <span className="text-muted-foreground">Voucher type:</span>
          <span className="font-semibold text-foreground">{VOUCHER_MAP[state.txnType]}</span>
        </div>
      )}

      {/* Validation hint */}
      {!isStep1Valid(state) && (
        <p className="text-xs text-amber-600 flex items-center gap-1"><Info size={12} /> Select type, scenario, customer{state.txnType !== 'INFLOW' ? ', and investment' : ''} to continue.</p>
      )}
    </div>
  );
}

// ─── Step 2 ───────────────────────────────────────────────────────────────────

interface Step2Props {
  state: WizardState;
  setState: React.Dispatch<React.SetStateAction<WizardState>>;
  needsBeneficiary: boolean;
  beneficiaries: Beneficiary[];
  banks: Bank[];
  showBeneficiaryDrop: boolean;
  setShowBeneficiaryDrop: (v: boolean) => void;
  nameEnquiryLoading: boolean;
  nameEnquiryResult: string;
  handleNameEnquiry: () => void;
  fileInputRef: React.RefObject<HTMLInputElement | null>;
  handleFileUpload: (e: React.ChangeEvent<HTMLInputElement>) => void;
}

function Step2({ state, setState, needsBeneficiary, beneficiaries, banks, showBeneficiaryDrop, setShowBeneficiaryDrop, nameEnquiryLoading, nameEnquiryResult, handleNameEnquiry, fileInputRef, handleFileUpload }: Step2Props) {
  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-base font-semibold text-foreground mb-1">Step 2 — Instruction Details</h2>
        <p className="text-sm text-muted-foreground">Record the instruction channel, date/time received, and upload the scan.</p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {/* Channel */}
        <div>
          <label className="block text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1.5">Instruction Channel *</label>
          <select value={state.channel} onChange={(e) => setState((p) => ({ ...p, channel: e.target.value }))} className="input-field w-full">
            <option value="">Select channel…</option>
            {INSTRUCTION_CHANNELS.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
        </div>

        {/* Amount */}
        <div>
          <label className="block text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1.5">Amount (₦) *</label>
          <input type="text" placeholder="e.g. 5000000" value={state.amount} onChange={(e) => setState((p) => ({ ...p, amount: e.target.value }))} className="input-field w-full" />
        </div>

        {/* Date received */}
        <div>
          <label className="block text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1.5">Date Received *</label>
          <input type="date" value={state.dateReceived} onChange={(e) => setState((p) => ({ ...p, dateReceived: e.target.value }))} className="input-field w-full" />
        </div>

        {/* Time received */}
        <div>
          <label className="block text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1.5">Time Received *</label>
          <input type="time" value={state.timeReceived} onChange={(e) => setState((p) => ({ ...p, timeReceived: e.target.value }))} className="input-field w-full" />
          <p className="text-[10px] text-muted-foreground mt-1">SLA clock starts from this time</p>
        </div>
      </div>

      {/* Purpose */}
      <div>
        <label className="block text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1.5">Purpose *</label>
        <textarea rows={2} placeholder="Brief purpose of the transaction…" value={state.purpose} onChange={(e) => setState((p) => ({ ...p, purpose: e.target.value }))} className="input-field w-full resize-none" />
      </div>

      {/* Instruction scan upload */}
      <div>
        <label className="block text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1.5">Instruction Scan (PDF / Image)</label>
        <input ref={fileInputRef} type="file" accept="application/pdf,image/*" onChange={handleFileUpload} className="hidden" />
        {state.instructionScanDataUrl ? (
          <div className="relative border-2 border-primary rounded-xl overflow-hidden">
            {state.instructionScanDataUrl.startsWith('data:image') ? (
              <img src={state.instructionScanDataUrl} alt="Instruction scan preview" className="w-full max-h-48 object-contain bg-muted" />
            ) : (
              <div className="flex items-center gap-3 p-4 bg-muted/40">
                <FileText size={24} className="text-primary" />
                <span className="text-sm font-medium text-foreground">PDF uploaded</span>
              </div>
            )}
            <button onClick={() => setState((p) => ({ ...p, instructionScanDataUrl: null }))} className="absolute top-2 right-2 w-6 h-6 bg-red-500 text-white rounded-full flex items-center justify-center hover:bg-red-600">
              <X size={12} />
            </button>
          </div>
        ) : (
          <button onClick={() => fileInputRef.current?.click()} className="w-full border-2 border-dashed border-border rounded-xl p-6 flex flex-col items-center gap-2 hover:border-primary/50 hover:bg-primary/5 transition-colors">
            <Upload size={20} className="text-muted-foreground" />
            <span className="text-sm text-muted-foreground">Click to upload instruction scan</span>
            <span className="text-xs text-muted-foreground">PDF or image, stored as data URL in demo</span>
          </button>
        )}
      </div>

      {/* Beneficiary section */}
      {needsBeneficiary && (
        <div className="border-2 border-amber-200 dark:border-amber-800 rounded-xl p-4 bg-amber-50 dark:bg-amber-950/20 space-y-4">
          <div className="flex items-center gap-2">
            <AlertCircle size={16} className="text-amber-600" />
            <h3 className="text-sm font-semibold text-amber-700 dark:text-amber-400">Beneficiary Details Required</h3>
          </div>

          {/* Pick saved beneficiary */}
          <div className="relative">
            <label className="block text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1.5">Pick Saved Beneficiary</label>
            <button onClick={() => setShowBeneficiaryDrop((o) => !o)} className="input-field w-full text-left flex items-center justify-between">
              <span className={state.beneficiaryName ? 'text-foreground' : 'text-muted-foreground'}>{state.beneficiaryName || 'Select saved beneficiary…'}</span>
              <ChevronDown size={14} />
            </button>
            {showBeneficiaryDrop && (
              <div className="absolute z-20 top-full left-0 right-0 mt-1 bg-card border border-border rounded-xl shadow-xl max-h-40 overflow-y-auto">
                {beneficiaries.length === 0 && <p className="px-3 py-2 text-xs text-muted-foreground">No saved beneficiaries</p>}
                {beneficiaries.map((b) => (
                  <button key={b.id} className="w-full px-3 py-2 hover:bg-muted text-left" onClick={() => {
                    setState((p) => ({ ...p, beneficiaryName: b.beneficiaryName, beneficiaryBank: b.bankId, beneficiaryAccount: b.accountNumber }));
                    setShowBeneficiaryDrop(false);
                  }}>
                    <p className="text-xs font-semibold text-foreground">{b.beneficiaryName}</p>
                    <p className="text-[10px] text-muted-foreground">{b.bankName} · {b.accountNumber}</p>
                  </button>
                ))}
              </div>
            )}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1.5">Beneficiary Name *</label>
              <input type="text" value={state.beneficiaryName} onChange={(e) => setState((p) => ({ ...p, beneficiaryName: e.target.value }))} className="input-field w-full" placeholder="Full name" />
            </div>
            <div>
              <label className="block text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1.5">Bank *</label>
              <select value={state.beneficiaryBank} onChange={(e) => setState((p) => ({ ...p, beneficiaryBank: e.target.value }))} className="input-field w-full">
                <option value="">Select bank…</option>
                {banks.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1.5">Account Number * (10 digits)</label>
              <div className="flex gap-2">
                <input
                  type="text"
                  maxLength={10}
                  value={state.beneficiaryAccount}
                  onChange={(e) => setState((p) => ({ ...p, beneficiaryAccount: e.target.value.replace(/\D/g, '') }))}
                  className={`input-field flex-1 ${state.beneficiaryAccount.length > 0 && state.beneficiaryAccount.length !== 10 ? 'border-red-400' : ''}`}
                  placeholder="0123456789"
                />
                <button onClick={handleNameEnquiry} disabled={nameEnquiryLoading || state.beneficiaryAccount.length !== 10 || !state.beneficiaryBank} className="btn-secondary text-xs px-3 disabled:opacity-40 flex items-center gap-1">
                  {nameEnquiryLoading ? <Loader2 size={12} className="animate-spin" /> : <Search size={12} />}
                  Enquire
                </button>
              </div>
              {nameEnquiryResult && (
                <p className="text-xs text-emerald-600 mt-1 flex items-center gap-1"><CheckCircle2 size={11} /> {nameEnquiryResult}</p>
              )}
              {state.beneficiaryAccount.length > 0 && state.beneficiaryAccount.length !== 10 && (
                <p className="text-xs text-red-500 mt-1">Must be exactly 10 digits</p>
              )}
            </div>
            <div>
              <label className="block text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1.5">Beneficiary Amount (₦)</label>
              <input type="text" value={state.beneficiaryAmount} onChange={(e) => setState((p) => ({ ...p, beneficiaryAmount: e.target.value }))} className="input-field w-full" placeholder="Amount to beneficiary" />
            </div>
          </div>
          <div>
            <label className="block text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1.5">Beneficiary Purpose</label>
            <input type="text" value={state.beneficiaryPurpose} onChange={(e) => setState((p) => ({ ...p, beneficiaryPurpose: e.target.value }))} className="input-field w-full" placeholder="Purpose of transfer" />
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Step 3 ───────────────────────────────────────────────────────────────────

interface Step3Props {
  state: WizardState;
  setState: React.Dispatch<React.SetStateAction<WizardState>>;
  signatories: Signatory[];
  mandate: Mandate | null;
  onStopProcessing: () => void;
}

function Step3({ state, setState, signatories, mandate, onStopProcessing }: Step3Props) {
  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-base font-semibold text-foreground mb-1">Step 3 — Signature & Mandate Verification</h2>
        <p className="text-sm text-muted-foreground">Compare the instruction scan with specimen signatures and verify the mandate.</p>
      </div>

      {/* Split view */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Left: instruction scan */}
        <div className="border border-border rounded-xl overflow-hidden">
          <div className="px-3 py-2 bg-muted/40 border-b border-border text-xs font-semibold text-muted-foreground uppercase tracking-wide">Instruction Scan</div>
          <div className="p-3 min-h-[200px] flex items-center justify-center">
            {state.instructionScanDataUrl ? (
              state.instructionScanDataUrl.startsWith('data:image') ? (
                <img src={state.instructionScanDataUrl} alt="Instruction scan" className="max-h-64 object-contain w-full" />
              ) : (
                <div className="flex flex-col items-center gap-2 text-muted-foreground">
                  <FileText size={32} />
                  <span className="text-sm">PDF instruction uploaded</span>
                </div>
              )
            ) : (
              <div className="flex flex-col items-center gap-2 text-muted-foreground">
                <Eye size={32} />
                <span className="text-sm">No scan uploaded in Step 2</span>
              </div>
            )}
          </div>
        </div>

        {/* Right: specimen signatures */}
        <div className="border border-border rounded-xl overflow-hidden">
          <div className="px-3 py-2 bg-muted/40 border-b border-border text-xs font-semibold text-muted-foreground uppercase tracking-wide">
            Specimen Signatures & Mandate
          </div>
          <div className="p-3 space-y-3">
            {mandate && (
              <div className="p-2 bg-primary/5 rounded-lg border border-primary/20 text-xs">
                <span className="font-semibold text-primary">Mandate Rule: </span>
                <span className="text-foreground">{mandate.description}</span>
              </div>
            )}
            {signatories.length === 0 && (
              <p className="text-xs text-muted-foreground text-center py-4">No signatories on record</p>
            )}
            {signatories.map((sig) => (
              <div key={sig.id} className="flex items-start gap-3 p-2 rounded-lg border border-border bg-card">
                <div className="shrink-0">
                  <div className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${sig.signatoryClass === 'A' ? 'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300' : 'bg-purple-100 text-purple-700 dark:bg-purple-900/40 dark:text-purple-300'}`}>
                    Class {sig.signatoryClass}
                  </div>
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-semibold text-foreground">{sig.name}</p>
                  <div
                    className="mt-1 border border-border rounded bg-white dark:bg-gray-900 p-1"
                    dangerouslySetInnerHTML={{ __html: sig.specimenSvg }}
                  />
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Verification checkboxes */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {[
          { key: 'sigVerified', label: 'Signature verified', desc: 'Signature on instruction matches specimen' },
          { key: 'mandateSatisfied', label: 'Mandate satisfied', desc: 'Mandate rule has been met' },
          { key: 'ownershipConfirmed', label: 'Account ownership confirmed', desc: 'Instruction is from account owner' },
          { key: 'instructionComplete', label: 'Instruction complete', desc: 'All required fields present on instruction' },
        ].map(({ key, label, desc }) => {
          const checked = state[key as keyof WizardState] as boolean;
          return (
            <label key={key} className={`flex items-start gap-3 p-3 rounded-xl border-2 cursor-pointer transition-all
              ${checked ? 'border-emerald-400 bg-emerald-50 dark:bg-emerald-950/30' : 'border-border bg-card hover:border-primary/40'}`}>
              <div className={`w-5 h-5 rounded border-2 shrink-0 mt-0.5 flex items-center justify-center transition-colors
                ${checked ? 'bg-emerald-500 border-emerald-500' : 'border-border'}`}>
                {checked && <Check size={11} className="text-white" />}
              </div>
              <input type="checkbox" className="sr-only" checked={checked} onChange={(e) => setState((p) => ({ ...p, [key]: e.target.checked }))} />
              <div>
                <p className="text-xs font-semibold text-foreground">{label}</p>
                <p className="text-[10px] text-muted-foreground">{desc}</p>
              </div>
            </label>
          );
        })}
      </div>

      {/* Stop processing button */}
      <div className="pt-2">
        <button
          onClick={onStopProcessing}
          className="flex items-center gap-2 px-4 py-2.5 bg-red-600 hover:bg-red-700 text-white rounded-xl text-sm font-semibold transition-colors"
        >
          <ShieldAlert size={16} />
          Signature differs — Stop processing
        </button>
        <p className="text-[10px] text-muted-foreground mt-1.5">Use this if the signature on the instruction does not match the specimen. This will halt the transaction.</p>
      </div>
    </div>
  );
}

// ─── Step 4 ───────────────────────────────────────────────────────────────────

interface Step4Props {
  state: WizardState;
  setState: React.Dispatch<React.SetStateAction<WizardState>>;
  selectedCustomer: Customer | null;
  session: ReturnType<typeof getSession>;
}

function Step4({ state, setState, selectedCustomer, session }: Step4Props) {
  const allConfirmed = state.confirmAmount && state.confirmInstruction && state.confirmBeneficiary && state.confirmPurpose;

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-base font-semibold text-foreground mb-1">Step 4 — Customer Call-Back</h2>
        <p className="text-sm text-muted-foreground">Call the customer to confirm the instruction. All four items must be confirmed to proceed.</p>
      </div>

      {/* Registered phone */}
      {selectedCustomer && (
        <div className="flex items-center gap-3 p-3 bg-primary/5 rounded-xl border border-primary/20">
          <Phone size={18} className="text-primary shrink-0" />
          <div>
            <p className="text-xs text-muted-foreground">Registered phone</p>
            <p className="text-sm font-semibold text-foreground">{selectedCustomer.phone}</p>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div>
          <label className="block text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1.5">Call Date *</label>
          <input type="date" value={state.callDate} onChange={(e) => setState((p) => ({ ...p, callDate: e.target.value }))} className="input-field w-full" />
        </div>
        <div>
          <label className="block text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1.5">Call Time *</label>
          <input type="time" value={state.callTime} onChange={(e) => setState((p) => ({ ...p, callTime: e.target.value }))} className="input-field w-full" />
        </div>
        <div>
          <label className="block text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1.5">Officer</label>
          <input type="text" value={state.callOfficer || session?.user.name || ''} onChange={(e) => setState((p) => ({ ...p, callOfficer: e.target.value }))} className="input-field w-full" placeholder="Officer name" />
        </div>
      </div>

      {/* Four confirmations */}
      <div>
        <label className="block text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">Confirmations</label>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          {[
            { key: 'confirmAmount', label: 'Amount', desc: `₦${state.amount || '—'}` },
            { key: 'confirmInstruction', label: 'Instruction', desc: state.purpose || '—' },
            { key: 'confirmBeneficiary', label: 'Beneficiary', desc: state.beneficiaryName || 'N/A' },
            { key: 'confirmPurpose', label: 'Purpose', desc: state.beneficiaryPurpose || state.purpose || '—' },
          ].map(({ key, label, desc }) => {
            const confirmed = state[key as keyof WizardState] as boolean;
            return (
              <label key={key} className={`flex items-center gap-3 p-3 rounded-xl border-2 cursor-pointer transition-all
                ${confirmed ? 'border-emerald-400 bg-emerald-50 dark:bg-emerald-950/30' : 'border-border bg-card hover:border-primary/40'}`}>
                <div className={`w-5 h-5 rounded border-2 shrink-0 flex items-center justify-center transition-colors
                  ${confirmed ? 'bg-emerald-500 border-emerald-500' : 'border-border'}`}>
                  {confirmed && <Check size={11} className="text-white" />}
                </div>
                <input type="checkbox" className="sr-only" checked={confirmed} onChange={(e) => setState((p) => ({ ...p, [key]: e.target.checked }))} />
                <div>
                  <p className="text-xs font-semibold text-foreground">{label} — <span className={confirmed ? 'text-emerald-600' : 'text-amber-600'}>{confirmed ? 'Confirmed' : 'Not confirmed'}</span></p>
                  <p className="text-[10px] text-muted-foreground truncate max-w-[160px]">{desc}</p>
                </div>
              </label>
            );
          })}
        </div>
      </div>

      {/* Outcome */}
      <div>
        <label className="block text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">Call Outcome *</label>
        <div className="flex flex-wrap gap-2">
          {(['CONFIRMED', 'UNREACHABLE', 'DISPUTED'] as const).map((o) => (
            <button
              key={o}
              onClick={() => setState((p) => ({ ...p, callOutcome: o }))}
              className={`px-4 py-2 rounded-xl border-2 text-sm font-medium transition-all
                ${state.callOutcome === o
                  ? o === 'CONFIRMED' ? 'border-emerald-500 bg-emerald-50 text-emerald-700 dark:bg-emerald-950/30 dark:text-emerald-300'
                    : o === 'DISPUTED'? 'border-red-500 bg-red-50 text-red-700 dark:bg-red-950/30 dark:text-red-300' :'border-amber-500 bg-amber-50 text-amber-700 dark:bg-amber-950/30 dark:text-amber-300' :'border-border bg-card text-muted-foreground hover:border-primary/40'}`}
            >
              {o === 'CONFIRMED' ? '✅ Confirmed' : o === 'UNREACHABLE' ? '📵 Customer unreachable' : '⚠️ Customer disputed'}
            </button>
          ))}
        </div>
      </div>

      {/* Warning banners */}
      {state.callOutcome === 'UNREACHABLE' && (
        <div className="flex items-start gap-2 p-3 bg-amber-50 dark:bg-amber-950/30 rounded-xl border border-amber-200 dark:border-amber-800">
          <AlertTriangle size={16} className="text-amber-600 shrink-0 mt-0.5" />
          <p className="text-xs text-amber-700 dark:text-amber-400">Customer unreachable — a CallbackLog will be saved and the transaction will remain in VERIFICATION. You cannot proceed until the customer is reached.</p>
        </div>
      )}
      {state.callOutcome === 'DISPUTED' && (
        <div className="flex items-start gap-2 p-3 bg-red-50 dark:bg-red-950/30 rounded-xl border border-red-200 dark:border-red-800">
          <XCircle size={16} className="text-red-600 shrink-0 mt-0.5" />
          <p className="text-xs text-red-700 dark:text-red-400">Customer disputed the transaction — a CallbackLog will be saved. You cannot proceed. Escalate to Head Treasury.</p>
        </div>
      )}
      {state.callOutcome === 'CONFIRMED' && !allConfirmed && (
        <div className="flex items-start gap-2 p-3 bg-amber-50 dark:bg-amber-950/30 rounded-xl border border-amber-200 dark:border-amber-800">
          <AlertCircle size={16} className="text-amber-600 shrink-0 mt-0.5" />
          <p className="text-xs text-amber-700 dark:text-amber-400">All four items (Amount, Instruction, Beneficiary, Purpose) must be confirmed to proceed.</p>
        </div>
      )}

      {/* Notes */}
      <div>
        <label className="block text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1.5">Call Notes</label>
        <textarea rows={3} value={state.callNotes} onChange={(e) => setState((p) => ({ ...p, callNotes: e.target.value }))} className="input-field w-full resize-none" placeholder="Notes from the call…" />
      </div>
    </div>
  );
}

// ─── Step 5 ───────────────────────────────────────────────────────────────────

interface Step5Props {
  state: WizardState;
  setState: React.Dispatch<React.SetStateAction<WizardState>>;
  selectedInvestment: Investment | null;
  cbsData: Record<string, string>;
  cbsRefreshing: boolean;
  cbsLastSynced: string | null;
  onRefresh: () => void;
  accounts: Account[];
}

function Step5({ state, setState, selectedInvestment, cbsData, cbsRefreshing, cbsLastSynced, onRefresh, accounts }: Step5Props) {
  const isInflow = state.txnType === 'INFLOW';
  const isTransfer = state.txnType === 'TRANSFER';
  const sourceAccount = accounts.find((a) => a.id === state.sourceAccountId);

  const inv = selectedInvestment;
  const principal = cbsData.principal || inv?.principalAmt || '0';
  let accrued = cbsData.accrued || '0';
  const rate = cbsData.rate || inv?.intRate || '0';
  const effectiveDate = cbsData.effectiveDate || inv?.effectiveDate || '';
  const maturityDate = cbsData.maturityDate || inv?.maturityDate || '';

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-base font-semibold text-foreground mb-1">Step 5 — Investment Verification (Eazybankz)</h2>
          <p className="text-sm text-muted-foreground">Confirm investment details match the CBS system.</p>
        </div>
        <button onClick={onRefresh} disabled={cbsRefreshing} className="btn-secondary flex items-center gap-2 text-sm disabled:opacity-60">
          <RefreshCw size={14} className={cbsRefreshing ? 'animate-spin' : ''} />
          {cbsRefreshing ? 'Refreshing…' : 'Refresh from Eazybankz'}
        </button>
      </div>

      {cbsLastSynced && (
        <p className="text-xs text-emerald-600 flex items-center gap-1"><CheckCircle2 size={12} /> Last synced {cbsLastSynced}</p>
      )}

      {isTransfer && sourceAccount && (
        <div className="p-4 bg-muted/40 rounded-xl border border-border">
          <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-3">Source Account</h3>
          <div className="grid grid-cols-2 gap-3">
            <div><p className="text-[10px] text-muted-foreground">Account Type</p><p className="text-sm font-semibold text-foreground">{sourceAccount.accountTypeLabel}</p></div>
            <div><p className="text-[10px] text-muted-foreground">NUBAN</p><p className="text-sm font-semibold text-foreground font-mono">{sourceAccount.nuban}</p></div>
            <div><p className="text-[10px] text-muted-foreground">Available Balance</p><p className="text-sm font-semibold text-foreground">{formatNaira(sourceAccount.balance)}</p></div>
            <div><p className="text-[10px] text-muted-foreground">Transaction Amount</p><p className="text-sm font-semibold text-foreground">{formatNaira(state.amount)}</p></div>
          </div>
        </div>
      )}

      {isInflow && (
        <div className="p-4 bg-emerald-50 dark:bg-emerald-950/30 rounded-xl border border-emerald-200 dark:border-emerald-800 space-y-3">
          <h3 className="text-xs font-semibold text-emerald-700 dark:text-emerald-400 uppercase tracking-wide">New Investment — Inflow Confirmation</h3>
          <div className="grid grid-cols-2 gap-3">
            <div><p className="text-[10px] text-muted-foreground">Principal Amount</p><p className="text-sm font-semibold text-foreground">{formatNaira(state.amount)}</p></div>
            <div><p className="text-[10px] text-muted-foreground">Purpose</p><p className="text-sm font-semibold text-foreground">{state.purpose || '—'}</p></div>
          </div>
          <label className="flex items-center gap-2 cursor-pointer">
            <div className={`w-5 h-5 rounded border-2 flex items-center justify-center transition-colors ${state.cbsConfirmed ? 'bg-emerald-500 border-emerald-500' : 'border-border'}`}>
              {state.cbsConfirmed && <Check size={11} className="text-white" />}
            </div>
            <input type="checkbox" className="sr-only" checked={state.cbsConfirmed} onChange={(e) => setState((p) => ({ ...p, cbsConfirmed: e.target.checked }))} />
            <span className="text-sm font-medium text-foreground">Confirm receipt of funds and source account</span>
          </label>
        </div>
      )}

      {!isInflow && !isTransfer && inv && (
        <div className="p-4 bg-muted/40 rounded-xl border border-border">
          <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-3">Investment Details — Read Only</h3>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            {[
              { label: 'Principal', value: formatNaira(principal) },
              { label: 'Accrued Interest (today)', value: formatNaira(accrued) },
              { label: 'Interest Rate', value: `${rate}% p.a.` },
              { label: 'Effective Date', value: formatDate(effectiveDate) },
              { label: 'Maturity Date', value: formatDate(maturityDate) },
              { label: 'Outstanding Balance', value: formatNaira(principal) },
              { label: 'Available Amount', value: formatNaira(principal) },
              { label: 'Product', value: inv.product },
              { label: 'CBS Ref', value: inv.cbsRef },
            ].map(({ label, value }) => (
              <div key={label}>
                <p className="text-[10px] text-muted-foreground">{label}</p>
                <p className="text-sm font-semibold text-foreground">{value}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {!isInflow && (
        <label className={`flex items-start gap-3 p-4 rounded-xl border-2 cursor-pointer transition-all
          ${state.cbsConfirmed ? 'border-emerald-400 bg-emerald-50 dark:bg-emerald-950/30' : 'border-border bg-card hover:border-primary/40'}`}>
          <div className={`w-5 h-5 rounded border-2 shrink-0 mt-0.5 flex items-center justify-center transition-colors
            ${state.cbsConfirmed ? 'bg-emerald-500 border-emerald-500' : 'border-border'}`}>
            {state.cbsConfirmed && <Check size={11} className="text-white" />}
          </div>
          <input type="checkbox" className="sr-only" checked={state.cbsConfirmed} onChange={(e) => setState((p) => ({ ...p, cbsConfirmed: e.target.checked }))} />
          <div>
            <p className="text-sm font-semibold text-foreground">I confirm these details match Eazybankz</p>
            <p className="text-xs text-muted-foreground">Checking this box passes control C04 and C11</p>
          </div>
        </label>
      )}
    </div>
  );
}

// ─── Wrapper with Suspense ────────────────────────────────────────────────────

export default function TxnWizardClient() {
  return (
    <Suspense fallback={
      <AppLayout allowedRoles={['TREASURY_OFFICER']}>
        <div className="flex items-center justify-center h-64">
          <Loader2 size={32} className="animate-spin text-primary" />
        </div>
      </AppLayout>
    }>
      <TxnWizardInner />
    </Suspense>
  );
}
