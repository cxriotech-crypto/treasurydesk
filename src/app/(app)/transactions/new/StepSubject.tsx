'use client';

import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { ArrowRight } from 'lucide-react';
import type { TreasuryTxn } from '@/domain/types';
import {
  SCENARIO_META,
  TXN_TYPES,
  TXN_TYPE_META,
  VOUCHER_TYPE_META,
  scenariosForType,
  type ScenarioCode,
  type TxnType,
} from '@/domain/codes';
import { formatDate, formatNaira, formatRate } from '@/lib/format';
import {
  AppError,
  accountsService,
  customersService,
  investmentsService,
  transactionsService,
} from '@/services';
import { useData } from '@/services/useData';
import type { TxnDetail } from '@/services/transactionsService';
import {
  Badge,
  Button,
  Combobox,
  EmptyState,
  Field,
  InlineAlert,
  SkeletonRows,
  cn,
  toast,
} from '@/components/ui';

interface Choice {
  id: string;
  title: string;
  sub: string;
  amount: string;
  disabledReason: string | null;
}

function OptionCard({
  selected,
  disabled,
  onClick,
  children,
}: {
  selected: boolean;
  disabled?: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={selected}
      disabled={disabled}
      onClick={onClick}
      className={cn(
        'w-full rounded-md border px-3 py-2.5 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
        selected
          ? 'border-brand bg-brand-soft'
          : 'border-border hover:border-border-strong hover:bg-surface-2',
        disabled && 'cursor-not-allowed opacity-60 hover:bg-transparent'
      )}
    >
      {children}
    </button>
  );
}

