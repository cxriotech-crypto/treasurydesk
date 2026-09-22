'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { Pencil, Plus, Power, Trash2 } from 'lucide-react';
import type { Beneficiary, Signatory } from '@/domain/types';
import {
  ACCOUNT_PRODUCT_LABELS,
  CUSTOMER_TYPE_LABELS,
  MANDATE_RULE_LABELS,
  PRODUCT_LABELS,
  scenarioLabel,
  type MandateRule,
} from '@/domain/codes';
import { INTERNAL_BANK_CODE } from '@/domain/rules';
import { formatDate, formatDateTime, formatNaira, formatRate } from '@/lib/format';
import {
  AppError,
  banksService,
  beneficiariesService,
  callbacksService,
  customersService,
  investmentsService,
  transactionsService,
} from '@/services';
import { useCurrentUser, useData } from '@/services/useData';
import {
  Badge,
  Button,
  Card,
  CardBody,
  CardHeader,
  ConfirmDialog,
  DescriptionList,
  EmptyState,
  ErrorState,
  Field,
  IconButton,
  InlineAlert,
  Input,
  InvestmentStatusBadge,
  KpiGrid,
  KpiTile,
  Modal,
  Money,
  PageHeader,
  Select,
  SkeletonRows,
  TabPanel,
  Tabs,
  TxnStatusBadge,
  toast,
  toastError,
} from '@/components/ui';
import { SpecimenCard } from '@/components/txn/Specimen';
import { CallbackHistory } from '@/components/txn/CallbackForm';
import { CustomerForm } from '../CustomerForm';

type TabKey =
  | 'profile'
  | 'signatories'
  | 'accounts'
  | 'investments'
  | 'beneficiaries'
  | 'transactions'
  | 'callbacks';

function SignatoryForm({
  customerId,
  open,
  onClose,
  signatory,
}: {
  customerId: string;
  open: boolean;
  onClose: () => void;
  signatory?: Signatory | null;
}) {
  const [name, setName] = useState('');
  const [cls, setCls] = useState<'A' | 'B'>('A');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const editing = !!signatory;
  return (
    <Modal
      open={open}
      onClose={onClose}
      size="sm"
      title={editing ? 'Edit signatory' : 'Add signatory'}
      footer={
        <>
          <Button onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button
            variant="primary"
            loading={busy}
            onClick={async () => {
              setBusy(true);
              setErr(null);
              try {
                if (editing)
                  await customersService.updateSignatory(
                    signatory!.id,
                    { fullName: name || signatory!.fullName, signClass: cls },
                    signatory!.version
                  );
                else
                  await customersService.addSignatory(customerId, {
                    fullName: name,
                    signClass: cls,
                  });
                toast.success(
                  editing ? 'Signatory updated' : 'Signatory added',
                  editing ? undefined : 'A specimen signature was generated.'
                );
                onClose();
              } catch (e) {
                setErr(
                  e instanceof AppError
                    ? (Object.values(e.fieldErrors)[0] ?? e.message)
                    : (e as Error).message
                );
              } finally {
                setBusy(false);
              }
            }}
          >
            Save
          </Button>
        </>
      }
    >
      <div className="space-y-3">
        <Field label="Full name" required error={err}>
          <Input
            data-autofocus
            defaultValue={signatory?.fullName ?? ''}
            onChange={(e) => setName(e.target.value)}
          />
        </Field>
        <Field label="Signature class">
          <Select
            defaultValue={signatory?.signClass ?? 'A'}
            onChange={(e) => setCls(e.target.value as 'A' | 'B')}
            options={[
              { value: 'A', label: 'Class A' },
              { value: 'B', label: 'Class B' },
            ]}
          />
        </Field>
      </div>
    </Modal>
  );
}

