'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Pencil, Play, Plus, RotateCw, Save, Trash2 } from 'lucide-react';
import type { Bank, IntegrationConfig, PublicHoliday, Settings } from '@/domain/types';
import { APPROVAL_LEVELS, ROLE_LABELS, ROLE_CODES, type RoleCode } from '@/domain/codes';
import { DEMO_OTP, DEMO_PIN } from '@/domain/rules';
import { DEFAULT_SETTINGS, calcMaturity, calcThirdParty } from '@/lib/calc';
import { addDays, todayLagos, yearOf } from '@/lib/dates';
import { formatDate, formatDateTime, formatNaira } from '@/lib/format';
import {
  AppError,
  PERMISSIONS,
  SETTING_META,
  banksService,
  holidaysService,
  settingsService,
  usersService,
} from '@/services';
import { useCurrentUser, useData } from '@/services/useData';
import {
  Badge,
  Button,
  Card,
  CardBody,
  CardHeader,
  ConfirmDialog,
  DateInput,
  Field,
  IconButton,
  InlineAlert,
  Input,
  LinkButton,
  Modal,
  PageHeader,
  Select,
  SkeletonRows,
  Switch,
  TabPanel,
  Tabs,
  Textarea,
  TimeInput,
  toast,
  toastError,
} from '@/components/ui';

type TabKey = 'rates' | 'sla' | 'chain' | 'holidays' | 'banks' | 'users' | 'integrations' | 'demo';

