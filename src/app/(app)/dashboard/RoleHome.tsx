'use client';

/** Role dashboards (brief section 11 "Dashboards"). Every figure comes from dashboardService. */
import Link from 'next/link';
import { PhoneCall, PlayCircle } from 'lucide-react';
import { ROLE_LABELS, scenarioLabel, type ScenarioCode, type TxnStatus } from '@/domain/codes';
import type { SlaState } from '@/domain/rules';
import { isoTimePart, nowIso, todayLagos } from '@/lib/dates';
import { formatDate, formatDateTime, formatDuration, formatNaira } from '@/lib/format';
import { dashboardService } from '@/services';
import type {
  AdmDashboard,
  AoDashboard,
  ApproverDashboard,
  Dashboard,
  OpsDashboard,
  ToDashboard,
} from '@/services/dashboardService';
import { useCurrentUser, useData } from '@/services/useData';
import { BarChartCard, LineChartCard, StageBars } from '@/components/charts/Charts';
import {
  Badge,
  Card,
  CardBody,
  CardHeader,
  EmptyState,
  ErrorState,
  KpiGrid,
  KpiTile,
  LinkButton,
  Money,
  PageHeader,
  SkeletonRows,
  SlaBadge,
  TxnStatusBadge,
} from '@/components/ui';

function greeting(): string {
  const h = Number(isoTimePart(nowIso()).slice(0, 2));
  return h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening';
}

interface RowLike {
  id: string;
  txnRef: string;
  customerName: string;
  scenarioCode: ScenarioCode;
  status: TxnStatus;
  headlineAmt: string;
  sla: SlaState | null;
}

function TxnRows({ rows, empty }: { rows: RowLike[]; empty: string }) {
  if (!rows.length) return <EmptyState title={empty} />;
  return (
    <ul className="divide-y divide-border">
      {rows.map((r) => (
        <li key={r.id}>
          <Link
            href={`/transactions/${r.id}`}
            className="flex flex-wrap items-center justify-between gap-2 px-4 py-2.5 hover:bg-surface-2"
          >
            <span className="min-w-0">
              <span className="block text-sm font-medium">{r.txnRef}</span>
              <span className="block truncate text-xs text-muted">
                {r.customerName} · {scenarioLabel(r.scenarioCode)}
              </span>
            </span>
            <span className="flex flex-wrap items-center justify-end gap-2">
              <SlaBadge sla={r.sla} />
              <TxnStatusBadge status={r.status} />
              <Money value={r.headlineAmt} compact className="text-[13px] font-medium" />
            </span>
          </Link>
        </li>
      ))}
    </ul>
  );
}

function ToView({ d, userId }: { d: ToDashboard; userId: string }) {
  return (
    <>
      <KpiGrid>
        <KpiTile
          label="My drafts"
          value={d.drafts + d.inVerification}
          sub={`${d.inVerification} in verification`}
          href={`/transactions?tab=progress&maker=${userId}`}
        />
        <KpiTile
          label="Returned to me"
          value={d.returned}
          tone={d.returned ? 'warning' : 'default'}
          href={`/transactions?status=RETURNED&maker=${userId}`}
        />
        <KpiTile
          label="Awaiting approval"
          value={d.awaiting.count}
          sub={<Money value={d.awaiting.amount} compact />}
          href={`/transactions?tab=approval&maker=${userId}`}
        />
        <KpiTile
          label="Awaiting my confirmation"
          value={d.awaitingConfirmation}
          href={`/transactions?status=EXECUTED&maker=${userId}`}
        />
      </KpiGrid>
      <div className="mt-5 grid grid-cols-1 gap-5 lg:grid-cols-2">
        <Card>
          <CardHeader
            title="Maturities in the next 30 days"
            description={`${d.maturitiesToday.count} mature today · ${formatNaira(d.maturitiesToday.amount)}`}
            actions={
              <LinkButton href="/calendar" size="sm">
                Calendar
              </LinkButton>
            }
          />
          <CardBody>
            <BarChartCard data={d.maturities30} money />
          </CardBody>
        </Card>
        <Card>
          <CardHeader title="My transactions this month" description="By type" />
          <CardBody>
            <BarChartCard data={d.byTypeThisMonth} />
          </CardBody>
        </Card>
      </div>
      <Card className="mt-5">
        <CardHeader
          title="My recent transactions"
          actions={
            <LinkButton href={`/transactions?maker=${userId}`} size="sm">
              View all
            </LinkButton>
          }
        />
        <TxnRows rows={d.recent} empty="You have not created any transactions yet" />
      </Card>
    </>
  );
}

