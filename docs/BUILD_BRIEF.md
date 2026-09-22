# TreasuryDesk — Build Brief for Claude Code

Owner: 7STARS · Client: First Marina Trust Finance Company Limited (Nigeria) · Brief date: 22-Sep-2026

This brief is the single source of truth for finishing the Phase 1 demo. It replaces the rocket.new prompts.
Work through it in the phase order in section 13 and verify each phase before moving on.

---

## 1. Goal

Deliver a **complete, polished, clickable demo** of TreasuryDesk that the owner can present to the client:

- Every SOP transaction type runs end to end: instruction → verification → call-back → Eazybankz check →
  voucher with live calculations → 5-level approval → Operations execution → Treasury confirmation.
- Every button works; all CRUD works; all numbers are calculated; state persists in the browser.
- Modern, clean, simple, professional interface that works on **all screen sizes**.
- Code structured so Phase 2 can swap mock services for a real Oracle-backed API without touching screens.

## 2. Current state of the repo (audit of the rocket.new output)

rocket.new completed its Prompts 0–6 and ran out of credits before Prompt 7 (printable vouchers). Findings:

- Next.js 15 App Router + Tailwind + decimal.js + Recharts. Keep this stack.
- Data model mixes current and "legacy" statuses/types (`PENDING_VERIFY`, `PENDING_HT`, `FO`, `FD`, `TB`…).
  Remove all legacy values.
- A transaction holds a single `voucherId`, but compound transactions need **two linked vouchers**
  (Rollover B/C/D, partial pre-liquidation). The model must change.
- Two competing wizard routes (`/new-transaction` and `/transactions/new`) and duplicated seed files
  (`src/mocks/seed.ts` + `src/services/seedData.ts`). One of each only.
- Type errors (`npm run type-check` fails) hidden by `ignoreBuildErrors: true` in `next.config.mjs`.
- Rocket-specific leftovers: `@dhiwise/component-tagger` webpack loader, `rocketCritical` block in
  `package.json`, `image-hosts.config.mjs`, a `.env` full of dummy third-party keys (Supabase, OpenAI, Stripe…),
  Rocket README and logo. Remove all of them. Add `.env.example` with only the two variables in section 9.
- Missing entirely: printable vouchers, approvals review page, operations execution effects, transaction detail
  page, calendar, call-back log, notifications, reports, audit trail, most of settings.

**Recommended approach:** rebuild on a clean foundation inside this repo. Reuse any existing screen or component
only where it already meets this brief; don't patch around the old data model. `src/lib/calc.ts` formulas can
be used as a reference, but they must pass the checks in section 7.4.

## 3. Business process (from the client's SOP)

Every treasury transaction follows the same spine:

1. **Customer instruction** — letter, email, signed instruction form or mandated instruction. If money goes to
   another bank it must contain beneficiary name, bank name, account number, amount, purpose.
2. **Signature verification** (Treasury Officer) — signature, mandate, account ownership, instruction
   completeness. If the signature differs: **stop processing**.
3. **Customer confirmation** (Account Officer) — call the registered phone; confirm amount, instruction,
   beneficiary, purpose; record date, time, officer name.
4. **Investment verification in Eazybankz** (Treasury Officer) — principal, accrued interest, rate, effective
   date, maturity date, outstanding balance, available amount.
5. **Raise the correct voucher** (see table).
6. **Approval**, strictly in order: Treasury Officer signs → Head Treasury → MIS → Audit → Managing Director →
   Operations execute → Treasury follows up until completion.

| SOP | Transaction | Scenario | Voucher(s) |
| --- | --- | --- | --- |
| 1 | Rollover | A. Principal + Interest | Roll-over Slip |
| 1 | Rollover | B. Principal rolled, interest paid out | Roll-over Slip + Funds-Out |
| 1 | Rollover | C. Partial principal (e.g. roll ₦7M, pay ₦3M of ₦10M) | Roll-over Slip + Funds-Out |
| 1 | Rollover | D. Interest payment only, principal stays invested | Funds-Out + Roll-over Slip |
| 2 | Termination at maturity | Principal + Interest | Funds-Out |
| 3 | Pre-liquidation | Full (20% charge on accrued interest) | Funds-Out |
| 3 | Pre-liquidation | Partial | Funds-Out + rebooking (Roll-over Slip) |
| 4 | Anniversary interest | 30 / 60 / 90 days | Funds-Out |
| 5 | Third-party payment | A. External bank (0.10% transfer charge) | Funds-Out |
| 5 | Third-party payment | B. Internal account (no charge) | Funds-Out |
| 6 | Transfer | A. Savings (SS) → Personal Account (PA) | Transfer Slip |
| 6 | Transfer | B. PA → Commercial Paper (CP) | Transfer Slip |
| 6 | Transfer | C. PA → Call Placement | Transfer Slip |
| 6 | Transfer | Reversal (correct rate, tenor or amount) | Transfer Slip |
| 7 | Inflow | New investment | Funds-In |

Rollover B: beneficiary name, bank and account number are also written into the voucher **Remarks** (SOP rule).
Third-party A: Remarks carry beneficiary name, bank, account number and transfer charge.
The SOP's recommended **Payment Instruction** block (beneficiary name, bank name, account number, account type,
amount, transfer charge) appears on every Funds-Out Voucher and Roll-over Slip where money leaves.

