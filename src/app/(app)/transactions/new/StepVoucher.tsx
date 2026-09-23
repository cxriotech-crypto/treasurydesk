'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowLeft, Eye, PenLine, Save } from 'lucide-react';
import type { TxnInput } from '@/domain/types';
import {
  SCENARIO_META,
  VOUCHER_TYPE_META,
  type AnnivFreq,
  type ProductCode,
  type ScenarioCode,
} from '@/domain/codes';
import { formatNaira, formatRate } from '@/lib/format';
import { settingsService, transactionsService } from '@/services';
import { useCurrentUser, useData } from '@/services/useData';
import { useDebounced } from '@/components/hooks';
import {
  Button,
  DateInput,
  Field,
  InlineAlert,
  Input,
  MoneyInput,
  Select,
  SignatureModal,
  SkeletonRows,
  Switch,
  Tabs,
  Textarea,
  toast,
  toastError,
} from '@/components/ui';
import { SplitBar, VoucherView } from '@/components/txn/VoucherView';
import type { StepProps } from './Wizard';

type Key = keyof TxnInput;

function fieldsFor(s: ScenarioCode): Key[] {
  switch (s) {
    case 'INFLOW':
      return ['amount', 'newRate', 'newTenorDays', 'valueDate', 'productCode', 'annivFreqDays'];
    case 'MATURITY':
    case 'PRELIQ_FULL':
      return ['valueDate'];
    case 'PRELIQ_PARTIAL':
      return ['amount', 'valueDate', 'newRate', 'newTenorDays'];
    case 'ANNIVERSARY':
      return ['annivPeriod', 'valueDate'];
    case 'ROLLOVER_A':
    case 'ROLLOVER_B':
    case 'ROLLOVER_D':
      return ['valueDate', 'newRate', 'newTenorDays'];
    case 'ROLLOVER_C':
      return ['rollAmt', 'valueDate', 'newRate', 'newTenorDays'];
    case 'THIRD_PARTY_EXT':
    case 'THIRD_PARTY_INT':
    case 'TRANSFER_SS_PA':
      return ['amount', 'valueDate'];
    case 'TRANSFER_PA_CP':
    case 'TRANSFER_PA_CALL':
      return ['amount', 'valueDate', 'newRate', 'newTenorDays'];
    case 'TRANSFER_REVERSAL':
      return ['correctedAmount', 'correctedRate', 'correctedTenorDays'];
  }
}

function labelFor(s: ScenarioCode, k: Key): string {
  const t = SCENARIO_META[s].txnType;
  switch (k) {
    case 'amount':
      return s === 'INFLOW' ? 'Principal' : s === 'PRELIQ_PARTIAL' ? 'Amount requested' : 'Amount';
    case 'valueDate':
      return s === 'INFLOW' || (t === 'TRANSFER' && s !== 'TRANSFER_SS_PA')
        ? 'Effective / transfer date'
        : t === 'ROLLOVER'
          ? 'New effective date'
          : t === 'PRELIQ'
            ? 'Liquidation date'
            : 'Transfer date';
    case 'newRate':
      return t === 'ROLLOVER' || s === 'PRELIQ_PARTIAL' ? 'New rate' : 'Rate';
    case 'newTenorDays':
      return t === 'ROLLOVER' || s === 'PRELIQ_PARTIAL' ? 'New tenor' : 'Tenor';
    case 'rollAmt':
      return 'Amount to roll';
    case 'annivPeriod':
      return 'Anniversary period';
    case 'productCode':
      return 'Product';
    case 'annivFreqDays':
      return 'Anniversary interest';
    case 'correctedAmount':
      return 'Corrected amount';
    case 'correctedRate':
      return 'Corrected rate';
    case 'correctedTenorDays':
      return 'Corrected tenor';
    default:
      return k;
  }
}

