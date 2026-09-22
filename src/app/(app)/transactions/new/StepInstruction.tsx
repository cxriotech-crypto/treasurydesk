'use client';

import { useMemo, useRef, useState } from 'react';
import { ArrowLeft, ArrowRight, FileUp, Search, Trash2 } from 'lucide-react';
import type { AccountType, InstructionChannel, PayDestination } from '@/domain/codes';
import { CHANNEL_LABELS, SCENARIO_META } from '@/domain/codes';
import { INTERNAL_BANK_CODE } from '@/domain/rules';
import { isoDatePart, isoTimePart, nowIso } from '@/lib/dates';
import { isPositive } from '@/lib/money';
import {
  AppError,
  accountsService,
  banksService,
  beneficiariesService,
  transactionsService,
} from '@/services';
import { useData } from '@/services/useData';
import {
  Button,
  DateInput,
  Field,
  InlineAlert,
  Input,
  MoneyInput,
  RadioGroup,
  Select,
  Textarea,
  TimeInput,
  toast,
} from '@/components/ui';
import { DocumentPreview } from '@/components/txn/Specimen';
import type { StepProps } from './Wizard';

const MAX_UPLOAD = 1024 * 1024;
/** Scenarios whose instructed amount is also the voucher amount. */
const AMOUNT_DRIVES_INPUT = new Set([
  'INFLOW',
  'THIRD_PARTY_EXT',
  'THIRD_PARTY_INT',
  'TRANSFER_SS_PA',
  'TRANSFER_PA_CP',
  'TRANSFER_PA_CALL',
  'PRELIQ_PARTIAL',
]);

