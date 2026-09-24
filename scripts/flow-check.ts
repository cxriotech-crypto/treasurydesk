/*
 * End-to-end workflow check through the service layer, signing in as each role in turn:
 * all 15 scenarios from draft to COMPLETED, plus return/resubmit, reject, stop, call-back failure,
 * GAPS failure + retry and maker-checker blocks. Exit code 1 on any failure.
 */
import * as S from '../src/services';
import { getDb } from '../src/data/store';
import { verifyAuditChain } from '../src/data/audit';
import {
  SCENARIO_CODES,
  SCENARIO_META,
  type RoleCode,
  type ScenarioCode,
} from '../src/domain/codes';
import { accountIneligibility, investmentIneligibility } from '../src/domain/rules';
import type { TreasuryTxn, TxnInput } from '../src/domain/types';
import { isoDatePart, isoTimePart, nextBusinessDay, nowIso, todayLagos } from '../src/lib/dates';
import { gt, sub } from '../src/lib/money';
import { LOCKING_STATUSES } from '../src/services/workflow';

const results: { name: string; ok: boolean; note: string }[] = [];
const pass = (name: string, note = '') => results.push({ name, ok: true, note });
const fail = (name: string, note: string) => results.push({ name, ok: false, note });

const db = () => getDb();
const userOf = (role: RoleCode) =>
  db().users.find((u) => u.roleCode === role && u.status === 'ACTIVE')!;

async function as(role: RoleCode | string) {
  const u = role.length <= 3 ? userOf(role as RoleCode) : db().users.find((x) => x.id === role)!;
  await S.authService.login(u.email, 'x');
  return S.authService.verifyOtp('123456');
}

async function expectBlocked(label: string, p: Promise<unknown>) {
  try {
    await p;
    fail(label, 'was allowed but should be blocked');
  } catch (e) {
    pass(label, (e as Error).message);
  }
}

const today = () => todayLagos();
const bizDay = () =>
  nextBusinessDay(
    today(),
    db().holidays.map((h) => h.holidayDate)
  );
const openOn = (invId: string) =>
  db().txns.some((t) => t.investmentId === invId && LOCKING_STATUSES.includes(t.status));
const used = new Set<string>();

function subjectFor(s: ScenarioCode): {
  customerId: string;
  investmentId?: string;
  sourceAccountId?: string;
  reversalOfTxnId?: string;
} {
  const meta = SCENARIO_META[s];
  if (meta.subject === 'INVESTMENT') {
    const inv = db().investments.find(
      (i) =>
        !used.has(i.customerId + i.id) &&
        !used.has(i.customerId) &&
        !investmentIneligibility(s, i, today(), openOn(i.id))
    );
    if (!inv) throw new Error(`No eligible investment for ${s}`);
    used.add(inv.customerId);
    return { customerId: inv.customerId, investmentId: inv.id };
  }
  if (meta.subject === 'ACCOUNT') {
    const acc = db().accounts.find(
      (a) => !used.has(a.customerId) && !accountIneligibility(s, a) && gt(a.availableBal, '5000000')
    );
    if (!acc) throw new Error(`No eligible account for ${s}`);
    used.add(acc.customerId);
    return { customerId: acc.customerId, sourceAccountId: acc.id };
  }
  if (meta.subject === 'TXN') {
    const t = db().txns.find((x) => {
      if (x.status !== 'COMPLETED' || !x.resultInvestmentId || x.reversedByTxnId) return false;
      const inv = db().investments.find((i) => i.id === x.resultInvestmentId);
      return (
        inv?.status === 'ACTIVE' &&
        !db().txns.some((r) => r.reversalOfTxnId === x.id && LOCKING_STATUSES.includes(r.status))
      );
    });
    if (!t) throw new Error('No reversible transaction');
    return { customerId: t.customerId, reversalOfTxnId: t.id };
  }
  const c = db().customers.find((x) => !used.has(x.id))!;
  used.add(c.id);
  return { customerId: c.id };
}