**Control checklist (12 controls, every transaction):**
C01 Customer instruction received · C02 Signature verified · C03 Telephone confirmation completed ·
C04 Investment confirmed in Eazybankz · C05 Correct voucher raised · C06 Treasury Officer approval ·
C07 Head Treasury approval · C08 MIS approval · C09 Audit approval · C10 MD approval ·
C11 Operations processing confirmed · C12 Transaction completed within GAPS SLA.
Each control is ticked automatically when its step completes (who + when recorded). None can be skipped.

## 4. Roles and demo users

| Code | Role | Demo user | Main capabilities |
| --- | --- | --- | --- |
| TO | Treasury Officer (maker) | Adaeze Okonkwo | Create transactions, verification steps, raise vouchers, first signature, confirm completion, raise reversals |
| AO | Account Officer | Tunde Bakare | Call-backs for own customers |
| HT | Head, Treasury | Ibrahim Musa | Level 2 approval |
| MIS | MIS | Chiamaka Eze | Level 3 review & sign |
| AUD | Internal Audit | Olumide Adeyemi | Level 4 review & sign; audit trail; calc self-check |
| MD | Managing Director | Mrs. Folake Adebayo | Level 5 final approval; executive dashboard |
| OPS | Operations | Emeka Nwosu | Execute in Eazybankz/GAPS; enter posting and payment refs |
| ADM | System Admin (IT) | Kelechi Obi | Users, settings, banks, holidays, integrations |

At every approval level: **Approve & sign**, **Return to maker** (comment required), **Reject** (reason
required). Returned items go back to the TO, are editable, and resubmission restarts at level 1 (previous
approvals kept in history as an earlier cycle). Rejected items are closed.

Demo login: any email of a demo user + any password, then a 2FA screen (code `123456`). A **role switcher** in the
user menu jumps between the 8 users in one click. Signature modal for approvals: full name + PIN `1234`.

## 5. Transaction status model

```
DRAFT → VERIFICATION → (TO signs) PENDING_HEAD_TREASURY → PENDING_MIS → PENDING_AUDIT → PENDING_MD
      → PENDING_OPERATIONS → EXECUTED → (TO confirms) COMPLETED
VERIFICATION → STOPPED (signature mismatch)
PENDING_OPERATIONS ⇄ EXEC_FAILED (GAPS failure / retry)
any PENDING_* → RETURNED (back to maker) or REJECTED
DRAFT / VERIFICATION / RETURNED → CANCELLED (maker)
```

| Code | Label | Owner | Tone |
| --- | --- | --- | --- |
| DRAFT | Draft | TO | neutral |
| VERIFICATION | In verification | TO / AO | info |
| STOPPED | Stopped – signature mismatch | TO | danger |
| PENDING_HEAD_TREASURY | Awaiting Head Treasury | HT | warning |
| PENDING_MIS | Awaiting MIS | MIS | warning |
| PENDING_AUDIT | Awaiting Audit | AUD | warning |
| PENDING_MD | Awaiting MD | MD | warning |
| PENDING_OPERATIONS | Ready for Operations | OPS | accent |
| EXEC_FAILED | Execution failed | OPS | danger |
| EXECUTED | Executed – awaiting confirmation | TO | info |
| COMPLETED | Completed | — | success |
| RETURNED | Returned for correction | TO | warning |
| REJECTED | Rejected | — | danger |
| CANCELLED | Cancelled | — | neutral |

## 6. Domain model (Oracle-ready)

TypeScript interfaces in `src/domain/types.ts`. Field names are camelCase versions of future Oracle columns
(`principalAmt` ↔ `PRINCIPAL_AMT`, ≤ 30 chars, no reserved words). Codes, not labels, in data; label maps in
`src/domain/codes.ts`. Every record has `id: string` and `version: number`. Business dates `YYYY-MM-DD`;
timestamps ISO with `+01:00` (Africa/Lagos, no DST). Money is `string` with 2 dp.

