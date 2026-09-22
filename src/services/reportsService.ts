/**
 * Report queries (brief section 11 "Reports"). Every figure is aggregated from the same records the
 * lists show, so totals reconcile with the registers.
 */
import type { Investment, TreasuryTxn, Voucher } from '@/domain/types';
import {
  APPROVAL_LEVELS,
  PRODUCT_LABELS,
  TXN_TYPE_META,
  scenarioLabel,
  type ProductCode,
  type RoleCode,
  type TxnType,
} from '@/domain/codes';
import {
  addDays,
  addMonths,
  daysBetween,
  endOfMonth,
  isoDatePart,
  minutesBetween,
  nowIso,
  todayLagos,
} from '@/lib/dates';
import { formatDuration, monthShort } from '@/lib/format';
import { add, isPositive, ZERO } from '@/lib/money';
import type { Db } from '@/data/db';
import { getDb } from '@/data/store';
import { USE_MOCK, http, requireUser, run } from './core';
import { userName } from './transactionsService';

export type ReportCode =
  | 'POSITION'
  | 'MATURITY_PROFILE'
  | 'CHARGES'
  | 'WHT'
  | 'SLA'
  | 'TURNAROUND'
  | 'REGISTER'
  | 'EXCEPTIONS';

export const REPORTS: {
  code: ReportCode;
  title: string;
  description: string;
  usesRange: boolean;
}[] = [
  {
    code: 'POSITION',
    title: 'Daily treasury position',
    description: 'Opening AUM, inflows, outflows by type, rollovers and closing AUM by product.',
    usesRange: true,
  },
  {
    code: 'MATURITY_PROFILE',
    title: 'Maturity profile',
    description: 'Live investments by days to maturity, count and value by product.',
    usesRange: false,
  },
  {
    code: 'CHARGES',
    title: 'Charges & fee income',
    description: 'Pre-liquidation charges and transfer fees earned.',
    usesRange: true,
  },
  {
    code: 'WHT',
    title: 'WHT payable schedule',
    description: 'Withholding tax deducted from interest paid or rolled.',
    usesRange: true,
  },
  {
    code: 'SLA',
    title: 'SLA performance',
    description: 'Share completed within SLA, breaches and average time per stage.',
    usesRange: true,
  },
  {
    code: 'TURNAROUND',
    title: 'Approval turnaround',
    description: 'Time taken to sign at each level, by approver.',
    usesRange: true,
  },
  {
    code: 'REGISTER',
    title: 'Transaction register',
    description: 'All transactions with their voucher figures.',
    usesRange: true,
  },
  {
    code: 'EXCEPTIONS',
    title: 'Stopped / returned / rejected',
    description: 'Exceptions with reasons.',
    usesRange: true,
  },
];

export const REPORT_ROLES: RoleCode[] = ['HT', 'MIS', 'AUD', 'MD', 'ADM'];

export type CellFormat = 'text' | 'money' | 'count' | 'date' | 'datetime' | 'pct' | 'duration';

export interface ReportColumn {
  key: string;
  label: string;
  format: CellFormat;
}

export type ReportRow = Record<string, string | number | null>;

export interface ReportChart {
  type: 'bar' | 'line';
  xKey: string;
  series: { key: string; label: string }[];
  /** Values are numbers for charting only; tables use the exact money strings. */
  data: Record<string, string | number>[];
}

export interface Report {
  code: ReportCode;
  title: string;
  range: { from: string; to: string } | null;
  generatedBy: string;
  generatedAt: string;
  summary: { label: string; value: string | number; format: CellFormat }[];
  columns: ReportColumn[];
  rows: ReportRow[];
  totals: ReportRow | null;
  chart: ReportChart | null;
  notes: string[];
}

export interface DateRange {
  from: string;
  to: string;
}

export interface AumPoint {
  month: string;
  label: string;
  date: string;
  aum: string;
}

