/*
 * Builds the demo seed by replaying the workflow engine, checks invariants and prints counts.
 * Exit code 1 on any violation.
 */
import { buildSeed } from '../src/data/seed';
import type { Db } from '../src/data/db';
import { verifyAuditChain } from '../src/data/audit';
import {
  CONTROL_CODES,
  SCENARIO_CODES,
  TXN_STATUSES,
  TXN_TYPES,
  type ControlCode,
  type TxnStatus,
} from '../src/domain/codes';
import { addDays, lagosDateTime, todayLagos } from '../src/lib/dates';
import { isCanonicalMoney } from '../src/lib/money';

const problems: string[] = [];
const fail = (msg: string) => problems.push(msg);

function countBy<T>(items: T[], key: (t: T) => string): Record<string, number> {
  const out: Record<string, number> = {};
  for (const it of items) out[key(it)] = (out[key(it)] ?? 0) + 1;
  return out;
}

function table(title: string, rows: Record<string, number>, order?: readonly string[]) {
  console.log(`\n${title}`);
  const keys = order ? [...order] : Object.keys(rows).sort();
  for (const k of keys) console.log(`  ${k.padEnd(28)} ${String(rows[k] ?? 0).padStart(4)}`);
  console.log(
    `  ${'TOTAL'.padEnd(28)} ${String(Object.values(rows).reduce((a, b) => a + b, 0)).padStart(4)}`
  );
}

// Controls that must be PASSED for each status (the rest PENDING, except noted failures).
const PASSED_FOR: Partial<Record<TxnStatus, ControlCode[]>> = {
  DRAFT: [],
  PENDING_HEAD_TREASURY: ['C01', 'C02', 'C03', 'C04', 'C05', 'C06'],
  PENDING_MIS: ['C01', 'C02', 'C03', 'C04', 'C05', 'C06', 'C07'],
  PENDING_AUDIT: ['C01', 'C02', 'C03', 'C04', 'C05', 'C06', 'C07', 'C08'],
  PENDING_MD: ['C01', 'C02', 'C03', 'C04', 'C05', 'C06', 'C07', 'C08', 'C09'],
  PENDING_OPERATIONS: ['C01', 'C02', 'C03', 'C04', 'C05', 'C06', 'C07', 'C08', 'C09', 'C10'],
  EXEC_FAILED: ['C01', 'C02', 'C03', 'C04', 'C05', 'C06', 'C07', 'C08', 'C09', 'C10'],
  EXECUTED: ['C01', 'C02', 'C03', 'C04', 'C05', 'C06', 'C07', 'C08', 'C09', 'C10', 'C11'],
};