function BeneficiaryForm({
  customerId,
  open,
  onClose,
  beneficiary,
}: {
  customerId: string;
  open: boolean;
  onClose: () => void;
  beneficiary?: Beneficiary | null;
}) {
  const banks = useData(() => banksService.list({ filters: { active: true } }), []);
  const editing = !!beneficiary;
  const [f, setF] = useState({
    benefName: '',
    bank: '',
    accountNo: '',
    accountType: 'SAVINGS' as 'SAVINGS' | 'CURRENT',
  });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) return;
    setErrors({});
    setF({
      benefName: beneficiary?.benefName ?? '',
      bank: beneficiary ? (beneficiary.isInternal ? 'INTERNAL' : beneficiary.bankCode) : '',
      accountNo: beneficiary?.accountNo ?? '',
      accountType: beneficiary?.accountType ?? 'SAVINGS',
    });
  }, [open, beneficiary]);

  const save = async () => {
    setBusy(true);
    setErrors({});
    try {
      const isInternal = f.bank === 'INTERNAL';
      const input = {
        customerId,
        benefName: f.benefName,
        bankCode: isInternal ? INTERNAL_BANK_CODE : f.bank,
        accountNo: f.accountNo,
        accountType: f.accountType,
        isInternal,
      };
      if (editing) await beneficiariesService.update(beneficiary!.id, input, beneficiary!.version);
      else await beneficiariesService.create(input);
      toast.success(editing ? 'Beneficiary updated' : 'Beneficiary saved');
      onClose();
    } catch (e) {
      setErrors(
        e instanceof AppError && Object.keys(e.fieldErrors).length
          ? e.fieldErrors
          : { form: (e as Error).message }
      );
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      size="sm"
      title={editing ? 'Edit beneficiary' : 'Save beneficiary'}
      footer={
        <>
          <Button onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button variant="primary" loading={busy} onClick={save}>
            Save
          </Button>
        </>
      }
    >
      <div className="space-y-3">
        <Field label="Beneficiary name" required error={errors.benefName}>
          <Input
            data-autofocus
            value={f.benefName}
            onChange={(e) => setF({ ...f, benefName: e.target.value })}
          />
        </Field>
        <Field label="Bank" required error={errors.bankCode || errors.accountNo}>
          <Select
            value={f.bank}
            placeholder="Choose bank…"
            onChange={(e) => setF({ ...f, bank: e.target.value })}
            options={[
              { value: 'INTERNAL', label: 'First Marina Trust (internal)' },
              ...(banks.data?.items ?? []).map((b) => ({ value: b.bankCode, label: b.bankName })),
            ]}
          />
        </Field>
        <Field label="Account number" required error={errors.accountNo} hint="10-digit NUBAN">
          <Input
            inputMode="numeric"
            maxLength={10}
            value={f.accountNo}
            onChange={(e) => setF({ ...f, accountNo: e.target.value.replace(/\D/g, '') })}
          />
        </Field>
        <Field label="Account type" required error={errors.accountType}>
          <Select
            value={f.accountType}
            onChange={(e) => setF({ ...f, accountType: e.target.value as 'SAVINGS' | 'CURRENT' })}
            options={[
              { value: 'SAVINGS', label: 'Savings' },
              { value: 'CURRENT', label: 'Current' },
            ]}
          />
        </Field>
        {errors.form ? <InlineAlert tone="danger">{errors.form}</InlineAlert> : null}
      </div>
    </Modal>
  );
}