function RatesTab({ readOnly }: { readOnly: boolean }) {
  const q = useData(() => settingsService.get(), []);
  const [v, setV] = useState<Settings | null>(null);
  const [reason, setReason] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (q.data) setV(q.data.values);
  }, [q.data]);
  if (!q.data || !v) return <SkeletonRows rows={8} />;

  const dirty = JSON.stringify(v) !== JSON.stringify(q.data.values);
  const env = { settings: v, holidays: [] };
  const example = calcMaturity(
    {
      principalAmt: '10000000.00',
      intRate: '15',
      effectiveDate: addDays(todayLagos(), -365),
      tenorDays: 365,
      maturityDate: todayLagos(),
      intPaidToDate: '0.00',
    },
    false,
    env
  );
  const feeExample = calcThirdParty('5000000', false, v);

  const save = async () => {
    setBusy(true);
    setErrors({});
    try {
      const r = await settingsService.update(v, reason, q.data!.version);
      toast.success(
        'Settings saved',
        `${r.draftsRecalculated} open draft${r.draftsRecalculated === 1 ? '' : 's'} recalculated.`
      );
      setReason('');
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

  const num = (k: keyof Settings, max?: string) => (
    <Field key={k} label={SETTING_META[k].label} hint={SETTING_META[k].hint} error={errors[k]}>
      <Input
        inputMode="decimal"
        disabled={readOnly}
        value={String(v[k])}
        onChange={(e) => setV({ ...v, [k]: e.target.value.replace(/[^\d.]/g, '') } as Settings)}
        suffix={max}
        className="num text-right"
      />
    </Field>
  );

  const choice = <K extends keyof Settings>(k: K, options: { value: string; label: string }[]) => (
    <Field
      key={k}
      label={SETTING_META[k].label}
      hint={SETTING_META[k].hint}
      error={errors[k as string]}
    >
      <Select
        disabled={readOnly}
        value={String(v[k])}
        onChange={(e) =>
          setV({
            ...v,
            [k]: (k === 'dayCount' ? Number(e.target.value) : e.target.value) as Settings[K],
          })
        }
        options={options}
      />
    </Field>
  );

  return (
    <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">
      <div className="space-y-5 lg:col-span-2">
        <Card>
          <CardHeader
            title="Rates"
            description="Applied to every calculation, including open drafts."
          />
          <CardBody className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            {num('whtRate', '%')}
            {num('preliqChargeRate', '%')}
            {num('transferFeeRate', '%')}
            {choice('dayCount', [
              { value: '365', label: '365 days' },
              { value: '360', label: '360 days' },
            ])}
          </CardBody>
        </Card>
        <Card>
          <CardHeader title="Policies" description="How the SOP options are applied." />
          <CardBody className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            {choice('whtBasisPreliq', [
              { value: 'AFTER_CHARGE', label: 'After the charge' },
              { value: 'GROSS', label: 'On gross accrued interest' },
            ])}
            {choice('partialPreliqInterest', [
              { value: 'NOT_PAID', label: 'Not paid (SOP example)' },
              { value: 'PAID_OUT', label: 'Paid out with the request' },
              { value: 'CAPITALISED', label: 'Capitalised into the rebooking' },
            ])}
            {choice('tpFeeMode', [
              { value: 'DEDUCT', label: 'Deducted from the payment' },
              { value: 'ON_TOP', label: 'Debited on top' },
            ])}
            {choice('rolloverCInterest', [
              { value: 'PAY_OUT', label: 'Paid out' },
              { value: 'ROLL', label: 'Rolled over' },
            ])}
            {choice('rolloverABasis', [
              { value: 'NET', label: 'Net of WHT' },
              { value: 'GROSS', label: 'Gross' },
            ])}
            {choice('maturityHolidayRule', [
              { value: 'NEXT_BUSINESS_DAY', label: 'Move to next business day' },
              { value: 'NONE', label: 'Keep the date' },
            ])}
            <Switch
              checked={v.whtOnAnniversary}
              disabled={readOnly}
              onChange={(x) => setV({ ...v, whtOnAnniversary: x })}
              label={SETTING_META.whtOnAnniversary.label}
              description={SETTING_META.whtOnAnniversary.hint}
            />
          </CardBody>
        </Card>
        {!readOnly ? (
          <Card>
            <CardBody className="space-y-3">
              <Field
                label="Reason for the change"
                required
                error={errors.reason}
                hint="Recorded in the audit trail"
              >
                <Textarea
                  rows={2}
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  placeholder="e.g. CBN circular on WHT"
                />
              </Field>
              {errors.form ? <InlineAlert tone="danger">{errors.form}</InlineAlert> : null}
              <div className="flex flex-wrap justify-end gap-2">
                <Button onClick={() => setV(q.data!.values)} disabled={!dirty || busy}>
                  Discard changes
                </Button>
                <Button
                  onClick={() =>
                    setV({
                      ...DEFAULT_SETTINGS,
                      demoLatencyMs: v.demoLatencyMs,
                      gapsFailureRate: v.gapsFailureRate,
                    })
                  }
                  disabled={busy}
                >
                  Reset to defaults
                </Button>
                <Button
                  variant="primary"
                  icon={Save}
                  loading={busy}
                  disabled={!dirty}
                  onClick={save}
                >
                  Save settings
                </Button>
              </div>
            </CardBody>
          </Card>
        ) : (
          <InlineAlert tone="info">
            Rates and policies are read-only for your role. A System Admin can change them.
          </InlineAlert>
        )}
      </div>

      <Card className="h-fit">
        <CardHeader title="Live example" description="₦10,000,000 at 15% for 365 days" />
        <CardBody>
          <dl className="space-y-2 text-[13px]">
            <div className="flex justify-between gap-3">
              <dt className="text-muted">Interest</dt>
              <dd className="num">{formatNaira(example.interest.value)}</dd>
            </div>
            <div className="flex justify-between gap-3">
              <dt className="text-muted">WHT at {v.whtRate}%</dt>
              <dd className="num">{formatNaira(example.wht.value)}</dd>
            </div>
            <div className="flex justify-between gap-3 border-t border-border pt-2 font-semibold">
              <dt>Net at maturity</dt>
              <dd className="num">{formatNaira(example.net.value)}</dd>
            </div>
            <div className="flex justify-between gap-3 border-t border-border pt-2">
              <dt className="text-muted">Transfer fee on ₦5,000,000</dt>
              <dd className="num">{formatNaira(feeExample.fee.value)}</dd>
            </div>
            <div className="flex justify-between gap-3">
              <dt className="text-muted">Beneficiary receives</dt>
              <dd className="num">{formatNaira(feeExample.toBeneficiary.value)}</dd>
            </div>
          </dl>
          <p className="mt-3 border-t border-border pt-3 text-xs text-muted">
            These defaults are assumptions pending the client&apos;s confirmation.
          </p>
        </CardBody>
      </Card>
    </div>
  );
}

function SlaTab({ readOnly }: { readOnly: boolean }) {
  const q = useData(() => settingsService.get(), []);
  const [hours, setHours] = useState('');
  const [cutoff, setCutoff] = useState('');
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (q.data) {
      setHours(String(q.data.values.slaHours));
      setCutoff(q.data.values.slaCutoff);
    }
  }, [q.data]);
  if (!q.data) return <SkeletonRows rows={5} />;
  const dirty = hours !== String(q.data.values.slaHours) || cutoff !== q.data.values.slaCutoff;

  return (
    <Card>
      <CardHeader
        title="Service level"
        description="Measured from when the instruction is received to completion."
      />
      <CardBody className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Field label={SETTING_META.slaHours.label} hint={SETTING_META.slaHours.hint}>
          <Input
            inputMode="numeric"
            disabled={readOnly}
            value={hours}
            onChange={(e) => setHours(e.target.value.replace(/\D/g, ''))}
            suffix="hours"
            className="num text-right"
          />
        </Field>
        <Field label={SETTING_META.slaCutoff.label} hint={SETTING_META.slaCutoff.hint}>
          <TimeInput
            disabled={readOnly}
            value={cutoff}
            onChange={(e) => setCutoff(e.target.value)}
          />
        </Field>
        <div className="sm:col-span-2">
          <InlineAlert tone="info">
            An instruction received at 09:00 is due by{' '}
            {String(9 + Number(hours || 0)).padStart(2, '0')}:00 the same day. One received after{' '}
            {cutoff} starts at 08:00 on the next business day.
          </InlineAlert>
        </div>
        {!readOnly ? (
          <>
            <Field label="Reason for the change" required className="sm:col-span-2">
              <Textarea rows={2} value={reason} onChange={(e) => setReason(e.target.value)} />
            </Field>
            <div className="flex justify-end sm:col-span-2">
              <Button
                variant="primary"
                icon={Save}
                loading={busy}
                disabled={!dirty}
                onClick={async () => {
                  setBusy(true);
                  try {
                    await settingsService.update(
                      { ...q.data!.values, slaHours: Number(hours), slaCutoff: cutoff },
                      reason,
                      q.data!.version
                    );
                    toast.success('SLA updated');
                    setReason('');
                  } catch (e) {
                    toastError(e);
                  } finally {
                    setBusy(false);
                  }
                }}
              >
                Save
              </Button>
            </div>
          </>
        ) : null}
      </CardBody>
    </Card>
  );
}

