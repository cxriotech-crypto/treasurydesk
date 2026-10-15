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
  await S.transactionsService.refreshFromCbs(t.id);
  await S.transactionsService.confirmCbs(t.id, {
    cbsSyncedAt: nowIso(),
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
  t = await S.transactionsService.signAndSubmit(t.id, { signatureName: to.fullName, pin: '1234' });
  if (t.status !== 'PENDING_ACCOUNT_OFFICER')
    throw new Error(`${s}: expected to go to the Account Officer, got ${t.status}`);

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

  await accountOfficerCheck();
  for (const role of ['HT', 'MIS', 'AUD', 'MD'] as RoleCode[]) {
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

  // Operations: one officer keys the posting, a different one approves it.
  const [ops1, ops2] = db().users.filter((u) => u.roleCode === 'OPS' && u.status === 'ACTIVE');
  const setRate = async (rate: number) => {
    await as('ADM');
    const st = await S.settingsService.get();
    await S.settingsService.update(
      { ...st.values, gapsFailureRate: rate },
      'Flow check',
      st.version
    );
  };
  const key = async (ref: string) => {
    await as(ops1.id);
    t = await S.operationsService.prepare(t.id, ref);
  };
  const approveAsSecond = async () => {
    await as(ops2.id);
    const r = await S.operationsService.approve(t.id);
    t = r.txn;
    return r;
  };
  if (o.gapsFailFirst) {
    await setRate(100);
    await key('EZB-FLOW-1');
    await as(ops1.id);
    await expectBlocked(
      `${s}: the officer who keyed a posting cannot approve it`,
      S.operationsService.approve(t.id)
    );
    const r = await approveAsSecond();
    if (r.ok || r.txn.status !== 'EXEC_FAILED') throw new Error(`${s}: GAPS failure not recorded`);
    await setRate(0);
  }
  await key('EZB-FLOW-2');
  const r = await approveAsSecond();
  if (!r.ok) throw new Error(`${s}: execution did not succeed`);
  await as('TO');
  t = await S.transactionsService.confirmCompletion(t.id);
  const d = await S.transactionsService.get(t.id);
  const notPassed = d.controls.filter((c) => c.state !== 'PASSED').map((c) => c.controlCode);
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

  // 2d. Paper signature: the maker uploads the scan for an approver who cannot sign in the app.
  try {
    const atHt = db().txns.find(
      (t) => t.status === 'PENDING_HEAD_TREASURY' && t.makerId === userOf('TO').id
    )!;
    await as('TO');
    await expectBlocked(
      'A paper signature needs the signed scan',
      S.transactionsService.recordPaperApproval(atHt.id, {
        signedBy: userOf('HT').id,
        reason: 'Travelling',
        documents: [],
      })
    );
    const t = await S.transactionsService.recordPaperApproval(atHt.id, {
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
    });
    const ap = db().approvals.find(
      (a) => a.txnId === atHt.id && a.roleCode === 'HT' && a.channel === 'PAPER'
    );
    t.status === 'PENDING_MIS' &&
    ap?.userId === userOf('HT').id &&
    ap.recordedBy === userOf('TO').id
      ? pass('A paper signature completes the step in the approver’s name', 'moved to MIS')
      : fail('A paper signature completes the step', t.status);
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