function checkInvariants(db: Db) {
  // id + version on every record
  for (const [name, rows] of Object.entries(db)) {
    if (!Array.isArray(rows)) continue;
    for (const r of rows as { id?: unknown; version?: unknown }[]) {
      if (typeof r.id !== 'string' || !r.id) fail(`${name}: record without id`);
      if (typeof r.version !== 'number' || r.version < 1)
        fail(`${name}/${String(r.id)}: bad version`);
    }
  }
  // Unique references
  const uniq = (label: string, vals: string[]) => {
    const seen = new Set<string>();
    for (const v of vals) {
      if (seen.has(v)) fail(`Duplicate ${label}: ${v}`);
      seen.add(v);
    }
  };
  uniq(
    'txnRef',
    db.txns.map((t) => t.txnRef)
  );
  uniq(
    'voucherNo',
    db.vouchers.map((v) => v.voucherNo)
  );
  uniq(
    'investmentRef',
    db.investments.map((i) => i.investmentRef)
  );
  uniq(
    'cifNo',
    db.customers.map((c) => c.cifNo)
  );
  uniq(
    'accountNo',
    db.accounts.map((a) => a.accountNo)
  );

  // Money strings
  const money = (label: string, v: unknown) => {
    if (!isCanonicalMoney(v)) fail(`${label}: not a 2-dp money string (${JSON.stringify(v)})`);
  };
  db.accounts.forEach((a) => {
    money(`account ${a.accountNo} ledgerBal`, a.ledgerBal);
    money(`account ${a.accountNo} availableBal`, a.availableBal);
    if (Number(a.availableBal) < 0) fail(`account ${a.accountNo} negative balance`);
  });
  db.investments.forEach((i) => {
    money(`${i.investmentRef} principalAmt`, i.principalAmt);
    money(`${i.investmentRef} intPaidToDate`, i.intPaidToDate);
  });
  db.txns.forEach((t) => money(`${t.txnRef} headlineAmt`, t.headlineAmt));
  db.instructions.forEach((i) => money(`instruction ${i.id} amount`, i.amount));
  db.vouchers.forEach((v) => {
    for (const k of [
      'principalAmt',
      'interestAmt',
      'whtAmt',
      'chargeAmt',
      'feeAmt',
      'netAmt',
      'rollAmt',
      'projectedInterest',
    ] as const) {
      money(`${v.voucherNo} ${k}`, v[k]);
    }
    if (v.payment) {
      money(`${v.voucherNo} payment.amount`, v.payment.amount);
      money(`${v.voucherNo} payment.transferCharge`, v.payment.transferCharge);
    }
  });

  // Maker-checker and single signature per user per cycle
  for (const t of db.txns) {
    const aps = db.approvals.filter((a) => a.txnId === t.id);
    for (const a of aps) {
      if (a.levelNo > 1 && a.userId === t.makerId)
        fail(`${t.txnRef}: maker acted at level ${a.levelNo}`);
      if (a.levelNo === 1 && a.userId !== t.makerId)
        fail(`${t.txnRef}: level 1 not signed by maker`);
    }
    const byCycle = countBy(aps, (a) => `${a.cycleNo}:${a.userId}`);
    for (const [k, n] of Object.entries(byCycle))
      if (n > 1) fail(`${t.txnRef}: user signed twice in cycle (${k})`);

    // Controls
    const ctl = db.controls.filter((c) => c.txnId === t.id);
    if (ctl.length !== 12) fail(`${t.txnRef}: expected 12 controls, found ${ctl.length}`);
    const state = (code: ControlCode) => ctl.find((c) => c.controlCode === code)?.state;
    const expected = PASSED_FOR[t.status];
    if (expected) {
      for (const code of CONTROL_CODES) {
        const want = expected.includes(code) ? 'PASSED' : 'PENDING';
        if (state(code) !== want)
          fail(`${t.txnRef} (${t.status}): ${code} is ${state(code)}, expected ${want}`);
      }
    }
    if (t.status === 'COMPLETED') {
      for (const code of CONTROL_CODES.slice(0, 11))
        if (state(code) !== 'PASSED') fail(`${t.txnRef}: ${code} not passed`);
      if (state('C12') === 'PENDING') fail(`${t.txnRef}: C12 still pending`);
      if (!t.completedAt) fail(`${t.txnRef}: completedAt missing`);
    }
    if (t.status === 'STOPPED' && state('C02') !== 'FAILED')
      fail(`${t.txnRef}: stopped without C02 failed`);
    if (t.status === 'REJECTED' && !ctl.some((c) => c.state === 'FAILED'))
      fail(`${t.txnRef}: rejected without a failed control`);
    if (!['DRAFT', 'CANCELLED', 'STOPPED'].includes(t.status) && !t.slaDueAt)
      fail(`${t.txnRef}: slaDueAt missing`);
    // Vouchers issued once submitted
    const submitted = !['DRAFT', 'VERIFICATION', 'STOPPED', 'CANCELLED'].includes(t.status);
    const vs = db.vouchers.filter((v) => v.txnId === t.id);
    if (submitted && vs.length === 0) fail(`${t.txnRef}: no vouchers`);
  }

  // One open transaction per investment
  const open = db.txns.filter(
    (t) => t.investmentId && !['COMPLETED', 'REJECTED', 'CANCELLED', 'STOPPED'].includes(t.status)
  );
  const perInv = countBy(open, (t) => t.investmentId!);
  for (const [inv, n] of Object.entries(perInv))
    if (n > 1) fail(`Investment ${inv} has ${n} open transactions`);

  // Audit chain
  const integrity = verifyAuditChain(db.audit);
  if (!integrity.ok) fail(`Audit chain: ${integrity.message}`);
  return integrity;
}

// ─── Run ─────────────────────────────────────────────────────────────────────

const nowMs = Math.floor(Date.now() / 60_000) * 60_000;
const t0 = Date.now();
const db = buildSeed({ nowMs });
const ms = Date.now() - t0;
const again = buildSeed({ nowMs });
if (JSON.stringify(db) !== JSON.stringify(again))
  fail('Seed is not deterministic: two builds differ');

const integrity = checkInvariants(db);
const T = db.seedDate;

console.log(
  `TreasuryDesk seed — as of ${db.seededAt} (built in ${ms} ms, deterministic: ${problems.some((p) => p.startsWith('Seed is not')) ? 'NO' : 'yes'})`
);

table(
  'Transactions by status',
  countBy(db.txns, (t) => t.status),
  TXN_STATUSES
);
table(
  'Transactions by type',
  countBy(db.txns, (t) => t.txnType),
  TXN_TYPES
);
table(
  'Transactions by scenario',
  countBy(db.txns, (t) => t.scenarioCode),
  SCENARIO_CODES
);

const byStatus = countBy(db.txns, (t) => t.status);
for (const s of TXN_STATUSES) if (!byStatus[s]) fail(`No transaction in status ${s}`);
for (const s of ['PENDING_HEAD_TREASURY', 'PENDING_MIS', 'PENDING_AUDIT', 'PENDING_MD'] as const) {
  if ((byStatus[s] ?? 0) < 8) fail(`Fewer than 8 transactions in ${s}`);
}
const byType = countBy(db.txns, (t) => t.txnType);
for (const t of TXN_TYPES) if (!byType[t]) fail(`No transaction of type ${t}`);
if (db.txns.length !== 60) fail(`Expected 60 transactions, found ${db.txns.length}`);

