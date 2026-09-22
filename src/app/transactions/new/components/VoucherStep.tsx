'use client';
import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { FileText, Check, AlertCircle, Info, Loader2, Printer, PenLine, ChevronDown, Eye, CreditCard, ArrowRight, RefreshCw, DollarSign, Banknote } from 'lucide-react';
import Modal from '@/components/ui/Modal';
import {
  inflow, maturityPayout, preliqFull, preliqPartial,
  anniversary, rolloverA, rolloverB, rolloverC, rolloverD,
  thirdParty, transfer, reversalDiff, maturityDate as calcMaturityDate, daysBetween,
  interest, wht
} from '@/lib/calc';
import { formatNaira, formatDate, todayLagos, nowLagosISO } from '@/lib/format';
import { transactionService } from '@/services/transactionService';
import { getSettings } from '@/services/settingsService';
import { getSession } from '@/services/userService';
import type { Investment, Customer, Account, Bank } from '@/types';

// ─── Types ────────────────────────────────────────────────────────────────────

interface WizardStateSlice {
  txnId: string | null;
  txnType: string | null;
  scenario: string | null;
  customerId: string | null;
  investmentId: string | null;
  sourceAccountId: string | null;
  amount: string;
  purpose: string;
  beneficiaryName: string;
  beneficiaryBank: string;
  beneficiaryAccount: string;
  dateReceived: string;
}

