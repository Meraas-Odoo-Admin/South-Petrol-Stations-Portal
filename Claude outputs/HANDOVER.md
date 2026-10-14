# Handover: South Petrol Stations Portal (ضبط الوقود)

For the next Claude supervisor and the next Claude Code session, on any machine. Read it fully before doing anything.

## 1. What this is

A fuel fill-up control system for petrol stations overseen by **مديرية أمن سبها** (the client). It rolls out one municipality at a time, starting with **Sabha**, with 29 real stations.

- **Registration offices** register vehicles and print a one-face card with a QR code.
- **Petrol stations** scan the card with a phone and record the fill-up.
- **Municipality managers** and a **super admin** supervise everything.

**Stack:** pnpm monorepo, with:
- `apps/api` (NestJS, Prisma, PostgreSQL);
- `apps/web` (React, Vite, Arabic RTL, Cairo font);
- `packages/shared-types` (shared validators).

## 2. Who does what (the working method)

- **Mohamed** (project owner) decides. He tests, talks to the client, and pastes prompts.
- **Claude (chat), as supervisor:**
  - writes prompts for Claude Code as files in `Claude outputs/`;
  - reviews every Claude Code report against the prompt before approving;
  - explains things to Mohamed simply, with no jargon, using examples and clear reasons;
  - never approves untested or unrequested changes.
- **Claude Code (VS Code, on the laptop)** builds. Every round:
  - works on its own branch from `main`;
  - runs lint, typecheck, `pnpm test`, API e2e and the full Playwright suite through the root scripts, **on a scratch database** (never the dev DB);
  - **stops before committing** so the work can be reviewed;
  - after approval: commits, pushes, merges into `main` with `--no-ff`, and pushes normally.

## 3. Hard rules (never break)

1. **Never force-push.** Never bypass pre-commit hooks.
2. **Repository stays PRIVATE.** It was public for about 22 hours once and exposed real names and phones.
3. **No real personal data in tracked files.** Never commit:
   - `data/private/`, `Claude outputs/*.csv`, `*.xlsx`, `*.xls`;
   - `.env` files;
   - the root `.impeccable/`;
   - `docs/card-rendering/*.pdf`.

   The `no-real-data` unit test guards this.
4. **Migrations are additive only.** Never drop or edit existing ones. Removed features are removed from the API and UI, and their data stays.
5. **Permissions are data** (`apps/api/prisma/rbac-catalog.ts`), never role-name checks, and they're enforced in the API.
6. **UI:** use the **impeccable** skill and follow `apps/web/PRODUCT.md` and `apps/web/DESIGN.md`:
   - minimum text sizes: phone 16/13 px, desktop 14/12 px;
   - Ink #132524 text on amber;
   - red only for broken rules and irreversible actions;
   - never colour alone;
   - every message in clear Arabic.
7. **No owner name or national ID on the card.** No imitation of the official emblem.
8. **Don't re-seed or run tests against the dev DB** unless Mohamed asks. It holds a clean demo.

## 4. State on 14 Oct 2026

- **`main`:** Phase 6 Part A, the follow-ups and Part B are merged. Always pull the latest `main` before starting. Everything is pushed.
- **Phases built:** 1–3 (foundation, roles, card), 4a–4c, 5A–5C, the client-final-decisions round, the UX round (tabs, pagination, bell, nav) and Phase 6 (simplify, print, UX).
- **The dev DB is a clean demo:**
  - 29 Sabha stations, 6 real companies, 1 registration office with 2 desks;
  - 0 vehicles and 0 fill-ups;
  - 9 demo accounts on `ChangeMe123!` (forced change): `a.alfituri` (super admin), `s.aljabali` (municipality manager), `f.alatrash` and `i.altarqi` (supervisors), `a.alsharif` (office manager), `y.ghalboun` and `h.almabrouk` (station employees), `m.alzarrouq` and `k.alobeidi` (registration employees);
  - plus Mohamed's own `sebha.admin`.

  This DB is only on Mohamed's original laptop.
- The latest migration, `20261014130000_p6_default_exception_limits`, is not yet applied to that dev DB.

## 5. Client decisions in force (don't reverse without Mohamed)

**Structure:**
- The super admin creates municipalities and municipality managers.
- Municipality managers run stations, registration offices, supervisors and office managers (in «إدارة المحطات»).
- Supervisors create their station employees («محطتي»). Office managers create registration employees («مكتبي»).
- Each level creates only the level below. Archive, never delete.
- Each municipality gets «مديرية أمن ‹البلدية›» automatically. There is no users section and no الجهات الأمنية section.

**Activation:** one switch per municipality, «مفعّلة منذ ‹التاريخ›», super admin only. It gates nothing. There are no grace, awareness or deadline stages.