/** Remove empty values so the builder applies its defaults. */
function clean(i: TxnInput): TxnInput {
  const out: TxnInput = {};
  for (const [k, v] of Object.entries(i) as [Key, unknown][]) {
    if (v !== '' && v !== undefined && v !== null && !(typeof v === 'number' && Number.isNaN(v)))
      (out as Record<string, unknown>)[k] = v;
  }
  return out;
}

export function StepVoucher({ detail, goTo }: StepProps) {
  const router = useRouter();
  const me = useCurrentUser();
  const { txn, investment } = detail;
  const s = txn.scenarioCode;
  const [input, setInput] = useState<TxnInput>(txn.input);
  const [tab, setTab] = useState('0');
  const [signOpen, setSignOpen] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const debounced = useDebounced(input, 150);
  const key = JSON.stringify(clean(debounced));
  const comp = useData(() => transactionsService.preview(txn.id, clean(debounced)), [key]);
  const settings = useData(() => settingsService.get(), []);

  const set = (k: Key, v: unknown) => setInput((i) => ({ ...i, [k]: v }));
  const errors = comp.data?.errors ?? {};
  const vouchers = useMemo(() => comp.data?.vouchers ?? [], [comp.data]);
  const hasErrors = Object.keys(errors).length > 0;
  const current = vouchers[Number(tab)] ?? vouchers[0];

  const defaults = useMemo(() => {
    // Placeholders show what the builder will use when a field is left empty.
    const ro = vouchers.find((v) => v.voucherType === 'RO') ?? vouchers.find((v) => v.newRate);
    return {
      newRate: ro?.newRate ?? investment?.intRate ?? '',
      newTenorDays: ro?.newTenorDays ?? investment?.tenorDays ?? '',
      valueDate: (ro?.effectiveDate ?? vouchers[0]?.transferDate) || '',
    };
  }, [vouchers, investment]);

  const save = async (silent = false) => {
    await transactionsService.saveDraft(txn.id, { input: clean(input), wizardStep: 6 });
    if (!silent) toast.success('Draft saved');
  };

  const preview = async (seq: number) => {
    setBusy('preview');
    try {
      await save(true);
      window.open(`/vouchers/draft/print?txn=${txn.id}&seq=${seq}`, '_blank', 'noopener');
    } catch (e) {
      toastError(e);
    } finally {
      setBusy(null);
    }
  };

  const renderField = (k: Key) => {
    const err = errors[k] ?? null;
    const label = labelFor(s, k);
    switch (k) {
      case 'amount':
      case 'rollAmt':
      case 'correctedAmount':
        return (
          <Field
            key={k}
            label={label}
            error={err}
            required={k !== 'correctedAmount'}
            hint={
              k === 'correctedAmount' && investment
                ? `Original ${formatNaira(investment.principalAmt)}`
                : undefined
            }
          >
            <MoneyInput
              value={(input[k] as string) ?? ''}
              onValueChange={(v) => set(k, v)}
              placeholder={k === 'correctedAmount' && investment ? investment.principalAmt : '0.00'}
            />
          </Field>
        );
      case 'newRate':
      case 'correctedRate':
        return (
          <Field
            key={k}
            label={`${label} (% p.a.)`}
            error={err}
            hint={
              k === 'correctedRate' && investment
                ? `Original ${formatRate(investment.intRate)}`
                : defaults.newRate && !input[k]
                  ? `Default ${formatRate(defaults.newRate)}`
                  : undefined
            }
          >
            <Input
              inputMode="decimal"
              value={(input[k] as string) ?? ''}
              placeholder={
                k === 'correctedRate' ? (investment?.intRate ?? '') : String(defaults.newRate ?? '')
              }
              onChange={(e) => set(k, e.target.value.replace(/[^\d.]/g, ''))}
              suffix="%"
              className="num text-right"
            />
          </Field>
        );
      case 'newTenorDays':
      case 'correctedTenorDays':
        return (
          <Field key={k} label={label} error={err} hint="1–1,825 days">
            <Input
              inputMode="numeric"
              value={input[k] === undefined ? '' : String(input[k])}
              placeholder={
                k === 'correctedTenorDays'
                  ? String(investment?.tenorDays ?? '')
                  : String(defaults.newTenorDays ?? '')
              }
              onChange={(e) => {
                const v = e.target.value.replace(/\D/g, '');
                set(k, v === '' ? undefined : Number(v));
              }}
              suffix="days"
              className="num text-right"
            />
          </Field>
        );
      case 'valueDate':
        return (
          <Field
            key={k}
            label={label}
            error={err}
            hint={
              !input.valueDate && defaults.valueDate
                ? 'Defaults shown until you choose a date'
                : undefined
            }
          >
            <DateInput
              value={input.valueDate ?? defaults.valueDate ?? ''}
              onChange={(e) => set('valueDate', e.target.value)}
            />
          </Field>
        );
      case 'annivPeriod':
        return (
          <Field key={k} label={label} error={err}>
            <Select
              value={String(input.annivPeriod ?? investment?.annivFreqDays ?? 30)}
              onChange={(e) => set('annivPeriod', Number(e.target.value))}
              options={[30, 60, 90].map((p) => ({ value: String(p), label: `${p} days` }))}
            />
          </Field>
        );
      case 'productCode':
        return (
          <Field key={k} label={label}>
            <Select
              value={input.productCode ?? 'TERM'}
              onChange={(e) => set('productCode', e.target.value as ProductCode)}
              options={[
                { value: 'TERM', label: 'Term Deposit' },
                { value: 'CP', label: 'Commercial Paper' },
                { value: 'CALL', label: 'Call Placement' },
              ]}
            />
          </Field>
        );
      case 'annivFreqDays':
        return (
          <Field key={k} label={label}>
            <Select
              value={String(input.annivFreqDays ?? 0)}
              onChange={(e) => set('annivFreqDays', Number(e.target.value) as AnnivFreq)}
              options={[
                { value: '0', label: 'None — paid at maturity' },
                { value: '30', label: 'Every 30 days' },
                { value: '60', label: 'Every 60 days' },
                { value: '90', label: 'Every 90 days' },
              ]}
            />
          </Field>
        );
      default:
        return null;
    }
  };

  const ro = vouchers.find((v) => v.voucherType === 'RO');
  const fo = vouchers.find((v) => v.voucherType === 'FO');

  // Deductions this voucher carries; each can be switched off for this transaction alone.
  const hasRow = (prefix: string) =>
    vouchers.some((v) => v.rows.some((r) => r.label.startsWith(prefix)));
  const showWht = hasRow('WHT');
  const showCharge = hasRow('Pre-liquidation charge');

  return (
    <div className="space-y-5">
      <section>
        <h3 className="mb-3 text-[13px] font-semibold">Voucher inputs</h3>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          {fieldsFor(s).map(renderField)}
          <Field
            label="Remarks"
            hint="Leave empty to use the standard remarks"
            className="sm:col-span-2"
          >
            <Textarea
              rows={2}
              value={input.remarks ?? ''}
              onChange={(e) => set('remarks', e.target.value)}
              placeholder={vouchers[0]?.remarks}
            />
          </Field>
        </div>
        {showWht || showCharge ? (
          <div className="mt-4 rounded-md border border-border px-3">
            {showWht ? (
              <Switch
                label="Deduct withholding tax"
                description={
                  detail.customer.whtExempt
                    ? `${detail.customer.customerName} is WHT-exempt, so no tax is deducted.`
                    : `Deduct ${formatRate(settings.data?.values.whtRate ?? '0')} withholding tax on the interest of this transaction.`
                }
                disabled={detail.customer.whtExempt}
                checked={!detail.customer.whtExempt && input.whtOn !== false}
                onChange={(v) => set('whtOn', v)}
              />
            ) : null}
            {showCharge ? (
              <Switch
                label="Apply the pre-liquidation charge"
                description={`Charge ${formatRate(settings.data?.values.preliqChargeRate ?? '0')} of the accrued interest for breaking the investment early.`}
                checked={input.preliqChargeOn !== false}
                onChange={(v) => set('preliqChargeOn', v)}
              />
            ) : null}
          </div>
        ) : null}
      </section>

      {hasErrors ? (
        <InlineAlert tone="danger" title="Fix before signing">
          <ul className="list-disc pl-4">
            {Object.entries(errors)
              .filter(([k]) => !fieldsFor(s).includes(k as Key))
              .map(([k, m]) => (
                <li key={k}>{m}</li>
              ))}
            {Object.keys(errors).every((k) => fieldsFor(s).includes(k as Key)) ? (
              <li>See the highlighted fields above.</li>
            ) : null}
          </ul>
        </InlineAlert>
      ) : null}

      {(s === 'ROLLOVER_C' && ro && fo) || (s === 'PRELIQ_PARTIAL' && ro && fo) ? (
        <SplitBar
          left={ro.rollAmt}
          right={fo.netAmt}
          leftLabel={s === 'ROLLOVER_C' ? 'Roll' : 'Rebook'}
          rightLabel="Pay"
        />
      ) : null}

      <section>
        {vouchers.length > 1 ? (
          <Tabs
            label="Vouchers"
            value={tab}
            onChange={setTab}
            tabs={vouchers.map((v, i) => ({
              key: String(i),
              label: VOUCHER_TYPE_META[v.voucherType].label,
            }))}
          />
        ) : null}
        <div className={vouchers.length > 1 ? 'pt-4' : ''}>
          {comp.loading && !comp.data ? (
            <SkeletonRows rows={8} />
          ) : current ? (
            <VoucherView v={current} showTitle={vouchers.length === 1} />
          ) : null}
        </div>
      </section>

      <div className="flex flex-col-reverse gap-2 border-t border-border pt-4 sm:flex-row sm:flex-wrap sm:justify-between">
        <Button icon={ArrowLeft} onClick={() => goTo(5)}>
          Back
        </Button>
        <div className="flex flex-col-reverse gap-2 sm:flex-row">
          <Button
            icon={Save}
            loading={busy === 'save'}
            onClick={() => {
              setBusy('save');
              save()
                .catch(toastError)
                .finally(() => setBusy(null));
            }}
          >
            Save draft
          </Button>
          <Button
            icon={Eye}
            loading={busy === 'preview'}
            disabled={!current}
            onClick={() => preview(current?.seqNo ?? 1)}
          >
            Preview voucher
          </Button>
          <Button
            variant="primary"
            icon={PenLine}
            disabled={hasErrors || !vouchers.length || comp.loading}
            onClick={() => setSignOpen(true)}
          >
            Sign &amp; submit
          </Button>
        </div>
      </div>

      <SignatureModal
        open={signOpen}
        onClose={() => setSignOpen(false)}
        title={txn.status === 'RETURNED' ? 'Sign and resubmit' : 'Sign and submit'}
        description="Your signature is level 1 of 5. The transaction goes to Head, Treasury next."
        actionLabel="Sign & submit"
        summary={
          comp.data ? (
            <div className="rounded-md bg-surface-2 px-3 py-2 text-[13px]">
              {comp.data.summary.map((l) => (
                <p key={l.label} className="flex justify-between gap-3">
                  <span className="text-muted">{l.label}</span>
                  <span className="num font-medium">
                    {l.format === 'money' ? formatNaira(l.value) : l.value}
                  </span>
                </p>
              ))}
            </div>
          ) : null
        }
        onSign={async (sig) => {
          await save(true);
          const t = await transactionsService.signAndSubmit(txn.id, sig);
          toast.success(
            `${t.txnRef} submitted`,
            `Signed by ${me?.fullName}. Awaiting Head, Treasury.`
          );
          router.push(`/transactions/${t.id}`);
        }}
      />
    </div>
  );
}
