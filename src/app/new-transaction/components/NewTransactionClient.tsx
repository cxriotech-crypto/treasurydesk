'use client';
import React, { useState, useEffect } from 'react';
import AppLayout from '@/components/AppLayout';
import Stepper from '@/components/ui/Stepper';
import Modal from '@/components/ui/Modal';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { SEED_CUSTOMERS } from '@/services/seedData';
import { transactionService } from '@/services/transactionService';
import { getSession } from '@/services/userService';
import { calcInvestment } from '@/lib/calc';
import { formatNaira, formatDate, addDays, todayLagos, nowLagosISO, formatRate } from '@/lib/format';
import type { TxnType } from '@/types';
import { TXN_TYPE_LABELS } from '@/types';
import {
  Search, CheckCircle2, AlertCircle, Loader2, ChevronRight, ChevronLeft,
  FileText, Phone, Server, Receipt, CheckSquare, Zap, ShieldCheck, User
} from 'lucide-react';
import { toast } from 'sonner';
import { useRouter } from 'next/navigation';
import Decimal from 'decimal.js';

// ─── Step definitions ────────────────────────────────────────────────────────
const STEPS = [
  { id: 'instruction', label: 'Instruction', description: 'Customer & amount', icon: FileText },
  { id: 'mandate', label: 'Mandate Verify', description: 'Signature check', icon: ShieldCheck },
  { id: 'callback', label: 'Callback', description: 'Customer call-back', icon: Phone },
  { id: 'cbs', label: 'CBS Verify', description: 'Eazybankz check', icon: Server },
  { id: 'voucher', label: 'Voucher', description: 'Generate voucher', icon: Receipt },
  { id: 'approval', label: 'Approval', description: 'Route for approval', icon: CheckSquare },
  { id: 'execution', label: 'Execution', description: 'Ops execution', icon: Zap },
  { id: 'confirmation', label: 'Confirmation', description: 'Final confirm', icon: CheckCircle2 },
];

// ─── Zod schemas per step ────────────────────────────────────────────────────
const step1Schema = z.object({
  customerId: z.string().min(1, 'Select a customer'),
  type: z.enum(['FO', 'FD', 'TB', 'CP', 'RP', 'OD'] as const),
  principalAmt: z.string().min(1, 'Principal is required').refine((v) => {
    try { return new Decimal(v.replace(/,/g, '')).gt(0); } catch { return false; }
  }, 'Enter a valid positive amount'),
  intRate: z.string().min(1, 'Rate is required').refine((v) => {
    try { const d = new Decimal(v); return d.gt(0) && d.lte(100); } catch { return false; }
  }, 'Rate must be between 0.01 and 100'),
  tenorDays: z.string().min(1, 'Tenor is required').refine((v) => Number(v) > 0 && Number(v) <= 1825, 'Tenor must be 1–1825 days'),
  effectiveDate: z.string().min(1, 'Effective date is required'),
  narration: z.string().min(5, 'Provide a brief narration').max(200),
});
type Step1Form = z.infer<typeof step1Schema>;

const step2Schema = z.object({
  signatoryName: z.string().min(2, 'Enter signatory name'),
  mandateRef: z.string().min(3, 'Enter mandate reference'),
  mandateMatch: z.literal('YES', { errorMap: () => ({ message: 'Confirm mandate matches' }) }),
  verifierNotes: z.string().optional(),
});
type Step2Form = z.infer<typeof step2Schema>;

const step3Schema = z.object({
  callbackPhone: z.string().min(11, 'Enter valid phone number'),
  callbackOutcome: z.enum(['CONFIRMED', 'NO_ANSWER', 'DISPUTED', 'RESCHEDULED'] as const),
  callbackNotes: z.string().min(5, 'Add callback notes'),
});
type Step3Form = z.infer<typeof step3Schema>;

const step4Schema = z.object({
  cbsRef: z.string().min(5, 'Enter Eazybankz reference'),
  cbsBalance: z.string().min(1, 'Enter confirmed balance'),
  cbsVerified: z.literal('YES', { errorMap: () => ({ message: 'Confirm CBS verification' }) }),
});
type Step4Form = z.infer<typeof step4Schema>;

