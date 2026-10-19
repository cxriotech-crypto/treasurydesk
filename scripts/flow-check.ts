/*
 * End-to-end workflow check through the service layer, signing in as each role in turn:
 * all 15 scenarios from draft to COMPLETED, plus return/resubmit, reject, stop, call-back failure,
 * GAPS failure + retry and maker-checker blocks. Exit code 1 on any failure.
 */
import * as S from '../src/services';
import { getDb } from '../src/data/store';
import { verifyAuditChain } from '../src/data/audit';
import {
  APPROVAL_LEVELS,
  SCENARIO_CODES,
  SCENARIO_META,
  chainLevels,
  type RoleCode,
  type ScenarioCode,
} from '../src/domain/codes';
import { accountIneligibility, investmentIneligibility } from '../src/domain/rules';
import type { TreasuryTxn, TxnInput } from '../src/domain/types';
import { isoDatePart, isoTimePart, nextBusinessDay, nowIso, todayLagos } from '../src/lib/dates';
import { add, gt, sub } from '../src/lib/money';
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
    case 'COT':
      return { valueDate: bizDay(), amount: '10000000.00', cotRatePerMille: '5' };
    case 'INFLOW':
      if (s === 'INFLOW_ACCOUNT')
        return { valueDate: bizDay(), amount: '3000000.00', creditTo: 'PA' };
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
  /** Called once the transaction is ready to sign (before anything moves). */
  onPrepared?: (t: TreasuryTxn) => void;
  external?: boolean;
  callbackFailFirst?: boolean;
  returnAtMis?: boolean;
  gapsFailFirst?: boolean;
}

/** A new maturity on a weekend or holiday blocks signing: accept the suggestion, as a user would. */
async function acceptMaturityPrompt(txnId: string) {
  const txn = db().txns.find((x) => x.id === txnId)!;
  const prev = await S.transactionsService.preview(txnId, txn.input);
  if (!prev.maturityPrompt) return;
  await S.transactionsService.saveDraft(txnId, {
    input: { ...txn.input, [prev.maturityPrompt.field]: prev.maturityPrompt.suggestedTenorDays },
  });
}