export interface ReportsService {
  run(code: ReportCode, range: DateRange): Promise<Report>;
  /** Month-end AUM for the last 12 months plus today. */
  aumTrend(): Promise<AumPoint[]>;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

const PRODUCTS: ProductCode[] = ['TERM', 'CP', 'CALL'];
const num = (v: string) => Number(v); // charts only

/** Principal outstanding at the end of `date`. */
export function aumAsOf(invs: Investment[], date: string, product?: ProductCode): string {
  return add(
    ZERO,
    ...invs
      .filter(
        (i) =>
          (!product || i.productCode === product) &&
          i.effectiveDate <= date &&
          (!i.closedDate || i.closedDate > date)
      )
      .map((i) => i.principalAmt)
  );
}

function completedIn(db: Db, r: DateRange): TreasuryTxn[] {
  return db.txns.filter(
    (t) =>
      t.status === 'COMPLETED' &&
      t.completedAt &&
      isoDatePart(t.completedAt) >= r.from &&
      isoDatePart(t.completedAt) <= r.to
  );
}

function vouchersOf(db: Db, t: TreasuryTxn): Voucher[] {
  return db.vouchers.filter((v) => v.txnId === t.id).sort((a, b) => a.seqNo - b.seqNo);
}

function customerOf(db: Db, t: TreasuryTxn) {
  return db.customers.find((c) => c.id === t.customerId);
}

function base(
  code: ReportCode,
  range: DateRange | null
): Omit<Report, 'summary' | 'columns' | 'rows' | 'totals' | 'chart' | 'notes'> {
  const u = requireUser(REPORT_ROLES);
  return {
    code,
    title: REPORTS.find((r) => r.code === code)!.title,
    range,
    generatedBy: u.fullName,
    generatedAt: nowIso(),
  };
}

// ─── Reports ─────────────────────────────────────────────────────────────────

function position(db: Db, r: DateRange): Report {
  const opening = addDays(r.from, -1);
  const rows: ReportRow[] = PRODUCTS.map((p) => {
    const newBook = add(
      ZERO,
      ...db.investments
        .filter((i) => i.productCode === p && i.effectiveDate >= r.from && i.effectiveDate <= r.to)
        .map((i) => i.principalAmt)
    );
    const closed = add(
      ZERO,
      ...db.investments
        .filter(
          (i) =>
            i.productCode === p &&
            i.closedDate &&
            i.closedDate >= r.from &&
            i.closedDate <= r.to &&
            i.effectiveDate <= r.to
        )
        .map((i) => i.principalAmt)
    );
    return {
      product: PRODUCT_LABELS[p],
      opening: aumAsOf(db.investments, opening, p),
      booked: newBook,
      closed,
      closing: aumAsOf(db.investments, r.to, p),
    };
  });
  const done = completedIn(db, r);
  const outflows: Record<string, string> = {};
  let inflows = ZERO;
  let rolled = ZERO;
  let rollCount = 0;
  for (const t of done) {
    for (const v of vouchersOf(db, t)) {
      if (v.voucherType === 'FO') outflows[t.txnType] = add(outflows[t.txnType] ?? ZERO, v.netAmt);
      if (v.voucherType === 'FI') inflows = add(inflows, v.principalAmt);
      if (v.voucherType === 'RO' && t.txnType === 'ROLLOVER') {
        rolled = add(rolled, v.rollAmt);
        rollCount += 1;
      }
    }
  }
  const totals: ReportRow = {
    product: 'Total',
    opening: add(ZERO, ...rows.map((x) => String(x.opening))),
    booked: add(ZERO, ...rows.map((x) => String(x.booked))),
    closed: add(ZERO, ...rows.map((x) => String(x.closed))),
    closing: add(ZERO, ...rows.map((x) => String(x.closing))),
  };
  return {
    ...base('POSITION', r),
    summary: [
      { label: 'Opening AUM', value: String(totals.opening), format: 'money' },
      { label: 'Inflows (new investments)', value: inflows, format: 'money' },
      ...(Object.keys(TXN_TYPE_META) as TxnType[])
        .filter((k) => outflows[k])
        .map((k) => ({
          label: `Outflows – ${TXN_TYPE_META[k].label}`,
          value: outflows[k],
          format: 'money' as const,
        })),
      { label: `Rollovers (${rollCount})`, value: rolled, format: 'money' },
      { label: 'Closing AUM', value: String(totals.closing), format: 'money' },
    ],
    columns: [
      { key: 'product', label: 'Product', format: 'text' },
      { key: 'opening', label: 'Opening AUM', format: 'money' },
      { key: 'booked', label: 'Booked', format: 'money' },
      { key: 'closed', label: 'Closed / rolled', format: 'money' },
      { key: 'closing', label: 'Closing AUM', format: 'money' },
    ],
    rows,
    totals,
    chart: {
      type: 'bar',
      xKey: 'product',
      series: [
        { key: 'opening', label: 'Opening' },
        { key: 'closing', label: 'Closing' },
      ],
      data: rows.map((x) => ({
        product: String(x.product),
        opening: num(String(x.opening)),
        closing: num(String(x.closing)),
      })),
    },
    notes: ['Opening + booked − closed = closing for each product.'],
  };
}

function maturityProfile(db: Db): Report {
  const today = todayLagos();
  const buckets: [string, (d: number, i: Investment) => boolean][] = [
    ['Overdue (matured)', (d, i) => i.status === 'MATURED' || d < 0],
    ['0–7 days', (d, i) => i.status === 'ACTIVE' && d >= 0 && d <= 7],
    ['8–30 days', (d) => d >= 8 && d <= 30],
    ['31–90 days', (d) => d >= 31 && d <= 90],
    ['91–180 days', (d) => d >= 91 && d <= 180],
    ['181–365 days', (d) => d >= 181 && d <= 365],
    ['> 365 days', (d) => d > 365],
  ];
  const live = db.investments.filter((i) => i.status === 'ACTIVE' || i.status === 'MATURED');
  const used = new Set<string>();
  const rows: ReportRow[] = buckets.map(([label, test]) => {
    const inB = live.filter((i) => !used.has(i.id) && test(daysBetween(today, i.maturityDate), i));
    inB.forEach((i) => used.add(i.id));
    const row: ReportRow = { bucket: label };
    for (const p of PRODUCTS) {
      const ps = inB.filter((i) => i.productCode === p);
      row[`${p}_n`] = ps.length;
      row[`${p}_v`] = add(ZERO, ...ps.map((i) => i.principalAmt));
    }
    row.total_n = inB.length;
    row.total_v = add(ZERO, ...inB.map((i) => i.principalAmt));
    return row;
  });
  const totals: ReportRow = { bucket: 'Total' };
  for (const k of ['TERM', 'CP', 'CALL', 'total']) {
    totals[`${k}_n`] = rows.reduce((s, x) => s + Number(x[`${k}_n`]), 0);
    totals[`${k}_v`] = add(ZERO, ...rows.map((x) => String(x[`${k}_v`])));
  }
  return {
    ...base('MATURITY_PROFILE', null),
    summary: [
      { label: 'Live investments', value: live.length, format: 'count' },
      { label: 'Principal outstanding', value: String(totals.total_v), format: 'money' },
    ],
    columns: [
      { key: 'bucket', label: 'Days to maturity', format: 'text' },
      ...PRODUCTS.flatMap((p) => [
        { key: `${p}_n`, label: `${p} #`, format: 'count' as const },
        { key: `${p}_v`, label: `${PRODUCT_LABELS[p]}`, format: 'money' as const },
      ]),
      { key: 'total_n', label: 'Total #', format: 'count' },
      { key: 'total_v', label: 'Total', format: 'money' },
    ],
    rows,
    totals,
    chart: {
      type: 'bar',
      xKey: 'bucket',
      series: PRODUCTS.map((p) => ({ key: p, label: PRODUCT_LABELS[p] })),
      data: rows.map((x) => ({
        bucket: String(x.bucket),
        ...Object.fromEntries(PRODUCTS.map((p) => [p, num(String(x[`${p}_v`]))])),
      })),
    },
    notes: [`As of ${today}.`],
  };
}

function charges(db: Db, r: DateRange): Report {
  const rows: ReportRow[] = [];
  for (const t of completedIn(db, r)) {
    const vs = vouchersOf(db, t);
    const charge = add(ZERO, ...vs.filter((v) => v.voucherType === 'FO').map((v) => v.chargeAmt));
    const fee = add(ZERO, ...vs.map((v) => v.feeAmt));
    if (!isPositive(charge) && !isPositive(fee)) continue;
    rows.push({
      date: isoDatePart(t.completedAt!),
      txnRef: t.txnRef,
      customer: customerOf(db, t)?.customerName ?? '',
      scenario: scenarioLabel(t.scenarioCode),
      charge,
      fee,
      total: add(charge, fee),
    });
  }
  const totals: ReportRow = {
    date: 'Total',
    charge: add(ZERO, ...rows.map((x) => String(x.charge))),
    fee: add(ZERO, ...rows.map((x) => String(x.fee))),
    total: add(ZERO, ...rows.map((x) => String(x.total))),
  };
  return {
    ...base('CHARGES', r),
    summary: [
      { label: 'Pre-liquidation charges', value: String(totals.charge), format: 'money' },
      { label: 'Transfer fees', value: String(totals.fee), format: 'money' },
      { label: 'Total income', value: String(totals.total), format: 'money' },
    ],
    columns: [
      { key: 'date', label: 'Completed', format: 'date' },
      { key: 'txnRef', label: 'Transaction', format: 'text' },
      { key: 'customer', label: 'Customer', format: 'text' },
      { key: 'scenario', label: 'Type', format: 'text' },
      { key: 'charge', label: 'Pre-liq charge', format: 'money' },
      { key: 'fee', label: 'Transfer fee', format: 'money' },
      { key: 'total', label: 'Total', format: 'money' },
    ],
    rows,
    totals,
    chart: {
      type: 'bar',
      xKey: 'kind',
      series: [{ key: 'amount', label: 'Income' }],
      data: [
        { kind: 'Pre-liquidation charges', amount: num(String(totals.charge)) },
        { kind: 'Transfer fees', amount: num(String(totals.fee)) },
      ],
    },
    notes: [],
  };
}

function whtSchedule(db: Db, r: DateRange): Report {
  const rows: ReportRow[] = [];
  for (const t of completedIn(db, r)) {
    const c = customerOf(db, t);
    for (const v of vouchersOf(db, t)) {
      if ((v.voucherType !== 'FO' && v.voucherType !== 'RO') || !isPositive(v.whtAmt)) continue;
      rows.push({
        date: isoDatePart(t.completedAt!),
        txnRef: t.txnRef,
        voucherNo: v.voucherNo,
        customer: c?.customerName ?? '',
        cifNo: c?.cifNo ?? '',
        interest: v.interestAmt,
        wht: v.whtAmt,
      });
    }
  }
  const totals: ReportRow = {
    date: 'Total',
    interest: add(ZERO, ...rows.map((x) => String(x.interest))),
    wht: add(ZERO, ...rows.map((x) => String(x.wht))),
  };
  return {
    ...base('WHT', r),
    summary: [
      { label: 'Interest subject to WHT', value: String(totals.interest), format: 'money' },
      { label: 'WHT payable', value: String(totals.wht), format: 'money' },
      { label: 'Vouchers', value: rows.length, format: 'count' },
    ],
    columns: [
      { key: 'date', label: 'Date', format: 'date' },
      { key: 'txnRef', label: 'Transaction', format: 'text' },
      { key: 'voucherNo', label: 'Voucher', format: 'text' },
      { key: 'customer', label: 'Customer', format: 'text' },
      { key: 'cifNo', label: 'CIF', format: 'text' },
      { key: 'interest', label: 'Interest', format: 'money' },
      { key: 'wht', label: 'WHT', format: 'money' },
    ],
    rows,
    totals,
    chart: null,
    notes: ['WHT-exempt customers are excluded (no WHT deducted).'],
  };
}

function slaPerformance(db: Db, r: DateRange): Report {
  const done = completedIn(db, r);
  const breached = done.filter(
    (t) => db.controls.find((c) => c.txnId === t.id && c.controlCode === 'C12')?.state === 'FAILED'
  );
  const stageDefs: [string, (t: TreasuryTxn) => [string | null, string | null]][] = [
    ['Instruction → submitted', (t) => [t.receivedAt, t.submittedAt]],
    ...APPROVAL_LEVELS.slice(1).map(
      (l, i) =>
        [
          `${APPROVAL_LEVELS[i].label} → ${l.label}`,
          (t: TreasuryTxn) => {
            const a = db.approvals.filter(
              (x) => x.txnId === t.id && x.cycleNo === t.cycleNo && x.action === 'APPROVE'
            );
            return [
              a.find((x) => x.levelNo === l.levelNo - 1)?.actedAt ?? null,
              a.find((x) => x.levelNo === l.levelNo)?.actedAt ?? null,
            ];
          },
        ] as [string, (t: TreasuryTxn) => [string | null, string | null]]
    ),
    [
      'MD → executed',
      (t) => {
        const md = db.approvals
          .filter(
            (x) =>
              x.txnId === t.id &&
              x.cycleNo === t.cycleNo &&
              x.levelNo === 5 &&
              x.action === 'APPROVE'
          )
          .pop();
        const ex = db.executions.filter((e) => e.txnId === t.id && e.status === 'SUCCESS').pop();
        return [md?.actedAt ?? null, ex?.executedAt ?? null];
      },
    ],
    [
      'Executed → confirmed',
      (t) => [
        db.executions.filter((e) => e.txnId === t.id && e.status === 'SUCCESS').pop()?.executedAt ??
          null,
        t.completedAt,
      ],
    ],
  ];
  const rows: ReportRow[] = stageDefs.map(([stage, fn]) => {
    const mins = done
      .map(fn)
      .filter(([a, b]) => a && b)
      .map(([a, b]) => minutesBetween(a!, b!));
    const avg = mins.length ? Math.round(mins.reduce((s, x) => s + x, 0) / mins.length) : 0;
    return { stage, count: mins.length, avg, max: mins.length ? Math.max(...mins) : 0 };
  });
  const pct = done.length
    ? Math.round(((done.length - breached.length) / done.length) * 1000) / 10
    : 0;
  return {
    ...base('SLA', r),
    summary: [
      { label: 'Completed', value: done.length, format: 'count' },
      { label: 'Within SLA', value: pct, format: 'pct' },
      { label: 'Breaches', value: breached.length, format: 'count' },
    ],
    columns: [
      { key: 'stage', label: 'Stage', format: 'text' },
      { key: 'count', label: 'Transactions', format: 'count' },
      { key: 'avg', label: 'Average time', format: 'duration' },
      { key: 'max', label: 'Longest', format: 'duration' },
    ],
    rows,
    totals: null,
    chart: {
      type: 'bar',
      xKey: 'stage',
      series: [{ key: 'avg', label: 'Average minutes' }],
      data: rows.map((x) => ({ stage: String(x.stage), avg: Number(x.avg) })),
    },
    notes: breached.map((t) => {
      const c = db.controls.find((x) => x.txnId === t.id && x.controlCode === 'C12');
      return `${t.txnRef}: ${c?.note ?? 'SLA breached'}`;
    }),
  };
}

function turnaround(db: Db, r: DateRange): Report {
  const groups = new Map<
    string,
    { level: number; label: string; approver: string; mins: number[] }
  >();
  for (const a of db.approvals) {
    if (a.action !== 'APPROVE' || a.levelNo < 2) continue;
    const d = isoDatePart(a.actedAt);
    if (d < r.from || d > r.to) continue;
    const prev = db.approvals.find(
      (x) =>
        x.txnId === a.txnId &&
        x.cycleNo === a.cycleNo &&
        x.levelNo === a.levelNo - 1 &&
        x.action === 'APPROVE'
    );
    if (!prev) continue;
    const key = `${a.levelNo}:${a.userId}`;
    if (!groups.has(key))
      groups.set(key, {
        level: a.levelNo,
        label: APPROVAL_LEVELS[a.levelNo - 1].label,
        approver: userName(db, a.userId),
        mins: [],
      });
    groups.get(key)!.mins.push(minutesBetween(prev.actedAt, a.actedAt));
  }
  const rows: ReportRow[] = [...groups.values()]
    .sort((a, b) => a.level - b.level || a.approver.localeCompare(b.approver))
    .map((g) => ({
      level: `${g.level} – ${g.label}`,
      approver: g.approver,
      count: g.mins.length,
      avg: Math.round(g.mins.reduce((s, x) => s + x, 0) / g.mins.length),
      min: Math.min(...g.mins),
      max: Math.max(...g.mins),
    }));
  return {
    ...base('TURNAROUND', r),
    summary: [
      {
        label: 'Signatures',
        value: rows.reduce((s, x) => s + Number(x.count), 0),
        format: 'count',
      },
      {
        label: 'Average per level',
        value: rows.length
          ? formatDuration(
              rows.reduce((s, x) => s + Number(x.avg) * Number(x.count), 0) /
                Math.max(
                  1,
                  rows.reduce((s, x) => s + Number(x.count), 0)
                )
            )
          : '—',
        format: 'text',
      },
    ],
    columns: [
      { key: 'level', label: 'Level', format: 'text' },
      { key: 'approver', label: 'Approver', format: 'text' },
      { key: 'count', label: 'Signed', format: 'count' },
      { key: 'avg', label: 'Average', format: 'duration' },
      { key: 'min', label: 'Fastest', format: 'duration' },
      { key: 'max', label: 'Slowest', format: 'duration' },
    ],
    rows,
    totals: null,
    chart: {
      type: 'bar',
      xKey: 'level',
      series: [{ key: 'avg', label: 'Average minutes' }],
      data: rows.map((x) => ({ level: String(x.level), avg: Number(x.avg) })),
    },
    notes: ['Turnaround is measured from the previous level’s signature.'],
  };
}

function register(db: Db, r: DateRange): Report {
  const rows: ReportRow[] = db.txns
    .filter((t) => isoDatePart(t.createdAt) >= r.from && isoDatePart(t.createdAt) <= r.to)
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt))
    .map((t) => {
      const vs = vouchersOf(db, t);
      const sumOf = (k: keyof Voucher) => add(ZERO, ...vs.map((v) => String(v[k])));
      return {
        created: t.createdAt,
        txnRef: t.txnRef,
        customer: customerOf(db, t)?.customerName ?? '',
        scenario: scenarioLabel(t.scenarioCode),
        status: t.status,
        vouchers: vs.map((v) => v.voucherNo).join(', ') || '—',
        principal: vs.length ? sumOf('principalAmt') : t.headlineAmt,
        interest: sumOf('interestAmt'),
        wht: sumOf('whtAmt'),
        charge: sumOf('chargeAmt'),
        fee: sumOf('feeAmt'),
        net: sumOf('netAmt'),
      };
    });
  const money = ['principal', 'interest', 'wht', 'charge', 'fee', 'net'];
  const totals: ReportRow = {
    created: 'Total',
    ...Object.fromEntries(money.map((k) => [k, add(ZERO, ...rows.map((x) => String(x[k])))])),
  };
  return {
    ...base('REGISTER', r),
    summary: [{ label: 'Transactions', value: rows.length, format: 'count' }],
    columns: [
      { key: 'created', label: 'Created', format: 'datetime' },
      { key: 'txnRef', label: 'Transaction', format: 'text' },
      { key: 'customer', label: 'Customer', format: 'text' },
      { key: 'scenario', label: 'Type', format: 'text' },
      { key: 'status', label: 'Status', format: 'text' },
      { key: 'vouchers', label: 'Vouchers', format: 'text' },
      { key: 'principal', label: 'Principal', format: 'money' },
      { key: 'interest', label: 'Interest', format: 'money' },
      { key: 'wht', label: 'WHT', format: 'money' },
      { key: 'charge', label: 'Charge', format: 'money' },
      { key: 'fee', label: 'Fee', format: 'money' },
      { key: 'net', label: 'Net', format: 'money' },
    ],
    rows,
    totals,
    chart: null,
    notes: ['Principal shows the instructed amount for transactions without vouchers yet.'],
  };
}