export function StepSubject({
  detail,
  onCreated,
  goTo,
}: {
  detail: TxnDetail | null;
  onCreated: (t: TreasuryTxn) => void;
  goTo: (n: number) => void;
}) {
  const params = useSearchParams();
  const t = detail?.txn;
  const locked = !!t && t.status !== 'DRAFT';

  const [txnType, setTxnType] = useState<TxnType | ''>(
    t?.txnType ?? ((params.get('type') as TxnType) || '')
  );
  const [scenario, setScenario] = useState<ScenarioCode | ''>(
    t?.scenarioCode ?? ((params.get('scenario') as ScenarioCode) || '')
  );
  const [customerId, setCustomerId] = useState(t?.customerId ?? params.get('customerId') ?? '');
  const [subjectId, setSubjectId] = useState(
    t
      ? (t.reversalOfTxnId ??
          (t.investmentId && t.scenarioCode !== 'TRANSFER_REVERSAL'
            ? t.investmentId
            : t.sourceAccountId) ??
          '')
      : (params.get('investmentId') ?? params.get('accountId') ?? params.get('txnId') ?? '')
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Pre-fill the customer from an investment or account passed in the URL.
  useEffect(() => {
    if (customerId) return;
    const inv = params.get('investmentId');
    const acc = params.get('accountId');
    if (inv)
      investmentsService.get(inv).then(
        (x) => setCustomerId(x.customer.id),
        () => undefined
      );
    else if (acc)
      accountsService.get(acc).then(
        (x) => setCustomerId(x.customerId),
        () => undefined
      );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const customers = useData(
    () => customersService.list({ filters: { status: 'ACTIVE' }, pageSize: 1000 }),
    []
  );
  const meta = scenario ? SCENARIO_META[scenario] : null;

  const subjects = useData<Choice[] | null>(async () => {
    if (!scenario || !customerId) return null;
    const m = SCENARIO_META[scenario];
    if (m.subject === 'INVESTMENT') {
      const rows = await investmentsService.forScenario(scenario, customerId, t?.id);
      return rows.map((r) => ({
        id: r.id,
        title: r.investmentRef,
        sub: `${r.productCode} · ${formatRate(r.intRate)} · ${r.tenorDays} days · matures ${formatDate(r.maturityDate)}`,
        amount: r.principalAmt,
        disabledReason: r.disabledReason,
      }));
    }
    if (m.subject === 'ACCOUNT') {
      const rows = await accountsService.forScenario(scenario, customerId);
      return rows.map((r) => ({
        id: r.id,
        title: `${r.accountNo} · ${r.productCode === 'PA' ? 'Personal Account' : 'Savings'}`,
        sub: `Available ${formatNaira(r.availableBal)}`,
        amount: r.availableBal,
        disabledReason: r.disabledReason,
      }));
    }
    if (m.subject === 'TXN') {
      const rows = await transactionsService.reversible(customerId, t?.id);
      return rows.map((r) => ({
        id: r.id,
        title: `${r.txnRef} → ${r.investmentRef}`,
        sub: `${formatRate(r.intRate)} · ${r.tenorDays} days · completed ${formatDate(r.completedAt)}`,
        amount: r.principalAmt,
        disabledReason: r.disabledReason,
      }));
    }
    return [];
  }, [scenario, customerId]);

  // Drop a subject that no longer fits the chosen scenario / customer.
  useEffect(() => {
    if (!subjects.data || locked) return;
    if (subjectId && !subjects.data.some((s) => s.id === subjectId && !s.disabledReason))
      setSubjectId('');
  }, [subjects.data, subjectId, locked]);

  const customerOptions = useMemo(
    () =>
      (customers.data?.items ?? []).map((c) => ({
        value: c.id,
        label: c.customerName,
        sublabel: `${c.cifNo} · ${c.customerType === 'IND' ? 'Individual' : 'Corporate'}`,
        keywords: `${c.cifNo} ${c.regPhone}`,
      })),
    [customers.data]
  );

  const needsSubject = meta && meta.subject !== 'CUSTOMER';
  const ready = !!scenario && !!customerId && (!needsSubject || !!subjectId);

  const submit = async () => {
    if (!scenario || !meta) return;
    if (locked) {
      goTo(2);
      return;
    }
    setBusy(true);
    setError(null);
    const subject = {
      scenarioCode: scenario,
      customerId,
      investmentId: meta.subject === 'INVESTMENT' ? subjectId : undefined,
      sourceAccountId: meta.subject === 'ACCOUNT' ? subjectId : undefined,
      reversalOfTxnId: meta.subject === 'TXN' ? subjectId : undefined,
    };
    try {
      if (t) {
        await transactionsService.saveDraft(t.id, { subject, wizardStep: 2 });
      } else {
        const created = await transactionsService.create(subject);
        toast.success(`Draft ${created.txnRef} created`, 'Saved automatically as you go.');
        onCreated(created);
      }
      goTo(2);
    } catch (e) {
      setError(
        e instanceof AppError
          ? (Object.values(e.fieldErrors)[0] ?? e.message)
          : (e as Error).message
      );
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-6">
      {locked ? (
        <InlineAlert tone="info">
          The type, customer and subject are fixed once the instruction is recorded.
        </InlineAlert>
      ) : null}

      <fieldset disabled={locked}>
        <legend className="mb-2 text-[13px] font-medium text-muted">Transaction type</legend>
        <div
          role="radiogroup"
          aria-label="Transaction type"
          className="grid grid-cols-1 gap-2 sm:grid-cols-2 xl:grid-cols-4"
        >
          {TXN_TYPES.map((tt) => (
            <OptionCard
              key={tt}
              selected={txnType === tt}
              disabled={locked}
              onClick={() => {
                setTxnType(tt);
                const only = scenariosForType(tt);
                setScenario(only.length === 1 ? only[0] : '');
              }}
            >
              <span className="block text-sm font-medium">
                <span className="num text-muted">SOP {TXN_TYPE_META[tt].sop}</span> ·{' '}
                {TXN_TYPE_META[tt].label}
              </span>
              <span className="block text-xs text-muted">{TXN_TYPE_META[tt].description}</span>
            </OptionCard>
          ))}
        </div>
      </fieldset>

      {txnType ? (
        <fieldset disabled={locked}>
          <legend className="mb-2 text-[13px] font-medium text-muted">Scenario</legend>
          <div
            role="radiogroup"
            aria-label="Scenario"
            className="grid grid-cols-1 gap-2 sm:grid-cols-2"
          >
            {scenariosForType(txnType).map((s) => {
              const m = SCENARIO_META[s];
              return (
                <OptionCard
                  key={s}
                  selected={scenario === s}
                  disabled={locked}
                  onClick={() => setScenario(s)}
                >
                  <span className="block text-sm font-medium">
                    {m.letter ? `${m.letter}. ` : ''}
                    {m.label}
                  </span>
                  <span className="block text-xs text-muted">{m.description}</span>
                  <span className="mt-1.5 flex flex-wrap gap-1">
                    {m.vouchers.map((v) => (
                      <Badge key={v}>{VOUCHER_TYPE_META[v].label}</Badge>
                    ))}
                  </span>
                </OptionCard>
              );
            })}
          </div>
        </fieldset>
      ) : null}

      {scenario ? (
        <Field label="Customer" required hint="Search by name, CIF or phone">
          <Combobox
            options={customerOptions}
            value={customerId}
            onChange={(v) => {
              setCustomerId(v);
              setSubjectId('');
            }}
            placeholder={customers.loading ? 'Loading customers…' : 'Search customers'}
            disabled={locked}
          />
        </Field>
      ) : null}

      {needsSubject && customerId ? (
        <div>
          <p className="mb-2 text-[13px] font-medium text-muted">
            {meta!.subject === 'INVESTMENT'
              ? 'Investment'
              : meta!.subject === 'ACCOUNT'
                ? 'Source account'
                : 'Completed booking to correct'}
            <span className="ml-0.5 text-st-danger-fg">*</span>
          </p>
          {subjects.loading && !subjects.data ? (
            <SkeletonRows rows={3} />
          ) : !subjects.data?.length ? (
            <div className="rounded-md border border-dashed border-border-strong">
              <EmptyState
                title="Nothing available for this customer"
                description={
                  meta!.subject === 'TXN'
                    ? 'This customer has no completed booking that created an investment.'
                    : 'Choose another customer or scenario.'
                }
              />
            </div>
          ) : (
            <div role="radiogroup" aria-label="Subject" className="space-y-2">
              {subjects.data.map((s) => (
                <OptionCard
                  key={s.id}
                  selected={subjectId === s.id}
                  disabled={locked || !!s.disabledReason}
                  onClick={() => setSubjectId(s.id)}
                >
                  <span className="flex flex-wrap items-start justify-between gap-2">
                    <span className="min-w-0">
                      <span className="block text-sm font-medium">{s.title}</span>
                      <span className="block text-xs text-muted">{s.sub}</span>
                      {s.disabledReason ? (
                        <span className="block text-xs text-st-warning-fg">{s.disabledReason}</span>
                      ) : null}
                    </span>
                    <span className="num shrink-0 text-sm font-medium">
                      {formatNaira(s.amount)}
                    </span>
                  </span>
                </OptionCard>
              ))}
            </div>
          )}
        </div>
      ) : null}

      {error ? <InlineAlert tone="danger">{error}</InlineAlert> : null}

      <div className="flex justify-end border-t border-border pt-4">
        <Button
          variant="primary"
          iconRight={ArrowRight}
          disabled={!ready}
          loading={busy}
          onClick={submit}
        >
          {t ? 'Continue' : 'Create draft and continue'}
        </Button>
      </div>
    </div>
  );
}