function ChainTab() {
  return (
    <div className="space-y-5">
      <Card>
        <CardHeader
          title="Approval chain"
          description="Fixed by the SOP; shown here for reference."
        />
        <CardBody>
          <ol className="space-y-2">
            {APPROVAL_LEVELS.map((l) => (
              <li
                key={l.levelNo}
                className="flex items-center gap-3 rounded-md border border-border px-3 py-2"
              >
                <span className="num flex h-7 w-7 items-center justify-center rounded-full bg-brand text-xs font-semibold text-brand-fg">
                  {l.levelNo}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-medium">{l.label}</span>
                  <span className="block text-xs text-muted">Control {l.control}</span>
                </span>
                <Badge>{l.roleCode}</Badge>
              </li>
            ))}
            <li className="flex items-center gap-3 rounded-md border border-border px-3 py-2">
              <span className="flex h-7 w-7 items-center justify-center rounded-full bg-surface-2 text-xs font-semibold text-muted">
                6
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-medium">
                  Operations execute, Treasury confirms
                </span>
                <span className="block text-xs text-muted">Controls C11 and C12</span>
              </span>
              <Badge>OPS / TO</Badge>
            </li>
          </ol>
        </CardBody>
      </Card>
      <Card>
        <CardHeader title="Rules" />
        <CardBody>
          <ul className="list-disc space-y-1 pl-5 text-sm">
            <li>The Treasury Officer who creates a transaction can never approve it.</li>
            <li>No user signs the same transaction twice in one cycle.</li>
            <li>
              Returning sends it back to the maker; resubmission restarts at Head, Treasury and
              keeps the earlier cycle in history.
            </li>
            <li>Rejected and stopped transactions are closed.</li>
          </ul>
        </CardBody>
      </Card>
    </div>
  );
}