function exceptions(db: Db, r: DateRange): Report {
  const inRange = (iso: string | null) =>
    !!iso && isoDatePart(iso) >= r.from && isoDatePart(iso) <= r.to;
  const rows: ReportRow[] = [];
  for (const t of db.txns) {
    const cust = customerOf(db, t)?.customerName ?? '';
    if (t.status === 'STOPPED' && inRange(t.updatedAt))
      rows.push({
        at: t.updatedAt,
        kind: 'Stopped',
        txnRef: t.txnRef,
        customer: cust,
        by: userName(db, t.makerId),
        reason: t.stopReason ?? '',
      });
    if (t.status === 'CANCELLED' && inRange(t.updatedAt))
      rows.push({
        at: t.updatedAt,
        kind: 'Cancelled',
        txnRef: t.txnRef,
        customer: cust,
        by: userName(db, t.makerId),
        reason: t.rejectReason ?? '',
      });
    for (const a of db.approvals.filter(
      (x) =>
        x.txnId === t.id && (x.action === 'RETURN' || x.action === 'REJECT') && inRange(x.actedAt)
    )) {
      rows.push({
        at: a.actedAt,
        kind: a.action === 'RETURN' ? 'Returned' : 'Rejected',
        txnRef: t.txnRef,
        customer: cust,
        by: `${userName(db, a.userId)} (${APPROVAL_LEVELS[a.levelNo - 1].label})`,
        reason: a.comments,
      });
    }
  }
  rows.sort((a, b) => String(b.at).localeCompare(String(a.at)));
  const count = (k: string) => rows.filter((x) => x.kind === k).length;
  return {
    ...base('EXCEPTIONS', r),
    summary: ['Stopped', 'Returned', 'Rejected', 'Cancelled'].map((k) => ({
      label: k,
      value: count(k),
      format: 'count' as const,
    })),
    columns: [
      { key: 'at', label: 'When', format: 'datetime' },
      { key: 'kind', label: 'Exception', format: 'text' },
      { key: 'txnRef', label: 'Transaction', format: 'text' },
      { key: 'customer', label: 'Customer', format: 'text' },
      { key: 'by', label: 'By', format: 'text' },
      { key: 'reason', label: 'Reason', format: 'text' },
    ],
    rows,
    totals: null,
    chart: {
      type: 'bar',
      xKey: 'kind',
      series: [{ key: 'n', label: 'Count' }],
      data: ['Stopped', 'Returned', 'Rejected', 'Cancelled'].map((k) => ({ kind: k, n: count(k) })),
    },
    notes: [],
  };
}

