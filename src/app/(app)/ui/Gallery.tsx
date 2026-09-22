'use client';

/**
 * Component gallery (development only). Every sample is driven by real services / calc output,
 * so it also exercises the data path at every screen width.
 */
import { useState } from 'react';
import { Check, Plus, Trash2 } from 'lucide-react';
import {
  TXN_STATUSES,
  INVESTMENT_STATUS_META,
  TXN_STATUS_META,
  type InvestmentStatus,
} from '@/domain/codes';
import { runCalcCases } from '@/lib/calcCases';
import { calcPreliqFull, DEFAULT_SETTINGS } from '@/lib/calc';
import { addDays, todayLagos } from '@/lib/dates';
import { toCsv, downloadFile } from '@/lib/csv';
import { customersService, transactionsService } from '@/services';
import { useData } from '@/services/useData';
import type { TxnRow } from '@/services/transactionsService';
import type { SortDir } from '@/domain/types';
import {
  ActionBar,
  Badge,
  BottomSheet,
  Button,
  CalcValue,
  Card,
  CardBody,
  CardHeader,
  Checkbox,
  Combobox,
  ConfirmDialog,
  DataTable,
  DateInput,
  DateText,
  Drawer,
  EmptyState,
  ErrorState,
  Field,
  FormulaHint,
  Input,
  InlineAlert,
  InvestmentStatusBadge,
  KpiGrid,
  KpiTile,
  Modal,
  Money,
  MoneyInput,
  PageHeader,
  RadioGroup,
  Segmented,
  Select,
  SignatureModal,
  SkeletonRows,
  SlaBadge,
  Stepper,
  Switch,
  Tabs,
  TabPanel,
  Textarea,
  TimeInput,
  TxnStatusBadge,
  toast,
  type Column,
} from '@/components/ui';

const PAGE_SIZE = 5;

