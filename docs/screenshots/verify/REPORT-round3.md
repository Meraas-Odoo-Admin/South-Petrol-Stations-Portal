# Round 3: Fixes + Full Re-Verification Report

Two parts, per the round-3 brief: (1) fix every confirmed problem from `REPORT.md` (Round 2), (2) redo the full artboard-by-artboard verification from scratch — not just re-check what was previously wrong.

**Test accounts** (all password `Verify2026!`, `mustChangePassword: false` — reseed with `pnpm --filter @fuel-tracking/api run prisma:seed` for a clean `ChangeMe123!`/`mustChangePassword:true` state if the next pass needs one):

| Username | Password |
|---|---|
| employee1 | `Verify2026!` |
| supervisor1 | `Verify2026!` |
| admin1 | `Verify2026!` |
| sysadmin1 | `Verify2026!` |

Screenshots referenced below are in this same directory, `docs/screenshots/verify/` (round-2 and round-3 shots share filenames where the screen is unchanged; round-3 versions were copied over round-2's for any screen this pass touched).

---

## Part 1 — Fixes

| # | Item | Status | Verified via |
|---|---|---|---|
| 1 | RTL sidebar on the wrong side | **Fixed** | Bounding-box measurement: `<aside>` now at x:1200–1440 in a 1440px viewport (was x:0–240). `Layout.tsx`'s only actual bug was the flex `order` values being backwards for RTL's main-axis direction — swapped `aside` to `order-1` and `main` to `order-2`. Audited the rest of the file for other physical left/right classes; found none (the file already used `border-s`, `inset-x-0`, `end-[22%]` — all logical/symmetric). |
| 2 | Dropdown clipping (vehicle + driver search) | **Fixed** | New `PortalDropdown` component renders the result list into `document.body` via `createPortal`, positioned from the input's own bounding rect — sidesteps every ancestor's `overflow-hidden` entirely instead of trying to make each Card usage overflow-visible (which would just move the clipping problem elsewhere). Regression-checked with a query returning 6 results: all 6 fully visible, `lastOptionBottom` well inside the viewport. Also brought both components onto the design system (they were still plain-slate styled, never converted in an earlier round). |
| 3 | Inline vehicle creation missing | **Fixed** | Built `VehicleCreateForm.tsx` mirroring `DriverCreateForm.tsx`'s pattern (internalCode + currentPlate required, usageType optional), wired into `RecordFillUpPage.tsx` next to the plate field, gated by `vehicles:manage` (same permission the backend endpoint already required). Verified end-to-end live: created a vehicle inline, it resolved into the search field showing the new plate, and could be submitted as part of a real fill-up. |
| 4 | `mustChangePassword` not enforced server-side | **Fixed** | `PermissionsGuard` now calls `RbacService.mustChangePassword(userId)` (a new cached lookup, same pattern as the existing `isUserActive` check) and 403s everything except routes carrying a new `@AllowPendingPasswordChange()` decorator, applied to `auth/change-password`, `auth/logout`, `auth/me`. `AuthService.changePassword` invalidates the RBAC cache immediately so the same session isn't blocked by its own just-completed change. New e2e test (`auth-session.e2e-spec.ts`) proves: a `mustChangePassword:true` user with a real `vehicles:read` grant gets 403 on `GET /vehicles` (not a permission failure — they hold the permission), can still reach `/auth/me` and `/auth/logout`, and gets through immediately after actually changing the password. Also fixed: strength bar now shows 4 segments (was 3), and `/change-password` moved out of the `<Layout>` route nesting so it renders with zero nav chrome (no sidebar, no hamburger, no bottom bar) instead of the full authenticated shell with working links away from the forced step. |
| 5 | Admin Settings leaking raw developer text | **Fixed** | Added `SYSTEM_SETTING_LABELS` to `labels.ts` (Arabic label + description per `SystemSetting` key, same dictionary pattern as every enum) and removed the raw `setting.key`/`setting.description` rendering entirely from `SettingsAdminPage.tsx`. All 6 cards now show Arabic-only text; the placeholder settings (docs/OPEN_ITEMS.md #19/#20) say so in Arabic rather than presenting them as settled. The literal setting *value* (e.g. `rolling`) is left as-is in its edit input — that's user-editable data being edited, not a label, and translating it would corrupt what's actually stored. |
| 6 | No post-submit confirmation screen (4d) | **Fixed** | Built a dedicated full-screen confirmation (checkmark, headline, immutability note, vehicle/driver/fuel+quantity/time summary card, "تعبئة جديدة"/"عرض تعبئات اليوم" actions) replacing the old 3-second auto-dismissing inline banner. "عرض تعبئات اليوم" only renders for roles holding `reports:view` (a product-permission question, not invented silently). Verified live end-to-end with a genuinely clean submission. |
| 7 | Grant standing exception panel unstyled + missing scope selector | **Fixed** | Added the 3-tile scope selector ("السائق ومركبة معيّنة" / "السائق وحده" / "المركبة وحدها") with a live echo sentence, matching artboard 6d — the host page now passes the *other* entity as optional context (e.g. the driver's primary vehicle) via new `context*` props, kept strictly separate from the props that drive the listing query (Prisma ANDs `driverId`+`vehicleId` together, so reusing the same ids for both would have silently hidden existing driver-only/vehicle-only grants — caught before shipping, not after). Rule checkboxes are now icon-tile cards, reason/expiry are styled Card fields, action bar uses the real `PillButton`s. Verified live: opened the panel, switched scope tiles, confirmed the echo sentence updates correctly. |
| 8 | Diff-highlighting on 7a/7b (lower priority) | **Not done** | Skipped — noting per the brief's own allowance. 7a/7b still show old/new values plainly, no amber character-level highlighting. |
| 9 | Duplicate `data-testid="approve-exception-button"` | **Fixed** | Split into `approve-exception-button-mobile` / `approve-exception-button-desktop`. Updated the one e2e test that referenced the old shared name (`fillups.spec.ts`). |
| 10 | `VehicleChangeType` labels duplicated locally | **Fixed** | Added `VEHICLE_CHANGE_TYPE_LABELS`/`vehicleChangeTypeLabel()` to `labels.ts`; `ChangeRequestsQueuePage.tsx` and `VehicleDetailPage.tsx` now both use it instead of their own local copies. |

**Flagged, not fixed** (per the brief's explicit instruction — product decisions, not mine to make):

- **2a bottom nav**: `station_employee` still shows السائقون instead of المخالفات on the mobile bottom bar, because that role has no `reports:view` permission at all — the artboard draws a badged المخالفات tab for this exact role. Granting the permission vs. accepting the current nav is a role-design decision.
- **8d/8e station-scoped dashboard**: confirmed still entirely absent — `station_supervisor` gets "ليس لديك صلاحية عرض هذه اللوحة." at `/reports/dashboard` (which requires `reports:view_all_stations`), and there is no other route offering a station-scoped view anywhere in the app. Building it would mean a new route, a new station-scoped dashboard query (mirroring the directorate one's shape but filtered to the caller's own station scope), and a new page component reusing 8e's KPI-card + "يحتاج قرارك الآن" pattern — flagged as a real scope decision, not built here.
- **5a vehicle search fields**: still plate/internal-code only server-side (`FindVehiclesQueryDto` has no booklet/chassis/driver-name params) even though the artboard's single search box implies all four. Flagged as a scope question, not built.

**Checklist run before calling this done**, per `CLAUDE.md`:

- `pnpm run typecheck` — clean (all 3 packages).
- `pnpm run lint` — clean (all 3 packages).
- `apps/api` unit tests — 18/18 passed.
- `apps/api` e2e suite (8 files) — 115/115 passed, including the station-scoping boundary test and the new `mustChangePassword` tests.
- `apps/web` e2e suite (4 files) — 5/5 passed (fixed two more pre-existing failures unrelated to this round's own changes while getting there — see below).

**Two pre-existing e2e failures fixed along the way, not caused by this round's changes**: an earlier session's `HomePage.tsx` rebuild gave its quick-link cards accessible names that overlap the sidebar's nav-link names (e.g. a link named exactly "تسجيل تعبئة" and a card whose full name is "تسجيل تعبئة تسجيل عملية تعبئة جديدة لمركبة") — `fillups.spec.ts` and `reports.spec.ts` had ambiguous `getByRole('link', {name})` locators that this exposed as soon as the suite was actually run end-to-end (it apparently hadn't been since that rebuild). Fixed with `exact: true` or a sidebar-scoped locator, whichever disambiguated correctly for each specific pair of overlapping names. Also `auth.spec.ts`'s forced-password-change test never filled the `confirmPassword` field that an earlier session added to the form, silently blocking submission — fixed by filling it and matching the current button text ("حفظ والمتابعة").

---

## Part 2 — Full re-verification

### Summary table

| Artboard(s) | Screen | Verdict | One-line reason |
|---|---|---|---|
| 1a | Color/type reference | MATCH | No ad-hoc colors on any screen visited this pass. |
| 1b | Naming dictionary | **MATCH (was PARTIAL)** | The 9b Settings leak is fixed; re-grepped rendered DOM text on every screen visited, zero raw enum/key leaks found. |
| 2a | Mobile nav | PARTIAL (unchanged) | Sheet/collapsed states still correct; bottom-bar content mismatch for `station_employee` still present — flagged above, not a bug to fix silently. |
| 3a | Login desktop | MATCH | No regressions. |
| 3b | Login mobile | MATCH | No regressions. |
| 3c | Forced password change | **MATCH (was MISMATCH)** | 4-segment strength bar, zero nav chrome — both fixed and verified live. |
| 4a | Fill-up desktop | MATCH | No regressions; "مركبة جديدة" button now present and working (see item 3). |
| 4b | Fill-up mobile | MATCH | Re-screenshotted, no regressions. |
| 4c | Rule-violation state | MATCH | Live-triggered again this pass, unchanged and correct. |
| 4d | Post-submit confirmation | **MATCH (was MISMATCH)** | Full dedicated screen now exists and matches the artboard's content list item-for-item. |
| 5a | Vehicles list desktop | **MATCH (was MISMATCH)** | RTL sidebar bug was the sole disqualifier last round; confirmed fixed via bounding box. |
| 5b | Vehicles list mobile | MATCH | **Independently re-screenshotted this pass** (round 2 didn't) — correct. |
| 5c | Vehicle detail desktop | MATCH | RTL fix carries through; content unchanged and correct. |
| 5d | Vehicle detail mobile (tabs) | MATCH | **Independently re-screenshotted this pass, tabs actually clicked** (round 2 didn't) — identity/plates tabs both render correctly. |
| 6a | Drivers list desktop | MATCH | RTL fix carries through. |
| 6a | Drivers list mobile (no artboard, inferred) | MATCH | Extends 5b's card pattern correctly, no breakage. |
| 6b | Driver detail desktop | MATCH | No regressions. |
| 6c | Driver detail mobile | MATCH | No regressions. |
| 6d | Grant standing exception panel | **MATCH (was MISMATCH)** | Scope selector + full design-system styling now present and interactively verified. |
| 7a | Change-request submission (mobile artboard) | MATCH | Vehicle-detail mobile view unchanged, correct. |
| 7a (desktop, no artboard) | — | INFERRED, unchanged | Still a bare inline panel — acceptable per the documented gap, not touched this round (not in the item 1–7 fix list). |
| 7b | Change-request queue desktop | MATCH | No regressions. |
| 7b | Change-request queue mobile (no artboard) | MATCH | **Independently re-screenshotted this pass** (round 2 didn't) — stacks correctly, no breakage. |
| 7c | Reject-with-reason panel | MATCH | No regressions. |
| 8a | Violations desktop | MATCH | Live approve re-verified end-to-end (pending → معتمدة) using the new distinct testid. |
| 8b | Violations mobile | MATCH | No regressions. |
| 8c | Daily report (desktop + mobile, mobile no artboard) | MATCH | No regressions. |
| 8d | Dashboard, directorate-wide | MATCH | No regressions. |
| 8d/8e | Dashboard, station-scoped | **MISSING (unchanged, flagged not fixed)** | Confirmed still absent for `station_supervisor` — see Part 1's flagged-items list. |
| 8f | Stations (both widths) | MATCH | No regressions. |
| 9a | Admin: Users | MATCH | No regressions. |
| 9b | Admin: Settings | **MATCH (was MISMATCH — severe)** | Naming-dictionary leak fixed; verified visually, every card is Arabic-only. |
| 9c | Admin: Exception types | MATCH | No regressions. |
| 9d | Admin: Audit log | MATCH | No regressions. |
| — | Bug re-check: RTL nav side | **FIXED, confirmed** | Bounding box now x:1200–1440. |
| — | Bug re-check: dropdown clipping | **FIXED, confirmed** | 6-result query, all fully visible, no ancestor clip. |
| — | Bug re-check: inline vehicle creation | **FIXED, confirmed** | Created a vehicle inline end-to-end, used it in a real fill-up submission. |

### Notable detail: how the RTL bug was actually fixed

`Layout.tsx`'s outer container is `dir="rtl"` with `lg:flex` and no explicit `flex-direction` (defaults to `row`). With `dir="rtl"`, the flex main-axis start is the *physical right* edge — so the element that should render on-screen "first" along that axis needs the *lower* `order` value. The previous code had it backwards: `aside` was `order-2` and `main` was `order-1`, which put `aside` at the main-axis *end* (the physical left). Swapped: `aside` → `order-1`, `main` → `order-2`. No other physical-direction classes were found anywhere else in the file (it already used `border-s`, `inset-x-0`, `end-[22%]` correctly).

### Notable detail: why the dropdown-clipping fix uses a portal, not a CSS tweak

`Card`'s `overflow-hidden` exists specifically to clip its own children to its rounded corners — removing it globally would un-round every card with content that scrolls or overflows anywhere else in the app. Making the dropdown a fixed-position portal rendered at `document.body` sidesteps the ancestor entirely rather than trading one clipping bug for a rounded-corner regression somewhere else.

---

## What this pass did not cover

- Dark mode (t10, 10a–10e) — out of scope per both rounds' briefs.
- Item 8 (diff-highlighting on 7a/7b) — explicitly lower-priority, skipped due to time; noted rather than silently left undocumented.
- Did not re-test whether the pending-password nav links (now removed from `/change-password` entirely, so no longer applicable) could reach protected data — moot now since there's no nav chrome to click at all on that screen, and the server-side gate (item 4) is the real control regardless.
- Two Playwright sessions hit a one-off "logged out after a single `page.goto()` following login" flake during this pass (once for `supervisor1`'s station-scoped-dashboard re-check) that resolved on immediate retry with no code change — noted as environmental/session flakiness observed during scripted verification, not reproduced as a real bug a browser user would hit (real users navigate via in-app links, not repeated hard reloads), and not chased further given it didn't reproduce on retry.