export default function CustomerDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const me = useCurrentUser();
  const [tab, setTab] = useState<TabKey>('profile');
  const [editing, setEditing] = useState(false);
  const [sigOpen, setSigOpen] = useState<null | Signatory | 'new'>(null);
  const [benOpen, setBenOpen] = useState<null | Beneficiary | 'new'>(null);
  const [removeSig, setRemoveSig] = useState<Signatory | null>(null);
  const [removeBen, setRemoveBen] = useState<Beneficiary | null>(null);
  const [deactivate, setDeactivate] = useState(false);

  const q = useData(() => customersService.get(id), [id]);
  const invs = useData(
    () => investmentsService.list({ filters: { customerId: id }, pageSize: 100 }),
    [id]
  );
  const txns = useData(
    () => transactionsService.list({ filters: { customerId: id }, pageSize: 50 }),
    [id]
  );
  const calls = useData(
    () => callbacksService.list({ filters: { customerId: id }, pageSize: 50 }),
    [id]
  );
  const bens = useData(() => beneficiariesService.list({ filters: { customerId: id } }), [id]);

  if (q.error && !q.data) return <ErrorState error={q.error} onRetry={q.reload} />;
  if (!q.data) return <SkeletonRows rows={10} />;
  const d = q.data;
  const c = d.customer;
  const canEdit = me?.roleCode === 'TO' || me?.roleCode === 'ADM';
  const canEditBen = me?.roleCode === 'TO';

  const tabs: { key: TabKey; label: string; count?: number }[] = [
    { key: 'profile', label: 'Profile' },
    { key: 'signatories', label: 'Signatories & mandate', count: d.signatories.length },
    { key: 'accounts', label: 'Accounts', count: d.accounts.length },
    { key: 'investments', label: 'Investments', count: invs.data?.total },
    { key: 'beneficiaries', label: 'Beneficiaries', count: bens.data?.total },
    { key: 'transactions', label: 'Transactions', count: txns.data?.total },
    { key: 'callbacks', label: 'Call-backs', count: calls.data?.total },
  ];

  return (
    <>
      <PageHeader
        title={c.customerName}
        description={`${c.cifNo} · ${CUSTOMER_TYPE_LABELS[c.customerType]}`}
        crumbs={[{ label: 'Customers', href: '/customers' }, { label: c.customerName }]}
        meta={
          <>
            <Badge tone={c.status === 'ACTIVE' ? 'success' : 'neutral'}>
              {c.status === 'ACTIVE' ? 'Active' : 'Inactive'}
            </Badge>
            {c.whtExempt ? <Badge tone="info">WHT exempt</Badge> : null}
            <span className="num text-sm text-muted">{c.regPhone}</span>
          </>
        }
        actions={
          canEdit ? (
            <>
              <Button icon={Pencil} onClick={() => setEditing(true)}>
                Edit
              </Button>
              <Button
                icon={Power}
                variant={c.status === 'ACTIVE' ? 'ghost' : 'secondary'}
                onClick={() => setDeactivate(true)}
              >
                {c.status === 'ACTIVE' ? 'Deactivate' : 'Reactivate'}
              </Button>
            </>
          ) : null
        }
      />

      <KpiGrid>
        <KpiTile label="Assets under management" value={d.aum} kind="money" />
        <KpiTile
          label="Active investments"
          value={
            invs.data?.items.filter((i) => i.status === 'ACTIVE' || i.status === 'MATURED').length
          }
        />
        <KpiTile
          label="Account balances"
          value={d.accounts.reduce((s, a) => s + Number(a.availableBal), 0).toFixed(2)}
          kind="money"
        />
        <KpiTile
          label="Transactions"
          value={txns.data?.total}
          href={`/transactions?customer=${c.id}`}
        />
      </KpiGrid>

      <div className="mt-5">
        <Tabs label="Customer sections" value={tab} onChange={setTab} tabs={tabs} />
      </div>
      <TabPanel id={tab}>
        {tab === 'profile' ? (
          <Card>
            <CardBody>
              <DescriptionList
                items={[
                  { label: 'Customer name', value: c.customerName },
                  { label: 'CIF', value: c.cifNo },
                  { label: 'Type', value: CUSTOMER_TYPE_LABELS[c.customerType] },
                  { label: 'Registered phone', value: c.regPhone },
                  { label: 'Email', value: c.email },
                  { label: 'Address', value: c.address },
                  { label: 'BVN', value: c.bvnMasked },
                  { label: 'WHT', value: c.whtExempt ? 'Exempt' : 'Deducted at the standard rate' },
                  { label: 'Account Officer', value: d.officer?.fullName ?? '—' },
                  { label: 'Customer since', value: formatDate(c.createdAt) },
                ]}
              />
            </CardBody>
          </Card>
        ) : null}

        {tab === 'signatories' ? (
          <div className="space-y-5">
            <Card>
              <CardHeader
                title="Mandate"
                description={d.mandate ? MANDATE_RULE_LABELS[d.mandate.ruleCode] : 'Not set'}
                actions={
                  canEdit ? (
                    <div className="w-64">
                      <Select
                        aria-label="Mandate rule"
                        value={d.mandate?.ruleCode ?? ''}
                        onChange={async (e) => {
                          try {
                            await customersService.setMandate(c.id, e.target.value as MandateRule);
                            toast.success('Mandate updated');
                          } catch (err) {
                            toastError(err);
                          }
                        }}
                        options={(Object.keys(MANDATE_RULE_LABELS) as MandateRule[]).map((r) => ({
                          value: r,
                          label: r.replace(/_/g, ' '),
                        }))}
                      />
                    </div>
                  ) : null
                }
              />
            </Card>
            <Card>
              <CardHeader
                title="Signatories"
                actions={
                  canEdit ? (
                    <Button size="sm" icon={Plus} onClick={() => setSigOpen('new')}>
                      Add signatory
                    </Button>
                  ) : null
                }
              />
              <CardBody className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {d.signatories.map((s) => (
                  <div key={s.id} className="space-y-2">
                    <SpecimenCard s={s} />
                    {canEdit ? (
                      <div className="flex justify-end gap-1">
                        <IconButton
                          icon={Pencil}
                          label={`Edit ${s.fullName}`}
                          onClick={() => setSigOpen(s)}
                        />
                        <IconButton
                          icon={Trash2}
                          label={`Remove ${s.fullName}`}
                          onClick={() => setRemoveSig(s)}
                        />
                      </div>
                    ) : null}
                  </div>
                ))}
              </CardBody>
            </Card>
          </div>
        ) : null}

        {tab === 'accounts' ? (
          <Card>
            <ul className="divide-y divide-border">
              {d.accounts.map((a) => (
                <li
                  key={a.id}
                  className="flex flex-wrap items-center justify-between gap-2 px-4 py-3"
                >
                  <span>
                    <span className="num block text-sm font-medium">{a.accountNo}</span>
                    <span className="block text-xs text-muted">
                      {ACCOUNT_PRODUCT_LABELS[a.productCode]} · opened {formatDate(a.openedDate)}
                    </span>
                  </span>
                  <span className="flex items-center gap-3">
                    <Badge tone={a.status === 'ACTIVE' ? 'success' : 'neutral'}>
                      {a.status === 'ACTIVE' ? 'Active' : 'Inactive'}
                    </Badge>
                    <span className="text-right">
                      <Money value={a.availableBal} className="block text-sm font-medium" />
                      <span className="block text-xs text-muted">
                        Ledger {formatNaira(a.ledgerBal)}
                      </span>
                    </span>
                  </span>
                </li>
              ))}
            </ul>
          </Card>
        ) : null}

        {tab === 'investments' ? (
          <Card>
            {invs.data?.items.length ? (
              <ul className="divide-y divide-border">
                {invs.data.items.map((i) => (
                  <li key={i.id}>
                    <Link
                      href={`/investments/${i.id}`}
                      className="flex flex-wrap items-center justify-between gap-2 px-4 py-2.5 hover:bg-surface-2"
                    >
                      <span className="min-w-0">
                        <span className="block text-sm font-medium">{i.investmentRef}</span>
                        <span className="block truncate text-xs text-muted">
                          {PRODUCT_LABELS[i.productCode]} · {formatRate(i.intRate)} · matures{' '}
                          {formatDate(i.maturityDate)}
                        </span>
                      </span>
                      <span className="flex shrink-0 items-center gap-2">
                        <InvestmentStatusBadge status={i.status} />
                        <Money value={i.principalAmt} compact className="text-[13px] font-medium" />
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            ) : (
              <EmptyState title="No investments" />
            )}
          </Card>
        ) : null}

        {tab === 'beneficiaries' ? (
          <Card>
            <CardHeader
              title="Saved beneficiaries"
              actions={
                canEditBen ? (
                  <Button size="sm" icon={Plus} onClick={() => setBenOpen('new')}>
                    Add beneficiary
                  </Button>
                ) : null
              }
            />
            {bens.data?.items.length ? (
              <ul className="divide-y divide-border">
                {bens.data.items.map((b) => (
                  <li
                    key={b.id}
                    className="flex flex-wrap items-center justify-between gap-2 px-4 py-2.5"
                  >
                    <span className="min-w-0">
                      <span className="block text-sm font-medium">{b.benefName}</span>
                      <span className="num block truncate text-xs text-muted">
                        {b.bankName} · {b.accountNo} ·{' '}
                        {b.accountType === 'CURRENT' ? 'Current' : 'Savings'}
                      </span>
                    </span>
                    {canEditBen ? (
                      <span className="flex shrink-0">
                        <IconButton
                          icon={Pencil}
                          label={`Edit ${b.benefName}`}
                          onClick={() => setBenOpen(b)}
                        />
                        <IconButton
                          icon={Trash2}
                          label={`Delete ${b.benefName}`}
                          onClick={() => setRemoveBen(b)}
                        />
                      </span>
                    ) : null}
                  </li>
                ))}
              </ul>
            ) : (
              <EmptyState
                title="No saved beneficiaries"
                description="Beneficiaries saved here can be picked in the wizard."
              />
            )}
          </Card>
        ) : null}

        {tab === 'transactions' ? (
          <Card>
            {txns.data?.items.length ? (
              <ul className="divide-y divide-border">
                {txns.data.items.map((t) => (
                  <li key={t.id}>
                    <Link
                      href={`/transactions/${t.id}`}
                      className="flex flex-wrap items-center justify-between gap-2 px-4 py-2.5 hover:bg-surface-2"
                    >
                      <span className="min-w-0">
                        <span className="block text-sm font-medium">{t.txnRef}</span>
                        <span className="block truncate text-xs text-muted">
                          {scenarioLabel(t.scenarioCode)} · {formatDateTime(t.createdAt)}
                        </span>
                      </span>
                      <span className="flex shrink-0 items-center gap-2">
                        <TxnStatusBadge status={t.status} />
                        <Money value={t.headlineAmt} compact className="text-[13px]" />
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            ) : (
              <EmptyState title="No transactions" />
            )}
          </Card>
        ) : null}

        {tab === 'callbacks' ? (
          <Card>
            <CardBody>
              <CallbackHistory
                logs={(calls.data?.items ?? []).map((l) => ({ ...l, officerName: l.officerName }))}
              />
            </CardBody>
          </Card>
        ) : null}
      </TabPanel>

      <CustomerForm open={editing} onClose={() => setEditing(false)} customer={c} />
      <SignatoryForm
        customerId={c.id}
        open={!!sigOpen}
        onClose={() => setSigOpen(null)}
        signatory={sigOpen === 'new' ? null : sigOpen}
      />
      <BeneficiaryForm
        customerId={c.id}
        open={!!benOpen}
        onClose={() => setBenOpen(null)}
        beneficiary={benOpen === 'new' ? null : benOpen}
      />
      <ConfirmDialog
        open={!!removeSig}
        onClose={() => setRemoveSig(null)}
        title={`Remove ${removeSig?.fullName}?`}
        description="At least one active signatory must remain and the mandate must still be satisfiable."
        confirmLabel="Remove signatory"
        tone="danger"
        onConfirm={async () => {
          await customersService.removeSignatory(removeSig!.id, removeSig!.version);
          toast.success('Signatory removed');
        }}
      />
      <ConfirmDialog
        open={!!removeBen}
        onClose={() => setRemoveBen(null)}
        title={`Delete ${removeBen?.benefName}?`}
        confirmLabel="Delete beneficiary"
        tone="danger"
        onConfirm={async () => {
          await beneficiariesService.remove(removeBen!.id, removeBen!.version);
          toast.success('Beneficiary deleted');
        }}
      />
      <ConfirmDialog
        open={deactivate}
        onClose={() => setDeactivate(false)}
        title={
          c.status === 'ACTIVE' ? `Deactivate ${c.customerName}?` : `Reactivate ${c.customerName}?`
        }
        description={
          c.status === 'ACTIVE'
            ? 'Blocked while the customer has active investments or transactions in progress.'
            : undefined
        }
        confirmLabel={c.status === 'ACTIVE' ? 'Deactivate' : 'Reactivate'}
        tone={c.status === 'ACTIVE' ? 'danger' : 'primary'}
        onConfirm={async () => {
          await customersService.setStatus(
            c.id,
            c.status === 'ACTIVE' ? 'INACTIVE' : 'ACTIVE',
            c.version
          );
          toast.success(c.status === 'ACTIVE' ? 'Customer deactivated' : 'Customer reactivated');
          router.refresh();
        }}
      />
    </>
  );
}