const breaches = db.controls.filter((c) => c.controlCode === 'C12' && c.state === 'FAILED').length;
const cycle2 = db.txns.filter((t) => t.cycleNo > 1).length;
const failedExec = db.executions.filter((e) => e.status === 'FAILED').length;
console.log(
  `\nSLA breaches (C12 failed): ${breaches} · resubmitted after return: ${cycle2} · GAPS failures logged: ${failedExec}`
);
if (breaches !== 3) fail(`Expected 3 SLA breaches, found ${breaches}`);

table(
  'Investments by status',
  countBy(db.investments, (i) => i.status)
);
table(
  'Investments by product',
  countBy(db.investments, (i) => i.productCode)
);
if (db.investments.length !== 120) fail(`Expected 120 investments, found ${db.investments.length}`);

const live = db.investments.filter((i) => i.status === 'ACTIVE');
const dist = {
  'Mature today': live.filter((i) => i.maturityDate === T).length,
  'Mature in 1–7 days': live.filter((i) => i.maturityDate > T && i.maturityDate <= addDays(T, 7))
    .length,
  'Mature in 8–30 days': live.filter(
    (i) => i.maturityDate > addDays(T, 7) && i.maturityDate <= addDays(T, 30)
  ).length,
  'Matured, awaiting instruction': db.investments.filter((i) => i.status === 'MATURED').length,
  'Anniversary due ≤ 14 days': live.filter(
    (i) => i.nextAnnivDate && i.nextAnnivDate <= addDays(T, 14)
  ).length,
};
console.log('\nMaturity profile (as of today)');
for (const [k, v] of Object.entries(dist))
  console.log(`  ${k.padEnd(32)} ${String(v).padStart(4)}`);
if (dist['Matured, awaiting instruction'] < 10)
  fail('Fewer than 10 matured investments awaiting instruction');
if (dist['Anniversary due ≤ 14 days'] < 15) fail('Fewer than 15 anniversaries due within 14 days');
if (dist['Mature in 1–7 days'] < 18) fail('Fewer than 18 maturities in the next 7 days');

const earliest = db.investments.reduce((m, i) => (i.effectiveDate < m ? i.effectiveDate : m), T);
console.log(`  ${'Earliest effective date'.padEnd(32)} ${earliest}`);
if (earliest > addDays(T, -365)) fail('Investment history covers less than 12 months');

console.log('\nReference data');
const cust = countBy(db.customers, (c) => c.customerType);
console.log(
  `  Users ${db.users.length} · Banks ${db.banks.length} (${db.banks.filter((b) => !b.active).length} inactive) · Holidays ${db.holidays.length}`
);
console.log(
  `  Customers ${db.customers.length} (IND ${cust.IND}, CORP ${cust.CORP}, WHT-exempt ${db.customers.filter((c) => c.whtExempt).length})`
);
console.log(
  `  Signatories ${db.signatories.length} · Mandates ${db.mandates.length} · Accounts ${db.accounts.length} · Beneficiaries ${db.beneficiaries.length}`
);
console.log(
  `  Vouchers ${db.vouchers.length} · Approvals ${db.approvals.length} · Call-backs ${db.callbacks.length} · Executions ${db.executions.length}`
);
console.log(
  `  Notifications ${db.notifications.length} · Audit events ${db.audit.length} (${integrity.message})`
);
if (db.users.length !== 11) fail('Expected 11 users');
if (db.banks.length !== 20) fail('Expected 20 banks');
if (db.customers.length !== 40 || cust.IND !== 28 || cust.CORP !== 12)
  fail('Expected 40 customers (28 IND, 12 CORP)');
if (db.customers.filter((c) => c.whtExempt).length !== 6) fail('Expected 6 WHT-exempt customers');
if (db.beneficiaries.length !== 25) fail('Expected 25 beneficiaries');

// Robustness: the replay must succeed at any time of day, on weekdays and weekends.
const base = todayLagos(nowMs);
const anchors = [
  lagosDateTime(base, '06:30'),
  lagosDateTime(base, '09:05'),
  lagosDateTime(base, '13:40'),
  lagosDateTime(base, '16:55'),
  lagosDateTime(base, '23:50'),
  ...[1, 2, 3, 4, 5, 6].map((d) => lagosDateTime(addDays(base, d), '11:00')),
];
let robust = 0;
for (const a of anchors) {
  try {
    const d = buildSeed({ nowMs: Date.parse(a) });
    const before = problems.length;
    checkInvariants(d);
    if (problems.length > before)
      problems.push(`  ↳ invariant problems above were for anchor ${a}`);
    else robust += 1;
  } catch (e) {
    fail(`Replay at ${a} failed: ${(e as Error).message}`);
  }
}
console.log(
  `\nReplay at ${anchors.length} other clock times (incl. weekends): ${robust}/${anchors.length} OK`
);

if (problems.length) {
  console.log(`\n${problems.length} problem(s):`);
  for (const p of problems.slice(0, 60)) console.log(`  - ${p}`);
  process.exit(1);
}
console.log('\nAll seed checks PASS');
