/**
 * Voucher builder: turns a transaction's inputs into its voucher(s) with live figures from calc.ts.
 * Pure — used live by the wizard (preview) and by the workflow engine (on submission).
 */
import type {
  Account,
  Bank,
  Customer,
  Instruction,
  Investment,
  PaymentInstr,
  TreasuryTxn,
  Voucher,
  VoucherRow,
  VoucherRowFormat,
} from '@/domain/types';
import type { ScenarioCode, VoucherRowKind, VoucherType } from '@/domain/codes';
import { SCENARIO_META } from '@/domain/codes';
import { INTERNAL_BANK_CODE, INTERNAL_BANK_NAME } from '@/domain/rules';
import {
  calcAnniversary,
  calcInflow,
  calcMaturity,
  calcPreliqFull,
  calcPreliqPartial,
  calcReversal,
  calcRollover,
  calcThirdParty,
  calcTransfer,
  validateTransferDate,
  whtOn,
  type CalcEnv,
  type Errors,
  type Fig,
  type MaturityDateResult,
} from '@/lib/calc';
import { maxDate, nextBusinessDay } from '@/lib/dates';
import { formatNaira } from '@/lib/format';
import { ZERO, add, isPositive, toMoney } from '@/lib/money';

export type VoucherDraft = Omit<Voucher, 'id' | 'version' | 'voucherNo' | 'txnId' | 'createdAt'>;

export interface TxnCalcContext {
  txn: Pick<TreasuryTxn, 'scenarioCode' | 'input'>;
  customer: Customer;
  investment?: Investment | null;
  sourceAccount?: Account | null;
  /** Customer's PA — destination for internal payouts and CP/CALL funding. */
  customerPa?: Account | null;
  /** Customer's SS — destination for transfer A is the PA. */
  instruction?: Instruction | null;
  banks: Bank[];
  /** Reversal: the investment created by the original transaction. */
  originalInvestment?: Investment | null;
  /** Internal third-party: the credited account (looked up by account number). */
  internalBenefAccount?: Account | null;
  today: string;
}

export interface SummaryLine {
  label: string;
  value: string;
  format: VoucherRowFormat;
}

export interface TxnComputation {
  vouchers: VoucherDraft[];
  headlineAmt: string;
  errors: Errors;
  notes: string[];
  /** Short list of the key figures (dashboards, lists, confirmation dialogs). */
  summary: SummaryLine[];
}

// ─── Row helpers ─────────────────────────────────────────────────────────────

const money = (label: string, f: Fig, kind: VoucherRowKind = 'calc'): VoucherRow => ({
  label,
  value: f.value,
  format: 'money',
  kind,
  formula: f.formula,
});
const moneyIn = (label: string, v: string): VoucherRow => ({
  label,
  value: toMoney(v),
  format: 'money',
  kind: 'input',
});
const info = (
  label: string,
  value: string,
  format: VoucherRowFormat = 'text',
  note?: string
): VoucherRow => ({
  label,
  value,
  format,
  kind: 'info',
  ...(note ? { note } : {}),
});
const input = (label: string, value: string, format: VoucherRowFormat): VoucherRow => ({
  label,
  value,
  format,
  kind: 'input',
});
const total = (label: string, f: Fig): VoucherRow => money(label, f, 'total');
const maturityRow = (label: string, m: MaturityDateResult): VoucherRow => ({
  label,
  value: m.date,
  format: 'date',
  kind: 'calc',
  formula: m.adjusted ? m.reason! : 'Effective date + tenor',
  ...(m.adjusted ? { note: m.reason! } : {}),
});

function blankVoucher(type: VoucherType, seqNo: number, transferDate: string): VoucherDraft {
  return {
    seqNo,
    voucherType: type,
    principalAmt: ZERO,
    interestAmt: ZERO,
    whtAmt: ZERO,
    chargeAmt: ZERO,
    feeAmt: ZERO,
    netAmt: ZERO,
    rollAmt: ZERO,
    transferDate,
    effectiveDate: null,
    newRate: null,
    newTenorDays: null,
    newMaturityDate: null,
    projectedInterest: ZERO,
    remarks: '',
    rows: [],
    notes: [],
    payment: null,
  };
}