// ─── Service ─────────────────────────────────────────────────────────────────

export const mockReportsService: ReportsService = {
  run: (code, range) =>
    run(() => {
      const db = getDb();
      switch (code) {
        case 'POSITION':
          return position(db, range);
        case 'MATURITY_PROFILE':
          return maturityProfile(db);
        case 'CHARGES':
          return charges(db, range);
        case 'WHT':
          return whtSchedule(db, range);
        case 'SLA':
          return slaPerformance(db, range);
        case 'TURNAROUND':
          return turnaround(db, range);
        case 'REGISTER':
          return register(db, range);
        case 'EXCEPTIONS':
          return exceptions(db, range);
      }
    }),
  aumTrend: () =>
    run(() => {
      const db = getDb();
      const today = todayLagos();
      const points: AumPoint[] = [];
      for (let i = 11; i >= 1; i--) {
        const d = endOfMonth(addMonths(today, -i));
        points.push({
          month: d.slice(0, 7),
          label: monthShort(d),
          date: d,
          aum: aumAsOf(db.investments, d),
        });
      }
      points.push({
        month: today.slice(0, 7),
        label: monthShort(today),
        date: today,
        aum: aumAsOf(db.investments, today),
      });
      return points;
    }),
};

export const httpReportsService: ReportsService = {
  run: (code, range) => http.get(`/reports/${code}`, { ...range }),
  aumTrend: () => http.get('/reports/aum-trend'),
};

export const reportsService: ReportsService = USE_MOCK ? mockReportsService : httpReportsService;
