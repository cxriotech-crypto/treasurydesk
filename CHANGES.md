# TreasuryDesk — what was built

A complete, clickable Phase 1 demo of the treasury workflow for **First Marina Trust Finance Company Limited**,
built on mock data that lives in the browser. Nothing is committed: every change is in the working tree for review.

## Run it

```bash
npm install
npm run dev          # http://localhost:4028
```

Sign in with any demo user (the sign-in page lists them), any password, 2FA code `123456`, signature PIN `1234`.
The user menu switches between the demo users in one click.

| Command | What it does |
| --- | --- |
| `npm run type-check` | TypeScript, zero errors |
| `npm run build` | Production build (runs ESLint + Prettier rules) |
| `npm run test:calc` | Calculation checks from the brief (6/6 required + 12 extra, including the client's COT examples) |
| `npm run seed:report` | Rebuilds the demo data, checks invariants, prints counts |
| `npm run test:flow` | All 16 scenarios end to end through every role, plus the exception paths |
| `npm run test:e2e` | Playwright: sign-in, route crawler, flows, CRUD, responsive |

> Stop `npm run dev` before `npm run build` — the build overwrites the dev server's output. If the app goes blank,
> delete `.next` and restart the dev server.

## What the demo covers

- **All 16 scenarios** run end to end (the 15 in the SOP plus Inflow B). The Treasury Officer prepares
  everything — instruction, signature verification, Eazybankz check and the full voucher (new rate, tenor and so
  on) — and signs. It then goes to the customer's **Account Officer**, then Head of Treasury → MIS → Internal
  Audit → MD → Operations (two officers) → Treasury confirmation. Six signatures in all.
- **Inflow has two scenarios.** A: funds received booked as a new investment (as before). B: funds received
  credited to an account the Treasury Officer picks — the customer's Personal Account, Savings account, Current
  account, a Call account, or "Other" (typed in). Inflow B goes Treasury Officer → Head of Treasury → Operations
  (two officers, the same as every other transaction) with no Account Officer call-back; the levels it skips show
  as "not required" in the controls. Personal, Savings and Current accounts are credited when Operations' record
  is approved; Call and other accounts are posted by Operations in Eazybankz and recorded on the voucher.
- **Three account types**: Personal Account (PA), Savings (SS) and Current account (CA). Companies and some
  individuals in the demo hold a Current account; third-party payments can go out of a Personal or a Current
  account.
- **One voucher per transaction.** A transaction that both pays out and rolls over — rollover B, C and D, and
  partial pre-liquidation — issues a single voucher with both parts on it under their own headings (Roll-over and
  Payout, or Pre-liquidation and Rebooking), one voucher number, one payment instruction and one set of
  signatures.
- **Partial pre-liquidation adds the accrued interest to the rebooking.** The accrued interest, less withholding
  tax, is added to the principal of the rebooked investment; the voucher shows the interest, the WHT and the
  amount added.
- **Maker-checker throughout.** The Treasury Officer who raises a transaction can never approve it, and no user
  signs the same transaction twice. Blocked buttons say why.
- **The Account Officer is the checker** (SOP step 3). Once the Treasury Officer submits, the customer's own
  Account Officer is notified, calls the customer on the registered number, logs the call, and then approves
  (on to Head of Treasury), returns it to the maker, or rejects it. They cannot approve until the customer has
  confirmed on a call logged in that round.
- **Batches.** The Treasury Officer can tick several ready transactions and submit them together with one
  signature (Work → Batches → New batch). At every level the approver opens the batch, decides item by item —
  approve, return or reject, with a reason for the last two — and signs once. Approved items move on; returned
  and rejected ones go back to the maker. The batch keeps a record of where each item is.
- **A return starts the chain again.** A returned (or recalled) transaction comes back to the Treasury Officer,
  stays editable, and on resubmission goes through every level again from the Account Officer, with earlier
  signatures kept in the history but no longer counting.
- **Recall.** The Treasury Officer can recall a submitted transaction at any point before Operations execute it.
  Anyone else involved can *request* a recall; the Treasury Officer then brings it back to themselves, sends it
  back to the person who asked (the signatures from their level on are set aside and they decide again), or
  declines with a reason.
- **Internal Audit re-verifies the signature.** Audit sees exactly what the Treasury Officer saw — the
  instruction documents beside the specimen signatures and the mandate — and ticks the same four checks before
  they can sign.
- **Operations record payments; TreasuryDesk never moves or holds money.** Operations pay in GAPS (and post in
  Eazybankz) as they do today, then record the outcome: paid, with the Eazybankz and GAPS references, or failed,
  with the reason (a list of common reasons such as "Destination bank not available", or their own words). A
  different Operations officer checks the record and approves it. An approved "paid" record executes the
  transaction; an approved "failed" record goes back to Operations to pay again and record the new outcome. The
  second officer can send a record back to be corrected. Once Operations record a payment as made, the
  transaction can no longer be recalled.
- **Paper signatures.** If an approver cannot use TreasuryDesk, the Treasury Officer prints the voucher, has it
  signed by hand, and uploads the signed copy for that step, naming who signed and why. The upload completes the
  step in the approver's name, marked "signed on paper", with the scan attached and an audit entry. The approver
  is told and sees a banner on the transaction: "Yes, I signed it", or "I did not sign it" with a reason. A
  dispute sets their signature aside, brings the transaction back to them if it has not been paid, and alerts
  Internal Audit, the Head of Treasury and the MD.
- **Audit-trail review.** Internal Audit can select entries in the audit trail and mark them verified, flag them
  with a reason, or put them back to not reviewed. Each entry shows its status, who reviewed it and when, and
  its review history (for example, flagged and later verified). Counts of verified, flagged and not-reviewed
  entries sit at the top, and a filter shows each group. An auditor never reviews their own actions. "Verify
  integrity" is a separate, automatic check that no entry has been altered or deleted, and the page explains
  the difference.
- **Commission on turnover (COT)** is charged on debits: money paid out of a Current account and out of Call
  placements. COT = rate × amount ÷ 1,000. The Treasury Officer chooses the rate on each transaction — ₦2 per
  mille, ₦5 per mille or any other rate — and the voucher cannot be signed until one is chosen. ₦1,000,000 at ₦2
  is ₦2,000, at ₦5 is ₦5,000. COT is deducted from what is paid out, shown on the voucher and in the charges
  report, and can be switched off for one transaction with a reason.
- **Several documents everywhere.** The instruction can have several documents, a paper signature several
  pages, and every transaction has a Documents tab where anyone working on it can add supporting documents,
  several at a time (PDF, PNG or JPEG, up to 1 MB each).
- **Weekend maturities are caught.** When a new maturity date would fall on a weekend or public holiday, the
  voucher asks: move it to the next business day (the tenor is adjusted for you), or pick another date. It
  cannot be signed until the date is a business day.
- **Withholding tax and the pre-liquidation charge can each be switched off per transaction**, on the voucher
  step. Switching one off requires a typed reason, the same way stop, return and reject do. The reason prints
  on the voucher beneath the row it explains and is kept in the audit trail. A WHT-exempt customer locks the
  tax switch off and says why.
- **Returns, rejections, stops, failed call-backs and GAPS failures** all behave as the SOP describes.
- **Every figure is calculated** by `src/lib/calc.ts` with decimal.js. Hovering the "fx" marker shows the formula
  with the real numbers. Changing a rate in Settings recalculates open drafts.
- **Printable A4 vouchers** with the previous investment that leads to the new one (reference, principal, rate,
  dates, tenor, interest paid and interest accrued), amount in words, payment instruction, six signature boxes
  and the Operations box showing who keyed and who approved the posting.
- **Registers**: investments (live accrued interest), customers (full CRUD with signatories, mandate, accounts and
  beneficiaries), calendar, call-back log, notifications.
- **Data import** (Treasury → Data import): load customers, accounts, investments, beneficiaries, banks or public
  holidays from a **CSV or Excel (.xlsx)** file. Each register has a downloadable template; every row is checked
  before anything is written and the rows that fail are listed with their line number and reason. A Treasury
  Officer's upload waits for the Head of Treasury to approve it; a Head of Treasury's own upload applies straight
  away. Rows that cannot be written at that point (a missing customer, a duplicate) are skipped with a stated
  reason, and every record created is audited.
- **Approval notes.** Any approver can leave an optional note when they sign. Whoever receives the transaction
  next sees the name, the position and the note — on the transaction itself, in their approval queue and in the
  notification.
- **Oversight**: 8 reports with CSV / Excel / print, a hash-chained audit trail with an integrity check and Internal Audit's review, settings
  (rates, SLA, holidays, banks, users and permissions, integrations, demo controls) and the calculation self-check.
- **Responsive** from 360 px to 1920 px, light and dark, with no horizontal page scroll.

## How it is put together

```
src/domain      Types (Oracle-ready), codes and labels, business rules
src/lib         money (decimal.js), dates (Africa/Lagos), formatting, amount in words, calc engine
src/data        Browser store (localStorage), repository helpers, hash-chained audit, deterministic seed
src/services    One service per domain (mock + HTTP stub), workflow engine, voucher builder, useData hook
src/components  Design system (ui), app shell, transaction pieces, charts
src/app         Screens; src/app/routes.ts is the single route registry (roles + availability)
tests           Playwright suite
scripts         calc-check, seed-report, flow-check
```

Screens read and write **only** through `src/services`. Every state change goes through `src/services/workflow.ts`,
which validates role, state and maker-checker, ticks the 12 SOP controls, writes an audit event and notifies the
next role. Swapping `NEXT_PUBLIC_USE_MOCK=false` points the same screens at the Phase 2 REST API.

## Demo data

Rebuilt for "today" on first load each day, so it never goes stale: 40 customers, 102 accounts, 171 investments,
20 banks, 25 beneficiaries, public holidays, and 79 transactions covering every status and every type (at least 8
waiting at each of the five approval levels, 3 SLA breaches, returns, rejections, stops, failed payments, two
batches, a recall, a pending recall request, paper signatures, Inflow B items and payment records awaiting a
second Operations officer). Plenty is left untouched for new work: 20 matured investments awaiting instruction,
10 maturing today, 35 maturing within 7 days, 24 anniversaries due within 14 days, and long-dated investments to
pre-liquidate. The older part of the audit trail has been
reviewed by Internal Audit (two entries flagged, one since verified); the last week is not reviewed yet.

Settings → Demo has two buttons. **Reset demo data** brings back the full demo. **Start fresh** keeps the same
customers, investments, accounts and completed history but leaves nothing in progress, so testers can raise
every transaction themselves and take it through from the start.

## Decisions worth confirming with the client

- The rates and policies in Settings are the brief's defaults and remain assumptions: WHT 10%, pre-liquidation
  charge 20%, transfer fee 0.10%, 365-day basis, no WHT on anniversary interest, SLA 8 hours with a 15:00 cut-off.
- A new maturity on a weekend or public holiday is caught and the user is asked to move it. Investments loaded
  through Data import keep the automatic move to the next business day, since they come from existing records.
- Eid holiday dates are estimates and are editable in Settings.
- Account Officers only see transactions, investments and call-backs for their own customers, and only they can
  log a call-back — there is no cover path for an officer on leave, so confirm how absence is handled.
- The pre-liquidation charge is a flat 20% of accrued interest. The SOP lists the charges as "30 Days, 60 Days,
  90 Days" without rates; if the charge is tiered by how early the investment is broken, the tiers are needed.
- A paper signature uploaded by the Treasury Officer completes the step straight away, as asked; the approver can
  dispute it afterwards. If a second person should confirm it before it counts, that is a small change.
- The demo signs users out after 17 minutes of inactivity, with a warning at 15.

### Round 3 assumptions still open (each is easy to change)

- **COT** is deducted from the amount paid out (not charged on top). Personal and Savings accounts and term
  deposits are not charged.
- **Inflow B** to a Call account or "Other" is posted by Operations in Eazybankz and recorded with the account
  number the officer types. Overdraft was removed, as the client asked.
- **Paper signatures** follow the client's own process: the upload counts at once and the approver can dispute.
- **Audit review** is done by Internal Audit (the same person as IT Audit). A flag notifies the Head of Treasury
  and the MD.
- **Operations** record GAPS outcomes and never send payments. A live GAPS/NIP connection is out of scope.
- The extra security controls proposed by the backend review (F2–F16) are on hold until the client confirms them.