function bankName(banks: Bank[], code: string | null | undefined): string {
  if (!code) return '';
  if (code === INTERNAL_BANK_CODE) return INTERNAL_BANK_NAME;
  return banks.find((b) => b.bankCode === code)?.bankName ?? code;
}

/** Where money that leaves goes: external beneficiary from the instruction, or the customer's PA. */
function payment(c: TxnCalcContext, amount: string, charge = ZERO): PaymentInstr | null {
  const ins = c.instruction;
  if (ins && ins.payDestination === 'EXTERNAL' && ins.accountNo) {
    return {
      benefName: ins.benefName ?? '',
      bankCode: ins.bankCode ?? '',
      bankName: bankName(c.banks, ins.bankCode),
      accountNo: ins.accountNo,
      accountType: ins.accountType ?? 'SAVINGS',
      amount: toMoney(amount),
      transferCharge: toMoney(charge),
    };
  }
  if (c.txn.scenarioCode === 'THIRD_PARTY_INT' && ins?.accountNo) {
    return {
      benefName: ins.benefName ?? '',
      bankCode: INTERNAL_BANK_CODE,
      bankName: INTERNAL_BANK_NAME,
      accountNo: ins.accountNo,
      accountType: ins.accountType ?? 'SAVINGS',
      amount: toMoney(amount),
      transferCharge: toMoney(charge),
    };
  }
  const pa = c.customerPa;
  if (!pa) return null;
  return {
    benefName: c.customer.customerName,
    bankCode: INTERNAL_BANK_CODE,
    bankName: INTERNAL_BANK_NAME,
    accountNo: pa.accountNo,
    accountType: 'SAVINGS',
    amount: toMoney(amount),
    transferCharge: toMoney(charge),
  };
}

function paymentRemark(p: PaymentInstr | null, what: string): string {
  if (!p) return '';
  return `${what} to ${p.benefName}, ${p.bankName}, A/C ${p.accountNo}`;
}

function checkDate(
  errors: Errors,
  date: string,
  c: TxnCalcContext,
  env: CalcEnv,
  key = 'valueDate',
  label = 'Transfer date'
) {
  const msg = validateTransferDate(date, c.today, env.holidays);
  if (msg && !errors[key]) errors[key] = `${label}: ${msg.charAt(0).toLowerCase()}${msg.slice(1)}`;
}

function payDate(c: TxnCalcContext, env: CalcEnv, earliest?: string): string {
  const base = c.txn.input.valueDate ?? maxDate(c.today, earliest ?? c.today);
  return c.txn.input.valueDate ? base : nextBusinessDay(base, env.holidays);
}

/** Row label for withholding tax: says when it is exempt or switched off for this transaction. */
function whtLabel(exempt: boolean, env: CalcEnv, base = 'WHT'): string {
  if (exempt) return `${base} (exempt)`;
  if (!whtOn(env)) return `${base} (switched off)`;
  return base;
}

/** Row label for the pre-liquidation charge, showing the rate actually applied. */
function chargeLabel(env: CalcEnv): string {
  return env.preliqChargeOn === false
    ? 'Pre-liquidation charge (switched off)'
    : `Pre-liquidation charge (${env.settings.preliqChargeRate}%)`;
}

function requireInv(c: TxnCalcContext): Investment {
  if (!c.investment) throw new Error('Investment is required for this scenario');
  return c.investment;
}

// ─── Builder ─────────────────────────────────────────────────────────────────