| Entity | Key fields |
| --- | --- |
| AppUser | id, fullName, email, roleCode, staffId, status (ACTIVE/INACTIVE), lastLoginAt |
| Bank | bankCode (CBN 3-digit), bankName, shortName, active |
| Customer | cifNo (FMT000101…), customerName, customerType (IND/CORP), regPhone, email, bvnMasked, whtExempt, accountOfficerId, status, createdAt |
| Signatory | customerId, fullName, signClass (A/B), specimenSvg, active |
| Mandate | customerId, ruleCode (SOLE / ANY_TWO / A_AND_B), effectiveDate |
| Account | customerId, accountNo (10-digit NUBAN), productCode (SS / PA), ledgerBal, availableBal, status |
| Investment | investmentRef (INV-YYYY-00001), customerId, accountId, productCode (TERM / CP / CALL), principalAmt, intRate, effectiveDate, tenorDays, maturityDate, annivFreqDays (0/30/60/90), nextAnnivDate, intPaidToDate, status (ACTIVE / MATURED / LIQUIDATED / ROLLED_OVER / CLOSED / REVERSED), parentInvestmentId, originTxnId |
| Beneficiary | customerId, benefName, bankCode, accountNo, accountType (SAVINGS/CURRENT), isInternal |
| TreasuryTxn | txnRef (TRX-YYYY-000001), txnType, scenarioCode, customerId, investmentId?, sourceAccountId?, destAccountId?, reversalOfTxnId?, status, wizardStep, makerId, receivedAt, submittedAt, slaDueAt, completedAt, cycleNo, input (JSON of wizard values), headlineAmt, returnComment?, stopReason? |
| Instruction | txnId, channel (LETTER/EMAIL/FORM/MANDATE), receivedDate, receivedTime, amount, purpose, documentName, documentData (data URL in demo), payDestination (EXTERNAL/INTERNAL), benefName, bankCode, accountNo, accountType |
| Verification | txnId, sigOk, mandateOk, ownershipOk, completeOk, cbsConfirmed, cbsSyncedAt, fundsReceived, sourceConfirmed, verifiedBy, verifiedAt |
| CallbackLog | txnId, customerId, phoneCalled, callDate, callTime, officerId, amountOk, instrOk, benefOk, purposeOk, outcome (CONFIRMED/UNREACHABLE/DISPUTED), notes |
| Voucher | voucherNo (FI-/FO-/RO-/TS-YYYY-00001), txnId, voucherType (FI/FO/RO/TS), principalAmt, interestAmt, whtAmt, chargeAmt, feeAmt, netAmt, rollAmt, transferDate, effectiveDate, newRate, newTenorDays, newMaturityDate, projectedInterest, remarks, rows (label/value/kind/formula for display & print), payment? (PaymentInstr) |
| PaymentInstr | benefName, bankCode, bankName, accountNo, accountType, amount, transferCharge |
| Approval | txnId, cycleNo, levelNo (1–5), roleCode, userId, action (APPROVE/RETURN/REJECT), comments, actedAt |
| Execution | txnId, cbsPostingRef, gapsRef, status (SUCCESS/FAILED), failureReason, executedBy, executedAt, confirmedBy, confirmedAt |
| ControlCheck | txnId, controlCode (C01–C12), state (PENDING/PASSED/FAILED), actedBy, actedAt, note |
| TxnComment | txnId, userId, body, createdAt |
| Notification | targetRole or targetUserId, title, body, link, createdAt, readBy[] |
| AuditEvent | ts, userId, roleCode, entity, entityId, action, summary, before, after, ipAddr, prevHash, hash |
| SysSetting | key/value (typed Settings object, see 7.1) |
| PublicHoliday | holidayDate, description |

## 7. Calculation engine (`src/lib/calc.ts`)

Pure functions only. Inputs/outputs are money strings; round every output to 2 dp ROUND_HALF_UP. Settings are
passed in explicitly (the UI gets them from `settingsService`) so changing a setting changes results everywhere,
including open drafts. Every result also returns a human-readable formula per figure (for the "fx" hover).

### 7.1 Settings and defaults (all editable in Settings)

| Key | Default | Meaning |
| --- | --- | --- |
| whtRate | 10 | WHT % on interest |
| preliqChargeRate | 20 | % of accrued interest charged on pre-liquidation |
| transferFeeRate | 0.10 | % fee on external third-party transfers |
| dayCount | 365 | Day-count basis (365 or 360) |
| whtOnAnniversary | false | SOP says WHT "not required" for anniversary |
| whtBasisPreliq | AFTER_CHARGE | or GROSS |
| partialPreliqInterest | NOT_PAID | NOT_PAID / PAID_OUT / CAPITALISED (SOP example rebooks ₦6.7M and does not pay interest) |
| tpFeeMode | DEDUCT | DEDUCT (beneficiary gets amount − fee) or ON_TOP (customer debited amount + fee) |
| rolloverCInterest | PAY_OUT | PAY_OUT or ROLL |
| rolloverABasis | NET | NET (roll P + interest − WHT) or GROSS |
| maturityHolidayRule | NEXT_BUSINESS_DAY | or NONE |
| slaHours | 8 | Hours from instruction receipt to completion |
| slaCutoff | 15:00 | Daily cut-off; instructions after it get next-business-day SLA |
| demoLatencyMs | 400 | Simulated service latency |
| gapsFailureRate | 10 | % of simulated GAPS submissions that fail |

These defaults are assumptions pending the client's confirmation; each Settings field shows a one-line
explanation and a live example.

### 7.2 Formulas

- `daysBetween(from, to)` — actual days.
- `maturityDate(effective, tenorDays, holidays, rule)` → `{ date, adjusted, reason }`; weekend or public
  holiday moves to the next business day when rule = NEXT_BUSINESS_DAY.
- `interest(P, rate, days) = P × rate/100 × days / dayCount`.
- `accruedInterest(inv, asOf)` = interest from effectiveDate to min(asOf, maturityDate) − intPaidToDate (floor 0).
- `wht(amount, customer, applies)` = 0 if customer.whtExempt or !applies, else amount × whtRate/100.
- **Inflow:** projectedInterest = P × r × tenor / dayCount; WHT; netMaturityValue = P + interest − WHT.
- **Maturity:** interest = full-term interest − intPaidToDate; WHT; net = P + interest − WHT.
- **Pre-liquidation full:** AI = accrued to liquidation date; charge = AI × preliqChargeRate/100;
  netInterest = AI − charge; WHT on netInterest (AFTER_CHARGE) or AI (GROSS); payout = P + netInterest − WHT.
