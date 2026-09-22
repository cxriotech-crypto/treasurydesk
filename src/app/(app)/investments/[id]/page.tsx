'use client';

import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { PRODUCT_LABELS, scenarioLabel } from '@/domain/codes';
import { formatDate, formatDateTime, formatNaira, formatRate } from '@/lib/format';
import { investmentsService } from '@/services';
import { useCurrentUser, useData } from '@/services/useData';
import { isReady } from '@/app/routes';
import {
  Badge,
  Button,
  Card,
  CardBody,
  CardHeader,
  DescriptionList,
  EmptyState,
  ErrorState,
  InvestmentStatusBadge,
  KpiGrid,
  KpiTile,
  Money,
  PageHeader,
  SkeletonRows,
  TxnStatusBadge,
} from '@/components/ui';
import { CalcValue } from '@/components/ui/Display';

export default function InvestmentDetailPage() {
  const { id } = useParams<{ id: string }>();
  const me = useCurrentUser();
  const router = useRouter();
  const q = useData(() => investmentsService.get(id), [id]);

  if (q.error && !q.data) return <ErrorState error={q.error} onRetry={q.reload} />;
  if (!q.data) return <SkeletonRows rows={10} />;
  const d = q.data;
  const inv = d.investment;
  const live = inv.status === 'ACTIVE' || inv.status === 'MATURED';

  return (
    <>
      <PageHeader
        title={inv.investmentRef}
        description={`${PRODUCT_LABELS[inv.productCode]} · ${d.customer.customerName}`}
        crumbs={[{ label: 'Investments', href: '/investments' }, { label: inv.investmentRef }]}
        meta={
          <>
            <InvestmentStatusBadge status={inv.status} />
            <span className="num text-sm font-semibold">{formatNaira(inv.principalAmt)}</span>
            <span className="num text-sm text-muted">
              {formatRate(inv.intRate)} · {inv.tenorDays} days
            </span>
          </>
        }
      />

      <KpiGrid>
        <KpiTile label="Principal" value={inv.principalAmt} kind="money" />
        <KpiTile
          label="Accrued interest to today"
          value={d.accrued.value}
          kind="money"
          sub={`${d.accruedDays} of ${inv.tenorDays} days`}
        />
        <KpiTile
          label="Projected maturity value"
          value={d.projectedMaturityValue.value}
          kind="money"
        />
        <KpiTile
          label={inv.status === 'MATURED' ? 'Matured' : 'Days to maturity'}
          value={
            inv.status === 'MATURED'
              ? formatDate(inv.maturityDate)
              : String(Math.max(0, d.daysToMaturity))
          }
          kind="text"
          tone={live && d.daysToMaturity <= 7 ? 'warning' : 'default'}
        />
      </KpiGrid>

      <div className="mt-5 grid grid-cols-1 gap-5 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader title="Terms" />
          <CardBody className="space-y-4">
            <div>
              <div className="mb-1 flex items-center justify-between text-[13px] text-muted">
                <span>Accrual progress</span>
                <span className="num">{d.progressPct}%</span>
              </div>
              <div
                className="h-2 w-full overflow-hidden rounded-full bg-surface-2"
                role="progressbar"
                aria-valuenow={d.progressPct}
                aria-valuemin={0}
                aria-valuemax={100}
              >
                <div
                  className="h-full rounded-full bg-teal-bright"
                  style={{ width: `${d.progressPct}%` }}
                />
              </div>
            </div>
            <DescriptionList
              items={[
                {
                  label: 'Customer',
                  value: isReady(`/customers/${d.customer.id}`) ? (
                    <Link className="underline" href={`/customers/${d.customer.id}`}>
                      {d.customer.customerName}
                    </Link>
                  ) : (
                    d.customer.customerName
                  ),
                },
                { label: 'CIF', value: d.customer.cifNo },
                { label: 'Product', value: PRODUCT_LABELS[inv.productCode] },
                { label: 'Rate', value: formatRate(inv.intRate) },
                { label: 'Effective date', value: formatDate(inv.effectiveDate) },
                { label: 'Maturity date', value: formatDate(inv.maturityDate) },
                { label: 'Tenor', value: `${inv.tenorDays} days` },
                { label: 'Interest paid to date', value: <Money value={inv.intPaidToDate} /> },
                {
                  label: 'Anniversary interest',
                  value: inv.annivFreqDays ? `Every ${inv.annivFreqDays} days` : 'At maturity',
                },
                {
                  label: 'Next anniversary',
                  value: inv.nextAnnivDate ? formatDate(inv.nextAnnivDate) : '—',
                },
                ...(d.parent
                  ? [
                      {
                        label: 'Rebooked from',
                        value: (
                          <Link className="underline" href={`/investments/${d.parent.id}`}>
                            {d.parent.investmentRef}
                          </Link>
                        ),
                      },
                    ]
                  : []),
                ...(inv.closedDate ? [{ label: 'Closed', value: formatDate(inv.closedDate) }] : []),
              ]}
            />
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              <CalcValue
                label="Accrued interest"
                value={<Money value={d.accrued.value} />}
                formula={d.accrued.formula}
              />
              <CalcValue
                label="Projected interest"
                value={<Money value={d.projectedInterest.value} />}
                formula={d.projectedInterest.formula}
              />
              <CalcValue
                label="Projected maturity value"
                value={<Money value={d.projectedMaturityValue.value} />}
                formula={d.projectedMaturityValue.formula}
                total
              />
            </div>
          </CardBody>
        </Card>

        <Card>
          <CardHeader
            title="Start a transaction"
            description={
              me?.roleCode === 'TO'
                ? 'Only valid options are enabled.'
                : 'Treasury Officers raise transactions.'
            }
          />
          <CardBody className="space-y-2">
            {d.actions.map((a) => (
              <Button
                key={a.scenarioCode}
                className="w-full justify-start"
                disabledReason={
                  me?.roleCode !== 'TO'
                    ? 'Only a Treasury Officer can raise transactions'
                    : a.disabledReason
                }
                onClick={() => {
                  const params = new URLSearchParams({
                    scenario: a.scenarioCode,
                    customerId: d.customer.id,
                  });
                  if (a.scenarioCode === 'TRANSFER_REVERSAL')
                    params.set('txnId', inv.originTxnId ?? '');
                  else params.set('investmentId', inv.id);
                  router.push(`/transactions/new?${params.toString()}`);
                }}
              >
                {scenarioLabel(a.scenarioCode)}
              </Button>
            ))}
          </CardBody>
        </Card>
      </div>

      <div className="mt-5 grid grid-cols-1 gap-5 lg:grid-cols-2">
        <Card>
          <CardHeader
            title="Anniversary schedule"
            description={
              inv.annivFreqDays ? `Every ${inv.annivFreqDays} days` : 'Interest is paid at maturity'
            }
          />
          {d.anniversaries.length ? (
            <ul className="divide-y divide-border">
              {d.anniversaries.map((a) => (
                <li
                  key={a.date}
                  className="flex items-center justify-between gap-2 px-4 py-2 text-sm"
                >
                  <span className="num">{formatDate(a.date)}</span>
                  <span className="flex items-center gap-2">
                    <Money value={a.periodInterest} />
                    <Badge
                      tone={
                        a.state === 'PAID' ? 'success' : a.state === 'DUE' ? 'warning' : 'neutral'
                      }
                    >
                      {a.state === 'PAID' ? 'Paid' : a.state === 'DUE' ? 'Due' : 'Upcoming'}
                    </Badge>
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <EmptyState
              title="No anniversary payments"
              description="Interest is paid with the principal at maturity."
            />
          )}
        </Card>

        <Card>
          <CardHeader title="Linked transactions" />
          {d.linkedTxns.length ? (
            <ul className="divide-y divide-border">
              {d.linkedTxns.map((t) => (
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
                    <span className="flex flex-wrap items-center justify-end gap-2">
                      <TxnStatusBadge status={t.status} />
                      <Money value={t.headlineAmt} compact className="text-[13px]" />
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          ) : (
            <EmptyState title="No transactions yet" />
          )}
          {d.children.length ? (
            <CardBody className="border-t border-border">
              <p className="mb-1 text-[13px] font-semibold">Rebooked into</p>
              <ul className="space-y-1">
                {d.children.map((c) => (
                  <li key={c.id}>
                    <Link href={`/investments/${c.id}`} className="text-sm underline">
                      {c.investmentRef}
                    </Link>
                  </li>
                ))}
              </ul>
            </CardBody>
          ) : null}
        </Card>
      </div>
    </>
  );
}