export function computeTxn(c: TxnCalcContext, baseEnv: CalcEnv): TxnComputation {
  const s = c.txn.scenarioCode;
  const i = c.txn.input;
  // The transaction's own withholding-tax and pre-liquidation-charge switches (default on).
  const env: CalcEnv = { ...baseEnv, whtOn: i.whtOn, preliqChargeOn: i.preliqChargeOn };
  const exempt = c.customer.whtExempt;
  const purpose = c.instruction?.purpose ?? '';
  const withPurpose = (r: string) => [r, purpose].filter(Boolean).join('. ');
  const errors: Errors = {};
  const notes: string[] = [];
  const vouchers: VoucherDraft[] = [];
  let headlineAmt = ZERO;
  const summary: SummaryLine[] = [];
  const types = SCENARIO_META[s].vouchers;

  switch (s) {
    case 'INFLOW': {
      const eff = i.valueDate ?? c.today;
      const r = calcInflow(
        {
          principal: i.amount ?? '',
          rate: i.newRate ?? '',
          tenorDays: i.newTenorDays ?? NaN,
          effectiveDate: eff,
          whtExempt: exempt,
        },
        env
      );
      Object.assign(errors, r.errors);
      if (r.maturity.adjusted) notes.push(r.maturity.reason!);
      const v = blankVoucher('FI', 1, eff);
      Object.assign(v, {
        principalAmt: r.principal.value,
        interestAmt: r.projectedInterest.value,
        whtAmt: r.wht.value,
        netAmt: r.netMaturityValue.value,
        effectiveDate: eff,
        newRate: i.newRate ?? null,
        newTenorDays: i.newTenorDays ?? null,
        newMaturityDate: r.maturity.date,
        projectedInterest: r.projectedInterest.value,
        remarks: withPurpose(i.remarks ?? 'New investment'),
        notes: [...notes],
        rows: [
          info('Customer', `${c.customer.customerName} (${c.customer.cifNo})`),
          moneyIn('Amount received', r.principal.value),
          input('Interest rate', i.newRate ?? '', 'rate'),
          input('Tenor', String(i.newTenorDays ?? ''), 'days'),
          input('Effective date', eff, 'date'),
          maturityRow('Maturity date', r.maturity),
          money('Projected interest', r.projectedInterest),
          money(whtLabel(exempt, env), r.wht),
          total('Net maturity value', r.netMaturityValue),
        ],
      });
      vouchers.push(v);
      headlineAmt = r.principal.value;
      summary.push(
        { label: 'Principal', value: r.principal.value, format: 'money' },
        { label: 'Maturity', value: r.maturity.date, format: 'date' }
      );
      break;
    }

    case 'MATURITY': {
      const inv = requireInv(c);
      const r = calcMaturity(inv, exempt, env);
      const date = payDate(c, env, inv.maturityDate);
      checkDate(errors, date, c, env);
      const pay = payment(c, r.net.value);
      const v = blankVoucher('FO', 1, date);
      Object.assign(v, {
        principalAmt: r.principal.value,
        interestAmt: r.interest.value,
        whtAmt: r.wht.value,
        netAmt: r.net.value,
        remarks: withPurpose(i.remarks ?? `Termination at maturity of ${inv.investmentRef}`),
        payment: pay,
        rows: [
          info('Investment', inv.investmentRef),
          money('Principal', r.principal, 'input'),
          money('Interest', r.interest),
          money(whtLabel(exempt, env), r.wht),
          total('Net payable', r.net),
          input('Transfer date', date, 'date'),
        ],
      });
      vouchers.push(v);
      headlineAmt = r.net.value;
      summary.push({ label: 'Net payable', value: r.net.value, format: 'money' });
      break;
    }

    case 'PRELIQ_FULL': {
      const inv = requireInv(c);
      const liq = i.valueDate ?? c.today;
      const r = calcPreliqFull(inv, liq, exempt, env);
      Object.assign(errors, r.errors);
      if (liq >= inv.maturityDate) errors.valueDate = 'Liquidation date must be before maturity';
      checkDate(errors, liq, c, env, 'valueDate', 'Liquidation date');
      const pay = payment(c, r.payout.value);
      const v = blankVoucher('FO', 1, liq);
      Object.assign(v, {
        principalAmt: r.principal.value,
        interestAmt: r.netInterest.value,
        whtAmt: r.wht.value,
        chargeAmt: r.charge.value,
        netAmt: r.payout.value,
        remarks: withPurpose(i.remarks ?? `Full pre-liquidation of ${inv.investmentRef}`),
        payment: pay,
        rows: [
          info('Investment', inv.investmentRef),
          input('Liquidation date', liq, 'date'),
          info('Days elapsed', String(r.daysElapsed), 'days'),
          money('Principal', r.principal, 'input'),
          money('Accrued interest', r.accrued),
          money(chargeLabel(env), r.charge),
          money('Net interest', r.netInterest),
          money(whtLabel(exempt, env), r.wht),
          total('Payout', r.payout),
        ],
      });
      vouchers.push(v);
      headlineAmt = r.payout.value;
      summary.push(
        { label: 'Payout', value: r.payout.value, format: 'money' },
        { label: 'Charge', value: r.charge.value, format: 'money' }
      );
      break;
    }

    case 'PRELIQ_PARTIAL': {
      const inv = requireInv(c);
      const liq = i.valueDate ?? c.today;
      const r = calcPreliqPartial(
        inv,
        {
          requested: i.amount ?? '',
          liquidationDate: liq,
          newRate: i.newRate,
          newTenorDays: i.newTenorDays,
        },
        exempt,
        env
      );
      Object.assign(errors, r.errors);
      if (liq >= inv.maturityDate) errors.valueDate = 'Liquidation date must be before maturity';
      checkDate(errors, liq, c, env, 'valueDate', 'Liquidation date');
      if (r.newMaturity.adjusted) notes.push(r.newMaturity.reason!);
      notes.push(r.policyNote);
      const pay = payment(c, r.totalPayout.value);
      const fo = blankVoucher('FO', 1, liq);
      Object.assign(fo, {
        principalAmt: r.payout.value,
        interestAmt: r.interestPaidOut.value,
        whtAmt: r.interestWht.value,
        chargeAmt: r.charge.value,
        netAmt: r.totalPayout.value,
        remarks: withPurpose(i.remarks ?? `Partial pre-liquidation of ${inv.investmentRef}`),
        payment: pay,
        notes: [r.policyNote],
        rows: [
          info('Investment', inv.investmentRef),
          input('Liquidation date', liq, 'date'),
          info('Days elapsed', String(r.daysElapsed), 'days'),
          money('Principal', r.principal, 'input'),
          money('Requested amount', r.requested, 'input'),
          money('Accrued interest', r.accrued),
          money(chargeLabel(env), r.charge),
          money('Payout', r.payout),
          ...(env.settings.partialPreliqInterest === 'PAID_OUT'
            ? [
                money(whtLabel(exempt, env, 'WHT on interest'), r.interestWht),
                money('Interest paid out', r.interestPaidOut),
              ]
            : []),
          total('Total payout', r.totalPayout),
        ],
      });
      const ro = blankVoucher('RO', 2, liq);
      Object.assign(ro, {
        principalAmt: r.remaining.value,
        chargeAmt: r.charge.value,
        rollAmt: r.rebooked.value,
        effectiveDate: liq,
        newRate: r.newRate,
        newTenorDays: r.newTenorDays,
        newMaturityDate: r.newMaturity.date,
        projectedInterest: r.projectedInterest.value,
        remarks: `Rebooking of ${inv.investmentRef} after partial pre-liquidation`,
        notes: r.newMaturity.adjusted ? [r.newMaturity.reason!] : [],
        rows: [
          money('Remaining principal', r.remaining),
          money('Less charge', r.charge),
          ...(env.settings.partialPreliqInterest === 'CAPITALISED'
            ? [
                money('Add interest (net of WHT)', {
                  value: add(r.accrued.value, `-${r.interestWht.value}`),
                  formula: 'Accrued interest − WHT',
                }),
              ]
            : []),
          total('Rebooked principal', r.rebooked),
          input('New effective date', liq, 'date'),
          input('New rate', r.newRate, 'rate'),
          input('New tenor', String(r.newTenorDays), 'days'),
          maturityRow('New maturity date', r.newMaturity),
          money('Projected interest', r.projectedInterest),
        ],
      });
      vouchers.push(fo, ro);
      headlineAmt = r.requested.value;
      summary.push(
        { label: 'Payout', value: r.totalPayout.value, format: 'money' },
        { label: 'Charge', value: r.charge.value, format: 'money' },
        { label: 'Rebooked', value: r.rebooked.value, format: 'money' }
      );
      break;
    }

    case 'ANNIVERSARY': {
      const inv = requireInv(c);
      const period = i.annivPeriod ?? (inv.annivFreqDays || 30);
      const r = calcAnniversary(inv, period, exempt, env);
      Object.assign(errors, r.errors);
      const date = payDate(c, env, r.currentAnnivDate);
      checkDate(errors, date, c, env);
      const pay = payment(c, r.net.value);
      const v = blankVoucher('FO', 1, date);
      Object.assign(v, {
        principalAmt: toMoney(inv.principalAmt),
        interestAmt: r.periodInterest.value,
        whtAmt: r.wht.value,
        netAmt: r.net.value,
        remarks: withPurpose(
          i.remarks ?? `${period}-day anniversary interest on ${inv.investmentRef}`
        ),
        payment: pay,
        notes: ['Investment remains active.'],
        rows: [
          info('Investment', inv.investmentRef),
          info('Principal', toMoney(inv.principalAmt), 'money'),
          input('Period', String(period), 'days'),
          info('Anniversary date', r.currentAnnivDate, 'date'),
          money('Period interest', r.periodInterest),
          money(whtLabel(exempt, env), r.wht),
          total('Net interest payable', r.net),
          info('Next anniversary date', r.nextAnnivDate, 'date'),
          input('Transfer date', date, 'date'),
        ],
      });
      vouchers.push(v);
      headlineAmt = r.net.value;
      summary.push({ label: 'Net interest', value: r.net.value, format: 'money' });
      break;
    }

    case 'ROLLOVER_A':
    case 'ROLLOVER_B':
    case 'ROLLOVER_C':
    case 'ROLLOVER_D': {
      const inv = requireInv(c);
      const letter = s.slice(-1) as 'A' | 'B' | 'C' | 'D';
      const newEff = i.valueDate ?? inv.maturityDate;
      const r = calcRollover(
        inv,
        {
          letter,
          newEffectiveDate: newEff,
          newRate: i.newRate ?? inv.intRate,
          newTenorDays: i.newTenorDays ?? inv.tenorDays,
          rollAmt: i.rollAmt,
        },
        exempt,
        env
      );
      Object.assign(errors, r.errors);
      if (r.newMaturity.adjusted) notes.push(r.newMaturity.reason!);
      const ro = blankVoucher('RO', letter === 'D' ? 2 : 1, newEff);
      Object.assign(ro, {
        principalAmt: r.principal.value,
        interestAmt: letter === 'A' ? r.interest.value : ZERO,
        whtAmt: letter === 'A' ? r.wht.value : ZERO,
        rollAmt: r.rollAmt.value,
        effectiveDate: newEff,
        newRate: r.newRate,
        newTenorDays: r.newTenorDays,
        newMaturityDate: r.newMaturity.date,
        projectedInterest: r.projectedInterest.value,
        notes: r.newMaturity.adjusted ? [r.newMaturity.reason!] : [],
        rows: [
          info('Investment', inv.investmentRef),
          money('Principal', r.principal, 'input'),
          ...(letter === 'A'
            ? [money('Interest', r.interest), money(whtLabel(exempt, env), r.wht)]
            : []),
          ...(letter === 'C' ? [money('Amount to roll', r.rollAmt, 'input')] : []),
          total('Roll-over amount', r.rollAmt),
          input('New effective date', newEff, 'date'),
          input('New rate', r.newRate, 'rate'),
          input('New tenor', String(r.newTenorDays), 'days'),
          maturityRow('New maturity date', r.newMaturity),
          money('Projected interest', r.projectedInterest),
        ],
      });
      const payoutAmt = r.totalPayout.value;
      if (letter === 'A') {
        ro.remarks = withPurpose(
          i.remarks ?? `Roll-over of principal and interest of ${inv.investmentRef}`
        );
        vouchers.push(ro);
      } else {
        const pay = payment(c, payoutAmt);
        const fo = blankVoucher(
          'FO',
          letter === 'D' ? 1 : 2,
          nextBusinessDay(maxDate(c.today, newEff), env.holidays)
        );
        checkDate(errors, fo.transferDate, c, env);
        const what = letter === 'C' ? 'Balance of principal and interest' : 'Interest';
        const autoRemark = paymentRemark(pay, what);
        Object.assign(fo, {
          principalAmt: r.principalPayout.value,
          interestAmt: r.interest.value,
          whtAmt: r.wht.value,
          netAmt: payoutAmt,
          payment: pay,
          // SOP: for rollover B the beneficiary details are written into the voucher remarks.
          remarks: withPurpose(i.remarks ?? autoRemark),
          rows: [
            info('Investment', inv.investmentRef),
            ...(letter === 'C' ? [money('Principal paid out', r.principalPayout)] : []),
            money('Interest', r.interest),
            money(whtLabel(exempt, env), r.wht),
            ...(letter === 'C' ? [money('Interest paid out', r.interestPayout)] : []),
            total('Net payable', r.totalPayout),
            input('Transfer date', fo.transferDate, 'date'),
          ],
        });
        ro.remarks = `Roll-over of ${letter === 'C' ? 'part of the ' : ''}principal of ${inv.investmentRef}`;
        vouchers.push(...(letter === 'D' ? [fo, ro] : [ro, fo]));
      }
      headlineAmt = r.principal.value;
      summary.push({ label: 'Roll-over', value: r.rollAmt.value, format: 'money' });
      if (isPositive(payoutAmt))
        summary.push({ label: 'Payout', value: payoutAmt, format: 'money' });
      break;
    }

    case 'THIRD_PARTY_EXT':
    case 'THIRD_PARTY_INT': {
      const src = c.sourceAccount;
      if (!src) throw new Error('Source account is required');
      const internal = s === 'THIRD_PARTY_INT';
      const r = calcThirdParty(i.amount ?? '', internal, env.settings, src.availableBal);
      Object.assign(errors, r.errors);
      const date = payDate(c, env);
      checkDate(errors, date, c, env);
      if (internal && c.instruction?.accountNo && !c.internalBenefAccount) {
        errors.accountNo = 'No internal account found with this number';
      }
      if (internal && c.internalBenefAccount && c.internalBenefAccount.id === src.id) {
        errors.accountNo = 'Beneficiary account cannot be the source account';
      }
      const pay = payment(c, r.toBeneficiary.value, r.fee.value);
      const auto = pay
        ? `${paymentRemark(pay, 'Pay')}${internal ? '' : `; transfer charge ${formatNaira(r.fee.value)}`}`
        : '';
      const v = blankVoucher('FO', 1, date);
      Object.assign(v, {
        principalAmt: r.amount.value,
        feeAmt: r.fee.value,
        netAmt: r.toBeneficiary.value,
        remarks: withPurpose(i.remarks ?? auto),
        payment: pay,
        rows: [
          info('Source account', `${src.accountNo} (${src.productCode})`),
          info('Available balance', src.availableBal, 'money'),
          money('Amount', r.amount, 'input'),
          money(
            internal ? 'Transfer charge' : `Transfer charge (${env.settings.transferFeeRate}%)`,
            r.fee
          ),
          money('To beneficiary', r.toBeneficiary),
          total('Total debit', r.totalDebit),
          input('Transfer date', date, 'date'),
        ],
      });
      vouchers.push(v);
      headlineAmt = r.amount.value;
      summary.push({ label: 'To beneficiary', value: r.toBeneficiary.value, format: 'money' });
      if (!internal) summary.push({ label: 'Charge', value: r.fee.value, format: 'money' });
      break;
    }

    case 'TRANSFER_SS_PA':
    case 'TRANSFER_PA_CP':
    case 'TRANSFER_PA_CALL': {
      const src = c.sourceAccount;
      if (!src) throw new Error('Source account is required');
      const r = calcTransfer(i.amount ?? '', src.availableBal);
      Object.assign(errors, r.errors);
      const date = payDate(c, env);
      checkDate(errors, date, c, env);
      const v = blankVoucher('TS', 1, date);
      const rows: VoucherRow[] = [
        info('Source account', `${src.accountNo} (${src.productCode})`),
        money('Available balance', r.available, 'info'),
        money('Amount', r.amount, 'input'),
        money('Source balance after', r.sourceAfter),
        input('Transfer date', date, 'date'),
      ];
      if (s === 'TRANSFER_SS_PA') {
        if (!c.customerPa) errors.destAccountId = 'Customer has no Personal Account';
        rows.splice(
          1,
          0,
          info('Destination account', c.customerPa ? `${c.customerPa.accountNo} (PA)` : '—')
        );
        v.remarks = withPurpose(i.remarks ?? 'Transfer from Savings to Personal Account');
      } else {
        const product = s === 'TRANSFER_PA_CP' ? 'CP' : 'CALL';
        const inf = calcInflow(
          {
            principal: r.amount.value,
            rate: i.newRate ?? '',
            tenorDays: i.newTenorDays ?? NaN,
            effectiveDate: date,
            whtExempt: exempt,
          },
          env
        );
        if (inf.errors.newRate) errors.newRate = inf.errors.newRate;
        if (inf.errors.newTenorDays) errors.newTenorDays = inf.errors.newTenorDays;
        if (inf.maturity.adjusted) notes.push(inf.maturity.reason!);
        Object.assign(v, {
          effectiveDate: date,
          newRate: i.newRate ?? null,
          newTenorDays: i.newTenorDays ?? null,
          newMaturityDate: inf.maturity.date,
          projectedInterest: inf.projectedInterest.value,
          whtAmt: inf.wht.value,
          interestAmt: inf.projectedInterest.value,
        });
        rows.splice(
          1,
          0,
          info('Destination', product === 'CP' ? 'New Commercial Paper' : 'New Call Placement')
        );
        rows.push(
          input('Rate', i.newRate ?? '', 'rate'),
          input('Tenor', String(i.newTenorDays ?? ''), 'days'),
          maturityRow('Maturity date', inf.maturity),
          money('Projected interest', inf.projectedInterest),
          money(whtLabel(exempt, env), inf.wht),
          total('Net maturity value', inf.netMaturityValue)
        );
        v.remarks = withPurpose(
          i.remarks ??
            `Transfer from Personal Account to ${product === 'CP' ? 'Commercial Paper' : 'Call Placement'}`
        );
      }
      Object.assign(v, {
        principalAmt: r.amount.value,
        netAmt: r.amount.value,
        rows,
        notes: [...notes],
      });
      vouchers.push(v);
      headlineAmt = r.amount.value;
      summary.push({ label: 'Amount', value: r.amount.value, format: 'money' });
      break;
    }

    case 'TRANSFER_REVERSAL': {
      const orig = c.originalInvestment;
      if (!orig) throw new Error('Original investment is required');
      const r = calcReversal(
        {
          amount: orig.principalAmt,
          rate: orig.intRate,
          tenorDays: orig.tenorDays,
          effectiveDate: orig.effectiveDate,
        },
        {
          amount: i.correctedAmount ?? orig.principalAmt,
          rate: i.correctedRate ?? orig.intRate,
          tenorDays: i.correctedTenorDays ?? orig.tenorDays,
          effectiveDate: orig.effectiveDate,
        },
        env
      );
      Object.assign(errors, r.errors);
      const date = payDate(c, env);
      if (
        isPositive(r.deltaAmount.value) &&
        c.customerPa &&
        isPositive(add(r.deltaAmount.value, `-${c.customerPa.availableBal}`))
      ) {
        errors.correctedAmount = `Increase of ${formatNaira(r.deltaAmount.value)} exceeds the PA available balance ${formatNaira(c.customerPa.availableBal)}`;
      }
      if (r.corrected.maturity.adjusted) notes.push(r.corrected.maturity.reason!);
      const v = blankVoucher('TS', 1, date);
      Object.assign(v, {
        principalAmt: r.original.amount,
        rollAmt: r.corrected.amount,
        netAmt: r.deltaAmount.value,
        effectiveDate: orig.effectiveDate,
        newRate: r.corrected.rate,
        newTenorDays: r.corrected.tenorDays,
        newMaturityDate: r.corrected.maturity.date,
        projectedInterest: r.corrected.projectedInterest.value,
        interestAmt: r.deltaInterest.value,
        remarks: withPurpose(i.remarks ?? `Reversal and correction of ${orig.investmentRef}`),
        notes: [...notes],
        rows: [
          info('Original investment', orig.investmentRef),
          info('Original amount', r.original.amount, 'money'),
          input('Corrected amount', r.corrected.amount, 'money'),
          money('Δ Amount (settled against PA)', r.deltaAmount),
          info('Original rate', r.original.rate, 'rate'),
          input('Corrected rate', r.corrected.rate, 'rate'),
          info('Δ Rate', r.deltaRate, 'rate'),
          info('Original tenor', String(r.original.tenorDays), 'days'),
          input('Corrected tenor', String(r.corrected.tenorDays), 'days'),
          info('Δ Tenor', String(r.deltaTenor), 'days'),
          maturityRow('Corrected maturity date', r.corrected.maturity),
          money('Original projected interest', r.original.projectedInterest),
          money('Corrected projected interest', r.corrected.projectedInterest),
          total('Δ Projected interest', r.deltaInterest),
        ],
      });
      vouchers.push(v);
      headlineAmt = r.corrected.amount;
      summary.push({ label: 'Corrected amount', value: r.corrected.amount, format: 'money' });
      break;
    }

    default: {
      const never: never = s;
      throw new Error(`Unknown scenario ${String(never)}`);
    }
  }

  // Sanity: voucher types always match the SOP table.
  const built = vouchers.map((v) => v.voucherType).join(',');
  if (built !== types.join(','))
    throw new Error(`Voucher mismatch for ${s}: ${built} ≠ ${types.join(',')}`);
  vouchers.forEach((v) => {
    if (!v.notes.length && notes.length) v.notes = [...notes];
  });

  // A deduction switched off for this transaction carries its reason on the row it explains,
  // and cannot be left unexplained: the reason is required before the voucher can be signed.
  let whtOff = false;
  let chargeOff = false;
  for (const v of vouchers) {
    for (const row of v.rows) {
      if (!row.label.includes('(switched off)')) continue;
      const charge = row.label.startsWith('Pre-liquidation charge');
      const reason = (charge ? i.preliqChargeOffReason : i.whtOffReason)?.trim();
      if (charge) chargeOff = true;
      else whtOff = true;
      if (reason) row.note = `Switched off: ${reason}`;
    }
  }
  if (whtOff && !i.whtOffReason?.trim())
    errors.whtOffReason = 'Give a reason for not deducting withholding tax';
  if (chargeOff && !i.preliqChargeOffReason?.trim())
    errors.preliqChargeOffReason = 'Give a reason for not applying the pre-liquidation charge';

  return { vouchers, headlineAmt, errors, notes, summary };
}

export function scenarioHasPayout(s: ScenarioCode): boolean {
  return SCENARIO_META[s].vouchers.includes('FO');
}