export default function NewTransactionClient() {
  const [currentStep, setCurrentStep] = useState(0);
  const [completedSteps, setCompletedSteps] = useState<number[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [createdTxnRef, setCreatedTxnRef] = useState<string | null>(null);
  const [showSuccess, setShowSuccess] = useState(false);
  const [customerSearch, setCustomerSearch] = useState('');
  const [selectedCustomer, setSelectedCustomer] = useState<typeof SEED_CUSTOMERS[0] | null>(null);
  const [showCustomerDropdown, setShowCustomerDropdown] = useState(false);
  const router = useRouter();
  const session = getSession();

  // Computed investment figures from step 1 inputs
  const [calcResult, setCalcResult] = useState<{ interestAmt: string; withholdingTax: string; netInterest: string; totalPayout: string; maturityDate: string } | null>(null);

  const form1 = useForm<Step1Form>({ resolver: zodResolver(step1Schema), defaultValues: { type: 'FD', effectiveDate: todayLagos() } });
  const form2 = useForm<Step2Form>({ resolver: zodResolver(step2Schema) });
  const form3 = useForm<Step3Form>({ resolver: zodResolver(step3Schema), defaultValues: { callbackOutcome: 'CONFIRMED' } });
  const form4 = useForm<Step4Form>({ resolver: zodResolver(step4Schema) });

  // Watch step 1 fields for live calculation
  const watchPrincipal = form1.watch('principalAmt');
  const watchRate = form1.watch('intRate');
  const watchTenor = form1.watch('tenorDays');
  const watchDate = form1.watch('effectiveDate');

  useEffect(() => {
    try {
      const p = watchPrincipal?.replace(/,/g, '');
      const r = watchRate;
      const t = Number(watchTenor);
      if (p && r && t > 0) {
        const result = calcInvestment(p, r, t);
        const maturityDate = watchDate ? addDays(watchDate, t) : '';
        setCalcResult({ ...result, maturityDate });
      }
    } catch { /* ignore */ }
  }, [watchPrincipal, watchRate, watchTenor, watchDate]);

  const filteredCustomers = SEED_CUSTOMERS.filter(
    (c) =>
      c.isActive &&
      (c.name.toLowerCase().includes(customerSearch.toLowerCase()) ||
        c.cif.toLowerCase().includes(customerSearch.toLowerCase()) ||
        c.accountNumber.includes(customerSearch))
  );

  function getStepStatus(i: number): 'completed' | 'current' | 'pending' | 'error' {
    if (completedSteps.includes(i)) return 'completed';
    if (i === currentStep) return 'current';
    return 'pending';
  }

  async function handleStep1(data: Step1Form) {
    if (!selectedCustomer) { toast.error('Select a customer to continue.'); return; }
    setCompletedSteps((prev) => [...new Set([...prev, 0])]);
    setCurrentStep(1);
    toast.success('Customer instruction recorded.');
  }

  async function handleStep2(data: Step2Form) {
    if (data.mandateMatch !== 'YES') { toast.error('Mandate verification must be confirmed.'); return; }
    setCompletedSteps((prev) => [...new Set([...prev, 1])]);
    setCurrentStep(2);
    toast.success('Mandate verified successfully.');
  }

  async function handleStep3(data: Step3Form) {
    if (data.callbackOutcome === 'DISPUTED') {
      toast.error('Customer disputed the transaction — cannot proceed. Raise a query.');
      return;
    }
    if (data.callbackOutcome === 'NO_ANSWER' || data.callbackOutcome === 'RESCHEDULED') {
      toast.warning('Callback not confirmed — transaction is on hold pending re-call.');
      return;
    }
    setCompletedSteps((prev) => [...new Set([...prev, 2])]);
    setCurrentStep(3);
    toast.success('Customer callback confirmed.');
  }

  async function handleStep4(data: Step4Form) {
    if (data.cbsVerified !== 'YES') { toast.error('CBS verification must be confirmed.'); return; }
    setCompletedSteps((prev) => [...new Set([...prev, 3])]);
    setCurrentStep(4);
    toast.success('Eazybankz CBS verification complete.');
  }

  async function handleVoucherGenerate() {
    setCompletedSteps((prev) => [...new Set([...prev, 4])]);
    setCurrentStep(5);
    toast.success('Treasury voucher generated.');
  }

  async function handleRouteApproval() {
    setSubmitting(true);
    try {
      const step1Data = form1.getValues();
      const step4Data = form4.getValues();
      if (!selectedCustomer || !calcResult) throw new Error('Missing data.');

      const principal = step1Data.principalAmt.replace(/,/g, '');
      const today = todayLagos();
      const voucherNo = `VCH-${today.replace(/-/g, '')}-${Math.floor(Math.random() * 900) + 100}`;
      const txnRef = `TXN-${today.replace(/-/g, '').slice(0, 7).replace(/(\d{4})(\d{2})/, '$1-$2')}-${String(Math.floor(Math.random() * 900) + 100).padStart(3, '0')}`;

      await transactionService.create({
        ref: txnRef,
        customerId: selectedCustomer.id,
        customerName: selectedCustomer.name,
        customerCif: selectedCustomer.cif,
        accountNumber: selectedCustomer.accountNumber,
        type: step1Data.type as TxnType,
        principalAmt: principal,
        intRate: step1Data.intRate,
        tenorDays: Number(step1Data.tenorDays),
        effectiveDate: step1Data.effectiveDate,
        maturityDate: calcResult.maturityDate,
        interestAmt: calcResult.interestAmt,
        withholdingTax: calcResult.withholdingTax,
        netInterest: calcResult.netInterest,
        totalPayout: calcResult.totalPayout,
        status: 'PENDING_TO',
        currentApprovalLevel: 'TO',
        voucherNo,
        cbsRef: step4Data.cbsRef,
        mandateVerified: true,
        callbackDone: true,
        cbsVerified: true,
        initiatedBy: session?.user.name ?? 'Unknown',
        initiatedById: session?.user.id ?? 'usr-001',
        initiatedAt: nowLagosISO(),
        updatedAt: nowLagosISO(),
        approvals: [
          { id: `apr-new-1-${Date.now()}`, version: 1, txnId: '', level: 'TO', sequence: 1, status: 'PENDING' },
          { id: `apr-new-2-${Date.now()}`, version: 1, txnId: '', level: 'HT', sequence: 2, status: 'PENDING' },
          { id: `apr-new-3-${Date.now()}`, version: 1, txnId: '', level: 'MIS', sequence: 3, status: 'PENDING' },
          { id: `apr-new-4-${Date.now()}`, version: 1, txnId: '', level: 'AUDIT', sequence: 4, status: 'PENDING' },
          { id: `apr-new-5-${Date.now()}`, version: 1, txnId: '', level: 'MD', sequence: 5, status: 'PENDING' },
        ],
      });

      setCreatedTxnRef(txnRef);
      setCompletedSteps((prev) => [...new Set([...prev, 5, 6, 7])]);
      setCurrentStep(7);
      setShowSuccess(true);
      toast.success(`Transaction ${txnRef} routed to Treasury Officer for approval.`);
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : 'Failed to create transaction.');
    } finally {
      setSubmitting(false);
    }
  }

  const stepperSteps = STEPS.map((s, i) => ({
    id: s.id,
    label: s.label,
    description: s.description,
    status: getStepStatus(i),
  }));

  return (
    <AppLayout allowedRoles={['TREASURY_OFFICER', 'ACCOUNT_OFFICER']}>
      <div className="mb-6">
        <h1 className="page-title">New Treasury Transaction</h1>
        <p className="text-sm text-muted-foreground mt-1">Follow the 8-step treasury SOP to initiate and route a new transaction.</p>
      </div>

      <div className="card p-4 mb-6 overflow-x-auto">
        <Stepper steps={stepperSteps} orientation="horizontal" />
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-3 2xl:grid-cols-3 gap-6">
        {/* Main Form */}
        <div className="xl:col-span-2 card p-6">
          {/* Step 1: Customer Instruction */}
          {currentStep === 0 && (
            <form onSubmit={form1.handleSubmit(handleStep1)} className="space-y-5">
              <div className="flex items-center gap-2 mb-4">
                <div className="w-7 h-7 rounded-full bg-primary text-white text-xs font-bold flex items-center justify-center">1</div>
                <div>
                  <h2 className="section-header">Customer Instruction</h2>
                  <p className="text-xs text-muted-foreground">Capture the customer's investment instruction</p>
                </div>
              </div>

              {/* Customer Search */}
              <div className="relative">
                <label className="label-text">Customer (CIF / Name / Account)</label>
                <div className="relative">
                  <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                  <input
                    type="text"
                    value={selectedCustomer ? selectedCustomer.name : customerSearch}
                    onChange={(e) => { setCustomerSearch(e.target.value); setSelectedCustomer(null); setShowCustomerDropdown(true); }}
                    onFocus={() => setShowCustomerDropdown(true)}
                    placeholder="Search by name, CIF or account number…"
                    className="input-field pl-8"
                  />
                </div>
                {showCustomerDropdown && !selectedCustomer && filteredCustomers.length > 0 && (
                  <div className="absolute top-full left-0 right-0 mt-1 bg-card border border-border rounded-xl shadow-xl z-20 overflow-hidden max-h-52 overflow-y-auto">
                    {filteredCustomers.map((c) => (
                      <button
                        key={`cust-opt-${c.id}`}
                        type="button"
                        onClick={() => { setSelectedCustomer(c); form1.setValue('customerId', c.id); setShowCustomerDropdown(false); setCustomerSearch(''); }}
                        className="w-full px-4 py-3 text-left hover:bg-muted/60 transition-colors border-b border-border last:border-0"
                      >
                        <p className="text-sm font-semibold text-foreground">{c.name}</p>
                        <p className="text-xs text-muted-foreground">{c.cif} · {c.accountNumber} · {c.accountType}</p>
                      </button>
                    ))}
                  </div>
                )}
                {form1.formState.errors.customerId && (
                  <p className="text-red-600 text-xs mt-1 flex items-center gap-1"><AlertCircle size={11} /> {form1.formState.errors.customerId.message}</p>
                )}
              </div>

              {/* Selected Customer Card */}
              {selectedCustomer && (
                <div className="bg-accent/5 border border-accent/20 rounded-xl px-4 py-3 flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-full bg-primary text-white text-xs font-bold flex items-center justify-center">
                      <User size={14} />
                    </div>
                    <div>
                      <p className="text-sm font-semibold text-foreground">{selectedCustomer.name}</p>
                      <p className="text-xs text-muted-foreground">{selectedCustomer.cif} · {selectedCustomer.accountNumber}</p>
                    </div>
                  </div>
                  <span className={`text-xs px-2 py-0.5 rounded-full font-semibold ${selectedCustomer.kycStatus === 'VERIFIED' ? 'bg-green-100 text-green-700' : 'bg-amber-100 text-amber-700'}`}>
                    KYC {selectedCustomer.kycStatus}
                  </span>
                </div>
              )}

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="label-text">Instrument Type</label>
                  <select className="input-field" {...form1.register('type')}>
                    {Object.entries(TXN_TYPE_LABELS).map(([k, v]) => (
                      <option key={`type-${k}`} value={k}>{k} — {v}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="label-text">Effective Date</label>
                  <input type="date" className="input-field" {...form1.register('effectiveDate')} />
                  {form1.formState.errors.effectiveDate && <p className="text-red-600 text-xs mt-1">{form1.formState.errors.effectiveDate.message}</p>}
                </div>
              </div>

              <div className="grid grid-cols-3 gap-4">
                <div>
                  <label className="label-text">Principal Amount (₦)</label>
                  <p className="text-[10px] text-muted-foreground mb-1">Enter full amount without commas</p>
                  <input type="text" placeholder="500000000.00" className={`input-field ${form1.formState.errors.principalAmt ? 'border-red-400' : ''}`} {...form1.register('principalAmt')} />
                  {form1.formState.errors.principalAmt && <p className="text-red-600 text-xs mt-1 flex items-center gap-1"><AlertCircle size={11} /> {form1.formState.errors.principalAmt.message}</p>}
                </div>
                <div>
                  <label className="label-text">Annual Interest Rate (%)</label>
                  <p className="text-[10px] text-muted-foreground mb-1">e.g. 18.50</p>
                  <input type="text" placeholder="18.50" className={`input-field ${form1.formState.errors.intRate ? 'border-red-400' : ''}`} {...form1.register('intRate')} />
                  {form1.formState.errors.intRate && <p className="text-red-600 text-xs mt-1 flex items-center gap-1"><AlertCircle size={11} /> {form1.formState.errors.intRate.message}</p>}
                </div>
                <div>
                  <label className="label-text">Tenor (Days)</label>
                  <p className="text-[10px] text-muted-foreground mb-1">1–1825 days</p>
                  <input type="number" placeholder="91" className={`input-field ${form1.formState.errors.tenorDays ? 'border-red-400' : ''}`} {...form1.register('tenorDays')} />
                  {form1.formState.errors.tenorDays && <p className="text-red-600 text-xs mt-1 flex items-center gap-1"><AlertCircle size={11} /> {form1.formState.errors.tenorDays.message}</p>}
                </div>
              </div>

              <div>
                <label className="label-text">Narration / Instruction Notes</label>
                <p className="text-[10px] text-muted-foreground mb-1">Brief description of the customer's instruction</p>
                <textarea rows={2} placeholder="Customer instructed placement of FD per attached letter ref…" className={`input-field resize-none ${form1.formState.errors.narration ? 'border-red-400' : ''}`} {...form1.register('narration')} />
                {form1.formState.errors.narration && <p className="text-red-600 text-xs mt-1 flex items-center gap-1"><AlertCircle size={11} /> {form1.formState.errors.narration.message}</p>}
              </div>

              <div className="flex justify-end pt-2">
                <button type="submit" className="btn-primary gap-2">
                  Next: Mandate Verification <ChevronRight size={14} />
                </button>
              </div>
            </form>
          )}

          {/* Step 2: Mandate Verification */}
          {currentStep === 1 && (
            <form onSubmit={form2.handleSubmit(handleStep2)} className="space-y-5">
              <div className="flex items-center gap-2 mb-4">
                <div className="w-7 h-7 rounded-full bg-primary text-white text-xs font-bold flex items-center justify-center">2</div>
                <div>
                  <h2 className="section-header">Mandate Verification</h2>
                  <p className="text-xs text-muted-foreground">Verify customer signature against mandate card on file</p>
                </div>
              </div>

              <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 text-xs text-amber-800">
                <strong>SOP Requirement:</strong> The treasury officer must physically verify the customer&apos;s signature on the instruction letter against the mandate card on file before proceeding.
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="label-text">Signatory Name</label>
                  <input type="text" placeholder="As on mandate card" className={`input-field ${form2.formState.errors.signatoryName ? 'border-red-400' : ''}`} {...form2.register('signatoryName')} />
                  {form2.formState.errors.signatoryName && <p className="text-red-600 text-xs mt-1">{form2.formState.errors.signatoryName.message}</p>}
                </div>
                <div>
                  <label className="label-text">Mandate Reference</label>
                  <input type="text" placeholder="MND-XXXXXX" className={`input-field ${form2.formState.errors.mandateRef ? 'border-red-400' : ''}`} {...form2.register('mandateRef')} />
                  {form2.formState.errors.mandateRef && <p className="text-red-600 text-xs mt-1">{form2.formState.errors.mandateRef.message}</p>}
                </div>
              </div>

              <div>
                <label className="label-text">Signature Match Confirmation</label>
                <p className="text-[10px] text-muted-foreground mb-1">Select YES only after physically comparing signatures</p>
                <select className={`input-field ${form2.formState.errors.mandateMatch ? 'border-red-400' : ''}`} {...form2.register('mandateMatch')}>
                  <option value="">— Select —</option>
                  <option value="YES">YES — Signatures match</option>
                  <option value="NO">NO — Signatures do not match (stop)</option>
                </select>
                {form2.formState.errors.mandateMatch && <p className="text-red-600 text-xs mt-1">{form2.formState.errors.mandateMatch.message}</p>}
              </div>

              <div>
                <label className="label-text">Verification Notes (Optional)</label>
                <textarea rows={2} placeholder="Any notes on the mandate verification…" className="input-field resize-none" {...form2.register('verifierNotes')} />
              </div>

              <div className="flex justify-between pt-2">
                <button type="button" onClick={() => setCurrentStep(0)} className="btn-ghost gap-2">
                  <ChevronLeft size={14} /> Back
                </button>
                <button type="submit" className="btn-primary gap-2">
                  Next: Customer Callback <ChevronRight size={14} />
                </button>
              </div>
            </form>
          )}

          {/* Step 3: Customer Callback */}
          {currentStep === 2 && (
            <form onSubmit={form3.handleSubmit(handleStep3)} className="space-y-5">
              <div className="flex items-center gap-2 mb-4">
                <div className="w-7 h-7 rounded-full bg-primary text-white text-xs font-bold flex items-center justify-center">3</div>
                <div>
                  <h2 className="section-header">Customer Callback</h2>
                  <p className="text-xs text-muted-foreground">Call the customer back to verbally confirm the instruction</p>
                </div>
              </div>

              <div className="bg-blue-50 border border-blue-200 rounded-xl px-4 py-3 text-xs text-blue-800">
                <strong>SOP Requirement:</strong> Call the customer on their registered phone number to verbally confirm the amount, rate, and tenor before proceeding.
                {selectedCustomer && <span className="block mt-1 font-mono">Registered phone: {selectedCustomer.phone}</span>}
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="label-text">Phone Number Used</label>
                  <input type="tel" placeholder="08012345678" defaultValue={selectedCustomer?.phone ?? ''} className={`input-field ${form3.formState.errors.callbackPhone ? 'border-red-400' : ''}`} {...form3.register('callbackPhone')} />
                  {form3.formState.errors.callbackPhone && <p className="text-red-600 text-xs mt-1">{form3.formState.errors.callbackPhone.message}</p>}
                </div>
                <div>
                  <label className="label-text">Callback Outcome</label>
                  <select className={`input-field ${form3.formState.errors.callbackOutcome ? 'border-red-400' : ''}`} {...form3.register('callbackOutcome')}>
                    <option value="CONFIRMED">CONFIRMED — Customer confirmed</option>
                    <option value="NO_ANSWER">NO ANSWER — Schedule re-call</option>
                    <option value="DISPUTED">DISPUTED — Customer disputes</option>
                    <option value="RESCHEDULED">RESCHEDULED — Call back later</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="label-text">Callback Notes</label>
                <textarea rows={2} placeholder="Customer verbally confirmed ₦500M at 18.5% for 91 days…" className={`input-field resize-none ${form3.formState.errors.callbackNotes ? 'border-red-400' : ''}`} {...form3.register('callbackNotes')} />
                {form3.formState.errors.callbackNotes && <p className="text-red-600 text-xs mt-1">{form3.formState.errors.callbackNotes.message}</p>}
              </div>

              <div className="flex justify-between pt-2">
                <button type="button" onClick={() => setCurrentStep(1)} className="btn-ghost gap-2">
                  <ChevronLeft size={14} /> Back
                </button>
                <button type="submit" className="btn-primary gap-2">
                  Next: CBS Verification <ChevronRight size={14} />
                </button>
              </div>
            </form>
          )}

          {/* Step 4: CBS Verification */}
          {currentStep === 3 && (
            <form onSubmit={form4.handleSubmit(handleStep4)} className="space-y-5">
              <div className="flex items-center gap-2 mb-4">
                <div className="w-7 h-7 rounded-full bg-primary text-white text-xs font-bold flex items-center justify-center">4</div>
                <div>
                  <h2 className="section-header">CBS Verification (Eazybankz)</h2>
                  <p className="text-xs text-muted-foreground">Verify investment in the core banking system</p>
                </div>
              </div>

              <div className="bg-teal-50 border border-teal-200 rounded-xl px-4 py-3 text-xs text-teal-800">
                <strong>SOP Requirement:</strong> Log into Eazybankz CBS and verify the customer&apos;s account balance is sufficient and that the investment can be posted. Record the CBS reference number below.
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="label-text">Eazybankz CBS Reference</label>
                  <input type="text" placeholder="EZB-2026-XXXXX" className={`input-field ${form4.formState.errors.cbsRef ? 'border-red-400' : ''}`} {...form4.register('cbsRef')} />
                  {form4.formState.errors.cbsRef && <p className="text-red-600 text-xs mt-1">{form4.formState.errors.cbsRef.message}</p>}
                </div>
                <div>
                  <label className="label-text">Confirmed Account Balance (₦)</label>
                  <input type="text" placeholder="600000000.00" className={`input-field ${form4.formState.errors.cbsBalance ? 'border-red-400' : ''}`} {...form4.register('cbsBalance')} />
                  {form4.formState.errors.cbsBalance && <p className="text-red-600 text-xs mt-1">{form4.formState.errors.cbsBalance.message}</p>}
                </div>
              </div>

              <div>
                <label className="label-text">CBS Verification Confirmation</label>
                <select className={`input-field ${form4.formState.errors.cbsVerified ? 'border-red-400' : ''}`} {...form4.register('cbsVerified')}>
                  <option value="">— Select —</option>
                  <option value="YES">YES — Investment verified in Eazybankz</option>
                  <option value="NO">NO — Cannot verify (stop)</option>
                </select>
                {form4.formState.errors.cbsVerified && <p className="text-red-600 text-xs mt-1">{form4.formState.errors.cbsVerified.message}</p>}
              </div>

              <div className="flex justify-between pt-2">
                <button type="button" onClick={() => setCurrentStep(2)} className="btn-ghost gap-2">
                  <ChevronLeft size={14} /> Back
                </button>
                <button type="submit" className="btn-primary gap-2">
                  Next: Generate Voucher <ChevronRight size={14} />
                </button>
              </div>
            </form>
          )}

          {/* Step 5: Voucher */}
          {currentStep === 4 && (
            <div className="space-y-5">
              <div className="flex items-center gap-2 mb-4">
                <div className="w-7 h-7 rounded-full bg-primary text-white text-xs font-bold flex items-center justify-center">5</div>
                <div>
                  <h2 className="section-header">Treasury Voucher</h2>
                  <p className="text-xs text-muted-foreground">Review and generate the treasury voucher</p>
                </div>
              </div>

              {calcResult && (
                <div className="border border-border rounded-xl overflow-hidden">
                  <div className="bg-primary px-4 py-3">
                    <p className="text-white font-bold text-sm">TREASURY VOUCHER — DRAFT</p>
                    <p className="text-white/60 text-xs">First Marina Trust Finance Company Limited</p>
                  </div>
                  <div className="p-4 space-y-3">
                    <div className="grid grid-cols-2 gap-x-6 gap-y-2 text-sm">
                      {[
                        ['Customer', selectedCustomer?.name],
                        ['CIF', selectedCustomer?.cif],
                        ['Account No.', selectedCustomer?.accountNumber],
                        ['Type', form1.getValues('type')],
                        ['Effective Date', formatDate(form1.getValues('effectiveDate'))],
                        ['Maturity Date', formatDate(calcResult.maturityDate)],
                        ['Tenor', `${form1.getValues('tenorDays')} days`],
                        ['Rate', formatRate(form1.getValues('intRate'))],
                      ].map(([k, v]) => (
                        <div key={`vch-${k}`} className="flex justify-between border-b border-border pb-1">
                          <span className="text-muted-foreground text-xs">{k}</span>
                          <span className="font-semibold text-xs text-foreground">{v}</span>
                        </div>
                      ))}
                    </div>
                    <div className="border-t border-border pt-3 space-y-1.5">
                      {[
                        ['Principal Amount', formatNaira(form1.getValues('principalAmt').replace(/,/g, ''))],
                        ['Gross Interest', formatNaira(calcResult.interestAmt)],
                        ['Withholding Tax (10%)', `(${formatNaira(calcResult.withholdingTax)})`],
                        ['Net Interest', formatNaira(calcResult.netInterest)],
                      ].map(([k, v]) => (
                        <div key={`vch-amt-${k}`} className="flex justify-between text-sm">
                          <span className="text-muted-foreground text-xs">{k}</span>
                          <span className={`font-semibold text-xs tabular-nums ${k === 'Withholding Tax (10%)' ? 'text-red-600' : 'text-foreground'}`}>{v}</span>
                        </div>
                      ))}
                      <div className="flex justify-between text-sm border-t border-border pt-1.5 mt-1.5">
                        <span className="font-bold text-sm text-foreground">Total Payout at Maturity</span>
                        <span className="font-bold text-sm tabular-nums text-accent">{formatNaira(calcResult.totalPayout)}</span>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              <div className="flex justify-between pt-2">
                <button type="button" onClick={() => setCurrentStep(3)} className="btn-ghost gap-2">
                  <ChevronLeft size={14} /> Back
                </button>
                <button onClick={handleVoucherGenerate} className="btn-primary gap-2">
                  Generate Voucher & Proceed <ChevronRight size={14} />
                </button>
              </div>
            </div>
          )}

          {/* Step 6: Approval Routing */}
          {currentStep === 5 && (
            <div className="space-y-5">
              <div className="flex items-center gap-2 mb-4">
                <div className="w-7 h-7 rounded-full bg-primary text-white text-xs font-bold flex items-center justify-center">6</div>
                <div>
                  <h2 className="section-header">Approval Routing</h2>
                  <p className="text-xs text-muted-foreground">Route the transaction through the 5-level approval chain</p>
                </div>
              </div>

              <div className="space-y-3">
                {[
                  { level: 'Level 1', role: 'Treasury Officer', name: 'Adaeze Okonkwo', status: 'CURRENT' },
                  { level: 'Level 2', role: 'Head Treasury', name: 'Ibrahim Musa', status: 'PENDING' },
                  { level: 'Level 3', role: 'MIS', name: 'Chiamaka Eze', status: 'PENDING' },
                  { level: 'Level 4', role: 'Internal Audit', name: 'Olumide Adeyemi', status: 'PENDING' },
                  { level: 'Level 5', role: 'Managing Director', name: 'Mrs. Folake Adebayo', status: 'PENDING' },
                ].map((a) => (
                  <div key={`approval-route-${a.level}`} className={`flex items-center gap-4 p-3 rounded-xl border ${a.status === 'CURRENT' ? 'bg-blue-50 border-blue-200' : 'bg-card border-border'}`}>
                    <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold shrink-0 ${a.status === 'CURRENT' ? 'bg-blue-600 text-white' : 'bg-muted text-muted-foreground'}`}>
                      {a.level.split(' ')[1]}
                    </div>
                    <div className="flex-1">
                      <p className="text-sm font-semibold text-foreground">{a.role}</p>
                      <p className="text-xs text-muted-foreground">{a.name}</p>
                    </div>
                    <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${a.status === 'CURRENT' ? 'bg-blue-100 text-blue-700' : 'bg-muted text-muted-foreground'}`}>
                      {a.status === 'CURRENT' ? 'Will Receive' : 'Queued'}
                    </span>
                  </div>
                ))}
              </div>

              <div className="flex justify-between pt-2">
                <button type="button" onClick={() => setCurrentStep(4)} className="btn-ghost gap-2">
                  <ChevronLeft size={14} /> Back
                </button>
                <button
                  onClick={handleRouteApproval}
                  disabled={submitting}
                  className="btn-primary gap-2"
                >
                  {submitting ? <><Loader2 size={14} className="animate-spin" /> Submitting…</> : <>Submit for Approval <ChevronRight size={14} /></>}
                </button>
              </div>
            </div>
          )}

          {/* Steps 7–8: Confirmation */}
          {(currentStep === 6 || currentStep === 7) && (
            <div className="text-center py-8">
              <div className="w-16 h-16 rounded-full bg-green-100 flex items-center justify-center mx-auto mb-4">
                <CheckCircle2 size={32} className="text-green-600" />
              </div>
              <h2 className="text-xl font-bold text-foreground mb-2">Transaction Submitted</h2>
              <p className="text-sm text-muted-foreground mb-1">Reference: <span className="font-mono font-bold text-accent">{createdTxnRef}</span></p>
              <p className="text-xs text-muted-foreground mb-6">
                The transaction has been routed to the Treasury Officer for Level 1 approval. You will be notified as it progresses through the approval chain.
              </p>
              <div className="flex items-center justify-center gap-3">
                <button onClick={() => router.push('/transactions')} className="btn-secondary text-sm">
                  View All Transactions
                </button>
                <button onClick={() => { setCurrentStep(0); setCompletedSteps([]); setSelectedCustomer(null); setCalcResult(null); form1.reset(); form2.reset(); form3.reset(); form4.reset(); }} className="btn-primary text-sm">
                  Start New Transaction
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Right: Live Voucher Preview */}
        <div className="space-y-4">
          <div className="card p-4">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-3">Live Calculation Preview</p>
            {calcResult ? (
              <div className="space-y-2">
                {[
                  { label: 'Principal', value: formatNaira(form1.getValues('principalAmt').replace(/,/g, '')) },
                  { label: 'Rate', value: formatRate(form1.getValues('intRate')) },
                  { label: 'Tenor', value: `${form1.getValues('tenorDays')} days` },
                  { label: 'Maturity', value: formatDate(calcResult.maturityDate) },
                  { label: 'Gross Interest', value: formatNaira(calcResult.interestAmt) },
                  { label: 'WHT (10%)', value: `(${formatNaira(calcResult.withholdingTax)})`, danger: true },
                  { label: 'Net Interest', value: formatNaira(calcResult.netInterest) },
                ].map(({ label, value, danger }) => (
                  <div key={`preview-${label}`} className="flex justify-between text-xs">
                    <span className="text-muted-foreground">{label}</span>
                    <span className={`font-semibold tabular-nums ${danger ? 'text-red-600' : 'text-foreground'}`}>{value}</span>
                  </div>
                ))}
                <div className="border-t border-border pt-2 flex justify-between">
                  <span className="text-xs font-bold text-foreground">Total Payout</span>
                  <span className="text-sm font-bold tabular-nums text-accent">{formatNaira(calcResult.totalPayout)}</span>
                </div>
              </div>
            ) : (
              <p className="text-xs text-muted-foreground">Enter principal, rate, and tenor to see live calculation.</p>
            )}
          </div>

          {/* SOP Checklist */}
          <div className="card p-4">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-3">SOP Checklist</p>
            <div className="space-y-2">
              {STEPS.slice(0, 6).map((step, i) => (
                <div key={`checklist-${step.id}`} className="flex items-center gap-2">
                  <div className={`w-4 h-4 rounded-full flex items-center justify-center shrink-0 ${completedSteps.includes(i) ? 'bg-green-500' : i === currentStep ? 'bg-primary' : 'bg-border'}`}>
                    {completedSteps.includes(i) && <CheckCircle2 size={10} className="text-white" />}
                  </div>
                  <span className={`text-xs ${completedSteps.includes(i) ? 'text-foreground line-through opacity-60' : i === currentStep ? 'text-primary font-semibold' : 'text-muted-foreground'}`}>
                    {step.label}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Success Modal */}
      <Modal
        open={showSuccess}
        onClose={() => setShowSuccess(false)}
        title="Transaction Successfully Submitted"
        footer={
          <button onClick={() => { setShowSuccess(false); router.push('/transactions'); }} className="btn-primary text-sm">
            View in Transactions
          </button>
        }
      >
        <div className="text-center py-4">
          <CheckCircle2 size={40} className="text-green-500 mx-auto mb-3" />
          <p className="text-sm text-foreground font-semibold mb-1">Ref: <span className="font-mono text-accent">{createdTxnRef}</span></p>
          <p className="text-xs text-muted-foreground">Routed to Treasury Officer for Level 1 approval. Track progress in the Transactions screen.</p>
        </div>
      </Modal>
    </AppLayout>
  );
}