function inputFor(s: ScenarioCode, subj: ReturnType<typeof subjectFor>): TxnInput {
  const inv = db().investments.find((i) => i.id === subj.investmentId);
  switch (SCENARIO_META[s].txnType) {
    case 'ROLLOVER':
      return {
        newRate: '16.00',
        newTenorDays: 182,
        ...(s === 'ROLLOVER_C' ? { rollAmt: sub(inv!.principalAmt, '1000000') } : {}),
      };
    case 'PRELIQ':
      return s === 'PRELIQ_PARTIAL'
        ? { valueDate: bizDay(), amount: '1000000.00' }
        : { valueDate: bizDay() };
    case 'ANNIVERSARY':
      return { annivPeriod: (inv!.annivFreqDays || 30) as 30 | 60 | 90 };
    case 'THIRD_PARTY':
      return { valueDate: bizDay(), amount: '2000000.00' };
    case 'TRANSFER':
      if (s === 'TRANSFER_REVERSAL') return { correctedRate: '25.00' };
      if (s === 'TRANSFER_SS_PA') return { valueDate: bizDay(), amount: '100000.00' };
      return { valueDate: bizDay(), amount: '1000000.00', newRate: '17.50', newTenorDays: 90 };
    case 'INFLOW':
      return {
        valueDate: bizDay(),
        amount: '25000000.00',
        newRate: '18.00',
        newTenorDays: 180,
        productCode: 'TERM',
        annivFreqDays: 0,
      };
    default:
      return {};
  }
}

interface RunOpts {
  external?: boolean;
  /** Never call the customer: the call-back is recorded but does not block. */
  skipCallback?: boolean;
  callbackFailFirst?: boolean;
  returnAtMis?: boolean;
  gapsFailFirst?: boolean;
}