/** Take a scenario from a new draft to ready-to-sign (instruction, signature, Eazybankz). */
async function prepareScenario(s: ScenarioCode, o: RunOpts = {}) {
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
  // A bank charge (COT) has no customer instruction or signature to check.
  if (SCENARIO_META[s].instruction !== false) {
    await S.transactionsService.recordInstruction(t.id, {
      channel: 'LETTER',
      receivedDate: isoDatePart(now),
      receivedTime: isoTimePart(now),
      amount: t.headlineAmt !== '0.00' ? t.headlineAmt : '1000000.00',
      purpose: 'Flow check',
      documents: [
        { fileName: 'letter.pdf', mimeType: 'application/pdf', sizeBytes: 120_000, dataUrl: null },
        {
          fileName: 'letter-page-2.pdf',
          mimeType: 'application/pdf',
          sizeBytes: 90_000,
          dataUrl: null,
        },
      ],
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
  }
  await S.transactionsService.refreshFromCbs(t.id);
  await S.transactionsService.confirmCbs(t.id, {
    fundsReceived: true,
    sourceConfirmed: true,
  });
  await acceptMaturityPrompt(t.id);
  const prev = await S.transactionsService.preview(
    t.id,
    db().txns.find((x) => x.id === t.id)!.input
  );
  if (Object.keys(prev.errors).length)
    throw new Error(`${s} voucher errors: ${JSON.stringify(prev.errors)}`);
  t = db().txns.find((x) => x.id === t.id)!;
  return { t, to, cust };
}

/** Drive one scenario all the way to COMPLETED. Returns the final transaction. */
async function runScenario(s: ScenarioCode, o: RunOpts = {}): Promise<TreasuryTxn> {
  const prepared = await prepareScenario(s, o);
  const { to, cust } = prepared;
  let t = prepared.t;
  o.onPrepared?.(t);
  const route = chainLevels(s);
  t = await S.transactionsService.signAndSubmit(t.id, { signatureName: to.fullName, pin: '1234' });
  const firstStatus = APPROVAL_LEVELS[route[1] - 1].pendingStatus;
  if (t.status !== firstStatus)
    throw new Error(`${s}: expected ${firstStatus} after submission, got ${t.status}`);

  // The customer's Account Officer calls, then checks: approve, return or reject.
  const accountOfficerCheck = async () => {
    const ao = await as(cust.accountOfficerId);
    const cb = {
      phoneCalled: cust.regPhone,
      callDate: isoDatePart(nowIso()),
      callTime: isoTimePart(nowIso()),
      officerId: ao.id,
    };
    if (o.callbackFailFirst && t.cycleNo === 1) {
      await S.callbacksService.log(t.id, {
        ...cb,
        amountOk: false,
        instrOk: false,
        benefOk: false,
        purposeOk: false,
        outcome: 'UNREACHABLE',
        notes: 'No answer',
      });
      await expectBlocked(
        `${s}: the Account Officer cannot approve without a confirmed call`,
        S.approvalsService.approve(t.id, { signatureName: ao.fullName, pin: '1234' })
      );
    }
    await S.callbacksService.log(t.id, {
      ...cb,
      amountOk: true,
      instrOk: true,
      benefOk: true,
      purposeOk: true,
      outcome: 'CONFIRMED',
      notes: '',
    });
    t = await S.approvalsService.approve(t.id, { signatureName: ao.fullName, pin: '1234' });
  };
  const signAt = async (role: RoleCode) => {
    const u = await as(role);
    if (role === 'AUD') {
      await expectBlocked(
        `${s}: Audit cannot sign before re-verifying the signature`,
        S.approvalsService.approve(t.id, { signatureName: u.fullName, pin: '1234' })
      );
      await S.transactionsService.auditVerify(t.id, {
        sigOk: true,
        mandateOk: true,
        ownershipOk: true,
        completeOk: true,
      });
    }
    t = await S.approvalsService.approve(t.id, { signatureName: u.fullName, pin: '1234' });
  };

  if (route.includes(2)) await accountOfficerCheck();
  const later = APPROVAL_LEVELS.filter((l) => l.levelNo > 2 && route.includes(l.levelNo)).map(
    (l) => l.roleCode as RoleCode
  );
  for (const role of later) {
    if (o.returnAtMis && role === 'MIS' && t.cycleNo === 1) {
      await as('MIS');
      t = await S.approvalsService.returnToMaker(t.id, 'Please correct the remarks');
      const m = await as('TO');
      t = await S.transactionsService.signAndSubmit(t.id, {
        signatureName: m.fullName,
        pin: '1234',
      });
      // A resubmission starts again from the Account Officer, not from MIS.
      if (t.status !== 'PENDING_ACCOUNT_OFFICER')
        fail(`${s}: resubmission restarts from the Account Officer`, t.status);
      else pass(`${s}: resubmission restarts from the Account Officer`, `cycle ${t.cycleNo}`);
      await accountOfficerCheck();
      await signAt('HT');
    }
    await signAt(role);
  }
  if (t.status !== 'PENDING_OPERATIONS')
    throw new Error(`${s}: expected PENDING_OPERATIONS, got ${t.status}`);

  // Operations: one officer pays in GAPS and records the outcome, a different one approves the record.
  const [ops1, ops2] = db().users.filter((u) => u.roleCode === 'OPS' && u.status === 'ACTIVE');
  const viaGaps = (await S.transactionsService.get(t.id)).gapsRequired;
  const record = async (rec: Parameters<typeof S.operationsService.record>[1]) => {
    await as(ops1.id);
    t = await S.operationsService.record(t.id, rec);
  };
  const approveAsSecond = async () => {
    await as(ops2.id);
    const r = await S.operationsService.approve(t.id);
    t = r.txn;
    return r;
  };
  if (o.gapsFailFirst) {
    await as(ops1.id);
    await expectBlocked(
      `${s}: a failed payment cannot be recorded without a reason`,
      S.operationsService.record(t.id, { outcome: 'FAILED', failureReason: ' ' })
    );
    await record({ outcome: 'FAILED', failureReason: 'Destination bank not available' });
    await as(ops1.id);
    await expectBlocked(
      `${s}: the officer who recorded a payment cannot approve it`,
      S.operationsService.approve(t.id)
    );
    const r = await approveAsSecond();
    if (r.ok || r.txn.status !== 'EXEC_FAILED')
      throw new Error(`${s}: failed payment not confirmed`);
    pass(
      `${s}: a failed GAPS payment is recorded with its reason`,
      r.execution.failureReason ?? ''
    );
    if (db().executions.some((e) => e.txnId === t.id && e.status === 'SUCCESS'))
      fail(`${s}: no money effect for a failed payment`, 'a SUCCESS execution exists');
  }
  if (viaGaps) {
    await as(ops1.id);
    await expectBlocked(
      `${s}: a paid GAPS payment needs the GAPS reference`,
      S.operationsService.record(t.id, { outcome: 'SUCCESS', cbsPostingRef: 'EZB-FLOW-2' })
    );
  }
  await record({
    outcome: 'SUCCESS',
    cbsPostingRef: 'EZB-FLOW-2',
    gapsRef: viaGaps ? 'GAPS-FLOW-2' : undefined,
  });
  if (viaGaps) {
    const m = await as('TO');
    if (t.makerId === m.id)
      await expectBlocked(
        `${s}: the maker cannot recall once Operations recorded it as paid`,
        S.transactionsService.recall(t.id, 'Too late')
      );
  }
  const r = await approveAsSecond();
  if (!r.ok) throw new Error(`${s}: execution did not succeed`);
  await as('TO');
  t = await S.transactionsService.confirmCompletion(t.id);
  const d = await S.transactionsService.get(t.id);
  const notPassed = d.controls
    .filter((c) => c.state !== 'PASSED' && c.state !== 'NOT_REQUIRED')
    .map((c) => c.controlCode);
  if (notPassed.length) throw new Error(`${s}: controls not passed: ${notPassed.join(',')}`);
  if (d.vouchers.map((v) => v.voucherType).join('+') !== SCENARIO_META[s].vouchers.join('+'))
    throw new Error(`${s}: wrong vouchers`);
  return t;
}

async function main() {
  // Always start from a fresh seed, with no simulated latency.
  await as('ADM');
  await S.settingsService.resetDemoData();
  await as('ADM');
  const st = await S.settingsService.get();
  await S.settingsService.update({ ...st.values, demoLatencyMs: 0 }, 'Flow check', st.version);

  // 1. Every scenario end to end (inflow first so a reversal target exists).
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
      let paBefore = '';
      let srcBefore = '';
      const t = await runScenario(s, {
        ...opts,
        onPrepared: (x) => {
          srcBefore = db().accounts.find((a) => a.id === x.sourceAccountId)?.availableBal ?? '';
          paBefore =
            db().accounts.find((a) => a.customerId === x.customerId && a.productCode === 'PA')
              ?.availableBal ?? '';
        },
      });
      const d = db();
      let effect = '';
      const orig = d.investments.find((i) => i.id === t.investmentId);
      const created = d.investments.length - beforeInv;
      switch (SCENARIO_META[s].txnType) {
        case 'COT': {
          const cot = d.vouchers.find((v) => v.txnId === t.id)!.cotAmt;
          if (cot !== '50000.00') throw new Error(`COT ${cot}, expected 50000.00`);
          if (s === 'COT_CMS') {
            const now = d.accounts.find((a) => a.id === t.sourceAccountId)!.availableBal;
            if (now !== sub(srcBefore, cot))
              throw new Error(`Call / CMS account not debited (${srcBefore} → ${now})`);
          }
          effect = `₦50,000 COT at ₦5 per mille · Treasury Officer → Head of Treasury → Operations`;
          break;
        }
        case 'INFLOW':
          if (s === 'INFLOW_ACCOUNT') {
            const pa = d.accounts.find(
              (a) => a.customerId === t.customerId && a.productCode === 'PA'
            )!;
            if (created !== 0) throw new Error('a credit to an account created an investment');
            if (!paBefore || pa.availableBal !== add(paBefore, '3000000.00'))
              throw new Error(`Personal Account not credited (${paBefore} → ${pa.availableBal})`);
            const skipped = d.approvals.filter(
              (a) => a.txnId === t.id && [2, 4, 5, 6].includes(a.levelNo)
            );
            if (skipped.length) throw new Error('levels outside its route signed');
            effect = 'Personal Account credited · Treasury Officer → Head of Treasury → Operations';
            break;
          }
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

  // 2b. Batching: several submitted with one signature; each level decides per item.
  try {
    const ready = [];
    for (const sc of ['TRANSFER_SS_PA', 'THIRD_PARTY_INT', 'TRANSFER_PA_CALL'] as ScenarioCode[])
      ready.push(await prepareScenario(sc));
    const to = await as('TO');
    const res = await S.batchesService.submit(
      ready.map((x) => x.t.id),
      { signatureName: to.fullName, pin: '1234' },
      'Flow check batch'
    );
    res.batch && res.submitted.length === 3
      ? pass('A batch is submitted with one signature', `${res.batch.batchRef}: 3 items`)
      : fail('A batch is submitted with one signature', JSON.stringify(res.failed));
    // Each customer's Account Officer calls and decides on their own items: two go on, one back.
    for (const [i, x] of ready.entries()) {
      const ao = await as(x.cust.accountOfficerId);
      await S.callbacksService.log(x.t.id, {
        phoneCalled: x.cust.regPhone,
        callDate: isoDatePart(nowIso()),
        callTime: isoTimePart(nowIso()),
        officerId: ao.id,
        amountOk: true,
        instrOk: true,
        benefOk: true,
        purposeOk: true,
        outcome: 'CONFIRMED',
        notes: '',
      });
      await S.batchesService.decide(
        res.batch!.id,
        [
          i === 2
            ? { txnId: x.t.id, action: 'RETURN', comment: 'Customer wants a different tenor' }
            : { txnId: x.t.id, action: 'APPROVE' },
        ],
        { signatureName: ao.fullName, pin: '1234' }
      );
    }
    // Head of Treasury decides on what reached them, together.
    const ht = await as('HT');
    const at = await S.batchesService.get(res.batch!.id);
    const mine = at.items.filter((x) => x.canDecide);
    const decided = await S.batchesService.decide(
      res.batch!.id,
      mine.map((x, i) =>
        i === 0
          ? { txnId: x.id, action: 'APPROVE' as const }
          : {
              txnId: x.id,
              action: 'REJECT' as const,
              comment: 'Duplicate of an earlier instruction',
            }
      ),
      { signatureName: ht.fullName, pin: '1234' }
    );
    const final = await S.batchesService.get(res.batch!.id);
    const status = (id: string) => final.items.find((x) => x.id === id)?.status;
    status(ready[0].t.id) === 'PENDING_MIS' &&
    status(ready[1].t.id) === 'REJECTED' &&
    status(ready[2].t.id) === 'RETURNED' &&
    decided.done.length === 2
      ? pass(
          'Approved items move on, returned and rejected ones go back',
          'MIS · rejected · returned to maker'
        )
      : fail(
          'Approved items move on, returned and rejected ones go back',
          ready.map((x) => status(x.t.id)).join(', ')
        );
  } catch (e) {
    fail('Batching', (e as Error).message);
  }

  // 2c. Recall: the maker recalls; someone else asks and the maker sends it back to them.
  try {
    const own = db().txns.find((t) => t.status === 'PENDING_MIS' && t.makerId === userOf('TO').id)!;
    await as('TO');
    const back = await S.transactionsService.recall(own.id, 'Customer changed the payment date');
    back.status === 'RETURNED'
      ? pass('The maker can recall a submitted transaction', `${back.txnRef} back with the maker`)
      : fail('The maker can recall a submitted transaction', back.status);

    const atMd = db().txns.find((t) => t.status === 'PENDING_MD')!;
    await as('AUD');
    const req = await S.transactionsService.requestRecall(
      atMd.id,
      'I need to re-check the mandate before the MD signs'
    );
    await as('TO');
    await S.transactionsService.decideRecall(req.id, 'TO_REQUESTER', '');
    const after = db().txns.find((t) => t.id === atMd.id)!;
    const audSig = db().approvals.find(
      (a) =>
        a.txnId === atMd.id &&
        a.cycleNo === after.cycleNo &&
        a.roleCode === 'AUD' &&
        a.action === 'APPROVE'
    );
    after.status === 'PENDING_AUDIT' && audSig?.superseded
      ? pass(
          'A recall request can send it back to the person who asked',
          'back with Internal Audit'
        )
      : fail('A recall request can send it back to the person who asked', after.status);
  } catch (e) {
    fail('Recall', (e as Error).message);
  }

  // 2d. Paper signature: the maker uploads the scan and the step is done; the named approver can dispute it.
  try {
    const mine = (t: TreasuryTxn) =>
      t.status === 'PENDING_HEAD_TREASURY' &&
      t.makerId === userOf('TO').id &&
      chainLevels(t.scenarioCode).includes(4);
    const [atHt, second] = db().txns.filter(mine);
    const paperFor = (txnId: string) => ({
      signedBy: userOf('HT').id,
      reason: 'Travelling; signed the printed voucher',
      documents: [
        { fileName: 'signed.pdf', mimeType: 'application/pdf', sizeBytes: 200_000, dataUrl: null },
        {
          fileName: 'signed-p2.pdf',
          mimeType: 'application/pdf',
          sizeBytes: 150_000,
          dataUrl: null,
        },
      ],
      txnId,
    });
    await as('TO');
    await expectBlocked(
      'A paper signature needs the signed scan',
      S.transactionsService.recordPaperApproval(atHt.id, {
        signedBy: userOf('HT').id,
        reason: 'Travelling',
        documents: [],
      })
    );
    const { txnId: _a, ...args } = paperFor(atHt.id);
    const t = await S.transactionsService.recordPaperApproval(atHt.id, args);
    const ap = db().approvals.find(
      (a) => a.txnId === atHt.id && a.roleCode === 'HT' && a.channel === 'PAPER'
    );
    t.status === 'PENDING_MIS' &&
    ap?.userId === userOf('HT').id &&
    ap.recordedBy === userOf('TO').id
      ? pass("The upload completes the step in the approver's name", 'moved to MIS')
      : fail("The upload completes the step in the approver's name", t.status);
    db().notifications.some(
      (n) =>
        n.targetUserId === userOf('HT').id && n.title.startsWith('Signed on paper in your name')
    )
      ? pass('The approver named on it is told', userOf('HT').fullName)
      : fail('The approver named on it is told', 'no notification');
    const paper = db().paperSignatures.find((x) => x.txnId === atHt.id && x.status === 'RECORDED')!;
    await as('TO');
    await expectBlocked(
      'Only the named approver can confirm a paper signature',
      S.transactionsService.confirmPaperSignature(paper.id)
    );
    await as('HT');
    await S.transactionsService.confirmPaperSignature(paper.id);
    db().paperSignatures.find((x) => x.id === paper.id)?.status === 'CONFIRMED'
      ? pass('The approver confirms it is theirs', 'confirmed')
      : fail('The approver confirms it is theirs', 'not confirmed');

    if (!second) throw new Error('No second transaction at Head of Treasury for the dispute check');
    await as('TO');
    const { txnId: _b, ...args2 } = paperFor(second.id);
    await S.transactionsService.recordPaperApproval(second.id, args2);
    const p2 = db().paperSignatures.find((x) => x.txnId === second.id && x.status === 'RECORDED')!;
    await as('HT');
    await S.transactionsService.disputePaperSignature(p2.id, 'I did not sign this voucher');
    const after = db().txns.find((x) => x.id === second.id)!;
    const ap2 = db().approvals.find((a) => a.id === p2.approvalId);
    after.status === 'PENDING_HEAD_TREASURY' &&
    ap2?.superseded &&
    db().paperSignatures.find((x) => x.id === p2.id)?.status === 'DISPUTED' &&
    db().notifications.some(
      (n) => n.targetRole === 'AUD' && n.title.startsWith('Disputed paper signature')
    )
      ? pass(
          'A disputed paper signature comes back to the approver and alerts Internal Audit',
          after.txnRef
        )
      : fail(
          'A disputed paper signature comes back to the approver and alerts Internal Audit',
          after.status
        );
  } catch (e) {
    fail('Paper signature', (e as Error).message);
  }

  // 2e. Several supporting documents at once; a weekend maturity is caught before signing.
  try {
    const any = db().txns.find((t) => t.status === 'PENDING_MIS')!;
    await as('MIS');
    const added = await S.transactionsService.addDocuments(any.id, [
      { fileName: 'a.pdf', mimeType: 'application/pdf', sizeBytes: 10_000, dataUrl: null },
      { fileName: 'b.png', mimeType: 'image/png', sizeBytes: 10_000, dataUrl: null },
      { fileName: 'c.jpg', mimeType: 'image/jpeg', sizeBytes: 10_000, dataUrl: null },
    ]);
    added.length === 3
      ? pass('Several supporting documents can be added at once', '3 attached')
      : fail('Several supporting documents', String(added.length));

    const { t } = await prepareScenario('INFLOW');
    // Find a tenor that lands on a Saturday, and check the voucher refuses it.
    const eff = t.input.valueDate!;
    let tenor = 90;
    while (
      new Date(`${eff}T12:00:00Z`).getTime() + tenor * 864e5 &&
      new Date(new Date(`${eff}T12:00:00Z`).getTime() + tenor * 864e5).getUTCDay() !== 6
    )
      tenor++;
    const prev = await S.transactionsService.preview(t.id, { ...t.input, newTenorDays: tenor });
    prev.maturityPrompt &&
    prev.errors.newTenorDays &&
    prev.maturityPrompt.suggestedTenorDays === tenor + 2
      ? pass(
          'A weekend maturity is caught and the next business day suggested',
          prev.errors.newTenorDays
        )
      : fail('A weekend maturity is caught', JSON.stringify(prev.maturityPrompt));
  } catch (e) {
    fail('Documents and weekend maturity', (e as Error).message);
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

  // 2h. One voucher per transaction; partial pre-liquidation adds the net interest to the rebooked principal.
  try {
    const one = ['ROLLOVER_B', 'ROLLOVER_C', 'ROLLOVER_D', 'PRELIQ_PARTIAL'].map((s) => {
      const t = db().txns.find((x) => x.scenarioCode === s && x.status === 'COMPLETED')!;
      return { s, n: db().vouchers.filter((v) => v.txnId === t.id).length, t };
    });
    one.every((x) => x.n === 1)
      ? pass(
          'A transaction that pays out and rolls over issues one voucher',
          one.map((x) => x.s).join(', ')
        )
      : fail('One voucher per transaction', one.map((x) => `${x.s}:${x.n}`).join(', '));
    const pp = one.find((x) => x.s === 'PRELIQ_PARTIAL')!.t;
    const v = db().vouchers.find((x) => x.txnId === pp.id)!;
    const row = (label: string) => v.rows.find((r) => r.label === label)?.value ?? '';
    const want = add(
      sub(row('Remaining principal'), row('Less charge') || '0'),
      sub(row('Accrued interest'), v.whtAmt)
    );
    v.rollAmt === want && gt(row('Accrued interest'), '0')
      ? pass(
          'Partial pre-liquidation: accrued interest (less WHT) is added to the rebooked principal',
          `rebooked ${v.rollAmt}`
        )
      : fail('Partial pre-liquidation capitalises interest', `${v.rollAmt} vs ${want}`);
  } catch (e) {
    fail('One voucher per transaction', (e as Error).message);
  }

  // 2g. Commission on turnover is its own transaction: rate per mille × turnover ÷ 1,000, rate chosen each time.
  try {
    await as('TO');
    const acc = db().accounts.find(
      (a) => a.productCode === 'CA' && a.status === 'ACTIVE' && gt(a.availableBal, '2000000')
    )!;
    const draft = await S.transactionsService.create({
      scenarioCode: 'COT_CMS',
      customerId: acc.customerId,
      sourceAccountId: acc.id,
      input: { amount: '1000000.00' },
    });
    draft.status === 'VERIFICATION'
      ? pass(
          'A COT charge needs no customer instruction or signature check',
          'starts at verification'
        )
      : fail('A COT charge starts at verification', draft.status);
    const at = async (input: Record<string, unknown>) =>
      S.transactionsService.preview(draft.id, { amount: '1000000.00', ...input });
    const none = await at({});
    none.errors.cotRatePerMille
      ? pass('The COT rate must be chosen on each transaction', none.errors.cotRatePerMille)
      : fail('The COT rate must be chosen on each transaction', 'no error raised');
    const two = await at({ cotRatePerMille: '2' });
    const five = await at({ cotRatePerMille: '5' });
    two.vouchers[0].cotAmt === '2000.00' && five.vouchers[0].cotAmt === '5000.00'
      ? pass(
          'COT on ₦1,000,000 of turnover: ₦2,000 at ₦2, ₦5,000 at ₦5 per mille',
          `${two.vouchers[0].voucherType} voucher`
        )
      : fail('COT amounts', `${two.vouchers[0].cotAmt} / ${five.vouchers[0].cotAmt}`);
    const bad = await at({ cotRatePerMille: '0' });
    bad.errors.cotRatePerMille
      ? pass('A COT rate must be more than 0', bad.errors.cotRatePerMille)
      : fail('A COT rate must be more than 0', 'no error raised');
    const off = await at({ cotOn: false });
    off.errors.cotOffReason && !off.errors.cotRatePerMille
      ? pass('Switching COT off needs a reason (and no rate)', off.errors.cotOffReason)
      : fail('Switching COT off needs a reason', JSON.stringify(off.errors));
    const waived = await at({ cotOn: false, cotOffReason: 'Waived by the MD' });
    !Object.keys(waived.errors).length &&
    waived.vouchers[0].cotAmt === '0.00' &&
    waived.vouchers[0].rows.some((r) => r.note === 'Switched off: Waived by the MD')
      ? pass('With a reason, COT is switched off and the reason is on the voucher', '₦0.00')
      : fail('COT switched off with a reason', JSON.stringify(waived.errors));
    await S.transactionsService.cancel(draft.id, 'flow check');
    // No other transaction carries COT any more.
    const tp = await S.transactionsService.create({
      scenarioCode: 'THIRD_PARTY_EXT',
      customerId: acc.customerId,
      sourceAccountId: acc.id,
      input: { amount: '1000000.00' },
    });
    const plain = await S.transactionsService.preview(tp.id, { amount: '1000000.00' });
    plain.vouchers[0].cotAmt === '0.00' &&
    !plain.vouchers[0].rows.some((r) => r.label.includes('COT'))
      ? pass('A payment out of a Call / CMS account carries no COT', 'COT is its own transaction')
      : fail('No COT on other transactions', plain.vouchers[0].cotAmt);
    await S.transactionsService.cancel(tp.id, 'flow check');
  } catch (e) {
    fail('Commission on turnover', (e as Error).message);
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

  // 2f. Audit-trail review: Internal Audit verifies or flags entries; never their own.
  try {
    const aud = await as('AUD');
    const others = db()
      .audit.filter((e) => e.userId !== aud.id)
      .slice(-3)
      .map((e) => e.id);
    const own = db().audit.find((e) => e.userId === aud.id)!;
    await expectBlocked(
      'Flagging an audit entry needs a reason',
      S.auditService.review([others[0]], 'FLAGGED', ' ')
    );
    const r = await S.auditService.review([...others, own.id], 'VERIFIED', '');
    r.done.length === 3 && r.skipped.length === 1 && r.skipped[0].reason === 'your own action'
      ? pass('Audit marks selected entries verified, never their own', `${r.done.length} verified`)
      : fail('Audit marks selected entries verified, never their own', JSON.stringify(r));
    await S.auditService.review([others[0]], 'FLAGGED', 'Needs the call recording');
    const flagged = await S.auditService.list({ filters: { review: 'FLAGGED' } });
    const row = flagged.items.find((x) => x.id === others[0]);
    row?.review?.status === 'FLAGGED' && row.review.reviewedByName === aud.fullName
      ? pass('Each entry shows its review status and who set it', `#${row.seqNo} flagged`)
      : fail('Each entry shows its review status and who set it', String(row?.review?.status));
    await as('MIS');
    await expectBlocked(
      'Only Internal Audit reviews audit entries',
      S.auditService.review([others[1]], 'VERIFIED', '')
    );
  } catch (e) {
    fail('Audit review', (e as Error).message);
  }

  // 3. Integrity.
  const chain = verifyAuditChain(db().audit);
  chain.ok ? pass('Audit hash chain', chain.message) : fail('Audit hash chain', chain.message);

  for (const r of results)
    console.log(`${r.ok ? 'PASS' : 'FAIL'}  ${r.name}${r.note ? ` — ${r.note}` : ''}`);
  console.log(
    `\n${completed}/${SCENARIO_CODES.length} scenarios completed end to end · ${results.filter((r) => r.ok).length}/${results.length} checks PASS`
  );
  if (results.some((r) => !r.ok)) process.exit(1);
}

main().catch((e) => {
  console.error('FLOW CHECK CRASHED:', e);
  process.exit(1);
});
