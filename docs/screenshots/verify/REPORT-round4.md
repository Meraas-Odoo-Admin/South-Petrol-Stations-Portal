# Round 4 — Client Feedback Implementation Report

Source: `claude-code-round4-feedback-prompt.md` (direct client feedback after
reviewing the live app plus 11 newer Claude Design mockups saved to
`design/feedback-2026-08-29/`). This report covers what was built, verified,
and left open — in the same spirit as `REPORT.md`/`REPORT-round3.md`.

## Checklist before calling this done

- `pnpm lint` — clean across all workspaces (shared-types, api, web).
- `pnpm --filter @fuel-tracking/api exec tsc --noEmit` — clean.
- `pnpm --filter @fuel-tracking/web exec tsc --noEmit` — clean.
- API unit tests: **18/18** passing (`fill-up-rule-engine.spec.ts`,
  `week-window.strategy.spec.ts`, `duration.spec.ts`).
- API e2e: **129/129** passing (`pnpm --filter @fuel-tracking/api run
  test:e2e`, against a freshly reseeded DB).
- Web e2e (Playwright, real browser against the real dev stack): **5/5**
  passing (`auth.spec.ts` ×2, `fillups.spec.ts`, `reports.spec.ts` ×2).
- Station-scoping boundary tests (pre-existing, part of the API e2e suite)
  still pass unchanged.
- `mustChangePassword` e2e test (added round 3) still passes unchanged.

## What was built, item by item

### 1. Settings page redesign
`SettingsAdminPage.tsx` rebuilt to match
`11-design-target-settings-rich.png`: +/- stepper cards with a centered
value, `fillup.week_window_mode` rendered as two labeled pills (متجدد/ثابت)
instead of the raw `'rolling'`/`'fixed'` DB string (the exact complaint in
`01-settings-week-calc-issue.png`), a button-group for week-start-day, and a
real **DB-computed** before/after impact banner
(`SystemSettingsService.computeWeeklyCapImpact`) for the two weekly-cap
settings — counts actual `Exception` rows that tripped that specific rule
and recomputes whether they'd still trip it at the hypothetical new value.
Not fabricated text; returns `null` (no banner shown) for any setting it
can't honestly compute an impact for.

Added a `POST /system-settings` + "إضافة قاعدة رقمية جديدة" affordance,
since `SystemSetting` is a table per CLAUDE.md rule 4. **Important scoped
limitation, surfaced directly in the UI, not glossed over**: creating a row
here only adds the DB row — it does not wire the new key into
`FillUpRuleEngine`. A new setting only affects behavior once code is
written to consume it. See `docs/OPEN_ITEMS.md` #23.

Per-usage-type max-liters-per-fill-up breakdown ("دراجة/إدارية/نقل/دورية")
from the mockup was **not built** — it's a new rule the engine doesn't have
today, and `VehicleUsageType` only has 3 values, not 4. Flagged as
`docs/OPEN_ITEMS.md` #22 rather than guessed at.

### 2. Fill-up confirmation screen layout bug
Root cause: `p-4.5`, `h-13`, `h-13.5`, `gap-4.5`, `mt-4.5` are not valid
Tailwind utilities — the project's spacing scale (default, no custom
extension) doesn't include `.5` increments past `3.5`, or `13`/`13.5` at
all. These silently produced **zero CSS**, which is exactly why the
confirmation card in `02-fillup-success-layout-issue.png` looked
unstyled — it had no padding at all, not "wrong" padding. Swept and fixed
all 8 occurrences across `RecordFillUpPage.tsx`, `LoginPage.tsx`, and
`ChangePasswordPage.tsx` (not just the one screen the client screenshotted),
since it's the identical class of bug and could plausibly recur elsewhere
unnoticed. Replaced with valid literal pixel values (`p-[18px]`,
`h-[52px]`, `h-[54px]`) matching the surrounding design system's existing
conventions.

### 3. Fill-up form
- **Plate auto-formatting**: `formatPlateAsTyped()` added to
  `libyanFormats.ts`, wired into `VehicleSearchSelect.tsx`'s input —
  live-inserts the city-code/sequence separator as digits are typed. Real
  Libyan plates can have a 1- or 2-digit city code (seed data has both) —
  genuinely ambiguous to auto-detect from digits alone with no lookup
  table of valid codes, so this defaults to a 1-digit code (the common
  case) and a user with a 2-digit code types the separator themselves,
  same as before.
- **"مركبة جديدة" gating + duplicate handling**: the button is disabled
  until at least one digit is typed. `VehicleCreateForm.tsx` now catches a
  409 conflict on submit, looks up the matching vehicle by the typed
  plate, and auto-selects it instead of just failing — no duplicate
  vehicle records under an already-registered plate.