function HolidaysTab({ readOnly }: { readOnly: boolean }) {
  const today = todayLagos();
  const [year, setYear] = useState(String(yearOf(today)));
  const [open, setOpen] = useState<PublicHoliday | 'new' | null>(null);
  const [remove, setRemove] = useState<PublicHoliday | null>(null);
  const [date, setDate] = useState('');
  const [desc, setDesc] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const q = useData(() => holidaysService.list({ filters: { year: Number(year) } }), [year]);

  useEffect(() => {
    if (!open) return;
    setErr(null);
    setDate(open === 'new' ? '' : open.holidayDate);
    setDesc(open === 'new' ? '' : open.description);
  }, [open]);

  return (
    <Card>
      <CardHeader
        title="Public holidays"
        description="Used for maturity dates and SLA business days."
        actions={
          <div className="flex items-center gap-2">
            <div className="w-28">
              <Select
                aria-label="Year"
                value={year}
                onChange={(e) => setYear(e.target.value)}
                options={[-1, 0, 1].map((d) => ({
                  value: String(yearOf(today) + d),
                  label: String(yearOf(today) + d),
                }))}
              />
            </div>
            {!readOnly ? (
              <Button size="sm" icon={Plus} onClick={() => setOpen('new')}>
                Add
              </Button>
            ) : null}
          </div>
        }
      />
      {q.data?.items.length ? (
        <ul className="divide-y divide-border">
          {q.data.items.map((h) => (
            <li key={h.id} className="flex items-center justify-between gap-2 px-4 py-2.5">
              <span>
                <span className="num block text-sm font-medium">{formatDate(h.holidayDate)}</span>
                <span className="block text-xs text-muted">{h.description}</span>
              </span>
              {!readOnly ? (
                <span className="flex">
                  <IconButton
                    icon={Pencil}
                    label={`Edit ${h.description}`}
                    onClick={() => setOpen(h)}
                  />
                  <IconButton
                    icon={Trash2}
                    label={`Remove ${h.description}`}
                    onClick={() => setRemove(h)}
                  />
                </span>
              ) : null}
            </li>
          ))}
        </ul>
      ) : (
        <CardBody>
          <p className="text-sm text-muted">No holidays recorded for {year}.</p>
        </CardBody>
      )}

      <Modal
        open={!!open}
        onClose={() => setOpen(null)}
        size="sm"
        title={open === 'new' ? 'Add public holiday' : 'Edit public holiday'}
        footer={
          <>
            <Button onClick={() => setOpen(null)} disabled={busy}>
              Cancel
            </Button>
            <Button
              variant="primary"
              loading={busy}
              onClick={async () => {
                setBusy(true);
                setErr(null);
                try {
                  if (open === 'new')
                    await holidaysService.create({ holidayDate: date, description: desc });
                  else
                    await holidaysService.update(
                      (open as PublicHoliday).id,
                      { holidayDate: date, description: desc },
                      (open as PublicHoliday).version
                    );
                  toast.success('Holiday saved');
                  setOpen(null);
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
          <Field label="Date" required error={err}>
            <DateInput data-autofocus value={date} onChange={(e) => setDate(e.target.value)} />
          </Field>
          <Field label="Description" required>
            <Input value={desc} onChange={(e) => setDesc(e.target.value)} />
          </Field>
        </div>
      </Modal>
      <ConfirmDialog
        open={!!remove}
        onClose={() => setRemove(null)}
        title={`Remove ${remove?.description}?`}
        description="Maturity dates and SLA calculations will no longer skip this day."
        confirmLabel="Remove holiday"
        tone="danger"
        onConfirm={async () => {
          await holidaysService.remove(remove!.id, remove!.version);
          toast.success('Holiday removed');
        }}
      />
    </Card>
  );
}

function BanksTab({ readOnly }: { readOnly: boolean }) {
  const [search, setSearch] = useState('');
  const [open, setOpen] = useState<Bank | 'new' | null>(null);
  const [f, setF] = useState({ bankCode: '', bankName: '', shortName: '' });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const q = useData(
    () => banksService.list({ filters: { search: search || undefined } }),
    [search]
  );

  useEffect(() => {
    if (!open) return;
    setErr(null);
    setF(
      open === 'new'
        ? { bankCode: '', bankName: '', shortName: '' }
        : { bankCode: open.bankCode, bankName: open.bankName, shortName: open.shortName }
    );
  }, [open]);

  return (
    <Card>
      <CardHeader
        title="Banks"
        description="CBN codes used for beneficiary payments."
        actions={
          <div className="flex items-center gap-2">
            <Input
              type="search"
              aria-label="Search banks"
              placeholder="Search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-40"
            />
            {!readOnly ? (
              <Button size="sm" icon={Plus} onClick={() => setOpen('new')}>
                Add
              </Button>
            ) : null}
          </div>
        }
      />
      <ul className="divide-y divide-border">
        {(q.data?.items ?? []).map((b) => (
          <li key={b.id} className="flex items-center justify-between gap-2 px-4 py-2.5">
            <span className="min-w-0">
              <span className="block truncate text-sm font-medium">{b.bankName}</span>
              <span className="num block text-xs text-muted">
                {b.bankCode} · {b.shortName}
              </span>
            </span>
            <span className="flex items-center gap-2">
              <Badge tone={b.active ? 'success' : 'neutral'}>
                {b.active ? 'Active' : 'Inactive'}
              </Badge>
              {!readOnly ? (
                <>
                  <IconButton
                    icon={Pencil}
                    label={`Edit ${b.bankName}`}
                    onClick={() => setOpen(b)}
                  />
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() =>
                      banksService
                        .setActive(b.id, !b.active, b.version)
                        .then(
                          () => toast.success(b.active ? 'Bank deactivated' : 'Bank reactivated'),
                          toastError
                        )
                    }
                  >
                    {b.active ? 'Deactivate' : 'Reactivate'}
                  </Button>
                </>
              ) : null}
            </span>
          </li>
        ))}
      </ul>
      <Modal
        open={!!open}
        onClose={() => setOpen(null)}
        size="sm"
        title={open === 'new' ? 'Add bank' : 'Edit bank'}
        footer={
          <>
            <Button onClick={() => setOpen(null)} disabled={busy}>
              Cancel
            </Button>
            <Button
              variant="primary"
              loading={busy}
              onClick={async () => {
                setBusy(true);
                setErr(null);
                try {
                  if (open === 'new') await banksService.create(f);
                  else await banksService.update((open as Bank).id, f, (open as Bank).version);
                  toast.success('Bank saved');
                  setOpen(null);
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
          <Field label="CBN code" required error={err} hint="3 digits">
            <Input
              data-autofocus
              inputMode="numeric"
              maxLength={3}
              value={f.bankCode}
              onChange={(e) => setF({ ...f, bankCode: e.target.value.replace(/\D/g, '') })}
            />
          </Field>
          <Field label="Bank name" required>
            <Input value={f.bankName} onChange={(e) => setF({ ...f, bankName: e.target.value })} />
          </Field>
          <Field label="Short name" required>
            <Input
              value={f.shortName}
              onChange={(e) => setF({ ...f, shortName: e.target.value })}
            />
          </Field>
        </div>
      </Modal>
    </Card>
  );
}

function UsersTab({ readOnly }: { readOnly: boolean }) {
  const me = useCurrentUser();
  type EditableUser = {
    id: string;
    fullName: string;
    email: string;
    roleCode: RoleCode;
    staffId: string;
    version: number;
  };
  const [open, setOpen] = useState<'new' | EditableUser | null>(null);
  const [f, setF] = useState({ fullName: '', email: '', roleCode: 'TO' as RoleCode, staffId: '' });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const usersQuery = useData(() => usersService.list({ pageSize: 100 }), []);

  useEffect(() => {
    if (!open) return;
    setErr(null);
    setF(
      open === 'new'
        ? { fullName: '', email: '', roleCode: 'TO', staffId: '' }
        : {
            fullName: open.fullName,
            email: open.email,
            roleCode: open.roleCode,
            staffId: open.staffId,
          }
    );
  }, [open]);

  return (
    <div className="space-y-5">
      <Card>
        <CardHeader
          title="Users"
          description="Roles decide what each person can do."
          actions={
            !readOnly ? (
              <Button size="sm" icon={Plus} onClick={() => setOpen('new')}>
                Add user
              </Button>
            ) : null
          }
        />
        <ul className="divide-y divide-border">
          {(usersQuery.data?.items ?? []).map((u) => (
            <li
              key={u.id}
              className="flex flex-wrap items-center justify-between gap-2 px-4 py-2.5"
            >
              <span className="min-w-0">
                <span className="block text-sm font-medium">
                  {u.fullName}
                  {u.id === me?.id ? <span className="ml-2 text-xs text-muted">(you)</span> : null}
                </span>
                <span className="block truncate text-xs text-muted">
                  {u.email} · {u.staffId} · last sign-in{' '}
                  {u.lastLoginAt ? formatDateTime(u.lastLoginAt) : 'never'}
                </span>
              </span>
              <span className="flex items-center gap-2">
                <Badge>{ROLE_LABELS[u.roleCode]}</Badge>
                <Badge tone={u.status === 'ACTIVE' ? 'success' : 'neutral'}>
                  {u.status === 'ACTIVE' ? 'Active' : 'Inactive'}
                </Badge>
                {!readOnly ? (
                  <>
                    <IconButton
                      icon={Pencil}
                      label={`Edit ${u.fullName}`}
                      onClick={() => setOpen(u)}
                    />
                    <Button
                      size="sm"
                      variant="ghost"
                      disabledReason={u.id === me?.id ? 'You cannot deactivate yourself' : null}
                      onClick={() =>
                        usersService
                          .setStatus(u.id, u.status === 'ACTIVE' ? 'INACTIVE' : 'ACTIVE', u.version)
                          .then(() => toast.success('User updated'), toastError)
                      }
                    >
                      {u.status === 'ACTIVE' ? 'Deactivate' : 'Reactivate'}
                    </Button>
                  </>
                ) : null}
              </span>
            </li>
          ))}
        </ul>
      </Card>

      <Card>
        <CardHeader
          title="Permissions"
          description="What each role may do (enforced by the service layer)."
        />
        <div className="overflow-x-auto scrollbar-thin">
          <table className="w-full min-w-[720px] text-sm">
            <caption className="sr-only">Permissions matrix</caption>
            <thead>
              <tr>
                <th
                  scope="col"
                  className="border-b border-border bg-surface-2 px-3 py-2 text-left text-xs font-semibold text-muted"
                >
                  Capability
                </th>
                {ROLE_CODES.map((r) => (
                  <th
                    key={r}
                    scope="col"
                    className="border-b border-border bg-surface-2 px-2 py-2 text-center text-xs font-semibold text-muted"
                  >
                    {r}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {PERMISSIONS.map((p) => (
                <tr key={p.capability}>
                  <td className="border-b border-border px-3 py-2">{p.capability}</td>
                  {ROLE_CODES.map((r) => (
                    <td key={r} className="border-b border-border px-2 py-2 text-center">
                      {p.roles.includes(r) ? (
                        <span aria-label="allowed">●</span>
                      ) : (
                        <span className="text-subtle" aria-label="not allowed">
                          ·
                        </span>
                      )}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      <Modal
        open={!!open}
        onClose={() => setOpen(null)}
        size="sm"
        title={open === 'new' ? 'Add user' : 'Edit user'}
        footer={
          <>
            <Button onClick={() => setOpen(null)} disabled={busy}>
              Cancel
            </Button>
            <Button
              variant="primary"
              loading={busy}
              onClick={async () => {
                setBusy(true);
                setErr(null);
                try {
                  if (open === 'new') await usersService.create(f);
                  else await usersService.update(open!.id, f, open!.version);
                  toast.success('User saved');
                  setOpen(null);
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
              value={f.fullName}
              onChange={(e) => setF({ ...f, fullName: e.target.value })}
            />
          </Field>
          <Field label="Email" required>
            <Input
              type="email"
              value={f.email}
              onChange={(e) => setF({ ...f, email: e.target.value })}
            />
          </Field>
          <Field label="Staff ID" required>
            <Input value={f.staffId} onChange={(e) => setF({ ...f, staffId: e.target.value })} />
          </Field>
          <Field label="Role" required>
            <Select
              value={f.roleCode}
              onChange={(e) => setF({ ...f, roleCode: e.target.value as RoleCode })}
              options={ROLE_CODES.map((r) => ({ value: r, label: ROLE_LABELS[r] }))}
            />
          </Field>
        </div>
      </Modal>
    </div>
  );
}

function IntegrationsTab({ readOnly }: { readOnly: boolean }) {
  const q = useData(() => settingsService.integrations(), []);
  const [open, setOpen] = useState<IntegrationConfig | null>(null);
  const [f, setF] = useState({ endpoint: '', username: '', timeoutMs: 15000, enabled: true });
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setErr(null);
    setF({
      endpoint: open.endpoint,
      username: open.username,
      timeoutMs: open.timeoutMs,
      enabled: open.enabled,
    });
  }, [open]);

  return (
    <div className="space-y-5">
      <InlineAlert tone="info" title="Phase 2">
        These connections are simulated in the demo. In Phase 2 they become the live Eazybankz,
        GAPS, NIBSS, Oracle and Active Directory integrations.
      </InlineAlert>
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        {(q.data ?? []).map((i) => (
          <Card key={i.id}>
            <CardHeader
              title={i.name}
              description={i.description}
              actions={
                <Badge tone={!i.enabled ? 'neutral' : i.lastTestOk ? 'success' : 'warning'}>
                  {!i.enabled ? 'Disabled' : i.lastTestOk ? 'Healthy' : 'Not tested'}
                </Badge>
              }
            />
            <CardBody className="space-y-2 text-[13px]">
              <p className="num break-all text-muted">{i.endpoint}</p>
              <p className="text-muted">
                User {i.username} · timeout {i.timeoutMs} ms
              </p>
              <p className="num text-xs text-muted">
                {i.lastTestAt
                  ? `Last test ${formatDateTime(i.lastTestAt)}${i.lastTestMs ? ` · ${i.lastTestMs} ms` : ''}`
                  : 'Never tested'}
              </p>
              {!readOnly ? (
                <div className="flex flex-wrap gap-2 pt-1">
                  <Button
                    size="sm"
                    icon={Play}
                    loading={busy === i.id}
                    onClick={async () => {
                      setBusy(i.id);
                      try {
                        const r = await settingsService.testIntegration(i.id);
                        if (r.lastTestOk)
                          toast.success(`${r.name} responded`, `${r.lastTestMs} ms (simulated)`);
                        else toast.warning(`${r.name} is disabled`, 'Enable it before testing.');
                      } catch (e) {
                        toastError(e);
                      } finally {
                        setBusy(null);
                      }
                    }}
                  >
                    Test connection
                  </Button>
                  <Button size="sm" icon={Pencil} onClick={() => setOpen(i)}>
                    Configure
                  </Button>
                </div>
              ) : null}
            </CardBody>
          </Card>
        ))}
      </div>

      <Modal
        open={!!open}
        onClose={() => setOpen(null)}
        size="sm"
        title={open ? `Configure ${open.name}` : ''}
        footer={
          <>
            <Button onClick={() => setOpen(null)} disabled={!!busy}>
              Cancel
            </Button>
            <Button
              variant="primary"
              loading={busy === 'save'}
              onClick={async () => {
                setBusy('save');
                setErr(null);
                try {
                  await settingsService.updateIntegration(open!.id, f, open!.version);
                  toast.success('Integration updated');
                  setOpen(null);
                } catch (e) {
                  setErr(
                    e instanceof AppError
                      ? (Object.values(e.fieldErrors)[0] ?? e.message)
                      : (e as Error).message
                  );
                } finally {
                  setBusy(null);
                }
              }}
            >
              Save
            </Button>
          </>
        }
      >
        <div className="space-y-3">
          <Field label="Endpoint" required error={err}>
            <Input
              data-autofocus
              value={f.endpoint}
              onChange={(e) => setF({ ...f, endpoint: e.target.value })}
            />
          </Field>
          <Field label="Username">
            <Input value={f.username} onChange={(e) => setF({ ...f, username: e.target.value })} />
          </Field>
          <Field label="Timeout (ms)">
            <Input
              inputMode="numeric"
              value={String(f.timeoutMs)}
              onChange={(e) =>
                setF({ ...f, timeoutMs: Number(e.target.value.replace(/\D/g, '') || 0) })
              }
              className="num text-right"
            />
          </Field>
          <Switch
            checked={f.enabled}
            onChange={(v) => setF({ ...f, enabled: v })}
            label="Enabled"
          />
        </div>
      </Modal>
    </div>
  );
}

function DemoTab({ readOnly }: { readOnly: boolean }) {
  const q = useData(() => settingsService.get(), []);
  const [latency, setLatency] = useState('');
  const [failure, setFailure] = useState('');
  const [busy, setBusy] = useState(false);
  const [reset, setReset] = useState(false);
  useEffect(() => {
    if (q.data) {
      setLatency(String(q.data.values.demoLatencyMs));
      setFailure(String(q.data.values.gapsFailureRate));
    }
  }, [q.data]);
  if (!q.data) return <SkeletonRows rows={5} />;

  return (
    <div className="space-y-5">
      <Card>
        <CardHeader title="Demo behaviour" description="Only affects this demo environment." />
        <CardBody className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label={SETTING_META.demoLatencyMs.label} hint={SETTING_META.demoLatencyMs.hint}>
            <Input
              inputMode="numeric"
              disabled={readOnly}
              value={latency}
              onChange={(e) => setLatency(e.target.value.replace(/\D/g, ''))}
              suffix="ms"
              className="num text-right"
            />
          </Field>
          <Field
            label={SETTING_META.gapsFailureRate.label}
            hint={SETTING_META.gapsFailureRate.hint}
          >
            <Input
              inputMode="numeric"
              disabled={readOnly}
              value={failure}
              onChange={(e) => setFailure(e.target.value.replace(/\D/g, ''))}
              suffix="%"
              className="num text-right"
            />
          </Field>
          {!readOnly ? (
            <div className="flex justify-end sm:col-span-2">
              <Button
                variant="primary"
                icon={Save}
                loading={busy}
                onClick={async () => {
                  setBusy(true);
                  try {
                    await settingsService.update(
                      {
                        ...q.data!.values,
                        demoLatencyMs: Number(latency),
                        gapsFailureRate: Number(failure),
                      },
                      'Demo settings',
                      q.data!.version
                    );
                    toast.success('Demo settings saved');
                  } catch (e) {
                    toastError(e);
                  } finally {
                    setBusy(false);
                  }
                }}
              >
                Save
              </Button>
            </div>
          ) : null}
        </CardBody>
      </Card>

      <Card>
        <CardHeader
          title="Demo data"
          description={`Seeded for ${formatDate(todayLagos())}. Sign-in code ${DEMO_OTP}, signature PIN ${DEMO_PIN}.`}
        />
        <CardBody className="flex flex-wrap items-center gap-2">
          <LinkButton href="/settings/self-check">Run calculation self-check</LinkButton>
          {!readOnly ? (
            <Button variant="danger" icon={RotateCw} onClick={() => setReset(true)}>
              Reset demo data
            </Button>
          ) : null}
        </CardBody>
      </Card>

      <ConfirmDialog
        open={reset}
        onClose={() => setReset(false)}
        title="Reset demo data?"
        description="Everything created during this demo is replaced with a fresh seed for today."
        confirmLabel="Reset demo data"
        tone="danger"
        onConfirm={async () => {
          await settingsService.resetDemoData();
          toast.success('Demo data reset');
        }}
      />
    </div>
  );
}

export default function SettingsPage() {
  const me = useCurrentUser();
  const [tab, setTab] = useState<TabKey>('rates');
  const readOnly = me?.roleCode !== 'ADM';

  const tabs: { key: TabKey; label: string }[] = [
    { key: 'rates', label: 'Rates & policies' },
    { key: 'sla', label: 'SLA' },
    { key: 'chain', label: 'Approval chain' },
    { key: 'holidays', label: 'Public holidays' },
    { key: 'banks', label: 'Banks' },
    { key: 'users', label: 'Users & roles' },
    { key: 'integrations', label: 'Integrations' },
    { key: 'demo', label: 'Demo' },
  ];

  return (
    <>
      <PageHeader
        title="Settings"
        description={
          readOnly ? 'Read-only for your role.' : 'Changes apply everywhere, including open drafts.'
        }
        actions={
          me?.roleCode === 'AUD' || me?.roleCode === 'ADM' ? (
            <Link href="/settings/self-check" className="text-sm font-medium underline">
              Calculation self-check
            </Link>
          ) : null
        }
      />
      <Tabs label="Settings sections" value={tab} onChange={setTab} tabs={tabs} />
      <TabPanel id={tab}>
        {tab === 'rates' ? <RatesTab readOnly={readOnly} /> : null}
        {tab === 'sla' ? <SlaTab readOnly={readOnly} /> : null}
        {tab === 'chain' ? <ChainTab /> : null}
        {tab === 'holidays' ? <HolidaysTab readOnly={readOnly} /> : null}
        {tab === 'banks' ? <BanksTab readOnly={readOnly} /> : null}
        {tab === 'users' ? <UsersTab readOnly={readOnly} /> : null}
        {tab === 'integrations' ? <IntegrationsTab readOnly={readOnly} /> : null}
        {tab === 'demo' ? <DemoTab readOnly={readOnly} /> : null}
      </TabPanel>
    </>
  );
}
