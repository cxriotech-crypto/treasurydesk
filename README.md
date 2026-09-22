# TreasuryDesk

Treasury operations workflow for **First Marina Trust Finance Company Limited**: customer instruction →
signature verification → call-back → Eazybankz check → voucher → five-level approval → Operations
execution → Treasury confirmation.

Phase 1 is a fully working frontend demo on mock data that lives in the browser. Phase 2 connects the same
screens to an Oracle-backed API, Eazybankz and GAPS. The full specification is in `docs/BUILD_BRIEF.md`.

## Run the demo

```bash
npm install
npm run dev          # http://localhost:4028
```

Copy `.env.example` to `.env.local` to change the two settings (mock services on/off, API base URL).

## Commands

| Command | What it does |
| --- | --- |
| `npm run dev` | Development server on port 4028 |
| `npm run build` / `npm start` | Production build / serve it on port 4028 |
| `npm run type-check` | TypeScript check (must be clean) |
| `npm run test:calc` | Calculation checks from brief section 7.4 (6/6 required + extra cases) |
| `npm run seed:report` | Builds the demo data by replaying the workflow engine, checks invariants, prints counts |
| `npm run test:flow` | Drives all 15 scenarios end to end through every role via the services |
| `npm run test:e2e` | Playwright end-to-end suite (sign-in, route crawler, flows, CRUD, responsive) |

Sign in with any demo user listed on the sign-in page, any password, 2FA code `123456`, signature PIN `1234`.
Stop the dev server before `npm run build` (the build overwrites the dev server's output).

See `CHANGES.md` for what the demo covers and the decisions that need the client's confirmation.

## Structure

```
src/domain      Types (Oracle-ready shapes), codes and labels, business rules
src/lib         money (decimal.js), dates (Africa/Lagos), formatting, amount in words, calc engine
src/data        In-browser store (localStorage), repository helpers, audit hash chain, deterministic seed
src/services    One service per domain (mock + HTTP), workflow engine, voucher builder, useData hook
src/components  Design system, app shell, transaction pieces, charts
src/app         Screens and the route registry (roles + availability)
tests           Playwright suite
scripts         calc-check, seed-report and flow-check
```

Screens read and write data only through `src/services`. Every state change goes through
`src/services/workflow.ts` and writes a hash-chained audit event.