**Pump:**
- **Card scan only.** No typed plates.
- **Fallback when the card can't be used:**
  - search a **registered** car by plate, owner name or booklet number;
  - a reason is required: «البطاقة تالفة» / «الكاميرا لا تعمل» / «البطاقة غير موجودة»;
  - recorded as «بدون بطاقة», shown in reports.
- There is no emergency override.

**Exceptions:**
- Admins (super admin, or a municipality manager for their own municipality) define exception types, each with a **daily limit per station** (default 10; empty = no limit).
- Staff use them **without approval**, and every use is logged.
- **Over the limit:** a warning, a flag, and one notification to the supervisor and manager per type, per station, per day.
- **Strict switch** «منع تجاوز حد الاستثناءات»: global, overridable per municipality.
- **Station flag:** set by the threshold `exceptions.station_daily_threshold` (default 20).
- Per-vehicle standing exceptions are removed.

**Owners and vehicles:**
- **Individuals only** (no institutions).
- **National ID:** 12 digits; first digit 1 or 2; digits 2–5 a valid birth year; owner 18+. **No check-digit validation** (the client's decision).
- **Administrative number** (changed 14 Oct, built in Phase 7): 10 digits, starting with 5 (male) or 6 (female).
- **Required vehicle fields:** plate (optional trailing N is part of its identity), chassis, booklet, make, model (free text, as in the booklet), colour (list + أخرى), year 1950 to next year, fuel type (a mismatch warns at the pump).
- **Chassis:** 17 characters normally. 6–20 only with «رقم هيكل غير قياسي». Dashes are stripped automatically (Japanese frame numbers).

**Removed features:**
- blank-card stock tracking;
- the readiness report;
- the guided tour;
- the station ownership field;
- the stolen-vehicle flag.

**Kept:**
- fuel stock per station (deliveries, computed level, 1,000 L alert, reset with confirmation, «إظهار المخزون للموظفين» switch);
- routes;
- all remaining notifications;
- fuel types, set by both the supervisor and the municipality manager.

**Merged:**
- the dashboard into «اليوم» (the daily report);
- one CSV export, plus PDF where printing makes sense;
- the test card into the printer setup card;
- vehicle and exception types into «القوائم».

**Card:**
- printer: **Evolis Zenius Classic** (single-sided, 300 dpi, CR80 85.60 × 53.98 mm);
- **one face only, option A**: QR about 29 mm on the left, plate largest top right, all vehicle details;
- colour and black-only PDFs;
- the printer setup card;
- `docs/PRINTING.md`.

## 6. What's left

0. **Phase 7: Mohamed's review fixes (do this first).** Everything is listed in `Claude outputs/claude-code-phase7-client-review-fixes.md`. Decisions taken on 14 Oct 2026:
   - administrative number: 10 digits, starting with 5 (male) or 6 (female);
   - booklet number: digits only;
   - no N plate suffix;
   - year as a dropdown;
   - «رقم المرجع/الإثبات» removed (auto codes only);
   - desks and printers removed;
   - the municipality manager may issue cards in their own municipality;
   - stations and offices in separate lists;
   - no custom numeric rules;
   - units on every setting;
   - «القوائم» moved into settings;
   - a stronger button and colour system.

   Phase 7 also includes the Part B leftovers (item 2 below).
1. **Testing tracker for Mohamed.** A published artifact listing every function for every role, with a tick and a notes field each, that saves as he goes. Build it from the current app (after Phase 6).
2. **Small polish round** (from Part B "not done"):
   - skeleton loaders on all lists;
   - first-error focus in older forms;
   - the 12-box ID row clipping at 390 px;
   - the 7 older side-tab anti-patterns;
   - the pump figure font sizes;
   - a full `/impeccable critique` and `audit` pass;
   - a fresh full API e2e and Playwright run (the last migration and test were added after the final full run).
3. **Real hardware:**
   - print the printer setup card and a real card on the Evolis;
   - check the edges, the QR scan and the driver settings per `docs/PRINTING.md`;
   - the real-iPhone check (zoom on the amount field, the bottom bar vs the home indicator, one-handed use, sunlight).
4. **Go-live:** a server and a domain, then `infra/DEPLOYMENT.md` in order:
   1. create the super admin (`bootstrap:prod`);
   2. create the municipality managers;
   3. run `stations:import` with the private CSV;
   4. create the offices, supervisors and office managers;
   5. create the employees;
   6. supervisors enter their tanks and fuel types.

## 7. Prompt files

All earlier prompts are in `Claude outputs/` (the phase 1–6 prompts, design briefs, field specs). The newest are:
- `claude-code-phase6-simplify-print-ux.md`;
- `claude-code-phase6-partA-followups.md`.