interface VoucherStepProps {
  state: WizardStateSlice;
  setState: React.Dispatch<React.SetStateAction<WizardStateSlice & Record<string, unknown>>>;
  selectedInvestment: Investment | null;
  selectedCustomer: Customer | null;
  accounts: Account[];
  banks: Bank[];
  onBack: () => void;
  onComplete: () => void;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function FxField({
  label,
  value,
  formula,
  highlight = false,
  large = false,
}: {
  label: string;
  value: string;
  formula: string;
  highlight?: boolean;
  large?: boolean;
}) {
  const [showTip, setShowTip] = useState(false);
  return (
    <div className="relative">
      <p className="text-[10px] text-muted-foreground uppercase tracking-wide mb-0.5">{label}</p>
      <div
        className={`flex items-center gap-1.5 px-3 py-2 rounded-lg border ${
          highlight
            ? 'bg-emerald-50 dark:bg-emerald-950/30 border-emerald-200 dark:border-emerald-800' :'bg-muted/40 border-border'
        } cursor-help`}
        onMouseEnter={() => setShowTip(true)}
        onMouseLeave={() => setShowTip(false)}
      >
        <span className="text-[10px] font-bold text-primary bg-primary/10 px-1 rounded">fx</span>
        <span className={`font-semibold text-foreground ${large ? 'text-base' : 'text-sm'}`}>{value}</span>
      </div>
      {showTip && (
        <div className="absolute z-50 bottom-full left-0 mb-1 px-3 py-2 bg-gray-900 text-white text-xs rounded-lg shadow-xl whitespace-nowrap max-w-xs">
          <span className="font-mono">{formula}</span>
          <div className="absolute top-full left-4 border-4 border-transparent border-t-gray-900" />
        </div>
      )}
    </div>
  );
}

function EditableField({
  label,
  value,
  onChange,
  type = 'text',
  placeholder = '',
  error = '',
  required = false,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  type?: string;
  placeholder?: string;
  error?: string;
  required?: boolean;
}) {
  return (
    <div>
      <label className="block text-[10px] text-muted-foreground uppercase tracking-wide mb-0.5">
        {label}{required && <span className="text-red-500 ml-0.5">*</span>}
      </label>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className={`input-field w-full text-sm ${error ? 'border-red-400' : ''}`}
      />
      {error && <p className="text-xs text-red-500 mt-0.5">{error}</p>}
    </div>
  );
}

function SectionHeader({ title, icon }: { title: string; icon?: React.ReactNode }) {
  return (
    <div className="flex items-center gap-2 pb-2 border-b border-border mb-3">
      {icon}
      <h3 className="text-sm font-semibold text-foreground">{title}</h3>
    </div>
  );
}

function InfoNote({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex items-start gap-2 p-3 bg-blue-50 dark:bg-blue-950/30 rounded-lg border border-blue-200 dark:border-blue-800 text-xs text-blue-700 dark:text-blue-300">
      <Info size={14} className="shrink-0 mt-0.5" />
      <div>{children}</div>
    </div>
  );
}

// ─── Payment Instruction Block ────────────────────────────────────────────────

interface PaymentInstructionData {
  beneficiaryName: string;
  bankName: string;
  accountNumber: string;
  accountType: 'Savings' | 'Current';
  amount: string;
  transferCharge: string;
}

function PaymentInstructionBlock({
  data,
  onChange,
}: {
  data: PaymentInstructionData;
  onChange: (d: PaymentInstructionData) => void;
}) {
  return (
    <div className="border-2 border-primary/30 rounded-xl p-4 bg-primary/5 space-y-3">
      <SectionHeader
        title="Payment Instruction"
        icon={<CreditCard size={16} className="text-primary" />}
      />
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <EditableField
          label="Beneficiary Name"
          value={data.beneficiaryName}
          onChange={(v) => onChange({ ...data, beneficiaryName: v })}
          required
        />
        <EditableField
          label="Bank Name"
          value={data.bankName}
          onChange={(v) => onChange({ ...data, bankName: v })}
          required
        />
        <EditableField
          label="Account Number"
          value={data.accountNumber}
          onChange={(v) => onChange({ ...data, accountNumber: v })}
          placeholder="10-digit NUBAN"
          required
        />
        <div>
          <label className="block text-[10px] text-muted-foreground uppercase tracking-wide mb-0.5">
            Account Type<span className="text-red-500 ml-0.5">*</span>
          </label>
          <select
            value={data.accountType}
            onChange={(e) => onChange({ ...data, accountType: e.target.value as 'Savings' | 'Current' })}
            className="input-field w-full text-sm"
          >
            <option value="Savings">Savings</option>
            <option value="Current">Current</option>
          </select>
        </div>
        <div>
          <p className="text-[10px] text-muted-foreground uppercase tracking-wide mb-0.5">Amount (Auto)</p>
          <div className="flex items-center gap-1.5 px-3 py-2 rounded-lg border bg-muted/40 border-border">
            <span className="text-[10px] font-bold text-primary bg-primary/10 px-1 rounded">fx</span>
            <span className="text-sm font-semibold text-foreground">{formatNaira(data.amount)}</span>
          </div>
        </div>
        <div>
          <p className="text-[10px] text-muted-foreground uppercase tracking-wide mb-0.5">Transfer Charge (Auto)</p>
          <div className="flex items-center gap-1.5 px-3 py-2 rounded-lg border bg-muted/40 border-border">
            <span className="text-[10px] font-bold text-primary bg-primary/10 px-1 rounded">fx</span>
            <span className="text-sm font-semibold text-foreground">{formatNaira(data.transferCharge)}</span>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Signature Modal ──────────────────────────────────────────────────────────

function SignatureModal({
  open,
  onClose,
  onSubmit,
  submitting,
}: {
  open: boolean;
  onClose: () => void;
  onSubmit: (name: string, pin: string) => void;
  submitting: boolean;
}) {
  const [name, setName] = useState('');
  const [pin, setPin] = useState('');
  const [error, setError] = useState('');

  const handleSubmit = () => {
    if (!name.trim()) { setError('Please enter your full name'); return; }
    if (pin !== '1234') { setError('Incorrect PIN. (Demo PIN: 1234)'); return; }
    setError('');
    onSubmit(name, pin);
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Sign & Submit — Treasury Officer Approval"
      size="md"
      footer={
        <>
          <button onClick={onClose} className="btn-secondary" disabled={submitting}>Cancel</button>
          <button
            onClick={handleSubmit}
            disabled={submitting || !name || !pin}
            className="btn-primary flex items-center gap-2 disabled:opacity-50"
          >
            {submitting ? <Loader2 size={14} className="animate-spin" /> : <PenLine size={14} />}
            Sign & Submit
          </button>
        </>
      }
    >
      <div className="space-y-4">
        <InfoNote>
          This records your approval as <strong>Treasury Officer (Level 1)</strong>. The transaction will move to <strong>PENDING_HEAD_TREASURY</strong> and Head Treasury will be notified.
        </InfoNote>
        <div>
          <label className="block text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1.5">
            Full Name *
          </label>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Type your full name to sign"
            className="input-field w-full"
          />
        </div>
        <div>
          <label className="block text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1.5">
            PIN * <span className="text-muted-foreground font-normal normal-case">(Demo PIN: 1234)</span>
          </label>
          <input
            type="password"
            value={pin}
            onChange={(e) => setPin(e.target.value)}
            placeholder="Enter your PIN"
            maxLength={6}
            className="input-field w-full"
          />
        </div>
        {error && (
          <div className="flex items-center gap-2 p-2 bg-red-50 dark:bg-red-950/30 rounded-lg border border-red-200 dark:border-red-800 text-xs text-red-600">
            <AlertCircle size={12} />
            {error}
          </div>
        )}
      </div>
    </Modal>
  );
}

// ─── Print View Modal ─────────────────────────────────────────────────────────

function PrintViewModal({
  open,
  onClose,
  voucherNo,
  voucherType,
  customerName,
  fields,
}: {
  open: boolean;
  onClose: () => void;
  voucherNo: string;
  voucherType: string;
  customerName: string;
  fields: { label: string; value: string }[];
}) {
  return (
    <Modal open={open} onClose={onClose} title={`Preview — ${voucherType}`} size="lg">
      <div className="print-area space-y-4 font-mono text-sm">
        <div className="text-center border-b-2 border-gray-800 pb-3">
          <p className="text-lg font-bold">TREASURY DESK</p>
          <p className="text-base font-semibold">{voucherType}</p>
          <p className="text-xs text-muted-foreground">Voucher No: {voucherNo}</p>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <div><span className="text-muted-foreground">Customer:</span> <span className="font-semibold">{customerName}</span></div>
          <div><span className="text-muted-foreground">Date:</span> <span className="font-semibold">{formatDate(todayLagos())}</span></div>
        </div>
        <table className="w-full border-collapse text-xs">
          <tbody>
            {fields.map((f, i) => (
              <tr key={i} className={i % 2 === 0 ? 'bg-muted/30' : ''}>
                <td className="py-1.5 px-2 font-medium text-muted-foreground border border-border">{f.label}</td>
                <td className="py-1.5 px-2 font-semibold text-foreground border border-border text-right">{f.value}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <div className="grid grid-cols-2 gap-8 pt-6">
          <div className="border-t border-gray-400 pt-1 text-center text-xs text-muted-foreground">Treasury Officer</div>
          <div className="border-t border-gray-400 pt-1 text-center text-xs text-muted-foreground">Head Treasury</div>
        </div>
      </div>
      <div className="flex justify-end mt-4">
        <button onClick={() => window.print()} className="btn-secondary flex items-center gap-2">
          <Printer size={14} /> Print
        </button>
      </div>
    </Modal>
  );
}

// ─── Voucher Number Generator ─────────────────────────────────────────────────

function generateVoucherNo(prefix: string): string {
  const year = new Date().getFullYear();
  const seq = String(Math.floor(Math.random() * 90000) + 10000);
  return `${prefix}-${year}-${seq}`;
}

function getVoucherPrefix(txnType: string, scenario: string): string {
  if (txnType === 'INFLOW') return 'FI';
  if (txnType === 'ROLLOVER') return 'RO';
  if (txnType === 'TRANSFER') return 'TS';
  return 'FO';
}

// ─── Individual Voucher Forms ─────────────────────────────────────────────────

// INFLOW — Funds-In Voucher
function InflowVoucher({
  state,
  customer,
  voucherNo,
  paymentInstruction,
  onPaymentInstructionChange,
}: {
  state: WizardStateSlice;
  customer: Customer | null;
  voucherNo: string;
  paymentInstruction: PaymentInstructionData;
  onPaymentInstructionChange: (d: PaymentInstructionData) => void;
}) {
  const [fields, setFields] = useState({
    principal: state.amount || '0',
    rate: '15',
    tenorDays: '365',
    effectiveDate: state.dateReceived || todayLagos(),
  });
  const [calc, setCalc] = useState<ReturnType<typeof inflow> | null>(null);
  const [matAdj, setMatAdj] = useState<{ adjusted: boolean; originalDate?: string } | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const recalc = useCallback(() => {
    try {
      const tenor = parseInt(fields.tenorDays) || 0;
      if (!fields.principal || !fields.rate || !tenor || !fields.effectiveDate) return;
      const result = inflow({
        principal: fields.principal,
        rate: fields.rate,
        tenorDays: tenor,
        effectiveDate: fields.effectiveDate,
        customer: customer ? { isWhtExempt: customer.isWhtExempt } : undefined,
      });
      // Check maturity adjustment
      const rawMat = calcMaturityDate(fields.effectiveDate, tenor, [], 'NONE');
      const adjMat = calcMaturityDate(fields.effectiveDate, tenor);
      setMatAdj({ adjusted: adjMat.adjusted, originalDate: rawMat.date });
      setCalc(result);
    } catch { /* */ }
  }, [fields, customer]);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(recalc, 150);
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, [recalc]);

  const settings = getSettings();
  const whtRate = settings['WHT_RATE'] ?? '10';

  return (
    <div className="space-y-5">
      <SectionHeader title="Funds-In Voucher" icon={<Banknote size={16} className="text-emerald-600" />} />
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div>
          <p className="text-[10px] text-muted-foreground uppercase tracking-wide mb-0.5">Customer Name</p>
          <p className="text-sm font-semibold text-foreground">{customer?.name || '—'}</p>
        </div>
        <EditableField label="Principal Amount (₦)" value={fields.principal} onChange={(v) => setFields((f) => ({ ...f, principal: v }))} placeholder="e.g. 10000000" required />
        <EditableField label="Rate (% p.a.)" value={fields.rate} onChange={(v) => setFields((f) => ({ ...f, rate: v }))} placeholder="e.g. 15" required />
        <EditableField label="Tenor (days)" value={fields.tenorDays} onChange={(v) => setFields((f) => ({ ...f, tenorDays: v }))} type="number" placeholder="e.g. 365" required />
        <EditableField label="Effective Date" value={fields.effectiveDate} onChange={(v) => setFields((f) => ({ ...f, effectiveDate: v }))} type="date" required />
        {calc && (
          <>
            <div>
              <p className="text-[10px] text-muted-foreground uppercase tracking-wide mb-0.5">Maturity Date</p>
              <div className="flex items-center gap-1.5 px-3 py-2 rounded-lg border bg-muted/40 border-border">
                <span className="text-[10px] font-bold text-primary bg-primary/10 px-1 rounded">fx</span>
                <span className="text-sm font-semibold text-foreground">{formatDate(calc.maturityDate)}</span>
              </div>
              {matAdj?.adjusted && (
                <p className="text-[10px] text-amber-600 mt-0.5 flex items-center gap-1">
                  <Info size={10} />
                  Moved from {formatDate(matAdj.originalDate!)} (weekend/holiday) to {formatDate(calc.maturityDate)}
                </p>
              )}
            </div>
            <FxField
              label="Projected Interest"
              value={formatNaira(calc.projectedInterest)}
              formula={`${fields.principal} × ${fields.rate}% × ${fields.tenorDays}/365 = ${formatNaira(calc.projectedInterest)}`}
            />
            <FxField
              label={`WHT (${whtRate}%)`}
              value={customer?.isWhtExempt ? 'Exempt' : formatNaira(calc.wht)}
              formula={`${whtRate}% × ${formatNaira(calc.projectedInterest)} = ${formatNaira(calc.wht)}`}
            />
            <FxField
              label="Net Maturity Value"
              value={formatNaira(calc.netMaturityValue)}
              formula={`${formatNaira(fields.principal)} + ${formatNaira(calc.projectedInterest)} − ${formatNaira(calc.wht)} = ${formatNaira(calc.netMaturityValue)}`}
              highlight
              large
            />
          </>
        )}
      </div>
    </div>
  );
}

// MATURITY — Funds-Out
function MaturityVoucher({
  investment,
  customer,
  voucherNo,
  paymentInstruction,
  onPaymentInstructionChange,
}: {
  investment: Investment | null;
  customer: Customer | null;
  voucherNo: string;
  paymentInstruction: PaymentInstructionData;
  onPaymentInstructionChange: (d: PaymentInstructionData) => void;
}) {
  const [transferDate, setTransferDate] = useState(todayLagos());
  const [remarks, setRemarks] = useState('');
  const [calc, setCalc] = useState<ReturnType<typeof maturityPayout> | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const recalc = useCallback(() => {
    if (!investment) return;
    try {
      const result = maturityPayout({
        principalAmt: investment.principalAmt,
        intRate: investment.intRate,
        tenorDays: investment.tenorDays,
        customer: customer ? { isWhtExempt: customer.isWhtExempt } : undefined,
      });
      setCalc(result);
      onPaymentInstructionChange({ ...paymentInstruction, amount: result.net });
    } catch { /* */ }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [investment, customer]);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(recalc, 150);
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, [recalc]);

  const settings = getSettings();
  const whtRate = settings['WHT_RATE'] ?? '10';

  return (
    <div className="space-y-5">
      <SectionHeader title="Funds-Out Voucher — Maturity" icon={<DollarSign size={16} className="text-blue-600" />} />
      {investment && calc && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <FxField label="Principal" value={formatNaira(calc.principal)} formula={`Principal = ${formatNaira(investment.principalAmt)}`} />
          <FxField
            label="Interest"
            value={formatNaira(calc.interest)}
            formula={`${formatNaira(investment.principalAmt)} × ${investment.intRate}% × ${investment.tenorDays}/365 = ${formatNaira(calc.interest)}`}
          />
          <FxField
            label={`WHT (${whtRate}%)`}
            value={customer?.isWhtExempt ? 'Exempt' : formatNaira(calc.wht)}
            formula={`${whtRate}% × ${formatNaira(calc.interest)} = ${formatNaira(calc.wht)}`}
          />
          <FxField
            label="Net Amount"
            value={formatNaira(calc.net)}
            formula={`${formatNaira(calc.principal)} + ${formatNaira(calc.interest)} − ${formatNaira(calc.wht)} = ${formatNaira(calc.net)}`}
            highlight
            large
          />
          <EditableField label="Transfer Date" value={transferDate} onChange={setTransferDate} type="date" required />
          <div className="sm:col-span-2">
            <EditableField label="Remarks" value={remarks} onChange={setRemarks} placeholder="Optional remarks…" />
          </div>
        </div>
      )}
      <PaymentInstructionBlock data={paymentInstruction} onChange={onPaymentInstructionChange} />
    </div>
  );
}

// PRELIQ FULL — Funds-Out
function PreliqFullVoucher({
  investment,
  customer,
  paymentInstruction,
  onPaymentInstructionChange,
}: {
  investment: Investment | null;
  customer: Customer | null;
  paymentInstruction: PaymentInstructionData;
  onPaymentInstructionChange: (d: PaymentInstructionData) => void;
}) {
  const [liqDate, setLiqDate] = useState(todayLagos());
  const [calc, setCalc] = useState<ReturnType<typeof preliqFull> | null>(null);
  const [daysElapsed, setDaysElapsed] = useState(0);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const recalc = useCallback(() => {
    if (!investment) return;
    try {
      const days = daysBetween(investment.effectiveDate, liqDate);
      setDaysElapsed(days);
      const result = preliqFull(
        {
          principalAmt: investment.principalAmt,
          intRate: investment.intRate,
          effectiveDate: investment.effectiveDate,
          maturityDate: investment.maturityDate,
          customer: customer ? { isWhtExempt: customer.isWhtExempt } : undefined,
        },
        liqDate
      );
      setCalc(result);
      onPaymentInstructionChange({ ...paymentInstruction, amount: result.payout });
    } catch { /* */ }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [investment, customer, liqDate]);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(recalc, 150);
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, [recalc]);

  const settings = getSettings();
  const chargeRate = settings['PRELIQ_CHARGE_RATE'] ?? '20';
  const whtRate = settings['WHT_RATE'] ?? '10';

  return (
    <div className="space-y-5">
      <SectionHeader title="Funds-Out Voucher — Full Pre-Liquidation" icon={<DollarSign size={16} className="text-orange-600" />} />
      <EditableField label="Liquidation Date" value={liqDate} onChange={setLiqDate} type="date" required />
      {investment && calc && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <FxField label="Days Elapsed" value={`${daysElapsed} days`} formula={`Days from ${formatDate(investment.effectiveDate)} to ${formatDate(liqDate)} = ${daysElapsed}`} />
          <FxField
            label="Accrued Interest"
            value={formatNaira(calc.accrued)}
            formula={`${formatNaira(investment.principalAmt)} × ${investment.intRate}% × ${daysElapsed}/365 = ${formatNaira(calc.accrued)}`}
          />
          <FxField
            label={`20% Charge (${chargeRate}%)`}
            value={formatNaira(calc.charge)}
            formula={`${chargeRate}% × ${formatNaira(calc.accrued)} = ${formatNaira(calc.charge)}`}
          />
          <FxField
            label="Net Interest"
            value={formatNaira(calc.netInterest)}
            formula={`${formatNaira(calc.accrued)} − ${formatNaira(calc.charge)} = ${formatNaira(calc.netInterest)}`}
          />
          <FxField
            label={`WHT (${whtRate}%)`}
            value={customer?.isWhtExempt ? 'Exempt' : formatNaira(calc.wht)}
            formula={`${whtRate}% × ${formatNaira(calc.netInterest)} = ${formatNaira(calc.wht)}`}
          />
          <FxField
            label="Payout"
            value={formatNaira(calc.payout)}
            formula={`${formatNaira(investment.principalAmt)} + ${formatNaira(calc.netInterest)} − ${formatNaira(calc.wht)} = ${formatNaira(calc.payout)}`}
            highlight
            large
          />
        </div>
      )}
      <PaymentInstructionBlock data={paymentInstruction} onChange={onPaymentInstructionChange} />
    </div>
  );
}

// PRELIQ PARTIAL — Funds-Out + Rebooking
function PreliqPartialVoucher({
  investment,
  customer,
  paymentInstruction,
  onPaymentInstructionChange,
}: {
  investment: Investment | null;
  customer: Customer | null;
  paymentInstruction: PaymentInstructionData;
  onPaymentInstructionChange: (d: PaymentInstructionData) => void;
}) {
  const [liqDate, setLiqDate] = useState(todayLagos());
  const [requested, setRequested] = useState('');
  const [newRate, setNewRate] = useState(investment?.intRate || '15');
  const [newTenor, setNewTenor] = useState('');
  const [calc, setCalc] = useState<ReturnType<typeof preliqPartial> | null>(null);
  const [calcError, setCalcError] = useState('');
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const recalc = useCallback(() => {
    if (!investment || !requested) return;
    try {
      const result = preliqPartial(
        {
          principalAmt: investment.principalAmt,
          intRate: investment.intRate,
          effectiveDate: investment.effectiveDate,
          maturityDate: investment.maturityDate,
          customer: customer ? { isWhtExempt: customer.isWhtExempt } : undefined,
        },
        liqDate,
        requested
      );
      setCalc(result);
      setCalcError('');
      onPaymentInstructionChange({ ...paymentInstruction, amount: result.payout });
    } catch (e: unknown) {
      setCalcError(e instanceof Error ? e.message : 'Calculation error');
      setCalc(null);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [investment, customer, liqDate, requested]);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(recalc, 150);
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, [recalc]);

  // Compute remaining tenor
  useEffect(() => {
    if (investment) {
      const remaining = daysBetween(liqDate, investment.maturityDate);
      setNewTenor(String(Math.max(remaining, 30)));
    }
  }, [investment, liqDate]);

  const settings = getSettings();
  const chargeRate = settings['PRELIQ_CHARGE_RATE'] ?? '20';
  const partialPolicy = settings['PARTIAL_PRELIQ_INTEREST'] ?? 'NOT_PAID';

  return (
    <div className="space-y-5">
      <SectionHeader title="Funds-Out + Rebooking — Partial Pre-Liquidation" icon={<DollarSign size={16} className="text-orange-600" />} />
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <EditableField label="Liquidation Date" value={liqDate} onChange={setLiqDate} type="date" required />
        <EditableField
          label="Requested Amount (₦)"
          value={requested}
          onChange={setRequested}
          placeholder={`< ${formatNaira(investment?.principalAmt || '0')}`}
          error={calcError}
          required
        />
      </div>

      {investment && calc && (
        <>
          {/* SOP Table */}
          <div className="border border-border rounded-xl overflow-hidden">
            <div className="px-3 py-2 bg-muted/40 border-b border-border text-xs font-semibold text-muted-foreground uppercase tracking-wide">
              SOP Breakdown
            </div>
            <table className="w-full text-xs">
              <tbody>
                {[
                  { label: 'Original Investment', value: formatNaira(investment.principalAmt) },
                  { label: 'Accrued Interest', value: formatNaira(calc.accrued) },
                  { label: `${chargeRate}% Charge`, value: formatNaira(calc.charge) },
                  { label: 'Customer Requests', value: formatNaira(calc.payout) },
                  { label: 'Remaining Principal', value: formatNaira(calc.remaining) },
                  { label: 'Less Charge', value: `(${formatNaira(calc.charge)})` },
                  { label: 'Principal Rebooked', value: formatNaira(calc.rebookedPrincipal), bold: true },
                ].map((row, i) => (
                  <tr key={i} className={i % 2 === 0 ? 'bg-muted/20' : ''}>
                    <td className="px-3 py-2 text-muted-foreground border-b border-border">{row.label}</td>
                    <td className={`px-3 py-2 text-right border-b border-border ${row.bold ? 'font-bold text-primary' : 'font-semibold text-foreground'}`}>{row.value}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Rebooked investment fields */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <FxField
              label="Payout (= Requested)"
              value={formatNaira(calc.payout)}
              formula={`Customer requested = ${formatNaira(requested)}`}
              highlight
            />
            <FxField
              label="Principal Rebooked"
              value={formatNaira(calc.rebookedPrincipal)}
              formula={`${formatNaira(calc.remaining)} − ${formatNaira(calc.charge)} = ${formatNaira(calc.rebookedPrincipal)}`}
            />
            <EditableField label="New Rate (% p.a.)" value={newRate} onChange={setNewRate} placeholder={investment.intRate} />
            <EditableField label="New Tenor (days)" value={newTenor} onChange={setNewTenor} type="number" />
          </div>

          <InfoNote>
            <strong>PARTIAL_PRELIQ_INTEREST policy:</strong> {partialPolicy === 'NOT_PAID' ? 'Accrued interest is NOT paid out on partial pre-liquidation — it remains with the rebooked investment.' : 'Accrued interest IS paid out on partial pre-liquidation.'}
          </InfoNote>
        </>
      )}
      <PaymentInstructionBlock data={paymentInstruction} onChange={onPaymentInstructionChange} />
    </div>
  );
}

// ANNIVERSARY — Funds-Out
function AnniversaryVoucher({
  investment,
  customer,
  scenario,
  paymentInstruction,
  onPaymentInstructionChange,
}: {
  investment: Investment | null;
  customer: Customer | null;
  scenario: string;
  paymentInstruction: PaymentInstructionData;
  onPaymentInstructionChange: (d: PaymentInstructionData) => void;
}) {
  const periodDays = parseInt(scenario) || 30;
  const [calc, setCalc] = useState<ReturnType<typeof anniversary> | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const recalc = useCallback(() => {
    if (!investment) return;
    try {
      const result = anniversary(
        {
          principalAmt: investment.principalAmt,
          intRate: investment.intRate,
          effectiveDate: investment.effectiveDate,
          customer: customer ? { isWhtExempt: customer.isWhtExempt } : undefined,
        },
        periodDays
      );
      setCalc(result);
      onPaymentInstructionChange({ ...paymentInstruction, amount: result.net });
    } catch { /* */ }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [investment, customer, periodDays]);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(recalc, 150);
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, [recalc]);

  const settings = getSettings();
  const whtRate = settings['WHT_RATE'] ?? '10';
  const whtOnAnniversary = settings['WHT_ON_ANNIVERSARY'] === 'true';

  return (
    <div className="space-y-5">
      <SectionHeader title={`Funds-Out Voucher — ${periodDays}-Day Anniversary`} icon={<DollarSign size={16} className="text-purple-600" />} />
      {investment && calc && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <p className="text-[10px] text-muted-foreground uppercase tracking-wide mb-0.5">Period</p>
            <p className="text-sm font-semibold text-foreground">{periodDays} days</p>
          </div>
          <FxField
            label="Period Interest"
            value={formatNaira(calc.periodInterest)}
            formula={`${formatNaira(investment.principalAmt)} × ${investment.intRate}% × ${periodDays}/365 = ${formatNaira(calc.periodInterest)}`}
          />
          <FxField
            label={`WHT (${whtRate}%)`}
            value={!whtOnAnniversary ? 'N/A (setting off)' : customer?.isWhtExempt ? 'Exempt' : formatNaira(calc.wht)}
            formula={whtOnAnniversary ? `${whtRate}% × ${formatNaira(calc.periodInterest)} = ${formatNaira(calc.wht)}` : 'WHT_ON_ANNIVERSARY = false'}
          />
          <FxField
            label="Net Payment"
            value={formatNaira(calc.net)}
            formula={`${formatNaira(calc.periodInterest)} − ${formatNaira(calc.wht)} = ${formatNaira(calc.net)}`}
            highlight
            large
          />
          <div>
            <p className="text-[10px] text-muted-foreground uppercase tracking-wide mb-0.5">Next Anniversary Date</p>
            <div className="flex items-center gap-1.5 px-3 py-2 rounded-lg border bg-muted/40 border-border">
              <span className="text-[10px] font-bold text-primary bg-primary/10 px-1 rounded">fx</span>
              <span className="text-sm font-semibold text-foreground">{formatDate(calc.nextAnniversaryDate)}</span>
            </div>
          </div>
          <div className="sm:col-span-2">
            <InfoNote>Investment remains active. Next anniversary payment due on {formatDate(calc.nextAnniversaryDate)}.</InfoNote>
          </div>
        </div>
      )}
      <PaymentInstructionBlock data={paymentInstruction} onChange={onPaymentInstructionChange} />
    </div>
  );
}

// ROLLOVER A — Roll-over Slip
function RolloverAVoucher({
  investment,
  customer,
  voucherNo,
  paymentInstruction,
  onPaymentInstructionChange,
}: {
  investment: Investment | null;
  customer: Customer | null;
  voucherNo: string;
  paymentInstruction: PaymentInstructionData;
  onPaymentInstructionChange: (d: PaymentInstructionData) => void;
}) {
  const [newRate, setNewRate] = useState(investment?.intRate || '15');
  const [newTenor, setNewTenor] = useState(String(investment?.tenorDays || 365));
  const [newEffective, setNewEffective] = useState(investment?.maturityDate || todayLagos());
  const [calc, setCalc] = useState<ReturnType<typeof rolloverA> | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const recalc = useCallback(() => {
    if (!investment) return;
    try {
      const result = rolloverA(
        {
          principalAmt: investment.principalAmt,
          intRate: investment.intRate,
          tenorDays: investment.tenorDays,
          effectiveDate: investment.effectiveDate,
          maturityDate: investment.maturityDate,
          customer: customer ? { isWhtExempt: customer.isWhtExempt } : undefined,
        },
        newRate,
        parseInt(newTenor) || investment.tenorDays,
        newEffective
      );
      setCalc(result);
    } catch { /* */ }
  }, [investment, customer, newRate, newTenor, newEffective]);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(recalc, 150);
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, [recalc]);

  const settings = getSettings();
  const whtRate = settings['WHT_RATE'] ?? '10';
  const basis = settings['ROLLOVER_A_BASIS'] ?? 'NET';

  return (
    <div className="space-y-5">
      <SectionHeader title="Roll-over Slip — Rollover A (Principal + Interest)" icon={<RefreshCw size={16} className="text-blue-600" />} />
      {investment && calc && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <FxField label="Principal Amount" value={formatNaira(calc.principal)} formula={`Principal = ${formatNaira(investment.principalAmt)}`} />
          <FxField
            label="Interest Due"
            value={formatNaira(calc.interest)}
            formula={`${formatNaira(investment.principalAmt)} × ${investment.intRate}% × ${investment.tenorDays}/365 = ${formatNaira(calc.interest)}`}
          />
          <FxField
            label={`WHT (${whtRate}%)`}
            value={customer?.isWhtExempt ? 'Exempt' : formatNaira(calc.wht)}
            formula={`${whtRate}% × ${formatNaira(calc.interest)} = ${formatNaira(calc.wht)}`}
          />
          <EditableField label="Effective Date (New)" value={newEffective} onChange={setNewEffective} type="date" required />
          <EditableField label="New Tenor (days)" value={newTenor} onChange={setNewTenor} type="number" />
          <EditableField label="New Rate (% p.a.)" value={newRate} onChange={setNewRate} />
          <FxField
            label={`Roll-over Amount (${basis} basis)`}
            value={formatNaira(calc.rollAmount)}
            formula={basis === 'NET'
              ? `${formatNaira(calc.principal)} + ${formatNaira(calc.interest)} − ${formatNaira(calc.wht)} = ${formatNaira(calc.rollAmount)}`
              : `${formatNaira(calc.principal)} + ${formatNaira(calc.interest)} = ${formatNaira(calc.rollAmount)}`}
            highlight
            large
          />
          <div>
            <p className="text-[10px] text-muted-foreground uppercase tracking-wide mb-0.5">Roll-over Maturity Date</p>
            <div className="flex items-center gap-1.5 px-3 py-2 rounded-lg border bg-muted/40 border-border">
              <span className="text-[10px] font-bold text-primary bg-primary/10 px-1 rounded">fx</span>
              <span className="text-sm font-semibold text-foreground">{formatDate(calc.newMaturityDate)}</span>
            </div>
          </div>
          <FxField
            label="Projected Interest (New)"
            value={formatNaira(calc.projectedNewInterest)}
            formula={`${formatNaira(calc.rollAmount)} × ${newRate}% × ${newTenor}/365 = ${formatNaira(calc.projectedNewInterest)}`}
          />
        </div>
      )}
    </div>
  );
}

// ROLLOVER B/D — Roll-over Slip + Funds-Out
function RolloverBDVoucher({
  investment,
  customer,
  scenario,
  voucherNos,
  paymentInstruction,
  onPaymentInstructionChange,
}: {
  investment: Investment | null;
  customer: Customer | null;
  scenario: string;
  voucherNos: [string, string];
  paymentInstruction: PaymentInstructionData;
  onPaymentInstructionChange: (d: PaymentInstructionData) => void;
}) {
  const [newRate, setNewRate] = useState(investment?.intRate || '15');
  const [newTenor, setNewTenor] = useState(String(investment?.tenorDays || 365));
  const [newEffective, setNewEffective] = useState(investment?.maturityDate || todayLagos());
  const [calc, setCalc] = useState<ReturnType<typeof rolloverB> | null>(null);
  const [activeTab, setActiveTab] = useState(0);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const recalc = useCallback(() => {
    if (!investment) return;
    try {
      const fn = scenario === 'D' ? rolloverD : rolloverB;
      const result = fn(
        {
          principalAmt: investment.principalAmt,
          intRate: investment.intRate,
          tenorDays: investment.tenorDays,
          effectiveDate: investment.effectiveDate,
          maturityDate: investment.maturityDate,
          customer: customer ? { isWhtExempt: customer.isWhtExempt } : undefined,
        },
        newRate,
        parseInt(newTenor) || investment.tenorDays,
        newEffective
      );
      setCalc(result);
      onPaymentInstructionChange({ ...paymentInstruction, amount: result.payout });
    } catch { /* */ }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [investment, customer, newRate, newTenor, newEffective, scenario]);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(recalc, 150);
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, [recalc]);

  // Auto-fill remarks with beneficiary info
  useEffect(() => {
    if (paymentInstruction.beneficiaryName && paymentInstruction.bankName && paymentInstruction.accountNumber) {
      // Remarks auto-filled per SOP
    }
  }, [paymentInstruction]);

  const settings = getSettings();
  const whtRate = settings['WHT_RATE'] ?? '10';

  const tabs = [
    `Roll-over Slip ${voucherNos[0]}`,
    `Funds-Out ${voucherNos[1]}`,
  ];

  return (
    <div className="space-y-4">
      {/* Compound tabs */}
      <div className="flex gap-1 border-b border-border">
        {tabs.map((t, i) => (
          <button
            key={i}
            onClick={() => setActiveTab(i)}
            className={`px-4 py-2 text-xs font-semibold rounded-t-lg border-b-2 transition-colors ${
              activeTab === i ? 'border-primary text-primary bg-primary/5' : 'border-transparent text-muted-foreground hover:text-foreground'
            }`}
          >
            {t}
          </button>
        ))}
      </div>

      {activeTab === 0 && investment && calc && (
        <div className="space-y-3">
          <SectionHeader title={`Roll-over Slip — Rollover ${scenario} (Principal rolled)`} icon={<RefreshCw size={16} className="text-blue-600" />} />
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <FxField label="Roll Amount (Principal)" value={formatNaira(calc.rollAmount)} formula={`Principal = ${formatNaira(investment.principalAmt)}`} highlight />
            <EditableField label="Effective Date (New)" value={newEffective} onChange={setNewEffective} type="date" required />
            <EditableField label="New Tenor (days)" value={newTenor} onChange={setNewTenor} type="number" />
            <EditableField label="New Rate (% p.a.)" value={newRate} onChange={setNewRate} />
            <div>
              <p className="text-[10px] text-muted-foreground uppercase tracking-wide mb-0.5">Roll-over Maturity Date</p>
              <div className="flex items-center gap-1.5 px-3 py-2 rounded-lg border bg-muted/40 border-border">
                <span className="text-[10px] font-bold text-primary bg-primary/10 px-1 rounded">fx</span>
                <span className="text-sm font-semibold text-foreground">{formatDate(calc.newMaturityDate)}</span>
              </div>
            </div>
            <FxField
              label="Projected Interest (New)"
              value={formatNaira(calc.projectedNewInterest)}
              formula={`${formatNaira(calc.rollAmount)} × ${newRate}% × ${newTenor}/365 = ${formatNaira(calc.projectedNewInterest)}`}
            />
          </div>
        </div>
      )}

      {activeTab === 1 && investment && calc && (
        <div className="space-y-3">
          <SectionHeader title="Funds-Out — Interest Payout" icon={<DollarSign size={16} className="text-green-600" />} />
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <FxField
              label="Interest Due"
              value={formatNaira(interest(investment.principalAmt, investment.intRate, investment.tenorDays))}
              formula={`${formatNaira(investment.principalAmt)} × ${investment.intRate}% × ${investment.tenorDays}/365`}
            />
            <FxField
              label={`WHT (${whtRate}%)`}
              value={customer?.isWhtExempt ? 'Exempt' : formatNaira(String(parseFloat(interest(investment.principalAmt, investment.intRate, investment.tenorDays)) - parseFloat(calc.payout)))}
              formula={`${whtRate}% × interest`}
            />
            <FxField label="Payout (Interest Net)" value={formatNaira(calc.payout)} formula={`Interest − WHT = ${formatNaira(calc.payout)}`} highlight large />
          </div>
          <InfoNote>
            Per SOP: Beneficiary Name, Bank, and Account Number are auto-copied to Remarks: <strong>{paymentInstruction.beneficiaryName} | {paymentInstruction.bankName} | {paymentInstruction.accountNumber}</strong>
          </InfoNote>
          <PaymentInstructionBlock data={paymentInstruction} onChange={onPaymentInstructionChange} />
        </div>
      )}
    </div>
  );
}

// ROLLOVER C — Roll-over Slip (partial) + Funds-Out
function RolloverCVoucher({
  investment,
  customer,
  voucherNos,
  paymentInstruction,
  onPaymentInstructionChange,
}: {
  investment: Investment | null;
  customer: Customer | null;
  voucherNos: [string, string];
  paymentInstruction: PaymentInstructionData;
  onPaymentInstructionChange: (d: PaymentInstructionData) => void;
}) {
  const [rollPrincipal, setRollPrincipal] = useState('');
  const [newRate, setNewRate] = useState(investment?.intRate || '15');
  const [newTenor, setNewTenor] = useState(String(investment?.tenorDays || 365));
  const [newEffective, setNewEffective] = useState(investment?.maturityDate || todayLagos());
  const [calc, setCalc] = useState<ReturnType<typeof rolloverC> | null>(null);
  const [calcError, setCalcError] = useState('');
  const [activeTab, setActiveTab] = useState(0);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const recalc = useCallback(() => {
    if (!investment || !rollPrincipal) return;
    try {
      const result = rolloverC(
        {
          principalAmt: investment.principalAmt,
          intRate: investment.intRate,
          tenorDays: investment.tenorDays,
          effectiveDate: investment.effectiveDate,
          maturityDate: investment.maturityDate,
          customer: customer ? { isWhtExempt: customer.isWhtExempt } : undefined,
        },
        rollPrincipal,
        newRate,
        parseInt(newTenor) || investment.tenorDays,
        newEffective
      );
      setCalc(result);
      setCalcError('');
      onPaymentInstructionChange({ ...paymentInstruction, amount: result.totalPayout });
    } catch (e: unknown) {
      setCalcError(e instanceof Error ? e.message : 'Calculation error');
      setCalc(null);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [investment, customer, rollPrincipal, newRate, newTenor, newEffective]);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(recalc, 150);
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, [recalc]);

  const tabs = [
    `Roll-over Slip ${voucherNos[0]}`,
    `Funds-Out ${voucherNos[1]}`,
  ];

  // Live split bar
  const totalPrincipal = parseFloat(investment?.principalAmt || '0');
  const rollAmt = parseFloat(rollPrincipal || '0');
  const payAmt = totalPrincipal - rollAmt;
  const rollPct = totalPrincipal > 0 ? (rollAmt / totalPrincipal) * 100 : 0;

  return (
    <div className="space-y-4">
      {/* Compound tabs */}
      <div className="flex gap-1 border-b border-border">
        {tabs.map((t, i) => (
          <button
            key={i}
            onClick={() => setActiveTab(i)}
            className={`px-4 py-2 text-xs font-semibold rounded-t-lg border-b-2 transition-colors ${
              activeTab === i ? 'border-primary text-primary bg-primary/5' : 'border-transparent text-muted-foreground hover:text-foreground'
            }`}
          >
            {t}
          </button>
        ))}
      </div>

      {/* Live split bar */}
      {rollPrincipal && totalPrincipal > 0 && (
        <div className="p-3 bg-muted/30 rounded-xl border border-border">
          <div className="flex justify-between text-xs font-semibold mb-1">
            <span className="text-blue-600">Roll {formatNaira(String(rollAmt))}</span>
            <span className="text-green-600">Pay {formatNaira(String(Math.max(payAmt, 0)))}</span>
          </div>
          <div className="h-3 rounded-full overflow-hidden bg-green-200 dark:bg-green-900/40">
            <div
              className="h-full bg-blue-500 rounded-full transition-all duration-300"
              style={{ width: `${Math.min(rollPct, 100)}%` }}
            />
          </div>
        </div>
      )}

      {activeTab === 0 && (
        <div className="space-y-3">
          <SectionHeader title="Roll-over Slip — Rollover C (Partial Principal)" icon={<RefreshCw size={16} className="text-blue-600" />} />
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <EditableField
              label="Roll Amount (₦, must be < principal)"
              value={rollPrincipal}
              onChange={setRollPrincipal}
              placeholder={`< ${formatNaira(investment?.principalAmt || '0')}`}
              error={calcError}
              required
            />
            <EditableField label="Effective Date (New)" value={newEffective} onChange={setNewEffective} type="date" required />
            <EditableField label="New Tenor (days)" value={newTenor} onChange={setNewTenor} type="number" />
            <EditableField label="New Rate (% p.a.)" value={newRate} onChange={setNewRate} />
            {calc && (
              <>
                <FxField label="Roll Amount" value={formatNaira(calc.rollAmount)} formula={`Roll principal = ${formatNaira(rollPrincipal)}`} highlight />
                <div>
                  <p className="text-[10px] text-muted-foreground uppercase tracking-wide mb-0.5">Roll-over Maturity Date</p>
                  <div className="flex items-center gap-1.5 px-3 py-2 rounded-lg border bg-muted/40 border-border">
                    <span className="text-[10px] font-bold text-primary bg-primary/10 px-1 rounded">fx</span>
                    <span className="text-sm font-semibold text-foreground">{formatDate(calc.newMaturityDate)}</span>
                  </div>
                </div>
                <FxField
                  label="Projected Interest (New)"
                  value={formatNaira(calc.projectedNewInterest)}
                  formula={`${formatNaira(calc.rollAmount)} × ${newRate}% × ${newTenor}/365 = ${formatNaira(calc.projectedNewInterest)}`}
                />
              </>
            )}
          </div>
        </div>
      )}

      {activeTab === 1 && calc && (
        <div className="space-y-3">
          <SectionHeader title="Funds-Out — Balance Payout" icon={<DollarSign size={16} className="text-green-600" />} />
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <FxField
              label="Principal Payout"
              value={formatNaira(calc.principalPayout)}
              formula={`${formatNaira(investment?.principalAmt || '0')} − ${formatNaira(rollPrincipal)} = ${formatNaira(calc.principalPayout)}`}
            />
            <FxField
              label="Interest Payout"
              value={formatNaira(calc.interestPayout)}
              formula={`Net interest = ${formatNaira(calc.interestPayout)}`}
            />
            <FxField
              label="Total Payout"
              value={formatNaira(calc.totalPayout)}
              formula={`${formatNaira(calc.principalPayout)} + ${formatNaira(calc.interestPayout)} = ${formatNaira(calc.totalPayout)}`}
              highlight
              large
            />
          </div>
          <PaymentInstructionBlock data={paymentInstruction} onChange={onPaymentInstructionChange} />
        </div>
      )}
    </div>
  );
}

// THIRD PARTY A — Funds-Out (external)
function ThirdPartyAVoucher({
  state,
  customer,
  banks,
  paymentInstruction,
  onPaymentInstructionChange,
}: {
  state: WizardStateSlice;
  customer: Customer | null;
  banks: Bank[];
  paymentInstruction: PaymentInstructionData;
  onPaymentInstructionChange: (d: PaymentInstructionData) => void;
}) {
  const [calc, setCalc] = useState<ReturnType<typeof thirdParty> | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const recalc = useCallback(() => {
    if (!state.amount) return;
    try {
      const result = thirdParty(state.amount, false);
      setCalc(result);
      onPaymentInstructionChange({
        ...paymentInstruction,
        amount: result.amountToBeneficiary,
        transferCharge: result.fee,
      });
    } catch { /* */ }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.amount]);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(recalc, 150);
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, [recalc]);

  const settings = getSettings();
  const feeRate = settings['TRANSFER_FEE_RATE'] ?? '0.10';
  const bankName = banks.find((b) => b.id === state.beneficiaryBank)?.name || state.beneficiaryBank;

  // Auto-fill remarks
  const remarks = [
    state.beneficiaryName && `Beneficiary: ${state.beneficiaryName}`,
    bankName && `Bank: ${bankName}`,
    state.beneficiaryAccount && `Acct: ${state.beneficiaryAccount}`,
    calc && `Transfer Charge: ${formatNaira(calc.fee)}`,
  ].filter(Boolean).join(' | ');

  return (
    <div className="space-y-5">
      <SectionHeader title="Funds-Out Voucher — Third-Party (External Bank)" icon={<DollarSign size={16} className="text-cyan-600" />} />
      {calc && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <p className="text-[10px] text-muted-foreground uppercase tracking-wide mb-0.5">Amount</p>
            <p className="text-sm font-semibold text-foreground">{formatNaira(state.amount)}</p>
          </div>
          <FxField
            label={`Transfer Charge (${feeRate}%)`}
            value={formatNaira(calc.fee)}
            formula={`${feeRate}% × ${formatNaira(state.amount)} = ${formatNaira(calc.fee)}`}
          />
          <FxField
            label="Amount to Beneficiary"
            value={formatNaira(calc.amountToBeneficiary)}
            formula={`${formatNaira(state.amount)} − ${formatNaira(calc.fee)} = ${formatNaira(calc.amountToBeneficiary)}`}
            highlight
          />
          <FxField
            label="Total Debit"
            value={formatNaira(calc.totalDebit)}
            formula={`Total debit = ${formatNaira(calc.totalDebit)}`}
            highlight
            large
          />
          <div className="sm:col-span-2">
            <p className="text-[10px] text-muted-foreground uppercase tracking-wide mb-0.5">Remarks (Auto-filled)</p>
            <div className="px-3 py-2 rounded-lg border bg-muted/40 border-border text-xs text-foreground">{remarks || '—'}</div>
          </div>
        </div>
      )}
      <PaymentInstructionBlock data={paymentInstruction} onChange={onPaymentInstructionChange} />
    </div>
  );
}

// THIRD PARTY B — Funds-Out (internal)
function ThirdPartyBVoucher({
  state,
  accounts,
  paymentInstruction,
  onPaymentInstructionChange,
}: {
  state: WizardStateSlice;
  accounts: Account[];
  paymentInstruction: PaymentInstructionData;
  onPaymentInstructionChange: (d: PaymentInstructionData) => void;
}) {
  const [destAccountId, setDestAccountId] = useState('');
  const [calc, setCalc] = useState<ReturnType<typeof thirdParty> | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const recalc = useCallback(() => {
    if (!state.amount) return;
    try {
      const result = thirdParty(state.amount, true);
      setCalc(result);
      onPaymentInstructionChange({ ...paymentInstruction, amount: result.amountToBeneficiary, transferCharge: '0.00' });
    } catch { /* */ }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.amount]);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(recalc, 150);
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, [recalc]);

  return (
    <div className="space-y-5">
      <SectionHeader title="Funds-Out Voucher — Third-Party (Internal Account)" icon={<DollarSign size={16} className="text-cyan-600" />} />
      <div>
        <label className="block text-[10px] text-muted-foreground uppercase tracking-wide mb-0.5">Destination Account</label>
        <select value={destAccountId} onChange={(e) => setDestAccountId(e.target.value)} className="input-field w-full text-sm">
          <option value="">Select internal account…</option>
          {accounts.map((a) => (
            <option key={a.id} value={a.id}>{a.accountTypeLabel} — {a.nuban}</option>
          ))}
        </select>
      </div>
      {calc && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <p className="text-[10px] text-muted-foreground uppercase tracking-wide mb-0.5">Amount</p>
            <p className="text-sm font-semibold text-foreground">{formatNaira(state.amount)}</p>
          </div>
          <FxField label="Transfer Charge" value={formatNaira(calc.fee)} formula="Internal transfer — charge ₦0.00" />
          <FxField label="Amount to Beneficiary" value={formatNaira(calc.amountToBeneficiary)} formula={`Amount = ${formatNaira(state.amount)}`} highlight large />
        </div>
      )}
      <PaymentInstructionBlock data={paymentInstruction} onChange={onPaymentInstructionChange} />
    </div>
  );
}

// TRANSFER A/B/C — Transfer Slip
function TransferVoucher({
  state,
  accounts,
  scenario,
  paymentInstruction,
  onPaymentInstructionChange,
}: {
  state: WizardStateSlice;
  accounts: Account[];
  scenario: string;
  paymentInstruction: PaymentInstructionData;
  onPaymentInstructionChange: (d: PaymentInstructionData) => void;
}) {
  const [destType, setDestType] = useState<'account' | 'cp' | 'call'>('account');
  const [destAccountId, setDestAccountId] = useState('');
  const [newRate, setNewRate] = useState('15');
  const [newTenor, setNewTenor] = useState('90');
  const [newEffective, setNewEffective] = useState(todayLagos());
  const [transferResult, setTransferResult] = useState<ReturnType<typeof transfer> | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const sourceAccount = accounts.find((a) => a.id === state.sourceAccountId);

  const recalc = useCallback(() => {
    if (!sourceAccount || !state.amount) return;
    try {
      const result = transfer(sourceAccount.balance, state.amount);
      setTransferResult(result);
    } catch { /* */ }
  }, [sourceAccount, state.amount]);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(recalc, 150);
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, [recalc]);