/** Drive one scenario all the way to COMPLETED. Returns the final transaction. */
async function runScenario(s: ScenarioCode, o: RunOpts = {}): Promise<TreasuryTxn> {
  const to = await as('TO');
  const subj = subjectFor(s);
  let t = await S.transactionsService.create({
    scenarioCode: s,
    ...subj,
    input: inputFor(s, subj),
  });
  const cust = db().customers.find((c) => c.id === subj.customerId)!;
  const now = nowIso();
  const hasFo = SCENARIO_META[s].vouchers.includes('FO');
  const external = s === 'THIRD_PARTY_EXT' || (hasFo && s !== 'THIRD_PARTY_INT' && !!o.external);
  const internalBenef =
    s === 'THIRD_PARTY_INT'
      ? db().accounts.find((a) => a.productCode === 'PA' && a.customerId !== cust.id)!
      : null;
  await S.transactionsService.recordInstruction(t.id, {
    channel: 'LETTER',
    receivedDate: isoDatePart(now),
    receivedTime: isoTimePart(now),
    amount: t.headlineAmt !== '0.00' ? t.headlineAmt : '1000000.00',
    purpose: 'Flow check',
    documentName: 'letter.pdf',
    documentData: null,
    payDestination: external ? 'EXTERNAL' : 'INTERNAL',
    benefName: external ? cust.customerName : (internalBenef?.accountName ?? null),
    bankCode: external ? '058' : null,
    accountNo: external ? '0123456789' : (internalBenef?.accountNo ?? null),
    accountType: external || internalBenef ? 'SAVINGS' : null,
  });
  await S.transactionsService.verifySignature(t.id, {
    sigOk: true,
    mandateOk: true,
    ownershipOk: true,
    completeOk: true,
  });
  // Call-back by the customer's Account Officer. It is recorded but never blocks, so a run can
  // skip it entirely and still reach COMPLETED with control C03 left outstanding.
  if (!o.skipCallback) await as(cust.accountOfficerId);
  const cb = {
    phoneCalled: cust.regPhone,
    callDate: isoDatePart(now),
    callTime: isoTimePart(now),
    officerId: cust.accountOfficerId,
  };
  if (o.callbackFailFirst && !o.skipCallback) {
    await S.callbacksService.log(t.id, {
      ...cb,
      amountOk: false,
      instrOk: false,
      benefOk: false,
      purposeOk: false,
      outcome: 'UNREACHABLE',
      notes: 'No answer',
    });
    // The call-back is recorded but does not block: an unconfirmed one still lets the maker on.
    await as('TO');
    const ctrl = db().controls.find((c) => c.txnId === t.id && c.controlCode === 'C03');
    if (ctrl?.state === 'PENDING')
      pass(`${s}: call-back stays outstanding after a failed call`, 'C03 PENDING');
    else fail(`${s}: call-back stays outstanding after a failed call`, String(ctrl?.state));
    await as(cust.accountOfficerId);
  }
  if (!o.skipCallback)
    await S.callbacksService.log(t.id, {
      ...cb,
      amountOk: true,
      instrOk: true,
      benefOk: true,
      purposeOk: true,
      outcome: 'CONFIRMED',
      notes: '',
    });
  await as('TO');
  await S.transactionsService.refreshFromCbs(t.id);
  await S.transactionsService.confirmCbs(t.id, {
    cbsSyncedAt: nowIso(),
    fundsReceived: true,
    sourceConfirmed: true,
  });
  const prev = await S.transactionsService.preview(t.id, t.input);
  if (Object.keys(prev.errors).length)
    throw new Error(`${s} voucher errors: ${JSON.stringify(prev.errors)}`);
  t = await S.transactionsService.signAndSubmit(t.id, { signatureName: to.fullName, pin: '1234' });

  for (const role of ['HT', 'MIS', 'AUD', 'MD'] as RoleCode[]) {
    const u = await as(role);
    if (o.returnAtMis && role === 'MIS' && t.cycleNo === 1) {
      t = await S.approvalsService.returnToMaker(t.id, 'Please correct the remarks');
      const m = await as('TO');
      t = await S.transactionsService.signAndSubmit(t.id, {
        signatureName: m.fullName,
        pin: '1234',
      });
      for (const r2 of ['HT', 'MIS'] as RoleCode[]) {
        const u2 = await as(r2);
        t = await S.approvalsService.approve(t.id, { signatureName: u2.fullName, pin: '1234' });
      }
      continue;
    }
    t = await S.approvalsService.approve(t.id, { signatureName: u.fullName, pin: '1234' });
  }
  if (t.status !== 'PENDING_OPERATIONS')
    throw new Error(`${s}: expected PENDING_OPERATIONS, got ${t.status}`);

  await as('OPS');
  const needsGaps = (await S.transactionsService.get(t.id)).gapsRequired;
  const setRate = async (rate: number) => {
    await as('ADM');
    const st = await S.settingsService.get();
    await S.settingsService.update(
      { ...st.values, gapsFailureRate: rate },
      'Flow check',
      st.version
    );
    await as('OPS');
  };
  if (needsGaps) {
    if (o.gapsFailFirst) {
      await setRate(100);
      const r = await S.operationsService.sendToGaps(t.id, 'EZB-FLOW-1');
      if (r.ok || r.txn.status !== 'EXEC_FAILED')
        throw new Error(`${s}: GAPS failure not recorded`);
      await setRate(0);
    }
    const r = await S.operationsService.sendToGaps(t.id, 'EZB-FLOW-2');
    if (!r.ok) throw new Error(`${s}: GAPS did not succeed`);
    t = r.txn;
  } else {
    t = (await S.operationsService.executeInternal(t.id, 'EZB-FLOW-3')).txn;
  }
  await as('TO');
  t = await S.transactionsService.confirmCompletion(t.id);
  const d = await S.transactionsService.get(t.id);
  // A skipped call-back leaves C03 outstanding on purpose; every other control must pass.
  const notPassed = d.controls
    .filter((c) => c.state !== 'PASSED' && !(o.skipCallback && c.controlCode === 'C03'))
    .map((c) => c.controlCode);
  if (notPassed.length) throw new Error(`${s}: controls not passed: ${notPassed.join(',')}`);
  if (d.vouchers.map((v) => v.voucherType).join('+') !== SCENARIO_META[s].vouchers.join('+'))
    throw new Error(`${s}: wrong vouchers`);
  return t;
}