- **Inline vehicle preview**: `VehiclePreviewCard.tsx` (new) shows
  make/model, usage type, owner, and current driver inline once a vehicle
  is selected — the same fields `VehicleDetailPage.tsx`'s identity card
  already surfaces, via `GET /vehicles/:id`.
- **Auto-calculated cost field**: `quantityLiters × price-per-liter`,
  read-only, driven by three new `SystemSetting` rows
  (`fillup.price_per_liter.{PETROL_95,DIESEL,KEROSENE}`) via a new
  `GET /fillups/fuel-prices` endpoint. Seeded بنزين 95 at the client's
  confirmed 0.15 LYD/liter; diesel/kerosene are explicit, clearly-labeled
  placeholder values (0.10/0.05) — not guessed real prices. See
  `docs/OPEN_ITEMS.md` #21 for the open question on diesel/kerosene prices
  and whether cost should be persisted for reporting.

### 4. Standing-exception date field
**Diagnosis confirmed live before any fix work**, per the round 4
instruction to verify rather than assume: the native `<input type="date">`
displays its `mm/dd/yyyy` placeholder per the *browser's* UI locale, not
the page's `lang="ar"` attribute (Chromium ignores page `lang` for this
control) — matches `05-standing-exception-date-field-issue.png` exactly.
Replaced with a new `DateField` component (`components/DateField.tsx`): a
typed `dd/mm/yyyy` text field (the convention used everywhere else in this
app), with a small calendar-icon button that still opens the real native
picker for mouse users via a visually-hidden linked date input.

### 5–8. Four screens matched to the newer mockups
- **`VehicleDetailPage.tsx`** (→ `06-design-target-vehicle-detail.png`):
  added a weekly-consumption bar ("X من Y تعبئات مسموح بها") backed by a
  new `GET /vehicles/:id/weekly-usage` endpoint (reuses the exact same
  week-window logic the rule engine itself uses), and per-row
  `FillUpStatusPill` on the fill-up history table (distinguishes
  "استثناء مستمر" / "استثناء معتمد" / "بانتظار الاعتماد" /
  "مطابق للقواعد" instead of a bare yes/no). Plate-history timeline and
  identity card already matched the mockup's shape from round 3.
- **`DriversListPage.tsx`** (→ `07-design-target-drivers-list.png`):
  rebuilt with avatar-initials chips, masked national ID with a per-row
  reveal toggle (each reveal its own audited action, same as
  `DriverDetailPage.tsx`), a "من لديه استثناء مستمر" filter chip, and
  server-side search (name/phone/ID) via a new `FindDriversQueryDto`. A
  station filter from the mockup was **not built** — `Driver` has no
  direct station relation; see `docs/OPEN_ITEMS.md` #25.
- **`DriverDetailPage.tsx`** (→ `08-design-target-driver-detail.png`):
  the standing-exceptions card gets an amber border when an exception is
  active, and each active grant's scope is written as a full sentence
  ("هذا السائق، على مركبة … فقط") via a new `describeEntryScope()` helper
  in `StandingExceptionsSection.tsx` — not just a badge. Associated
  vehicles rendered as chips. Fill-up history table also gets
  `FillUpStatusPill`.
- **`ChangeRequestsQueuePage.tsx`** (→
  `09-design-target-change-request-diff.png`): real character-level diff
  highlighting via a new `diffValues()` helper (`lib/textDiff.ts`,
  common-prefix/common-suffix diff — sufficient for the fixed-length
  identifiers this diffs), old value in reading-first position, proposed
  value outlined in amber with only the changed characters marked, a
  "ما يتأثر بالاعتماد" consequences list, and "اعتماد التصحيح"/"رفض مع
  ذكر السبب" actions. This explicitly supersedes round 3's note that
  diff-highlighting was lower priority.

### 9. Reports — richer, chart-backed
`DailyReportPage.tsx` rebuilt to match
`10-design-target-daily-report.png`: tinted active filters, a live
"تعرض X من أصل Y تعبئات بعد تطبيق المرشحات" count line
(`totalBeforeFilters` vs `totalFillUps`, both from the same filtered
response), KPI tiles, a fuel-type-breakdown bar chart, and the results
table — all computed from the exact same backend response, never a
separately hardcoded number. `DashboardPage.tsx` additionally got a
fill-up-volume trend line chart and an exception-rate-over-time line
chart, both backed by a new `$queryRaw` (parameterized, per CLAUDE.md rule
8) date-truncation query in `ReportsService.getDashboard`. Chart library:
`recharts` (new dependency).