function AoView({ d }: { d: AoDashboard }) {
  return (
    <>
      <KpiGrid>
        <KpiTile
          label="Call-backs pending"
          value={d.pending}
          tone={d.pending ? 'warning' : 'default'}
          href="/callbacks"
        />
        <KpiTile label="Confirmed today" value={d.confirmedToday} />
        <KpiTile label="Unreachable / disputed today" value={d.failedToday} />
      </KpiGrid>
      <Card className="mt-5">
        <CardHeader
          title="Call-back queue"
          description="Customers waiting for a confirmation call"
          actions={
            <LinkButton href="/callbacks" size="sm">
              Open log
            </LinkButton>
          }
        />
        {d.queue.length ? (
          <ul className="divide-y divide-border">
            {d.queue.map((r) => (
              <li
                key={r.id}
                className="flex flex-wrap items-center justify-between gap-2 px-4 py-2.5"
              >
                <span className="min-w-0">
                  <span className="block text-sm font-medium">{r.customerName}</span>
                  <span className="num block text-xs text-muted">
                    {r.regPhone} · {r.txnRef}
                    {r.attempts ? ` · ${r.attempts} attempt${r.attempts === 1 ? '' : 's'}` : ''}
                  </span>
                </span>
                <span className="flex flex-wrap items-center justify-end gap-2">
                  <SlaBadge sla={r.sla} />
                  <LinkButton href={`/transactions/${r.id}`} size="sm" icon={PhoneCall}>
                    Call now
                  </LinkButton>
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <EmptyState
            title="No calls waiting"
            description="Call-backs appear here once the Treasury Officer verifies the signature."
          />
        )}
      </Card>
    </>
  );
}

function ApproverView({ d }: { d: ApproverDashboard }) {
  const md = d.aum !== undefined;
  return (
    <>
      <KpiGrid>
        <KpiTile
          label="Pending my approval"
          value={d.pending.count}
          sub={<Money value={d.pending.amount} compact />}
          href="/approvals"
        />
        <KpiTile
          label="Oldest item waiting"
          value={d.pending.count ? formatDuration(d.oldestMinutes) : '—'}
          kind="text"
          href="/approvals"
        />
        <KpiTile
          label="SLA breaches"
          value={d.breaches}
          tone={d.breaches ? 'danger' : 'default'}
          href="/approvals"
        />
        <KpiTile label="Approved by me today" value={d.approvedToday} />
      </KpiGrid>
      {md ? (
        <div className="mt-3">
          <KpiGrid>
            <KpiTile label="Total AUM" value={d.aum} kind="money" />
            <KpiTile label="Inflows this month" value={d.inflowsThisMonth} kind="money" />
            <KpiTile label="Outflows this month" value={d.outflowsThisMonth} kind="money" />
            <KpiTile label="Charges & fees MTD" value={d.feeIncomeMtd} kind="money" />
          </KpiGrid>
        </div>
      ) : null}
      <div className="mt-5 grid grid-cols-1 gap-5 lg:grid-cols-2">
        <Card>
          <CardHeader title="Pipeline by stage" description="Every open transaction in the bank" />
          <CardBody>
            <StageBars data={d.pipeline} />
          </CardBody>
        </Card>
        {md && d.aumTrend ? (
          <Card>
            <CardHeader title="AUM trend" description="Last 12 months" />
            <CardBody>
              <LineChartCard data={d.aumTrend} money />
            </CardBody>
          </Card>
        ) : (
          <Card>
            <CardHeader title="Open transactions by type" />
            <CardBody>
              <BarChartCard data={d.byType} />
            </CardBody>
          </Card>
        )}
      </div>
      <Card className="mt-5">
        <CardHeader
          title={`Top of my queue · ${d.levelLabel}`}
          actions={
            <LinkButton href="/approvals" size="sm">
              Open approvals
            </LinkButton>
          }
        />
        <TxnRows rows={d.top} empty="Nothing waiting for your signature" />
      </Card>
    </>
  );
}

function OpsView({ d }: { d: OpsDashboard }) {
  return (
    <>
      <KpiGrid>
        <KpiTile label="Ready to execute" value={d.ready} href="/operations" />
        <KpiTile label="Executed today" value={d.executedToday} />
        <KpiTile
          label="GAPS failures"
          value={d.failures}
          tone={d.failures ? 'danger' : 'default'}
          href="/operations?status=EXEC_FAILED"
        />
        <KpiTile label="Total to pay" value={d.toPay} kind="money" href="/operations" />
      </KpiGrid>
      <Card className="mt-5">
        <CardHeader
          title="Execution queue"
          actions={
            <LinkButton href="/operations" size="sm" icon={PlayCircle}>
              Open queue
            </LinkButton>
          }
        />
        {d.queue.length ? (
          <ul className="divide-y divide-border">
            {d.queue.map((r) => (
              <li
                key={r.id}
                className="flex flex-wrap items-center justify-between gap-2 px-4 py-2.5"
              >
                <span className="min-w-0">
                  <Link
                    href={`/transactions/${r.id}`}
                    className="block text-sm font-medium hover:underline"
                  >
                    {r.txnRef}
                  </Link>
                  <span className="block truncate text-xs text-muted">
                    {r.customerName} · {scenarioLabel(r.scenarioCode)}
                  </span>
                </span>
                <span className="flex flex-wrap items-center justify-end gap-2">
                  <Badge tone={r.gapsRequired ? 'info' : 'neutral'}>
                    {r.gapsRequired ? 'GAPS' : 'Internal'}
                  </Badge>
                  <TxnStatusBadge status={r.status} />
                  <Money value={r.payoutAmt} compact className="text-[13px] font-medium" />
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <EmptyState title="Nothing to execute" />
        )}
      </Card>
    </>
  );
}

function AdmView({ d }: { d: AdmDashboard }) {
  return (
    <>
      <KpiGrid>
        <KpiTile label="Active users" value={d.activeUsers} />
        <KpiTile label="Setting changes this week" value={d.settingChanges} />
        <KpiTile
          label="Integrations healthy"
          value={`${d.integrations.healthy} / ${d.integrations.enabled}`}
          kind="text"
          sub={`${d.integrations.total - d.integrations.enabled} disabled`}
        />
      </KpiGrid>
      <Card className="mt-5">
        <CardHeader title="Live audit feed" description="The most recent recorded events" />
        <ul className="divide-y divide-border">
          {d.audit.map((e) => (
            <li key={e.id} className="px-4 py-2.5">
              <p className="text-sm">{e.summary}</p>
              <p className="num text-xs text-muted">
                {e.userName} · {formatDateTime(e.ts)}
              </p>
            </li>
          ))}
        </ul>
      </Card>
    </>
  );
}

export function RoleHome() {
  const user = useCurrentUser();
  const q = useData<Dashboard | null>(
    () => (user ? dashboardService.load() : Promise.resolve(null)),
    [user?.id]
  );
  if (!user) return null;
  const firstName = user.fullName.replace(/^(mr|mrs|ms|dr)\.?\s+/i, '').split(' ')[0];
  const d = q.data;
  return (
    <>
      <PageHeader
        title={`${greeting()}, ${firstName}`}
        description={`${ROLE_LABELS[user.roleCode]} · ${formatDate(todayLagos())}`}
        actions={
          user.roleCode === 'TO' ? (
            <LinkButton href="/transactions/new" variant="primary">
              New transaction
            </LinkButton>
          ) : null
        }
      />
      {q.error ? (
        <ErrorState error={q.error} onRetry={q.reload} />
      ) : !d ? (
        <>
          <KpiGrid>
            {Array.from({ length: 4 }, (_, i) => (
              <KpiTile key={i} label="Loading" value={null} loading />
            ))}
          </KpiGrid>
          <div className="mt-5">
            <SkeletonRows rows={6} />
          </div>
        </>
      ) : d.kind === 'TO' ? (
        <ToView d={d} userId={user.id} />
      ) : d.kind === 'AO' ? (
        <AoView d={d} />
      ) : d.kind === 'APPROVER' ? (
        <ApproverView d={d} />
      ) : d.kind === 'OPS' ? (
        <OpsView d={d} />
      ) : (
        <AdmView d={d} />
      )}
    </>
  );
}
