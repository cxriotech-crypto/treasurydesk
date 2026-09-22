'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { CalendarDays, ChevronLeft, ChevronRight } from 'lucide-react';
import { PRODUCT_LABELS, scenarioLabel } from '@/domain/codes';
import { addMonths, todayLagos } from '@/lib/dates';
import { formatDate, formatNaira, monthLabel } from '@/lib/format';
import { calendarService } from '@/services';
import type { CalendarDay, EventKind } from '@/services/calendarService';
import { useCurrentUser, useData } from '@/services/useData';
import {
  Badge,
  Button,
  Card,
  CardBody,
  CardHeader,
  Drawer,
  EmptyState,
  ErrorState,
  IconButton,
  KpiGrid,
  KpiTile,
  Money,
  PageHeader,
  Segmented,
  SkeletonRows,
  Tabs,
  cn,
} from '@/components/ui';

const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

export default function CalendarPage() {
  const router = useRouter();
  const me = useCurrentUser();
  const today = todayLagos();
  const [month, setMonth] = useState(today.slice(0, 7));
  const [kind, setKind] = useState<'ALL' | EventKind>('ALL');
  const [view, setView] = useState<'month' | 'list'>('month');
  const [day, setDay] = useState<CalendarDay | null>(null);

  const q = useData(
    () => calendarService.month(month, kind === 'ALL' ? undefined : [kind]),
    [month, kind]
  );
  const d = q.data;
  const days = d?.days ?? [];
  const listDays = days.filter((x) => x.inMonth && x.events.length);

  return (
    <>
      <PageHeader
        title="Calendar"
        description="Maturities and anniversary payments. Public holidays and weekends are shaded."
        actions={
          <div className="flex items-center gap-1">
            <IconButton
              icon={ChevronLeft}
              label="Previous month"
              onClick={() => setMonth(addMonths(`${month}-01`, -1).slice(0, 7))}
            />
            <span className="num w-32 text-center text-sm font-medium">
              {monthLabel(`${month}-01`)}
            </span>
            <IconButton
              icon={ChevronRight}
              label="Next month"
              onClick={() => setMonth(addMonths(`${month}-01`, 1).slice(0, 7))}
            />
            <Button size="sm" className="ml-2" onClick={() => setMonth(today.slice(0, 7))}>
              Today
            </Button>
          </div>
        }
      />

      <KpiGrid>
        <KpiTile
          label="Due today"
          value={d?.summary.today}
          loading={q.loading}
          href={`/investments?tab=today`}
        />
        <KpiTile
          label="Next 7 days"
          value={d?.summary.next7}
          loading={q.loading}
          href={`/investments?tab=week`}
        />
        <KpiTile
          label="Next 30 days"
          value={d?.summary.next30}
          loading={q.loading}
          href="/investments"
        />
        <KpiTile
          label="Overdue"
          value={d?.summary.overdue}
          tone={d?.summary.overdue ? 'warning' : 'default'}
          loading={q.loading}
          href="/investments?tab=matured"
        />
      </KpiGrid>

      <div className="mt-5 flex flex-wrap items-center justify-between gap-3">
        <Tabs
          label="Calendar view"
          value={view}
          onChange={(v) => setView(v)}
          tabs={[
            { key: 'month', label: 'Month' },
            { key: 'list', label: 'List' },
          ]}
        />
        <Segmented
          label="Event type"
          value={kind}
          onChange={setKind}
          options={[
            { value: 'ALL', label: 'All' },
            { value: 'MATURITY', label: 'Maturities' },
            { value: 'ANNIVERSARY', label: 'Anniversaries' },
          ]}
        />
      </div>

      <div className="mt-4">
        {q.error ? (
          <ErrorState error={q.error} onRetry={q.reload} />
        ) : !d ? (
          <SkeletonRows rows={8} />
        ) : view === 'month' ? (
          <Card className="overflow-hidden">
            <div className="grid grid-cols-7 border-b border-border bg-surface-2 text-center text-[11px] font-semibold uppercase tracking-wide text-muted">
              {WEEKDAYS.map((w) => (
                <div key={w} className="px-1 py-1.5">
                  <span className="hidden sm:inline">{w}</span>
                  <span className="sm:hidden">{w[0]}</span>
                </div>
              ))}
            </div>
            <div className="grid grid-cols-7">
              {days.map((x) => (
                <button
                  key={x.date}
                  type="button"
                  onClick={() => x.events.length && setDay(x)}
                  aria-label={`${formatDate(x.date)}${x.events.length ? `, ${x.events.length} events` : ''}`}
                  className={cn(
                    'min-h-[74px] border-b border-r border-border p-1 text-left align-top last:border-r-0 sm:min-h-[96px]',
                    !x.inMonth && 'opacity-40',
                    (x.isWeekend || x.holiday) && 'bg-surface-2',
                    x.events.length ? 'cursor-pointer hover:bg-brand-soft' : 'cursor-default'
                  )}
                >
                  <span className="flex items-center justify-between">
                    <span
                      className={cn(
                        'num text-xs',
                        x.isToday &&
                          'flex h-5 w-5 items-center justify-center rounded-full bg-brand font-semibold text-brand-fg'
                      )}
                    >
                      {Number(x.date.slice(-2))}
                    </span>
                    {x.events.length ? (
                      <span className="num text-[10px] text-muted">{x.events.length}</span>
                    ) : null}
                  </span>
                  {x.holiday ? (
                    <span className="mt-0.5 block truncate text-[10px] text-st-warning-fg">
                      {x.holiday}
                    </span>
                  ) : null}
                  {x.events.slice(0, 2).map((e) => (
                    <span key={e.id} className="mt-0.5 block truncate text-[10px]">
                      <span
                        className={cn(
                          'mr-1 inline-block h-1.5 w-1.5 rounded-full align-middle',
                          e.kind === 'MATURITY' ? 'bg-brand' : 'bg-teal-bright'
                        )}
                      />
                      {e.customerName}
                    </span>
                  ))}
                  {x.events.length > 2 ? (
                    <span className="block text-[10px] text-muted">
                      +{x.events.length - 2} more
                    </span>
                  ) : null}
                  {x.events.length ? (
                    <span className="num mt-0.5 block truncate text-[10px] font-medium">
                      {formatNaira(x.total)}
                    </span>
                  ) : null}
                </button>
              ))}
            </div>
          </Card>
        ) : (
          <Card>
            {listDays.length ? (
              <ul className="divide-y divide-border">
                {listDays.map((x) => (
                  <li key={x.date} className="px-4 py-3">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <p className="num text-sm font-semibold">
                        {formatDate(x.date)}
                        {x.holiday ? (
                          <Badge tone="warning" className="ml-2">
                            {x.holiday}
                          </Badge>
                        ) : null}
                      </p>
                      <Money value={x.total} className="text-sm font-medium" />
                    </div>
                    <ul className="mt-2 space-y-1">
                      {x.events.map((e) => (
                        <li
                          key={e.id}
                          className="flex flex-wrap items-center justify-between gap-2 text-[13px]"
                        >
                          <span className="min-w-0">
                            <Link
                              href={`/investments/${e.investmentId}`}
                              className="font-medium hover:underline"
                            >
                              {e.investmentRef}
                            </Link>
                            <span className="text-muted">
                              {' '}
                              · {e.customerName} · {PRODUCT_LABELS[e.productCode]}
                            </span>
                          </span>
                          <span className="flex items-center gap-2">
                            <Badge tone={e.kind === 'MATURITY' ? 'info' : 'accent'}>
                              {e.kind === 'MATURITY' ? 'Maturity' : 'Anniversary'}
                            </Badge>
                            <Money value={e.amount} compact />
                          </span>
                        </li>
                      ))}
                    </ul>
                  </li>
                ))}
              </ul>
            ) : (
              <EmptyState
                title="Nothing due this month"
                description="Use the arrows to look at another month."
              />
            )}
          </Card>
        )}
      </div>

      <Drawer
        open={!!day}
        onClose={() => setDay(null)}
        title={day ? formatDate(day.date) : ''}
        description={
          day
            ? `${day.events.length} event${day.events.length === 1 ? '' : 's'} · ${formatNaira(day.total)}${day.holiday ? ` · ${day.holiday}` : ''}`
            : undefined
        }
      >
        <ul className="space-y-3">
          {day?.events.map((e) => (
            <li key={e.id}>
              <Card>
                <CardHeader
                  title={
                    <Link href={`/investments/${e.investmentId}`} className="hover:underline">
                      {e.investmentRef}
                    </Link>
                  }
                  description={`${e.customerName} · ${PRODUCT_LABELS[e.productCode]}`}
                  actions={
                    <Badge tone={e.kind === 'MATURITY' ? 'info' : 'accent'}>
                      {e.kind === 'MATURITY' ? 'Maturity' : 'Anniversary'}
                    </Badge>
                  }
                />
                <CardBody className="flex flex-wrap items-center justify-between gap-2">
                  <Money value={e.amount} className="text-sm font-semibold" />
                  <Button
                    size="sm"
                    icon={CalendarDays}
                    disabledReason={
                      me?.roleCode === 'TO'
                        ? null
                        : 'Only a Treasury Officer can raise transactions'
                    }
                    onClick={() =>
                      router.push(
                        `/transactions/new?scenario=${e.suggested}&customerId=${e.customerId}&investmentId=${e.investmentId}`
                      )
                    }
                  >
                    Start {scenarioLabel(e.suggested).toLowerCase()}
                  </Button>
                </CardBody>
              </Card>
            </li>
          ))}
        </ul>
      </Drawer>
    </>
  );
}