export function Gallery() {
  const [money, setMoney] = useState('');
  const [customer, setCustomer] = useState('');
  const [check, setCheck] = useState(true);
  const [radio, setRadio] = useState<'EXTERNAL' | 'INTERNAL'>('EXTERNAL');
  const [sw, setSw] = useState(false);
  const [seg, setSeg] = useState<'Y' | 'N' | ''>('');
  const [tab, setTab] = useState<'a' | 'b' | 'c'>('a');
  const [open, setOpen] = useState<null | 'modal' | 'drawer' | 'sheet' | 'confirm' | 'sign'>(null);
  const [page, setPage] = useState(1);
  const [sort, setSort] = useState<{ field: string; dir: SortDir }>({
    field: 'createdAt',
    dir: 'desc',
  });
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const counts = useData(() => transactionsService.statusCounts(), []);
  const txns = useData(
    () => transactionsService.list({ page, pageSize: PAGE_SIZE, sort }),
    [page, sort.field, sort.dir]
  );
  const customers = useData(() => customersService.list({ pageSize: 100 }), []);
  const checks = runCalcCases().filter((c) => c.required);
  const preliq = calcPreliqFull(
    {
      principalAmt: '10000000.00',
      intRate: '15',
      effectiveDate: addDays(todayLagos(), -180),
      tenorDays: 365,
      maturityDate: addDays(todayLagos(), 185),
      intPaidToDate: '0.00',
    },
    todayLagos(),
    false,
    { settings: DEFAULT_SETTINGS, holidays: [] }
  );

  const columns: Column<TxnRow>[] = [
    { key: 'ref', header: 'Reference', cell: (r) => r.txnRef, sortKey: 'txnRef', card: 'title' },
    {
      key: 'status',
      header: 'Status',
      cell: (r) => <TxnStatusBadge status={r.status} />,
      card: 'status',
    },
    { key: 'customer', header: 'Customer', cell: (r) => r.customerName, sortKey: 'customerName' },
    { key: 'sla', header: 'SLA', cell: (r) => <SlaBadge sla={r.sla} /> },
    {
      key: 'created',
      header: 'Created',
      cell: (r) => <DateText value={r.createdAt} time />,
      sortKey: 'createdAt',
    },
    {
      key: 'amt',
      header: 'Amount',
      cell: (r) => <Money value={r.headlineAmt} />,
      sortKey: 'headlineAmt',
      align: 'right',
      card: 'amount',
    },
  ];

  return (
    <>
      <PageHeader
        title="Component gallery"
        description="Development only. Every component at every screen width."
        crumbs={[{ label: 'Dashboard', href: '/dashboard' }, { label: 'Component gallery' }]}
        actions={
          <>
            <Button icon={Plus} variant="primary">
              Primary
            </Button>
            <Button>Secondary</Button>
          </>
        }
      />

      <div className="space-y-6">
        <section>
          <h2 className="mb-2 text-[15px] font-semibold">KPI tiles</h2>
          <KpiGrid>
            <KpiTile label="All transactions" value={counts.data?.ALL} loading={counts.loading} />
            <KpiTile
              label="Awaiting Head Treasury"
              value={counts.data?.PENDING_HEAD_TREASURY}
              loading={counts.loading}
              tone="warning"
            />
            <KpiTile
              label="Execution failed"
              value={counts.data?.EXEC_FAILED}
              loading={counts.loading}
              tone="danger"
            />
            <KpiTile
              label="Payout (case 2)"
              value={preliq.payout.value}
              kind="money"
              sub="Hover for exact value"
            />
          </KpiGrid>
        </section>

        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          <Card>
            <CardHeader
              title="Buttons"
              description="primary / secondary / ghost / danger, sm / md"
            />
            <CardBody className="flex flex-wrap gap-2">
              <Button variant="primary">Primary</Button>
              <Button>Secondary</Button>
              <Button variant="ghost">Ghost</Button>
              <Button variant="danger" icon={Trash2}>
                Danger
              </Button>
              <Button size="sm" variant="primary">
                Small
              </Button>
              <Button loading>Saving</Button>
              <Button
                variant="primary"
                disabledReason="Maker-checker: you created this transaction"
              >
                Approve
              </Button>
            </CardBody>
          </Card>

          <Card>
            <CardHeader title="Badges" />
            <CardBody className="flex flex-wrap gap-1.5">
              {TXN_STATUSES.map((s) => (
                <TxnStatusBadge key={s} status={s} />
              ))}
              {(Object.keys(INVESTMENT_STATUS_META) as InvestmentStatus[]).map((s) => (
                <InvestmentStatusBadge key={s} status={s} />
              ))}
              <Badge tone="accent">{TXN_STATUS_META.PENDING_OPERATIONS.label}</Badge>
            </CardBody>
          </Card>

          <Card>
            <CardHeader title="Form controls" />
            <CardBody className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Field
                label="Amount"
                hint={money ? `Stored as "${money}"` : 'Canonical 2-dp string'}
                required
              >
                <MoneyInput value={money} onValueChange={setMoney} placeholder="0.00" />
              </Field>
              <Field label="Customer" hint="Searchable">
                <Combobox
                  value={customer}
                  onChange={setCustomer}
                  clearable
                  placeholder="Search name or CIF"
                  options={(customers.data?.items ?? []).map((c) => ({
                    value: c.id,
                    label: c.customerName,
                    sublabel: c.cifNo,
                    keywords: c.cifNo,
                  }))}
                />
              </Field>
              <Field label="Received date">
                <DateInput defaultValue={todayLagos()} />
              </Field>
              <Field label="Received time">
                <TimeInput defaultValue="09:30" />
              </Field>
              <Field label="Channel">
                <Select
                  placeholder="Choose…"
                  options={[
                    { value: 'LETTER', label: 'Letter' },
                    { value: 'EMAIL', label: 'Email' },
                  ]}
                />
              </Field>
              <Field label="Account number" error="Account number must be exactly 10 digits">
                <Input defaultValue="01234" inputMode="numeric" />
              </Field>
              <Field label="Purpose" className="sm:col-span-2">
                <Textarea placeholder="Purpose of the payment" />
              </Field>
              <Checkbox
                checked={check}
                onChange={setCheck}
                label="Signature matches specimen"
                description="Compare with the specimen on file"
              />
              <Switch
                checked={sw}
                onChange={setSw}
                label="WHT on anniversary"
                description="SOP: not required"
              />
              <RadioGroup
                name="dest"
                label="Payment destination"
                value={radio}
                onChange={setRadio}
                orientation="horizontal"
                options={[
                  { value: 'EXTERNAL', label: 'External bank' },
                  { value: 'INTERNAL', label: 'Customer PA' },
                ]}
              />
              <div>
                <p className="mb-1 text-[13px] font-medium text-muted">Amount confirmed</p>
                <Segmented
                  label="Amount confirmed"
                  value={seg}
                  onChange={setSeg}
                  options={[
                    { value: 'Y', label: 'Confirmed' },
                    { value: 'N', label: 'Not confirmed' },
                  ]}
                />
              </div>
            </CardBody>
          </Card>

          <Card>
            <CardHeader
              title="Calculated figures"
              description="Shaded, read-only, with the fx formula (case 2 inputs)"
            />
            <CardBody className="space-y-2">
              <CalcValue
                label="Accrued interest"
                value={<Money value={preliq.accrued.value} />}
                formula={preliq.accrued.formula}
              />
              <CalcValue
                label="Pre-liquidation charge"
                value={<Money value={preliq.charge.value} />}
                formula={preliq.charge.formula}
              />
              <CalcValue
                label="WHT"
                value={<Money value={preliq.wht.value} />}
                formula={preliq.wht.formula}
              />
              <CalcValue
                label="Payout"
                value={<Money value={preliq.payout.value} />}
                formula={preliq.payout.formula}
                total
              />
              <p className="flex items-center gap-2 pt-2 text-[13px] text-muted">
                Self-check: {checks.filter((c) => c.pass).length}/{checks.length} required cases
                pass{' '}
                <FormulaHint
                  formula={checks.map((c) => `${c.id} ${c.pass ? 'PASS' : 'FAIL'}`).join(' · ')}
                />
              </p>
            </CardBody>
          </Card>

          <Card>
            <CardHeader title="Stepper and tabs" />
            <CardBody className="space-y-4">
              <Stepper
                orientation="horizontal"
                steps={[
                  { key: '1', label: 'Type & scenario', state: 'done' },
                  { key: '2', label: 'Instruction', state: 'done' },
                  { key: '3', label: 'Signature', state: 'current' },
                  { key: '4', label: 'Call-back', state: 'todo' },
                  { key: '5', label: 'Eazybankz', state: 'todo' },
                  { key: '6', label: 'Voucher', state: 'todo' },
                ]}
              />
              <Tabs
                label="Sample tabs"
                value={tab}
                onChange={setTab}
                tabs={[
                  { key: 'a', label: 'Summary' },
                  { key: 'b', label: 'Vouchers', count: 2 },
                  { key: 'c', label: 'Audit' },
                ]}
              />
              <TabPanel id={tab}>
                <p className="text-sm text-muted">Selected tab: {tab}</p>
              </TabPanel>
            </CardBody>
          </Card>

          <Card>
            <CardHeader title="Overlays" />
            <CardBody className="flex flex-wrap gap-2">
              <Button onClick={() => setOpen('modal')}>Modal</Button>
              <Button onClick={() => setOpen('drawer')}>Drawer</Button>
              <Button onClick={() => setOpen('sheet')}>Bottom sheet</Button>
              <Button onClick={() => setOpen('confirm')}>Confirm dialog</Button>
              <Button variant="primary" onClick={() => setOpen('sign')}>
                Signature
              </Button>
              <Button onClick={() => toast.success('Saved', 'Toast with description')}>
                Toast
              </Button>
            </CardBody>
          </Card>

          <Card>
            <CardHeader title="States" />
            <CardBody className="space-y-3">
              <InlineAlert tone="warning" title="Returned for correction">
                Remarks do not carry the beneficiary account number.
              </InlineAlert>
              <InlineAlert tone="danger" title="Signature differs — stop processing" />
              <SkeletonRows rows={2} />
              <EmptyState
                title="No transactions"
                description="Nothing matches these filters."
                action={<Button size="sm">Clear filters</Button>}
              />
              <ErrorState
                error="The service did not respond."
                onRetry={() => toast.info('Retrying')}
              />
            </CardBody>
          </Card>
        </div>

        <section>
          <h2 className="mb-2 text-[15px] font-semibold">Data table</h2>
          <DataTable
            caption="Transactions"
            columns={columns}
            rows={txns.data?.items}
            rowKey={(r) => r.id}
            loading={txns.loading}
            error={txns.error}
            onRetry={txns.reload}
            sort={sort}
            onSortChange={(s) => {
              setSort(s);
              setPage(1);
            }}
            page={page}
            pageSize={PAGE_SIZE}
            total={txns.data?.total}
            onPageChange={setPage}
            selectable
            selected={selected}
            onSelectedChange={setSelected}
            toolbar={<p className="text-[13px] text-muted">{selected.size} selected</p>}
            onExport={() =>
              downloadFile(
                'transactions-sample.csv',
                toCsv(txns.data?.items ?? [], [
                  { header: 'Reference', value: (r) => r.txnRef },
                  { header: 'Customer', value: (r) => r.customerName },
                  { header: 'Amount', value: (r) => r.headlineAmt },
                ])
              )
            }
          />
        </section>

        <ActionBar>
          <Button>Save draft</Button>
          <Button variant="primary" icon={Check}>
            Sign & submit
          </Button>
        </ActionBar>
      </div>

      <Modal
        open={open === 'modal'}
        onClose={() => setOpen(null)}
        title="Modal"
        description="Full-height sheet on phones"
        footer={<Button onClick={() => setOpen(null)}>Close</Button>}
      >
        <p className="text-sm">Focus is trapped here; Esc closes.</p>
      </Modal>
      <Drawer
        open={open === 'drawer'}
        onClose={() => setOpen(null)}
        title="Execute"
        description="Drawer from the right"
      >
        <p className="text-sm">Drawer content.</p>
      </Drawer>
      <BottomSheet open={open === 'sheet'} onClose={() => setOpen(null)} title="Filters">
        <p className="text-sm">Bottom sheet content.</p>
      </BottomSheet>
      <ConfirmDialog
        open={open === 'confirm'}
        onClose={() => setOpen(null)}
        title="Cancel transaction?"
        confirmLabel="Cancel transaction"
        tone="danger"
        reason={{ label: 'Reason', placeholder: 'Why is it being cancelled?' }}
        onConfirm={(r) => {
          toast.info('Confirmed', r);
        }}
      />
      <SignatureModal
        open={open === 'sign'}
        onClose={() => setOpen(null)}
        title="Sign"
        description="Type your full name and PIN"
        actionLabel="Sign"
        withComment
        onSign={async () => {
          toast.success('Signature verified');
        }}
      />
    </>
  );
}