- **Pre-liquidation partial** (requested R, must be < P): charge = AI × rate; payout = R;
  remaining = P − R; rebookedPrincipal = remaining − charge (error if charge ≥ remaining).
  PAID_OUT: also pay AI − WHT(AI) with the payout. CAPITALISED: add AI − WHT(AI) to rebookedPrincipal.
- **Anniversary** (period 30/60/90): periodInterest = P × r × period / dayCount; WHT only if whtOnAnniversary;
  net; nextAnnivDate = current + period. Investment stays active; intPaidToDate increases.
- **Rollover A:** interest = accrued to new effective date (= full-term at maturity); WHT;
  rollAmt = P + interest − WHT (NET) or P + interest (GROSS); newMaturityDate; projectedNewInterest =
  rollAmt × newRate × newTenor / dayCount.
- **Rollover B / D:** rollAmt = P; payout = interest − WHT to the Payment Instruction account.
- **Rollover C** (roll X, must be < P): principalPayout = P − X; interest paid out (PAY_OUT: interest − WHT)
  or added to rollAmt (ROLL); totalPayout.
- **Third party:** fee = internal ? 0 : amount × transferFeeRate/100; DEDUCT → toBeneficiary = amount − fee,
  totalDebit = amount; ON_TOP → toBeneficiary = amount, totalDebit = amount + fee.
- **Transfer:** valid if amount ≤ source availableBal; sourceAfter.
- **Reversal diff:** Δ rate, Δ tenor, Δ amount, Δ projected interest between original and corrected.

### 7.3 Validation

Amounts > 0; payout ≤ available; R < P; X < P; tenor 1–1,825 days; rate 0–100; account number exactly 10
digits; transfer date not in the past, not a weekend/holiday; bank required when external.

### 7.4 Required checks (`scripts/calc-check.ts`, run with `npm run test:calc`, and the in-app Self-Check page)

Settings: WHT 10%, charge 20%, fee 0.10%, day count 365, P = ₦10,000,000 at 15% unless stated.

| # | Case | Expected |
| --- | --- | --- |
| 1 | Maturity, 365-day tenor | interest 1,500,000.00 · WHT 150,000.00 · net 11,350,000.00 |
| 2 | Full pre-liquidation at day 180 | accrued 739,726.03 · charge 147,945.21 · net interest 591,780.82 · WHT 59,178.08 · payout 10,532,602.74 |
| 3 | Partial pre-liquidation at day 365 (accrued 1,500,000.00), requested 3,000,000 | charge 300,000.00 · payout 3,000,000.00 · remaining 7,000,000.00 · rebooked 6,700,000.00 |
| 4 | Anniversary 30 / 60 / 90 days | 123,287.67 / 246,575.34 / 369,863.01 |
| 5 | Rollover A at maturity (365 days) into 182 days at 16% | rollAmt 11,350,000.00 · projected new interest 905,512.33 |
| 6 | Third party external ₦5,000,000 | fee 5,000.00 · to beneficiary 4,995,000.00 |

Add more cases freely (Rollover C, WHT-exempt customer, holiday maturity adjustment), but these six must pass.

## 8. Workflow engine (`src/services/workflow.ts`)

All state transitions live here, never in components. Each function takes a context `{ userId, at }` so the seed
generator can replay history with back-dated timestamps through the same code (this guarantees consistent seed
data). Each transition: validates role + state + maker-checker, updates records, sets controls, writes audit
events, creates notifications for the next role.

**Execution business effects** (applied when Operations marks a transaction executed):

| Scenario | Effect |
| --- | --- |
| INFLOW | Create investment (ACTIVE) from voucher values |
| MATURITY | Investment → CLOSED; payout to customer PA (internal) or external via GAPS |
| PRELIQ full | Investment → LIQUIDATED; payout |
| PRELIQ partial | Original → LIQUIDATED; new investment with rebookedPrincipal (parentInvestmentId set); payout R |
| ANNIVERSARY | intPaidToDate += periodInterest; nextAnnivDate advances; payout |
| ROLLOVER A/B/C/D | Original → ROLLED_OVER; new investment with rollAmt, new rate/tenor/dates; payouts where applicable |
| THIRD_PARTY | Debit source PA by totalDebit; internal: credit beneficiary's internal account |
| TRANSFER A | Move amount SS → PA |
| TRANSFER B / C | Debit PA; create CP / CALL investment |
| Reversal | Original investment → REVERSED; corrected investment created; amount delta settled against PA; original txn tagged "Reversed by TRX-…" |