export function StepInstruction({ detail, goTo }: StepProps) {
  const { txn, instruction, customer } = detail;
  const s = txn.scenarioCode;
  const hasPayout = SCENARIO_META[s].vouchers.includes('FO');
  const forcedExternal = s === 'THIRD_PARTY_EXT';
  const internalTp = s === 'THIRD_PARTY_INT';
  const now = nowIso();

  const [channel, setChannel] = useState<InstructionChannel>(instruction?.channel ?? 'LETTER');
  const [date, setDate] = useState(instruction?.receivedDate ?? isoDatePart(now));
  const [time, setTime] = useState(instruction?.receivedTime ?? isoTimePart(now));
  const [amount, setAmount] = useState(
    instruction?.amount ?? txn.input.amount ?? (isPositive(txn.headlineAmt) ? txn.headlineAmt : '')
  );
  const [purpose, setPurpose] = useState(instruction?.purpose ?? '');
  const [dest, setDest] = useState<PayDestination>(
    forcedExternal ? 'EXTERNAL' : (instruction?.payDestination ?? 'INTERNAL')
  );
  const [benefName, setBenefName] = useState(instruction?.benefName ?? '');
  const [bankCode, setBankCode] = useState(
    instruction?.bankCode && instruction.bankCode !== INTERNAL_BANK_CODE ? instruction.bankCode : ''
  );
  const [accountNo, setAccountNo] = useState(instruction?.accountNo ?? '');
  const [accountType, setAccountType] = useState<AccountType>(
    instruction?.accountType ?? 'SAVINGS'
  );
  const [docName, setDocName] = useState(instruction?.documentName ?? null);
  const [docData, setDocData] = useState(instruction?.documentData ?? null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState<string | null>(null);
  const [enquiry, setEnquiry] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const external = forcedExternal || (hasPayout && !internalTp && dest === 'EXTERNAL');
  const banks = useData(() => banksService.list({ filters: { active: true } }), []);
  const saved = useData(
    () =>
      beneficiariesService.list({ filters: { customerId: customer.id, isInternal: internalTp } }),
    [customer.id, internalTp]
  );
  const bankOptions = useMemo(
    () =>
      (banks.data?.items ?? []).map((b) => ({
        value: b.bankCode,
        label: `${b.bankName} (${b.bankCode})`,
      })),
    [banks.data]
  );

  const pickSaved = (id: string) => {
    const b = saved.data?.items.find((x) => x.id === id);
    if (!b) return;
    setBenefName(b.benefName);
    setAccountNo(b.accountNo);
    setAccountType(b.accountType);
    if (!b.isInternal) setBankCode(b.bankCode);
    setEnquiry(null);
  };

  const nameEnquiry = async () => {
    setBusy('enquiry');
    setErrors((e) => ({ ...e, accountNo: '', bankCode: '' }));
    try {
      if (internalTp) {
        const r = await accountsService.lookup(accountNo);
        if (!r)
          throw new AppError('No internal account with this number.', 'NOT_FOUND', {
            accountNo: 'Account not found',
          });
        setBenefName(r.accountName);
        setEnquiry(`${r.accountName} · ${r.productCode === 'PA' ? 'Personal Account' : 'Savings'}`);
      } else {
        const r = await beneficiariesService.nameEnquiry(bankCode, accountNo);
        setBenefName(r.accountName);
        setEnquiry(`${r.accountName} · ${r.bankName}`);
      }
    } catch (e) {
      setErrors(
        e instanceof AppError && Object.keys(e.fieldErrors).length
          ? e.fieldErrors
          : { accountNo: (e as Error).message }
      );
      setEnquiry(null);
    } finally {
      setBusy(null);
    }
  };

  const onFile = (f: File | undefined) => {
    if (!f) return;
    if (!/^(application\/pdf|image\/(png|jpe?g|webp))$/.test(f.type)) {
      setErrors((e) => ({ ...e, document: 'Upload a PDF or an image (PNG, JPG)' }));
      return;
    }
    if (f.size > MAX_UPLOAD) {
      setErrors((e) => ({ ...e, document: 'File is larger than 1 MB' }));
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      setDocName(f.name);
      setDocData(String(reader.result));
      setErrors((e) => ({ ...e, document: '' }));
    };
    reader.readAsDataURL(f);
  };

  const submit = async () => {
    setBusy('save');
    setErrors({});
    try {
      await transactionsService.recordInstruction(txn.id, {
        channel,
        receivedDate: date,
        receivedTime: time,
        amount,
        purpose,
        documentName: docName,
        documentData: docData,
        payDestination: external ? 'EXTERNAL' : 'INTERNAL',
        benefName: external || internalTp ? benefName : null,
        bankCode: external ? bankCode : null,
        accountNo: external || internalTp ? accountNo : null,
        accountType: external || internalTp ? accountType : null,
      });
      if (AMOUNT_DRIVES_INPUT.has(s) && amount && amount !== txn.input.amount) {
        await transactionsService.saveDraft(txn.id, { input: { ...txn.input, amount } });
      }
      toast.success('Instruction recorded', 'SLA clock started.');
      goTo(3);
    } catch (e) {
      setErrors(
        e instanceof AppError && Object.keys(e.fieldErrors).length
          ? e.fieldErrors
          : { form: (e as Error).message }
      );
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Field label="Channel" required>
          <Select
            value={channel}
            onChange={(e) => setChannel(e.target.value as InstructionChannel)}
            options={(Object.keys(CHANNEL_LABELS) as InstructionChannel[]).map((c) => ({
              value: c,
              label: CHANNEL_LABELS[c],
            }))}
          />
        </Field>
        <Field label="Amount on the instruction" required error={errors.amount}>
          <MoneyInput value={amount} onValueChange={setAmount} placeholder="0.00" />
        </Field>
        <Field
          label="Date received"
          required
          error={errors.receivedDate}
          hint="Starts the SLA clock"
        >
          <DateInput value={date} onChange={(e) => setDate(e.target.value)} />
        </Field>
        <Field label="Time received" required error={errors.receivedTime}>
          <TimeInput value={time} onChange={(e) => setTime(e.target.value)} />
        </Field>
        <Field label="Purpose" required error={errors.purpose} className="sm:col-span-2">
          <Textarea
            rows={2}
            value={purpose}
            onChange={(e) => setPurpose(e.target.value)}
            placeholder="As stated by the customer"
          />
        </Field>
      </div>

      <div>
        <p className="mb-1 text-[13px] font-medium text-muted">Instruction scan</p>
        <div className="grid grid-cols-1 gap-3 md:grid-cols-[minmax(0,1fr)_auto] md:items-start">
          <DocumentPreview name={docName} data={docData} />
          <div className="flex gap-2 md:flex-col">
            <input
              ref={fileRef}
              type="file"
              accept="application/pdf,image/png,image/jpeg,image/webp"
              className="sr-only"
              aria-label="Upload instruction scan"
              onChange={(e) => onFile(e.target.files?.[0])}
            />
            <Button icon={FileUp} onClick={() => fileRef.current?.click()}>
              {docData ? 'Replace' : 'Upload'}
            </Button>
            {docData ? (
              <Button
                variant="ghost"
                icon={Trash2}
                onClick={() => {
                  setDocData(null);
                  setDocName(null);
                  if (fileRef.current) fileRef.current.value = '';
                }}
              >
                Remove
              </Button>
            ) : null}
          </div>
        </div>
        <p
          className={
            errors.document
              ? 'mt-1 text-xs font-medium text-st-danger-fg'
              : 'mt-1 text-xs text-muted'
          }
        >
          {errors.document || 'PDF or image, up to 1 MB. Stored with the transaction.'}
        </p>
      </div>

      {hasPayout ? (
        <div className="space-y-4 rounded-md border border-border p-4">
          {!forcedExternal && !internalTp ? (
            <RadioGroup<PayDestination>
              name="dest"
              label="Where is the money going?"
              orientation="horizontal"
              value={dest}
              onChange={setDest}
              options={[
                {
                  value: 'INTERNAL',
                  label: "Customer's Personal Account",
                  description: 'Credited in Eazybankz',
                },
                {
                  value: 'EXTERNAL',
                  label: 'Account at another bank',
                  description: 'Paid through GAPS',
                },
              ]}
            />
          ) : (
            <p className="text-sm font-medium">
              {internalTp ? 'Internal beneficiary account' : 'Beneficiary at another bank (GAPS)'}
            </p>
          )}

          {external || internalTp ? (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              {saved.data?.items.length ? (
                <Field label="Pick saved beneficiary" className="sm:col-span-2">
                  <Select
                    value=""
                    placeholder="Choose a saved beneficiary…"
                    onChange={(e) => pickSaved(e.target.value)}
                    options={saved.data.items.map((b) => ({
                      value: b.id,
                      label: `${b.benefName} · ${b.bankName} · ${b.accountNo}`,
                    }))}
                  />
                </Field>
              ) : null}
              {external ? (
                <Field label="Bank" required error={errors.bankCode}>
                  <Select
                    value={bankCode}
                    placeholder="Choose bank…"
                    onChange={(e) => setBankCode(e.target.value)}
                    options={bankOptions}
                  />
                </Field>
              ) : null}
              <Field label="Account number" required error={errors.accountNo} hint="10-digit NUBAN">
                <Input
                  inputMode="numeric"
                  maxLength={10}
                  value={accountNo}
                  onChange={(e) => {
                    setAccountNo(e.target.value.replace(/\D/g, '').slice(0, 10));
                    setEnquiry(null);
                  }}
                  suffix={
                    <button
                      type="button"
                      className="rounded px-2 py-1 text-xs font-medium text-brand hover:bg-surface-2 disabled:opacity-50"
                      disabled={
                        accountNo.length !== 10 || (external && !bankCode) || busy === 'enquiry'
                      }
                      onClick={nameEnquiry}
                      aria-label="Name enquiry"
                    >
                      {busy === 'enquiry' ? 'Checking…' : <Search size={14} aria-hidden />}
                    </button>
                  }
                />
              </Field>
              <Field
                label="Beneficiary name"
                required
                error={errors.benefName}
                hint={
                  enquiry ? `Name enquiry: ${enquiry}` : 'Use the search button for a name enquiry'
                }
              >
                <Input value={benefName} onChange={(e) => setBenefName(e.target.value)} />
              </Field>
              <Field label="Account type" required error={errors.accountType}>
                <Select
                  value={accountType}
                  onChange={(e) => setAccountType(e.target.value as AccountType)}
                  options={[
                    { value: 'SAVINGS', label: 'Savings' },
                    { value: 'CURRENT', label: 'Current' },
                  ]}
                />
              </Field>
            </div>
          ) : (
            <p className="text-[13px] text-muted">
              The payout will be credited to {customer.customerName}&apos;s Personal Account.
            </p>
          )}
        </div>
      ) : null}

      {errors.form ? <InlineAlert tone="danger">{errors.form}</InlineAlert> : null}

      <div className="flex flex-col-reverse gap-2 border-t border-border pt-4 sm:flex-row sm:justify-between">
        <Button icon={ArrowLeft} onClick={() => goTo(1)}>
          Back
        </Button>
        <Button variant="primary" iconRight={ArrowRight} loading={busy === 'save'} onClick={submit}>
          Save instruction and continue
        </Button>
      </div>
    </div>
  );
}