Scope was intentionally broad per the brief's own instruction to flag
rather than guess further — see `docs/OPEN_ITEMS.md` #26 for exactly what
was and wasn't built (no per-driver/per-vehicle trend charts, no
period-over-period comparison view).

### 10. Vehicle brand/type picker
`VehicleBrandPicker.tsx` (new) + `lib/vehicleBrands.ts` (new): a searchable
dropdown of ~50 brand names across car/truck/heavy-equipment/motorcycle
categories, weighted toward Libyan-road-realistic names, wired into
`VehicleCreateForm.tsx`'s model field. Free-text entry for anything not in
the list still works and is saved as-is — fill-up recording is never
gated on brand coverage.

**This ships as a scaffold, not the finished feature**, exactly as scoped
in the brief: category glyphs (generic silhouettes), **not real
manufacturer logos**. Sourcing actual SVG logo assets
(`car-logos-dataset`, `@avto-dev/vehicle-logotypes`, manually-collected
heavy-equipment/motorcycle logos from Wikimedia Commons) was not done this
round.

**Trademark question flagged, not resolved** — per the explicit
instruction not to treat this as settled: bundling real manufacturer logos
into internal, non-commercial government software is generally low-risk
(nominative fair use), but nobody on this project is positioned to clear
that unilaterally. See `docs/OPEN_ITEMS.md` #24.

### 11. App rename
Centralized as `APP_NAME`/`APP_TAGLINE` in a new `lib/appInfo.ts` —
`"ضبط الوقود"` ("Fuel Control"), replacing `"ضابط"` everywhere it appeared
user-facing: `LoginPage.tsx` (both branding blocks), `Layout.tsx` (sidebar
brand + mobile header fallback), `index.html`'s `<title>` (a literal string
there since a static HTML file can't import a JS constant — flagged with a
comment to keep it in sync), and `README.md`. Internal identifiers left
untouched as instructed: `@fuel-tracking/*` package name, git repo name,
database name.

## Bugs fixed along the way (not explicitly asked, but blocking correct
verification)

- **`docs/screenshots/verify` DailyReportPage crash**: `data.rows` being
  read before the shared type/backend actually carried it (transient,
  fixed by rebuilding both in sync — not a shipped bug, caught during this
  round's own verification).
- **`e2e/global-setup.ts`/`global-teardown.ts` didn't handle sysadmin1's
  own `mustChangePassword: true`** on a genuinely fresh seed — only
  supervisor1/admin1 were cleared. This went unnoticed because a
  long-lived dev DB usually already has it cleared from a prior run; it
  surfaces on any truly fresh clone/CI run. Fixed the same way as
  supervisor1/admin1 (temp password during the run, restored in
  teardown), reusing `changePassword`'s own returned token instead of an
  extra `/auth/login` call to stay within the 5/min throttle budget.
- **`e2e/helpers.ts`'s `loginAs` had no retry on a throttled login** — the
  node-side setup/teardown helpers already retried on 429, but a
  page-driven login didn't, so a fill-up form load. Added `submitLogin()`
  with the same retry-with-backoff pattern, and raised
  `playwright.config.ts`'s per-test timeout from 30s to 120s to give a
  retry cycle room to actually finish.
- **`apps/api` had a stale `tsconfig.build.tsbuildinfo`** left over from
  a `nest start --watch` process that deleted `dist/` (its own
  `deleteOutDir: true`) without a clean incremental rebuild finishing —
  tsc's incremental cache trusted the stale buildinfo and silently
  emitted nothing on the next manual build. Not a code bug, but worth
  noting if `nest start --watch` is ever killed mid-compile again:
  delete `apps/api/tsconfig.build.tsbuildinfo` before rebuilding.

## Open items added this round (see `docs/OPEN_ITEMS.md` for full text)

| # | Summary |
|---|---|
| 21 | Diesel/kerosene fuel prices not confirmed by client; whether cost should be persisted on `FillUpTransaction` |
| 22 | Per-usage-type max-liters-per-fillup rule from the settings mockup — not an existing rule, not built |
| 23 | "Add new setting" affordance is DB-only, doesn't wire into the rule engine |
| 24 | Vehicle brand logos are a scaffold (glyphs, not real logos) + trademark clearance not resolved |
| 25 | Drivers-list station filter not built — no direct station relation on `Driver` |
| 26 | Reports/charts scope — what was and wasn't built, flagged per the brief's own "say so rather than guess" instruction |

## What to look at first

If reviewing this live: `/reports/daily` for the new charts and count
line, `/reports/dashboard` for the trend/exception-rate charts, any vehicle
or driver detail page for the redesigned identity/history views, the
change-requests queue for the diff highlighting, and `/settings` for the
stepper/impact-banner redesign.