GAPS simulation: 2 s delay; fails `gapsFailureRate`% of the time with a realistic reason ("Beneficiary account
name mismatch", "Cut-off time passed", "Destination bank unavailable"); success returns `GAPS-YYYYMMDD-NNNNNN`.
Internal-only transactions skip GAPS and need only the Eazybankz posting ref.

SLA: slaDueAt = receivedAt + slaHours (instructions after slaCutoff start at next business day 08:00).
C12 passes when completedAt ≤ slaDueAt, else fails with "breached by 2h 14m".

## 9. Service layer and Phase 2 readiness

- `src/services/*`: one service per domain (customers, accounts, investments, beneficiaries, transactions,
  vouchers, approvals, operations, callbacks, notifications, reports, audit, settings, users, banks, holidays).
- Each exports a TypeScript interface, a `mock` implementation (in-memory store persisted to localStorage under
  one versioned key, simulated latency) and an `http` stub calling `NEXT_PUBLIC_API_BASE_URL`.
  `NEXT_PUBLIC_USE_MOCK=true` selects mock.
- List methods take `{ page, pageSize, sort, filters }` and return `{ items, total }` (maps to Oracle
  `OFFSET … FETCH NEXT`).
- Optimistic concurrency: updates send `version`; mock rejects stale versions with a friendly error.
- A small reactive layer (e.g. `useSyncExternalStore` over the store + a `useData(fetcher, deps)` hook) so every
  screen refreshes when data changes: approving on one role visibly changes other dashboards.
- All `localStorage` access guarded (SSR-safe, try/catch). "Reset demo data" restores the seed.
- Future backend (not in this phase): Oracle 19c+, REST API (Spring Boot or NestJS), `CoreBankingAdapter`
  (Eazybankz first, others later), `PaymentAdapter` (GAPS, NIBSS NIP), AD/SSO. Don't build these now; just keep
  the shapes compatible.

## 10. Seed data (`src/data/seed.ts`)

Deterministic (seeded PRNG) and **relative to today** (Africa/Lagos) so the demo never goes stale.

- 20 Nigerian banks with correct CBN codes: 044 Access, 023 Citibank, 050 Ecobank, 070 Fidelity, 011 First Bank,
  214 FCMB, 058 GTBank, 030 Heritage (inactive), 301 Jaiz, 082 Keystone, 076 Polaris, 101 Providus,
  221 Stanbic IBTC, 068 Standard Chartered, 232 Sterling, 032 Union, 033 UBA, 215 Unity, 035 Wema, 057 Zenith.
- 40 customers (28 individuals, 12 corporates, e.g. "Okafor & Sons Ltd", "Lekki Gardens Estates Ltd"),
  CIF FMT000101+, Nigerian phones (+234 80x/81x/70x/90x), masked BVN, 6 WHT-exempt, each with an Account Officer.
- 1–3 signatories each (class A/B) with a specimen signature rendered as SVG in a handwriting-style font; mandate
  rule SOLE / ANY_TWO / A_AND_B.
- SS and PA accounts for every customer, NUBAN numbers, balances ₦200,000 – ₦150,000,000.
- 120 investments (TERM/CP/CALL), ₦1M – ₦500M, 12–24%, tenors 30/60/90/180/270/365. Spread so that 6 mature
  today, 18 in the next 7 days, 30 in the next 30 days, 10 matured awaiting instruction, 15 with anniversary
  payments due within 14 days.
- 60 transactions across **all** statuses and **all** 7 types, generated by replaying the workflow engine with
  back-dated contexts. At least 8 pending at each approval level; 3 SLA breaches; some returned, rejected,
  stopped, failed.
- 25 saved beneficiaries; Nigerian public holidays for this year and next (New Year, Good Friday, Easter Monday,
  Workers' Day, Democracy Day 12 Jun, Independence Day 1 Oct, Christmas, Boxing Day, Eid dates editable).
- 12 months of history so the AUM trend and reports have data.
- Demo users as in section 4 plus 3 extra Account Officers.

## 11. Modules and screens

Routes use an `(app)` route group whose layout holds the shell and role guards. Login, 2FA and voucher print
live outside the shell.

| Route | Roles | Must do |
| --- | --- | --- |
| `/login` | all | Email + password, then 2FA (123456). Quick-pick list of demo users. |
| `/dashboard` | all | Role-specific KPIs and charts (below). Every tile clickable → filtered list. Date range: Today / This week / This month / Custom. |
| `/transactions` | all but AO-limited | Status tabs with counts, filters (type, customer, date, amount, maker, SLA breached), search, pagination, CSV export. |
| `/transactions/new` | TO | 6-step wizard (section 11.1). Query params `?type=&scenario=&investmentId=&accountId=` pre-fill. Autosave draft each step. |
| `/transactions/[id]` | all | Header, stage progress (Instruction → Verification → Call-back → Eazybankz → Voucher → HT → MIS → Audit → MD → Ops → Confirmed), tabs: Summary, Vouchers (with print), Instruction & documents, Verification & call-back, Controls (12, who/when), Timeline, Comments (add; CRUD own comments), Audit. Context actions per role/status: Continue draft, Cancel, Approve/Return/Reject, Execute, Confirm, Raise reversal. |
| `/approvals` | HT, MIS, AUD, MD | Queue for own level; live SLA countdown (green > 2 h, amber < 2 h, red breached); header count + ₦ total; filters; bulk approve (one signature). Review page = the transaction detail with a sticky action bar. Maker-checker disables with reason. |
| `/operations` | OPS | PENDING_OPERATIONS + EXEC_FAILED queue; Execute drawer with plain-language instructions, Eazybankz posting ref, "Send to GAPS" (simulated), retry on failure. |
| `/investments`, `/investments/[id]` | all but AO-limited | Register with live accrued interest, filters, summary row recomputed for filtered set, CSV. Detail: accrual progress bar, projected maturity value, anniversary schedule, linked transactions, action buttons pre-filling the wizard (disabled with reason when invalid). |
| `/customers`, `/customers/[id]` | all (edit: TO, ADM) | List + detail tabs: Profile, Signatories & mandate, Accounts, Investments, Beneficiaries, Transactions, Call-backs. |
| `/calendar` | all | Month / week / list views of maturities and anniversaries, holidays shaded, day totals, side panel with "Start transaction". Summary: today, 7 days, 30 days, overdue. |
| `/callbacks` | all (log: AO, TO) | Call-back log, filters, CSV; log a new call against a transaction in VERIFICATION. |
| `/notifications` | all | Full list, mark read / mark all read; bell dropdown in top bar with unread count. |
| `/reports` | HT, MIS, AUD, MD, ADM | 8 reports (below) with date range, table + chart, export CSV / Excel / Print-PDF. |
| `/audit` | AUD, MD, ADM | Immutable event list, filters, before/after diff, CSV, "Verify integrity" (hash chain). |
| `/settings` | ADM (others read-only where relevant) | Tabs: Rates & policies (live examples; saving needs a reason; toast "N open drafts recalculated"), SLA, Approval chain (read-only), Public holidays, Banks, Users & roles (+ permissions matrix), Integrations (simulated status cards + Test connection + config fields for Eazybankz, GAPS, NIBSS NIP, Oracle DB, Active Directory, SMS/Email), Demo (reset data, self-check, latency, GAPS failure rate). |
| `/settings/self-check` | AUD, ADM | Runs the section 7.4 cases live with PASS/FAIL, expected vs actual, "Run all", "6/6 passed". |
| `/vouchers/[id]/print` | all | A4 paper voucher (section 11.3). |
| `/forbidden`, not-found | all | Friendly pages with a way back. |

### Dashboards

- **TO:** My drafts, Returned to me, Awaiting approval (count + ₦), Awaiting my confirmation, Maturities today;
  maturities next 30 days (bar), transactions by type this month; my recent transactions.
- **AO:** Call-backs pending, completed today, unreachable/disputed; call-back queue with "Call now".
- **HT / MIS / AUD / MD:** Pending my approval (count + ₦), oldest item age, SLA breaches, approved by me today;
  pipeline by stage; volume by type; top 5 of my queue with Approve / Open.
- **MD extra:** Total AUM, inflows vs outflows this month, penalty + fee income MTD, AUM trend 12 months.
- **OPS:** Ready to execute, executed today, GAPS failures, total ₦ to pay today; execution queue.
- **ADM:** Active users, setting changes this week, integration health, live audit feed.

### Reports

1. Daily treasury position (opening AUM, inflows, outflows by type, rollovers, closing AUM; by product)
2. Maturity profile (0–7, 8–30, 31–90, 91–180, 181–365, > 365 days; count and ₦ by product)
3. Charges & fee income (pre-liquidation charges, transfer fees)
4. WHT payable schedule
5. SLA performance (within-SLA %, breaches, average time per stage)
6. Approval turnaround by level and approver
7. Transaction register (all voucher figures)
8. Stopped / returned / rejected with reasons

Each shows "Generated by <user> on <date time>" and totals; all figures reconcile with the underlying lists.

### 11.1 New Transaction wizard

Left (desktop) or top (mobile) stepper; Back / Next; Next disabled until valid; the 12-control checklist in a
side panel (bottom sheet on mobile) updating live; autosave to a DRAFT.

1. **Type & scenario** — 7 type cards → scenarios → customer (searchable) → investment or source account (only
   valid ones listed: e.g. MATURITY lists matured/maturing, PRELIQ lists active before maturity). Show the voucher
   that will be used.
2. **Instruction** — channel, date/time received (starts SLA), upload scan (PDF/image, preview), amount,
   purpose; payment destination (external bank / customer's internal PA); for external: beneficiary name, bank,
   10-digit account number, account type, with "Pick saved beneficiary" and simulated name enquiry (1 s).
3. **Signature & mandate** — instruction preview beside specimen signatures + mandate rule in plain words; four
   checkboxes; red "Signature differs — stop processing" → confirm → STOPPED, C02 failed, audit, red banner.
4. **Call-back** — registered phone, date, time (default now), officer (defaults to customer's AO), four
   Confirmed / Not confirmed toggles, outcome, notes. Only CONFIRMED with all four confirmed allows Next; other
   outcomes save the log and keep VERIFICATION with a warning.
5. **Eazybankz verification** — read-only panel (principal, accrued interest to today, rate, effective,
   maturity, outstanding, available), "Refresh from Eazybankz" (1 s, "Last synced 14:05:22"), confirm checkbox.
   INFLOW: "Funds received" + "Source account confirmed". TRANSFER / THIRD_PARTY: source balances.
6. **Voucher** — auto-selected voucher(s); every figure live from calc.ts (debounced ~150 ms); calculated fields
   read-only and shaded with an "fx" marker whose tooltip shows the formula with real numbers (e.g.
   "20% × ₦739,726.03 = ₦147,945.21"); maturity-date adjustment note; Payment Instruction block; compound
   transactions show two voucher tabs; Save draft / Preview / **Sign & submit** (name + PIN) → level-1 approval,
   PENDING_HEAD_TREASURY, C05 + C06 passed, SLA due set, HT notified.

A RETURNED transaction reopens at step 6 with the return comment in a banner; resubmission restarts at HT.

### 11.2 Scenario-specific voucher fields

- Funds-In: customer, amount, rate, tenor, effective, maturity (auto, with adjustment note), projected interest,
  WHT, net maturity value.
- Maturity Funds-Out: principal, interest, WHT ("Exempt" if exempt), net, transfer date, remarks, payment block.
- Pre-liq full: liquidation date, days elapsed, accrued, charge, net interest, WHT, payout, payment block.
- Pre-liq partial: requested (editable), accrued, charge, payout, remaining, less charge, rebooked, new rate/tenor
  (default original rate, remaining tenor), new maturity; SOP-style table; current policy note.
- Anniversary: period, period interest, WHT if on, net, next anniversary date, "Investment remains active".
- Rollover A: principal, interest, WHT, new effective, new tenor, new rate, roll amount, new maturity, projected
  interest.
- Rollover B/D: Roll-over Slip (principal) + Funds-Out (interest) with payment block; remarks auto-filled.
- Rollover C: roll X (editable) + Funds-Out balance; split bar "Roll ₦7,000,000 | Pay ₦3,000,000".
- Third party A: amount, charge 0.10%, to beneficiary, total debit, remarks auto-filled; B: internal account, ₦0.
- Transfer A/B/C: source + available, destination (or new CP/CALL with rate, tenor, maturity), amount, balance
  after; blocked if insufficient.
- Reversal: pick a COMPLETED transaction that created an investment; original vs corrected rate/tenor/amount
  with a delta column.

### 11.3 Printable voucher

A4 portrait, formal paper style: company name + simple text wordmark (no logo image), voucher title
(FUNDS-IN VOUCHER / FUNDS-OUT VOUCHER / ROLL-OVER SLIP / TRANSFER SLIP), voucher no., txn ref, date, customer +
CIF, bordered field grid, **amount in words** ("Ten million, five hundred and thirty-two thousand, six hundred
and two naira, seventy-four kobo"), Payment Instruction box, Remarks, 5 signature boxes (TO, HT, MIS, Audit, MD)
showing signer, date/time and signature or "Pending", Operations box (posting ref, GAPS ref). Diagonal "DEMO"
watermark; "DRAFT" if not submitted. Print button (print CSS, fits one page), Back.

## 12. Design system

**Direction:** modern, clean, simple, professional — think Linear, Stripe Dashboard, Mercury. Calm, dense,
confident. It must not look AI-generated.

- **Colour:** neutral base (white / zinc-50 surfaces, zinc-200 borders, zinc-900 text) and one brand accent
  (deep navy `#0B2545`) with a restrained secondary (teal `#13A89E`) for positive/progress. Status colours only in
  badges and small indicators, soft backgrounds with strong text. Define all colours as CSS variables with a
  proper dark theme. Contrast WCAG AA.
- **Type:** Inter (via `next/font`), 14 px base in app chrome, `tabular-nums` for all figures, right-aligned
  money in tables. Clear hierarchy: page title 20–24 px semibold, section 15–16 px semibold, labels 12–13 px
  medium muted.
- **Shape and depth:** 6–8 px radius, 1 px borders, almost no shadow (only on popovers/modals). No gradients,
  glows, blobs, glassmorphism, 3D, illustrations, stock photos, emoji, or decorative icons.
- **Icons:** lucide-react only, 16 px, stroke 1.75, used functionally (navigation, actions, status). Never
  sparkles, wands, robots, brains, rockets or stars.
- **Components:** Button (primary / secondary / ghost / danger; sm / md), Input, MoneyInput (formats ₦ with
  separators, keeps string value), DateInput, Select, Combobox (searchable), Textarea, Checkbox, Radio group,
  Switch, Field (label + hint + error), Card, Badge / StatusBadge, KPI tile, DataTable (sort, filter,
  pagination, CSV, row click, sticky header), Tabs, Modal, Drawer / bottom sheet, Popover / dropdown menu,
  Toast, Stepper, EmptyState (text + action, no illustration), Skeleton, ErrorState with Retry, ConfirmDialog,
  SignatureModal, PageHeader with breadcrumbs.
- **Charts:** Recharts, muted palette, no 3D, thin gridlines, direct labels where possible, tooltips with ₦
  formatting, legible in dark mode.
- **Formatting:** `₦10,532,602.74`; compact `₦10.53M` / `₦1.2B` on tiles with exact value on hover; dates
  `22-Sep-2026`; date-time `22-Sep-2026 14:05`; durations `2h 14m`.
- **States:** every list and panel has loading skeletons, an empty state and an error state with Retry.

### Responsive rules (all screens)

- Breakpoints to verify: 360, 390, 768, 1024, 1280, 1440, 1920 px.
- **< 1024 px:** sidebar becomes an off-canvas drawer opened from a menu button; top bar condenses (search
  becomes an icon that opens a full-width search).
- **< 768 px:** data tables render as stacked cards (primary field + status + amount, then key fields); filters
  collapse into a "Filters" sheet; KPI tiles 2 per row; wizard stepper becomes a compact "Step 3 of 6" header
  with a progress bar; the controls panel becomes a bottom sheet; modals become full-height sheets; sticky
  bottom action bars for primary actions.
- Touch targets ≥ 40 px on mobile. No horizontal page scroll anywhere (wide tables scroll inside their own
  container on tablet).
- Print view unaffected by responsive rules.

### CRUD that must work

| Entity | Create | Read | Update | Delete / deactivate | Who |
| --- | --- | --- | --- | --- | --- |
| Customers | ✓ | ✓ | ✓ | Deactivate (blocked if active investments) | TO, ADM |
| Signatories & mandate | ✓ | ✓ | ✓ | ✓ (keep ≥ 1) | TO, ADM |
| Accounts | ✓ | ✓ | Status | Deactivate (zero balance only) | ADM |
| Beneficiaries | ✓ | ✓ | ✓ | ✓ | TO |
| Transactions | ✓ (wizard) | ✓ | Edit while DRAFT / RETURNED | Cancel | TO |
| Comments | ✓ | ✓ | Own | Own | all |
| Call-back logs | ✓ | ✓ | — (immutable) | — | AO, TO |
| Users | ✓ | ✓ | ✓ (role, status) | Deactivate | ADM |
| Banks | ✓ | ✓ | ✓ | Deactivate | ADM |
| Public holidays | ✓ | ✓ | ✓ | ✓ | ADM |
| Settings | — | ✓ | ✓ (reason required) | — | ADM |
| Notifications | system | ✓ | Mark read | Clear | all |

Every create/update/delete: validation with inline errors, success toast, audit event, list refreshes.

## 13. Build phases (verify each before the next)

- **Phase A — Clean foundation.** Remove Rocket leftovers (section 2), fix configs (`ignoreBuildErrors` off),
  new `package.json` scripts including `test:calc`, domain types, codes, money/format/dates/words utilities,
  calc.ts + `scripts/calc-check.ts` (6/6 PASS), store, services, workflow engine, deterministic seed.
  *Verify:* type-check clean, calc 6/6, a small script replays the seed with no errors and prints counts by
  status/type.
- **Phase B — Design system and shell.** Tokens (light/dark), components, login + 2FA, shell (sidebar drawer on
  small screens, top bar, search, notifications, role switcher, idle warning at 15 min / logout at 17 min),
  route guards, forbidden/not-found. *Verify:* screenshots at 375 / 768 / 1440.
- **Phase C — Core flow.** Wizard steps 1–6 for all 15 scenarios, vouchers, print view, approvals, operations,
  confirmation, transaction list + detail. *Verify:* each scenario end to end through all roles.
- **Phase D — Registers.** Investments, customers (full CRUD), beneficiaries, calendar, call-back log,
  notifications, dashboards.
- **Phase E — Oversight.** Reports with exports, audit trail with integrity check, settings (all tabs, CRUD),
  self-check page.
- **Phase F — QA.** Playwright: login per role; every scenario end to end; return / reject / stop / call-back
  failure / GAPS failure + retry / maker-checker; CRUD per entity; a crawler test that visits every route per role
  and clicks every enabled button, failing on console errors or uncaught exceptions; screenshots at 375, 768,
  1024, 1440, 1920. Grep for hard-coded money or counts in components. Fix everything and list what was fixed.

## 14. Final acceptance checklist

- [ ] `npm run type-check`, `npm run build`, `npm run test:calc` all pass; Playwright suite green.
- [ ] No Rocket leftovers, dummy keys or unused dependencies remain.
- [ ] All 15 scenarios complete end to end; investments, balances, dashboards, calendar, reports and audit trail
      update accordingly.
- [ ] Return, reject, stop, call-back failure, GAPS failure + retry, maker-checker all behave as specified.
- [ ] All CRUD in section 12 works with validation, toasts and audit events.
- [ ] Changing a rate in Settings recalculates open drafts; Self-Check still 6/6 (it uses fixed test settings).
- [ ] Every screen usable at 360 px through 1920 px, no horizontal page scroll, light and dark mode.
- [ ] Zero console errors during the crawler run.
- [ ] Money always `₦` with 2 dp and separators; dates `dd-MMM-yyyy`.
- [ ] Nothing committed or pushed; a short `CHANGES.md` summarises what was built and how to run the demo.

## 15. Demo script the build must support (15 minutes)

1. Log in as MD: AUM, inflows vs outflows, fee income, pipeline.
2. Switch to TO: maturities today → calendar → pick a maturing investment.
3. Start a partial pre-liquidation from the investment page; upload instruction, verify signature, call-back,
   refresh from Eazybankz.
4. Voucher: type ₦3,000,000; charge, remaining and rebooked principal calculate live; hover a figure for its
   formula; sign and submit.
5. Walk the chain: HT → MIS (show Return once, resubmit) → Audit (checklist, audit trail) → MD approves.
6. Operations: send to GAPS (one simulated failure, retry), posting ref.
7. TO confirms: checklist fully green; register shows the rebooked investment; charges report includes the
   charge.
8. Settings: change the pre-liquidation rate live, show a draft recalculating; Integrations tab to introduce
   Phase 2.
