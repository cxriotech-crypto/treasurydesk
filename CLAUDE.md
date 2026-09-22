# TreasuryDesk — project rules for Claude Code

TreasuryDesk is a treasury operations workflow app for **First Marina Trust Finance Company Limited** (Nigeria).
Phase 1 (now) is a **fully working frontend demo on mock data**. Phase 2 will connect it to an Oracle-backed API
and the bank's core banking system (Eazybankz) and payment channel (GAPS).

The full specification is in `docs/BUILD_BRIEF.md`. Read it completely before changing anything.

## Non-negotiable rules

1. **Never `git commit` or `git push`.** The owner reviews and commits everything themselves. Leave all changes in
   the working tree.
2. Every button, link, tab, filter, menu item and form works. No placeholders, no "coming soon", no dead clicks,
   no `alert()`/`confirm()`/`prompt()` — use the app's own modals and toasts.
3. Every number on screen is computed from data (services or `src/lib/calc.ts`). No hard-coded amounts, counts
   or KPIs in components.
4. All money maths uses `decimal.js` via `src/lib/money.ts`. Money is stored and passed as **strings** with 2 dp,
   rounded ROUND_HALF_UP. Never use JavaScript floats for money.
5. Screens read and write data **only through `src/services/*`**. Never import seed data into components.
6. Every write goes through the workflow/service layer and creates an audit event.
7. Maker-checker holds everywhere: the creator of a transaction can never approve it; no user signs twice.
8. Design: modern, clean, simple, professional. No gradients, no illustrations, no stock or AI imagery, no emoji,
   no sparkle/magic/robot icons, no glassmorphism, no oversized rounded "AI dashboard" cards. See the design
   section of the brief.
9. Fully responsive from 360 px phones to 1920 px desktops. No horizontal page scroll at any width.
10. Keep the Oracle-ready shapes described in the brief (entity names, codes, ISO dates, money strings,
    `id` + `version` on every record, `{ items, total }` list results).

## Commands

- `npm install` — install dependencies
- `npm run dev` — dev server on http://localhost:4028
- `npm run type-check` — must pass with zero errors
- `npm run build` — must pass
- `npm run test:calc` — calculation checks, must print 6/6 PASS (plus any extra cases)
- `npx playwright test` — end-to-end checks (set up in Phase F of the brief)

## Definition of done for any change

Type-check passes, build passes, calc checks pass, the affected flows were clicked through in a real browser at
375 px, 768 px and 1440 px widths with no console errors.
