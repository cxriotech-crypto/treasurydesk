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
| `npm run test:calc` | Calculation checks from the brief (6/6 required + 9 extra) |
| `npm run seed:report` | Rebuilds the demo data, checks invariants, prints counts |
| `npm run test:flow` | All 15 scenarios end to end through every role, plus the exception paths |
| `npm run test:e2e` | Playwright: sign-in, route crawler, flows, CRUD, responsive |

> Stop `npm run dev` before `npm run build` — the build overwrites the dev server's output. If the app goes blank,
> delete `.next` and restart the dev server.

## What the demo covers

- **All 15 SOP scenarios** run end to end. The Treasury Officer prepares everything — instruction, signature
  verification, Eazybankz check and the full voucher (new rate, tenor and so on) — and signs. It then goes to
  the customer's **Account Officer**, then Head of Treasury → MIS → Internal Audit → MD → Operations (two
  officers) → Treasury confirmation. Six signatures in all.
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
- **Operations, two people.** One Operations officer keys the Eazybankz posting reference; a different officer
  approves it, and only then is it executed (posted, and sent to GAPS where money leaves the bank). The second
  officer can also send a keyed posting back to be corrected. A failed GAPS payment is keyed and approved again.
- **Paper signatures.** If an approver cannot use TreasuryDesk, the Treasury Officer prints the voucher, has it
  signed by hand, and uploads the signed copy for that step, naming who signed and why. The step is recorded in
  the approver's name, marked "signed on paper", with the scan attached and an audit entry.
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
- **Oversight**: 8 reports with CSV / Excel / print, a hash-chained audit trail with an integrity check, settings
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

Rebuilt for "today" on first load each day, so it never goes stale: 40 customers, 80 accounts, 120 investments,
20 banks, 25 beneficiaries, public holidays, and 74 transactions covering every status and every type (at least 8
waiting at each of the five approval levels, 3 SLA breaches, returns, rejections, stops, GAPS failures, two
batches, a recall, a pending recall request, paper signatures and postings awaiting a second Operations officer). Settings → Demo
resets it, changes the simulated latency, or forces GAPS failures.

## Decisions worth confirming with the client

- The rates and policies in Settings are the brief's defaults and remain assumptions: WHT 10%, pre-liquidation
  charge 20%, transfer fee 0.10%, 365-day basis, no WHT on anniversary interest, interest not paid on partial
  pre-liquidation, SLA 8 hours with a 15:00 cut-off.
- A new maturity on a weekend or public holiday is caught and the user is asked to move it. Investments loaded
  through Data import keep the automatic move to the next business day, since they come from existing records.
- Eid holiday dates are estimates and are editable in Settings.
- Account Officers only see transactions, investments and call-backs for their own customers, and only they can
  log a call-back — there is no cover path for an officer on leave, so confirm how absence is handled.
- The pre-liquidation charge is a flat 20% of accrued interest. The SOP lists the charges as "30 Days, 60 Days,
  90 Days" without rates; if the charge is tiered by how early the investment is broken, the tiers are needed.
- A paper signature is uploaded by the Treasury Officer — the maker — on the approver's behalf, as asked. It is
  named, evidenced by the scan and audited, but it does let the maker complete someone else's step. Confirm
  whether a second person (for example Head of Treasury) should confirm a paper signature before it counts.
- The demo signs users out after 17 minutes of inactivity, with a warning at 15.