  const destLabel = scenario === 'A' ? 'Personal Account' : scenario === 'B' ? 'Commercial Paper' : 'Call Placement';

  return (
    <div className="space-y-5">
      <SectionHeader title={`Transfer Slip — Transfer ${scenario}`} icon={<ArrowRight size={16} className="text-indigo-600" />} />
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div>
          <p className="text-[10px] text-muted-foreground uppercase tracking-wide mb-0.5">Source Account</p>
          <p className="text-sm font-semibold text-foreground">{sourceAccount?.accountTypeLabel || '—'} — {sourceAccount?.nuban || '—'}</p>
        </div>
        <div>
          <p className="text-[10px] text-muted-foreground uppercase tracking-wide mb-0.5">Available Balance</p>
          <p className="text-sm font-semibold text-foreground">{formatNaira(sourceAccount?.balance || '0')}</p>
        </div>
        <div>
          <p className="text-[10px] text-muted-foreground uppercase tracking-wide mb-0.5">Destination ({destLabel})</p>
          {scenario === 'A' ? (
            <select value={destAccountId} onChange={(e) => setDestAccountId(e.target.value)} className="input-field w-full text-sm">
              <option value="">Select account…</option>
              {accounts.filter((a) => a.id !== state.sourceAccountId).map((a) => (
                <option key={a.id} value={a.id}>{a.accountTypeLabel} — {a.nuban}</option>
              ))}
            </select>
          ) : (
            <div className="space-y-2">
              <EditableField label="Rate (% p.a.)" value={newRate} onChange={setNewRate} />
              <EditableField label="Tenor (days)" value={newTenor} onChange={setNewTenor} type="number" />
              <EditableField label="Effective Date" value={newEffective} onChange={setNewEffective} type="date" />
            </div>
          )}
        </div>
        <div>
          <p className="text-[10px] text-muted-foreground uppercase tracking-wide mb-0.5">Amount</p>
          <p className="text-sm font-semibold text-foreground">{formatNaira(state.amount)}</p>
        </div>
        {transferResult && (
          <>
            <FxField
              label="Balance After"
              value={formatNaira(transferResult.sourceAfter)}
              formula={`${formatNaira(sourceAccount?.balance || '0')} − ${formatNaira(state.amount)} = ${formatNaira(transferResult.sourceAfter)}`}
              highlight={transferResult.valid}
            />
            {!transferResult.valid && (
              <div className="sm:col-span-2">
                <div className="flex items-center gap-2 p-2 bg-red-50 dark:bg-red-950/30 rounded-lg border border-red-200 text-xs text-red-600">
                  <AlertCircle size={12} />
                  <strong>Blocked:</strong> {transferResult.error}
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

// TRANSFER REVERSAL
function TransferReversalVoucher({
  state,
}: {
  state: WizardStateSlice;
}) {
  const [originalRate, setOriginalRate] = useState('');
  const [originalTenor, setOriginalTenor] = useState('');
  const [originalAmount, setOriginalAmount] = useState('');
  const [originalInterest, setOriginalInterest] = useState('');
  const [correctedRate, setCorrectedRate] = useState('');
  const [correctedTenor, setCorrectedTenor] = useState('');
  const [correctedAmount, setCorrectedAmount] = useState('');
  const [correctedInterest, setCorrectedInterest] = useState('');
  const [diff, setDiff] = useState<ReturnType<typeof reversalDiff> | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const recalc = useCallback(() => {
    if (!originalRate || !originalTenor || !originalAmount || !correctedRate || !correctedTenor || !correctedAmount) return;
    try {
      const result = reversalDiff(
        { principalAmt: originalAmount, intRate: originalRate, tenorDays: parseInt(originalTenor), interestAmt: originalInterest || '0' },
        { principalAmt: correctedAmount, intRate: correctedRate, tenorDays: parseInt(correctedTenor), interestAmt: correctedInterest || '0' }
      );
      setDiff(result);
    } catch { /* */ }
  }, [originalRate, originalTenor, originalAmount, originalInterest, correctedRate, correctedTenor, correctedAmount, correctedInterest]);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(recalc, 150);
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, [recalc]);

  return (
    <div className="space-y-5">
      <SectionHeader title="Transfer Slip — Reversal" icon={<ArrowRight size={16} className="text-red-600" />} />
      <InfoNote>Select a COMPLETED transaction to correct. Enter original and corrected values to see the delta.</InfoNote>
      <div className="grid grid-cols-3 gap-3">
        <div className="font-semibold text-xs text-muted-foreground uppercase tracking-wide">Field</div>
        <div className="font-semibold text-xs text-muted-foreground uppercase tracking-wide">Original</div>
        <div className="font-semibold text-xs text-muted-foreground uppercase tracking-wide">Corrected</div>

        <div className="text-xs text-foreground self-center">Rate (% p.a.)</div>
        <input type="text" value={originalRate} onChange={(e) => setOriginalRate(e.target.value)} className="input-field text-sm" placeholder="e.g. 15" />
        <input type="text" value={correctedRate} onChange={(e) => setCorrectedRate(e.target.value)} className="input-field text-sm" placeholder="e.g. 16" />

        <div className="text-xs text-foreground self-center">Tenor (days)</div>
        <input type="number" value={originalTenor} onChange={(e) => setOriginalTenor(e.target.value)} className="input-field text-sm" placeholder="365" />
        <input type="number" value={correctedTenor} onChange={(e) => setCorrectedTenor(e.target.value)} className="input-field text-sm" placeholder="365" />

        <div className="text-xs text-foreground self-center">Amount (₦)</div>
        <input type="text" value={originalAmount} onChange={(e) => setOriginalAmount(e.target.value)} className="input-field text-sm" placeholder="10000000" />
        <input type="text" value={correctedAmount} onChange={(e) => setCorrectedAmount(e.target.value)} className="input-field text-sm" placeholder="10000000" />

        <div className="text-xs text-foreground self-center">Interest (₦)</div>
        <input type="text" value={originalInterest} onChange={(e) => setOriginalInterest(e.target.value)} className="input-field text-sm" placeholder="optional" />
        <input type="text" value={correctedInterest} onChange={(e) => setCorrectedInterest(e.target.value)} className="input-field text-sm" placeholder="optional" />
      </div>

      {diff && (
        <div className="border border-border rounded-xl overflow-hidden">
          <div className="px-3 py-2 bg-muted/40 border-b border-border text-xs font-semibold text-muted-foreground uppercase tracking-wide">Delta (Corrected − Original)</div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 p-3">
            {[
              { label: 'Rate Δ', value: `${diff.rateDelta}%` },
              { label: 'Tenor Δ', value: `${diff.tenorDelta} days` },
              { label: 'Amount Δ', value: formatNaira(diff.amountDelta) },
              { label: 'Interest Δ', value: formatNaira(diff.projectedInterestDelta) },
            ].map((d) => (
              <div key={d.label} className={`p-2 rounded-lg border text-center ${parseFloat(d.value) > 0 ? 'bg-emerald-50 dark:bg-emerald-950/30 border-emerald-200' : parseFloat(d.value) < 0 ? 'bg-red-50 dark:bg-red-950/30 border-red-200' : 'bg-muted/30 border-border'}`}>
                <p className="text-[10px] text-muted-foreground">{d.label}</p>
                <p className="text-sm font-bold text-foreground">{d.value}</p>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Main VoucherStep ─────────────────────────────────────────────────────────

export default function VoucherStep({
  state,
  setState,
  selectedInvestment,
  selectedCustomer,
  accounts,
  banks,
  onBack,
  onComplete,
}: VoucherStepProps) {
  const router = useRouter();
  const session = getSession();

  // Voucher numbers (generated on first render / first save)
  const [voucherNos, setVoucherNos] = useState<[string, string]>(['', '']);
  const [voucherGenerated, setVoucherGenerated] = useState(false);

  // Payment instruction state (pre-filled from step 2)
  const [paymentInstruction, setPaymentInstruction] = useState<PaymentInstructionData>({
    beneficiaryName: state.beneficiaryName || '',
    bankName: banks.find((b) => b.id === state.beneficiaryBank)?.name || '',
    accountNumber: state.beneficiaryAccount || '',
    accountType: 'Savings',
    amount: state.amount || '0',
    transferCharge: '0.00',
  });

  // Modals
  const [showSignModal, setShowSignModal] = useState(false);
  const [showPrintModal, setShowPrintModal] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [savingDraft, setSavingDraft] = useState(false);
  const [validationErrors, setValidationErrors] = useState<string[]>([]);

  // Generate voucher numbers on mount
  useEffect(() => {
    if (!voucherGenerated) {
      const prefix = getVoucherPrefix(state.txnType || '', state.scenario || '');
      const isCompound = (state.txnType === 'ROLLOVER' && ['B', 'C', 'D'].includes(state.scenario || '')) ||
        (state.txnType === 'PRELIQ' && state.scenario === 'PARTIAL');
      const no1 = generateVoucherNo(state.txnType === 'ROLLOVER' ? 'RO' : state.txnType === 'INFLOW' ? 'FI' : state.txnType === 'TRANSFER' ? 'TS' : 'FO');
      const no2 = isCompound ? generateVoucherNo('FO') : '';
      setVoucherNos([no1, no2]);
      setVoucherGenerated(true);
    }
  }, [voucherGenerated, state.txnType, state.scenario]);

  // Validate before submit
  const validate = useCallback((): boolean => {
    const errors: string[] = [];
    if (!paymentInstruction.beneficiaryName && needsPaymentInstruction()) errors.push('Beneficiary Name is required');
    if (!paymentInstruction.accountNumber && needsPaymentInstruction()) errors.push('Account Number is required');
    setValidationErrors(errors);
    return errors.length === 0;
  }, [paymentInstruction]);

  function needsPaymentInstruction(): boolean {
    const t = state.txnType;
    const s = state.scenario;
    if (t === 'INFLOW' || t === 'TRANSFER') return false;
    if (t === 'ROLLOVER' && s === 'A') return false;
    return true;
  }

  // Save draft
  const handleSaveDraft = useCallback(async () => {
    setSavingDraft(true);
    try {
      if (state.txnId) {
        await transactionService.update(state.txnId, {
          voucherNo: voucherNos[0],
          updatedAt: nowLagosISO(),
        });
      }
    } catch { /* */ } finally {
      setSavingDraft(false);
    }
  }, [state.txnId, voucherNos]);

  // Print fields for preview
  const getPrintFields = (): { label: string; value: string }[] => {
    const t = state.txnType;
    const s = state.scenario;
    const inv = selectedInvestment;
    if (!inv && t !== 'INFLOW' && t !== 'THIRD_PARTY' && t !== 'TRANSFER') return [];
    return [
      { label: 'Voucher No', value: voucherNos[0] },
      { label: 'Transaction Type', value: `${t} ${s}` },
      { label: 'Customer', value: selectedCustomer?.name || '—' },
      { label: 'Amount', value: formatNaira(state.amount) },
      { label: 'Purpose', value: state.purpose },
      ...(inv ? [
        { label: 'Principal', value: formatNaira(inv.principalAmt) },
        { label: 'Rate', value: `${inv.intRate}% p.a.` },
        { label: 'Tenor', value: `${inv.tenorDays} days` },
      ] : []),
    ];
  };

  // Sign & Submit
  const handleSignSubmit = useCallback(async (signerName: string, _pin: string) => {
    if (!validate()) { setShowSignModal(false); return; }
    setSubmitting(true);
    try {
      const now = nowLagosISO();
      const settings = getSettings();
      const slaHours = parseInt(settings['SLA_HOURS'] ?? '8');
      const slaDue = new Date(Date.now() + slaHours * 3600 * 1000).toISOString();

      if (state.txnId) {
        await transactionService.update(state.txnId, {
          status: 'PENDING_HEAD_TREASURY',
          voucherNo: voucherNos[0],
          updatedAt: now,
          slaCutoffTime: slaDue,
          approvals: [
            {
              id: `appr-to-${Date.now()}`,
              version: 1,
              txnId: state.txnId,
              level: 'TO',
              sequence: 1,
              approver: signerName,
              approverId: session?.user.id ?? 'usr-001',
              action: 'APPROVED',
              comment: 'Treasury Officer approval — voucher raised',
              actionAt: now,
              status: 'APPROVED',
            },
          ],
          controlChecks: [
            {
              id: `cc-c05-${Date.now()}`,
              version: 1,
              txnId: state.txnId,
              checkCode: 'C05',
              checkLabel: 'Correct voucher raised',
              passed: true,
              checkedAt: now,
              checkedBy: signerName,
            },
            {
              id: `cc-c06-${Date.now()}`,
              version: 1,
              txnId: state.txnId,
              checkCode: 'C06',
              checkLabel: 'Treasury Officer approval',
              passed: true,
              checkedAt: now,
              checkedBy: signerName,
            },
          ],
        });
      }

      setShowSignModal(false);
      // Redirect with success toast
      router.push('/transactions?submitted=1');
    } catch { /* */ } finally {
      setSubmitting(false);
    }
  }, [state.txnId, voucherNos, session, validate, router]);

  const txnType = state.txnType || '';
  const scenario = state.scenario || '';
  const isCompound = (txnType === 'ROLLOVER' && ['B', 'C', 'D'].includes(scenario)) ||
    (txnType === 'PRELIQ' && scenario === 'PARTIAL');

  const voucherTypeLabel = txnType === 'INFLOW' ? 'Funds-In Voucher'
    : txnType === 'ROLLOVER' ? 'Roll-over Slip'
    : txnType === 'TRANSFER'? 'Transfer Slip' :'Funds-Out Voucher';

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h2 className="text-base font-semibold text-foreground mb-1">Step 6 — Voucher</h2>
          <p className="text-sm text-muted-foreground">
            {voucherTypeLabel}
            {isCompound && ' (Compound — 2 linked vouchers)'}
          </p>
        </div>
        {voucherNos[0] && (
          <div className="text-right">
            <p className="text-[10px] text-muted-foreground">Voucher No.</p>
            <p className="text-sm font-mono font-bold text-primary">{voucherNos[0]}</p>
            {voucherNos[1] && <p className="text-xs font-mono text-muted-foreground">{voucherNos[1]}</p>}
          </div>
        )}
      </div>

      {/* Validation errors */}
      {validationErrors.length > 0 && (
        <div className="p-3 bg-red-50 dark:bg-red-950/30 rounded-xl border border-red-200 dark:border-red-800 space-y-1">
          {validationErrors.map((e, i) => (
            <div key={i} className="flex items-center gap-2 text-xs text-red-600">
              <AlertCircle size={12} />
              {e}
            </div>
          ))}
        </div>
      )}

      {/* Voucher form by type */}
      {txnType === 'INFLOW' && (
        <InflowVoucher
          state={state}
          customer={selectedCustomer}
          voucherNo={voucherNos[0]}
          paymentInstruction={paymentInstruction}
          onPaymentInstructionChange={setPaymentInstruction}
        />
      )}

      {txnType === 'MATURITY' && (
        <MaturityVoucher
          investment={selectedInvestment}
          customer={selectedCustomer}
          voucherNo={voucherNos[0]}
          paymentInstruction={paymentInstruction}
          onPaymentInstructionChange={setPaymentInstruction}
        />
      )}

      {txnType === 'PRELIQ' && scenario === 'FULL' && (
        <PreliqFullVoucher
          investment={selectedInvestment}
          customer={selectedCustomer}
          paymentInstruction={paymentInstruction}
          onPaymentInstructionChange={setPaymentInstruction}
        />
      )}

      {txnType === 'PRELIQ' && scenario === 'PARTIAL' && (
        <PreliqPartialVoucher
          investment={selectedInvestment}
          customer={selectedCustomer}
          paymentInstruction={paymentInstruction}
          onPaymentInstructionChange={setPaymentInstruction}
        />
      )}

      {txnType === 'ANNIVERSARY' && (
        <AnniversaryVoucher
          investment={selectedInvestment}
          customer={selectedCustomer}
          scenario={scenario}
          paymentInstruction={paymentInstruction}
          onPaymentInstructionChange={setPaymentInstruction}
        />
      )}

      {txnType === 'ROLLOVER' && scenario === 'A' && (
        <RolloverAVoucher
          investment={selectedInvestment}
          customer={selectedCustomer}
          voucherNo={voucherNos[0]}
          paymentInstruction={paymentInstruction}
          onPaymentInstructionChange={setPaymentInstruction}
        />
      )}

      {txnType === 'ROLLOVER' && (scenario === 'B' || scenario === 'D') && (
        <RolloverBDVoucher
          investment={selectedInvestment}
          customer={selectedCustomer}
          scenario={scenario}
          voucherNos={voucherNos}
          paymentInstruction={paymentInstruction}
          onPaymentInstructionChange={setPaymentInstruction}
        />
      )}

      {txnType === 'ROLLOVER' && scenario === 'C' && (
        <RolloverCVoucher
          investment={selectedInvestment}
          customer={selectedCustomer}
          voucherNos={voucherNos}
          paymentInstruction={paymentInstruction}
          onPaymentInstructionChange={setPaymentInstruction}
        />
      )}

      {txnType === 'THIRD_PARTY' && scenario === 'A' && (
        <ThirdPartyAVoucher
          state={state}
          customer={selectedCustomer}
          banks={banks}
          paymentInstruction={paymentInstruction}
          onPaymentInstructionChange={setPaymentInstruction}
        />
      )}

      {txnType === 'THIRD_PARTY' && scenario === 'B' && (
        <ThirdPartyBVoucher
          state={state}
          accounts={accounts}
          paymentInstruction={paymentInstruction}
          onPaymentInstructionChange={setPaymentInstruction}
        />
      )}

      {txnType === 'TRANSFER' && scenario !== 'REV' && (
        <TransferVoucher
          state={state}
          accounts={accounts}
          scenario={scenario}
          paymentInstruction={paymentInstruction}
          onPaymentInstructionChange={setPaymentInstruction}
        />
      )}

      {txnType === 'TRANSFER' && scenario === 'REV' && (
        <TransferReversalVoucher state={state} />
      )}

      {/* Bottom action bar */}
      <div className="flex items-center justify-between pt-4 border-t border-border gap-3 flex-wrap">
        <button onClick={onBack} className="btn-secondary flex items-center gap-2">
          <ChevronDown size={16} className="rotate-90" /> Back
        </button>
        <div className="flex items-center gap-2 flex-wrap">
          <button
            onClick={handleSaveDraft}
            disabled={savingDraft}
            className="btn-secondary flex items-center gap-2 text-sm"
          >
            {savingDraft ? <Loader2 size={14} className="animate-spin" /> : <FileText size={14} />}
            Save Draft
          </button>
          <button
            onClick={() => setShowPrintModal(true)}
            className="btn-secondary flex items-center gap-2 text-sm"
          >
            <Eye size={14} /> Preview Voucher
          </button>
          <button
            onClick={() => {
              if (validate()) setShowSignModal(true);
            }}
            className="btn-primary flex items-center gap-2 text-sm"
          >
            <PenLine size={14} /> Sign &amp; Submit
          </button>
        </div>
      </div>

      {/* Signature Modal */}
      <SignatureModal
        open={showSignModal}
        onClose={() => setShowSignModal(false)}
        onSubmit={handleSignSubmit}
        submitting={submitting}
      />

      {/* Print Preview Modal */}
      <PrintViewModal
        open={showPrintModal}
        onClose={() => setShowPrintModal(false)}
        voucherNo={voucherNos[0]}
        voucherType={voucherTypeLabel}
        customerName={selectedCustomer?.name || '—'}
        fields={getPrintFields()}
      />
    </div>
  );
}