async function main() {
  // Always start from a fresh seed, with GAPS never failing unless a test asks for it.
  await as('ADM');
  await S.settingsService.resetDemoData();
  await as('ADM');
  const st = await S.settingsService.get();
  await S.settingsService.update(
    { ...st.values, gapsFailureRate: 0, demoLatencyMs: 0 },
    'Flow check',
    st.version
  );

  // 1. All 15 scenarios end to end (inflow first so a reversal target exists).
  const order: ScenarioCode[] = ['INFLOW', ...SCENARIO_CODES.filter((s) => s !== 'INFLOW')];
  let completed = 0;
  for (const s of order) {
    try {
      const opts: RunOpts = {
        external: s === 'MATURITY' || s === 'ROLLOVER_B',
        gapsFailFirst: s === 'THIRD_PARTY_EXT',
        returnAtMis: s === 'PRELIQ_PARTIAL',
        callbackFailFirst: s === 'ANNIVERSARY',
      };
      const beforeInv = db().investments.length;
      const t = await runScenario(s, opts);
      const d = db();
      let effect = '';
      const orig = d.investments.find((i) => i.id === t.investmentId);
      const created = d.investments.length - beforeInv;
      switch (SCENARIO_META[s].txnType) {
        case 'INFLOW':
          if (created !== 1) throw new Error('inflow did not create an investment');
          effect = 'investment created';
          break;
        case 'MATURITY':
          if (orig?.status !== 'CLOSED') throw new Error('investment not closed');
          effect = 'investment closed';
          break;
        case 'PRELIQ':
          if (orig?.status !== 'LIQUIDATED') throw new Error('investment not liquidated');
          if (s === 'PRELIQ_PARTIAL' && created !== 1) throw new Error('no rebooked investment');
          effect = s === 'PRELIQ_PARTIAL' ? 'liquidated + rebooked' : 'liquidated';
          break;
        case 'ROLLOVER':
          if (orig?.status !== 'ROLLED_OVER' || created !== 1)
            throw new Error('rollover effects missing');
          effect = 'rolled over + new investment';
          break;
        case 'ANNIVERSARY':
          if (orig?.status !== 'ACTIVE' || orig.intPaidToDate === '0.00')
            throw new Error('anniversary not paid');
          effect = 'interest paid, still active';
          break;
        default:
          effect = created ? `${created} investment created` : 'balances moved';
      }
      completed += 1;
      pass(`${s} end to end`, `${t.txnRef} COMPLETED · ${effect}`);
    } catch (e) {
      fail(`${s} end to end`, (e as Error).message);
    }
  }

  // 2. Exceptions.
  try {
    const to = await as('TO');
    const subj = subjectFor('THIRD_PARTY_INT');
    const t = await S.transactionsService.create({
      scenarioCode: 'THIRD_PARTY_INT',
      ...subj,
      input: { valueDate: bizDay(), amount: '1000.00' },
    });
    const now = nowIso();
    await S.transactionsService.recordInstruction(t.id, {
      channel: 'EMAIL',
      receivedDate: isoDatePart(now),
      receivedTime: isoTimePart(now),
      amount: '1000.00',
      purpose: 'x',
      documentName: null,
      documentData: null,
      payDestination: 'INTERNAL',
      benefName: 'X',
      bankCode: null,
      accountNo: db().accounts.find(
        (a) => a.customerId !== subj.customerId && a.productCode === 'PA'
      )!.accountNo,
      accountType: 'SAVINGS',
    });
    const stopped = await S.transactionsService.stop(t.id, 'Signature differs');
    stopped.status === 'STOPPED'
      ? pass('Stop on signature mismatch', stopped.txnRef)
      : fail('Stop on signature mismatch', stopped.status);
    void to;
  } catch (e) {
    fail('Stop on signature mismatch', (e as Error).message);
  }

  try {
    const pending = db().txns.find((t) => t.status === 'PENDING_HEAD_TREASURY')!;
    await as('TO');
    await expectBlocked(
      'Maker cannot approve (role)',
      S.approvalsService.approve(pending.id, { signatureName: userOf('TO').fullName, pin: '1234' })
    );
    const ht = await as('HT');
    await expectBlocked(
      'Wrong PIN rejected',
      S.approvalsService.approve(pending.id, { signatureName: ht.fullName, pin: '0000' })
    );
    await expectBlocked('Reject needs a reason', S.approvalsService.reject(pending.id, ''));
    const r = await S.approvalsService.reject(pending.id, 'Outside pricing grid');
    r.status === 'REJECTED'
      ? pass('Reject closes the transaction', r.txnRef)
      : fail('Reject', r.status);
    const mis = await as('MIS');
    const other = db().txns.find((t) => t.status === 'PENDING_MIS')!;
    await S.approvalsService.approve(other.id, { signatureName: mis.fullName, pin: '1234' });
    await expectBlocked(
      'Same user cannot sign twice',
      S.approvalsService.approve(other.id, { signatureName: mis.fullName, pin: '1234' })
    );
    const q = await S.approvalsService.queue();
    const many = q.items.slice(0, 3).map((i) => i.id);
    const bulk = await S.approvalsService.bulkApprove(many, {
      signatureName: mis.fullName,
      pin: '1234',
    });
    bulk.approved.length === many.length
      ? pass('Bulk approve with one signature', `${bulk.approved.length} approved`)
      : fail('Bulk approve', JSON.stringify(bulk.failed));
  } catch (e) {
    fail('Approval exceptions', (e as Error).message);
  }

  // 2b. The call-back never blocks, and a switched-off deduction must be explained.
  try {
    const t = await runScenario('TRANSFER_SS_PA', { skipCallback: true });
    const c03 = db().controls.find((x) => x.txnId === t.id && x.controlCode === 'C03');
    t.status === 'COMPLETED' && c03?.state === 'PENDING'
      ? pass('Call-back does not block', `${t.txnRef} COMPLETED with C03 outstanding`)
      : fail('Call-back does not block', `${t.status} · C03 ${c03?.state}`);
  } catch (e) {
    fail('Call-back does not block', (e as Error).message);
  }

  try {
    await as('TO');
    const subj = subjectFor('PRELIQ_FULL');
    const t = await S.transactionsService.create({
      scenarioCode: 'PRELIQ_FULL',
      ...subj,
      input: { valueDate: bizDay(), preliqChargeOn: false },
    });
    const prev = await S.transactionsService.preview(t.id, t.input);
    prev.errors.preliqChargeOffReason
      ? pass('Switching off a charge needs a reason', prev.errors.preliqChargeOffReason)
      : fail('Switching off a charge needs a reason', 'no error raised');
    const ok = await S.transactionsService.preview(t.id, {
      ...t.input,
      preliqChargeOffReason: 'Head of Treasury waived it',
    });
    ok.errors.preliqChargeOffReason
      ? fail('A reason clears the error', ok.errors.preliqChargeOffReason)
      : pass('A reason clears the error', 'voucher is valid');
    await S.transactionsService.cancel(t.id, 'flow check');
  } catch (e) {
    fail('Switching off a charge needs a reason', (e as Error).message);
  }

  // 2c. Data import: Treasury uploads, Head of Treasury approves, records land.
  try {
    const to = await as('TO');
    const before = db().holidays.length;
    const batch = await S.importsService.create({
      register: 'HOLIDAYS',
      fileName: 'holidays.csv',
      rows: [
        { holidayDate: '2027-03-17', description: 'Flow check holiday' },
        { holidayDate: '2027-03-18', description: 'Flow check holiday 2' },
        { holidayDate: '2027-03-17', description: 'Duplicate of the first row' },
      ],
      rejectedRows: [],
    });
    batch.status === 'PENDING_APPROVAL'
      ? pass('Import waits for approval', `${batch.batchRef} uploaded by ${to.fullName}`)
      : fail('Import waits for approval', batch.status);
    db().holidays.length === before
      ? pass('Nothing is written before approval', `${before} holidays`)
      : fail('Nothing is written before approval', String(db().holidays.length));

    await expectBlocked(
      'A Treasury Officer cannot approve an import',
      S.importsService.decide(batch.id, 'APPROVE', { signatureName: to.fullName, pin: '1234' })
    );

    const ht = await as('HT');
    const applied = await S.importsService.decide(batch.id, 'APPROVE', {
      signatureName: ht.fullName,
      pin: '1234',
    });
    applied.status === 'APPLIED' &&
    applied.createdCount === 2 &&
    db().holidays.length === before + 2
      ? pass('Head of Treasury approves and the rows land', `${applied.createdCount} created`)
      : fail(
          'Head of Treasury approves and the rows land',
          `${applied.status} · ${applied.createdCount} created`
        );
    applied.skippedRows.length === 1
      ? pass('A duplicate row is skipped with a reason', applied.skippedRows[0].reason)
      : fail('A duplicate row is skipped with a reason', JSON.stringify(applied.skippedRows));
  } catch (e) {
    fail('Data import', (e as Error).message);
  }

  // 3. Integrity.
  const chain = verifyAuditChain(db().audit);
  chain.ok ? pass('Audit hash chain', chain.message) : fail('Audit hash chain', chain.message);

  for (const r of results)
    console.log(`${r.ok ? 'PASS' : 'FAIL'}  ${r.name}${r.note ? ` — ${r.note}` : ''}`);
  console.log(
    `\n${completed}/15 scenarios completed end to end · ${results.filter((r) => r.ok).length}/${results.length} checks PASS`
  );
  if (results.some((r) => !r.ok)) process.exit(1);
}

main().catch((e) => {
  console.error('FLOW CHECK CRASHED:', e);
  process.exit(1);
});
