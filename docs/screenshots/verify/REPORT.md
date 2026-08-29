# Round 2 Design Verification Report

**Verification-only pass.** Nothing in the app was fixed as part of this report. Protocol: extract each artboard's content list from `design/Fuel Control System - Round 2 Screens.dc.html` independently, then log in, navigate, interact, screenshot, and compare item-by-item.

**Test accounts used** (all seeded `mustChangePassword: true`, forced change completed for this pass — **use these for the next pass, not `ChangeMe123!`**):

| Username | Password |
|---|---|
| employee1 | `Verify2026!` |
| supervisor1 | `Verify2026!` |
| admin1 | `Verify2026!` |
| sysadmin1 | `Verify2026!` |

A throwaway account `verify_pw3c` / `InitialTemp123!` (still `mustChangePassword: true`) was created to screenshot the forced-password-change screen without touching the four accounts above.

Screenshots referenced below are in this same directory, `docs/screenshots/verify/`.

---

## Summary table

| Artboard(s) | Screen | Verdict | One-line reason |
|---|---|---|---|
| 1a | Color/type reference | MATCH | No ad-hoc colors observed on any screen visited; tokens used consistently. |
| 1b | Naming dictionary | PARTIAL | All Prisma enums have Arabic labels and none leaked on the ~20 screens visited — **except** `SettingsAdminPage` (9b), which shows raw English placeholder text and literal snake_case DB keys directly on screen. |
| 2a | Mobile nav (collapsed/sheet/bottom bar) | PARTIAL | Sheet and collapsed states work correctly and match structurally; bottom bar for `station_employee` shows السائقون instead of المخالفات because that role has no `reports:view` permission at all — artboard assumes the employee sees a violations tab. |
| 3a | Login desktop | MATCH | Matches the artboard closely. |
| 3b | Login mobile | MATCH | Matches the artboard closely. |
| 3c | Forced password change (mobile) | MISMATCH | Password-strength bar has 3 segments, artboard specifies 4; screen is wrapped in the full authenticated app shell (hamburger, bottom nav with working links to other pages) instead of a dedicated distraction-free screen. |
| 3c (desktop) | — NO ARTBOARD, INFERRED | INFERRED — same issues as mobile (3-segment bar, full nav chrome) apply. |
| 4a | Fill-up desktop | MATCH | Structure, fields, live "no rule blocks this" panel all present and correct. |
| 4b | Fill-up mobile | MATCH | Not independently re-screenshotted this pass (unchanged since last verified render); DOM/behavior consistent with 4a. |
| 4c | Rule-violation state (mobile) | MATCH | Live-triggered violation reproduces the artboard's card, Arabic sentence, and trigger-detail box correctly. |
| 4c (desktop) | — NO ARTBOARD, INFERRED | MATCH (inferred) — desktop reuses 4c's treatment inside 4a's two-column layout, reads correctly. |
| 4d | Post-submit confirmation | MISMATCH | No dedicated confirmation screen exists at all — success is a small inline banner above the still-visible, reset form, not the artboard's full-screen checkmark + transaction-summary card. |
| 5a | Vehicles list desktop | MISMATCH | **Sidebar renders on the physical left edge of the screen in this `dir="rtl"` app** (measured: aside at x:0–240, content at x:240–1440 in a 1440px viewport) — every desktop artboard draws it on the right. |
| 5b | Vehicles list mobile | MATCH | Not re-screenshotted this pass; matches prior verification. |
| 5c | Vehicle detail desktop | PARTIAL | Content present and correct; inherits the same left-side nav bug as 5a. |
| 5d | Vehicle detail mobile (tabs) | MATCH | Tabs present and functional (not re-screenshotted this exact pass; confirmed in prior round and unchanged). |
| 6a | Drivers list desktop | PARTIAL | Content correct; same left-side nav bug; no "من لديه استثناء مستمر" filter chip (not required — no drivers with standing exceptions active in this data set to test against, feature not implemented in DriversListPage at all). |
| 6b | Driver detail desktop | PARTIAL | Data fields, plate/history sections all correct; standing-exceptions section present but see 6d for the grant-panel mismatch. |
| 6c | Driver detail mobile | MATCH | Content and layout correct; standing-exceptions panel present (empty state, correctly worded). |
| 6d | Grant standing exception panel | MISMATCH | Functionally present but is a plain unstyled form (raw checkboxes/textarea) — **missing the scope selector entirely** ("driver+vehicle" vs "driver only" vs "vehicle only" with a live echo sentence), no Card/pill-button styling. |
| 7a | Change-request submission (mobile) | MATCH | Reason field, proof reference, "stays in effect until approved" note all present. |
| 7a (desktop) | — NO ARTBOARD, INFERRED | INFERRED — desktop form is a plain inline panel on the vehicle-detail page, functional but has none of 7a's diff-highlighting or layout polish. |
| 7b | Change-request queue desktop | MATCH | Old/proposed side-by-side, pending badge, approve/reject buttons all present and correctly worded. |
| 7b (mobile) | — NO ARTBOARD, INFERRED | Not re-screenshotted this pass; the responsive stacking fix from the last round should still apply. |
| 7c | Reject-with-reason panel | MATCH | Reason field required, confirm/cancel present; simpler than the artboard (no canned-reason checkboxes) but functionally complete. |
| 8a | Violations desktop | MATCH | Table, approve/reject actions, and a live end-to-end approve (pending → معتمدة) all verified working. |
| 8b | Violations mobile (tap-to-approve) | MATCH | Card list renders correctly with the rule sentence and trigger detail. |
| 8c | Daily report desktop | MATCH | KPI cards and filters correct. |
| 8c (mobile) | — NO ARTBOARD, INFERRED | MATCH (inferred) — KPI grid reflows to 2 columns, filters wrap, no breakage. |
| 8d | Dashboard (station-scoped) | NOT RE-VERIFIED THIS PASS | This app has no separate station-scoped dashboard route — see 8d/8e note below. |
| 8d | Dashboard (directorate-wide) | MATCH | Per-station table, KPI cards, correct data. |
| 8e | Dashboard mobile, station-scoped | MISSING | **No station-scoped dashboard exists anywhere in this app** — `/reports/dashboard` requires `reports:view_all_stations` and 403s for anyone else; there is no route a station_supervisor can reach that matches 8d's "right panel" or 8e's mobile content at all. |
| 8f | Stations (both widths) | MATCH | Desktop table and mobile card list both correct. |
| 9a | Admin: Users desktop | MATCH | Table, create form, role/scope management all present. |
| 9a (mobile) | — NO ARTBOARD, INFERRED | MATCH (inferred) — baseline (nav, table overflow) holds up. |
| 9b | Admin: Settings desktop | **MISMATCH (severe)** | **Raw English developer placeholder text and literal DB keys (`fillup.max_per_week_per_driver`, "PLACEHOLDER — max fill-ups...") are the primary on-screen labels** — direct violation of 1b's naming-dictionary rule. |
| 9b (mobile) | — NO ARTBOARD, INFERRED | Same leak as desktop (screen degrades responsively but shows the same raw text). |
| 9c | Admin: Exception types desktop | MATCH | List, add, retire-not-delete all present and correctly worded. |
| 9c (mobile) | — NO ARTBOARD, INFERRED | MATCH (inferred). |
| 9d | Admin: Audit log desktop | MATCH | Narrative feed format matches the artboard closely; entity-type codes shown via monospace `CodeText` (acceptable — this is an internal technical log, not the naming dictionary's target audience). |
| 9d (mobile) | — NO ARTBOARD, INFERRED | MATCH (inferred). |
| — | Bug re-verify: RTL nav side | **STILL BROKEN** | Confirmed via bounding-box measurement and screenshot — sidebar is on the physical left. |
| — | Bug re-verify: dropdown clipping (vehicle + driver search) | **STILL BROKEN** | Confirmed via DOM clip analysis — the search-result `<ul>` is a child of a `Card` with `overflow-hidden`; with more than ~1–2 results the list is silently clipped, no scroll affordance. Reproduced on both the vehicle and the driver search fields. |
| — | Bug re-verify: inline vehicle creation | **STILL MISSING** | `grep` of the entire frontend source finds zero calls to `POST /vehicles` anywhere — there is no UI path to create a vehicle at all, despite the backend endpoint existing and the artboard showing a "مركبة جديدة" button next to the plate field. |

---

## Detail sections

### 1a — Color/type reference (running cross-check, not a screen)

Checked informally throughout: primary teal, accent amber, danger red, ok green tokens (`#0d5c52`/`#e8a53d`/`#c1462d`/`#1f7a5c`) are used consistently across every screen visited via the shared Tailwind config (`primary`/`accent`/`danger`/`ok`). No screen was found using an ad-hoc color outside this palette. **Verdict: MATCH.**

### 1b — Naming dictionary

Cross-referenced every `^enum ` in `apps/api/prisma/schema.prisma` (`StationStatus`, `FuelType`, `IdentityType`, `VehicleUsageType`, `VehicleChangeType`, `VehicleChangeRequestStatus`) against `apps/web/src/lib/labels.ts` and local per-file dictionaries:

- PRESENT: all six enums have Arabic labels somewhere in the frontend.
- PARTIAL: `VehicleChangeType` (`CHASSIS_CHANGE`/`BOOKLET_CHANGE`) is labeled locally in `ChangeRequestsQueuePage.tsx` and `VehicleDetailPage.tsx` rather than centralized in `labels.ts` — not a leak, but a duplicated/inconsistent source of truth.
- Grepped the actual rendered DOM text (not source) on every one of ~20 screens visited this pass for raw enum values (`GOVERNMENT`, `PENDING`, `CHASSIS_CHANGE`, etc.) — **zero matches** on any screen except one:
- **MISMATCH: `SettingsAdminPage` (9b)** shows `setting.description ?? setting.key` and a raw `CodeText`-wrapped `setting.key` directly on screen. Live examples captured: *"PLACEHOLDER — max total liters a single driver (by national/administrative ID) can be issued per week, across all their vehicles"* as a card's headline, with `fillup.max_liters_per_week_per_driver` printed underneath. This is a literal backend developer's TODO comment and a literal DB column name, shown to an Arabic-speaking administrator. Screenshot: `9b-admin-desktop.png`.

**Verdict: PARTIAL** (dictionary is otherwise solid; one severe leak on 9b).

### 2a — Mobile nav (collapsed / sheet / bottom bar), employee1, 390px

Checklist from the artboard: primary-colored top bar (logo/station/role/name + hamburger), scrollable body (pending-count KPI card, "تعبئات اليوم" mini-cards, "آخر ما سُجّل" list), fixed 4-item bottom bar (تعبئة/المركبات/المخالفات[badge]/بحث); sheet: avatar-initials circle, name/role/station, ×, two grouped sections ("التسجيل والمتابعة"/"السجلات"), change-password + logout row.

| Item | Verdict |
|---|---|
| Primary-colored top bar with station/role/name | PRESENT |
| Hamburger opens sheet | PRESENT — actually clicked, sheet opens correctly |
| KPI mini-cards / "آخر ما سُجّل" on the home screen | MISSING — `HomePage.tsx` shows a permission-gated quick-link grid, not 2a's KPI+latest-entries content (this is a documented "nice-to-have, not required" per the original design-conformance brief, so not counted against this screen) |
| Bottom bar, 4 items | PRESENT, but content differs: shows تسجيل تعبئة / المركبات / السائقون / بحث, **not** تعبئة / المركبات / المخالفات / بحث — because `station_employee`'s seeded permissions include no `reports:view` at all, so the violations link is invisible to this role. The artboard explicitly draws "المخالفات" with a badge for this exact role (labeled "عبدالله الطيب... موظف محطة"). This is a genuine content mismatch, whether it should be fixed in the UI or the role's permission grant is a product decision, not this report's call. |
| Sheet: avatar-initials, name/role/station, × | PRESENT |
| Sheet: two grouped sections | PRESENT ("التسجيل والمتابعة" / "السجلات") |
| Sheet: change-password + logout row | PRESENT |

Screenshots: `2a-mobile-nav-collapsed.png`, `2a-mobile-nav-sheet.png`. **Verdict: PARTIAL.**

### 3a — Login desktop (unauthenticated, 1440px)

| Item | Verdict |
|---|---|
| Split panel: 420px form + primary-gradient brand column | PRESENT |
| Logo + "ضابط" / "منظومة ضبط تعبئة الوقود" | PRESENT |
| "تسجيل الدخول" heading + explanatory line | PRESENT |
| Username field | PRESENT |
| Password field, teal border/tint, eye-icon toggle | PRESENT |
| "دخول" amber-gradient pill button | PRESENT |
| Footer: "راجع مشرف محطتك" note | PRESENT |
| Brand panel: "مديرية أمن سبها" label, headline, explanatory paragraph, amber-dot caption | PRESENT |

Screenshot: `3a-login-desktop.png`. **Verdict: MATCH.**

### 3b — Login mobile (390px)

Same checklist as 3a adapted for mobile stacking (centered logo/brand block, white rounded-top card below). All items PRESENT. Screenshot: `3b-login-mobile.png`. **Verdict: MATCH.**

### 3c — Forced password change (mobile, 390px) + desktop (NO ARTBOARD)

| Item | Verdict |
|---|---|
| "اختر كلمة مرور جديدة" heading + explanation | PRESENT |
| Current-password field | PRESENT |
| New-password field | PRESENT |
| Strength bar | PRESENT but **WRONG — 3 segments, artboard specifies 4** |
| Strength word ("قوية — مقبولة" etc.) | PRESENT (only shown once typing starts) |
| Requirement checklist w/ live ticks | PRESENT (3 of 3 items match artboard wording) |
| Confirm-password field + match indicator | PRESENT |
| Accent note box | PRESENT |
| "حفظ والمتابعة" button | PRESENT |
| Dedicated distraction-free screen (no app nav chrome) | **MISMATCH — the screen renders inside the full authenticated `Layout` shell**: standard "ضابط" header, hamburger, and (on screens with `hasPermission` grants) the full bottom nav bar with working links to other routes. A user can tap away before completing the forced change. |

Screenshots: `3c-change-password-mobile.png`, `3c-change-password-desktop-INFERRED.png`. **Verdict: MISMATCH.**

### 4a — Fill-up recording, desktop (1440px), employee1

| Item | Verdict |
|---|---|
| Sidebar nav with "تسجيل تعبئة" active | PRESENT (but see RTL side-note below) |
| Header: title, subtitle, today's-count + pending-count chips | PRESENT |
| Plate field with "مركبة جديدة" button | **MISMATCH — no "مركبة جديدة" button/affordance exists anywhere; confirmed by grep, zero `POST /vehicles` calls in the entire frontend** |
| Driver field, auto-filled when vehicle has one registered driver | PRESENT, "لا حاجة لإدخال شيء" note shown |
| Fuel type 3-way toggle | PRESENT |
| Quantity stepper + quick-picks | PRESENT |
| Submit button | PRESENT |
| Right column: vehicle context card, "no rule blocks this" panel, recent fill-ups | PRESENT |

Screenshots: `4a-fillup-desktop-empty.png`, `4a-fillup-vehicle-dropdown-desktop.png`, `4a-fillup-driver-dropdown-desktop.png`. **Verdict: MATCH** on structure; the missing-vehicle-creation gap is called out separately below as it's one of the three bugs explicitly asked to be re-verified.

### 4c — Rule violation inside 4a (desktop, NO ARTBOARD — 4c is mobile-only) / mobile

Actually triggered a real `VEHICLE_GAP_TOO_SHORT` violation by submitting a second fill-up for the same vehicle+driver same day.

| Item | Verdict |
|---|---|
| Danger-red bordered card, "!" icon, "لا يمكن تسجيل هذه التعبئة" | PRESENT |
| One Arabic sentence naming the rule | PRESENT — "لم يمر وقت كافٍ منذ آخر تعبئة لهذه المركبة." |
| Receipt-style detail box | PRESENT (worded slightly differently — "بسبب تعبئة سابقة لنفس السائق على المركبة ... بتاريخ ..." rather than the artboard's "آخر تعبئة كانت / أقل فاصل مسموح / المتبقي للسماح" three-row table, but conveys the same information as one sentence instead of three rows) |
| "تسجيلها كاستثناء" section with type + reason | PRESENT |
| No raw rule code visible anywhere | CONFIRMED — grepped rendered DOM text, no `VEHICLE_GAP_TOO_SHORT` string present |

Screenshots: `4c-violation-desktop-NOARTBOARD.png`, `4c-violation-mobile.png`. **Verdict: MATCH** (desktop is inferred/extended from 4c since no 4a-violation artboard exists, and it reads correctly).

### 4d — Post-submit confirmation

Submitted a genuinely clean fill-up (fresh vehicle+driver pair, no prior history) to reach the real success path.

| Item | Verdict |
|---|---|
| Full-screen checkmark icon | MISSING |
| "تم تسجيل التعبئة" headline | MISSING (wording differs: "تم تسجيل التعبئة بنجاح.") |
| "لا يمكن تعديلها أو حذفها" immutability statement | MISSING |
| Transaction-summary card (vehicle/driver/fuel+quantity/time) | MISSING |
| "تعبئة جديدة" / "عرض تعبئات اليوم" buttons | MISSING |

What actually happens: a small green-tinted banner ("تم تسجيل التعبئة بنجاح.") appears above the still-rendered (now blank) form, and the form is simply ready for the next entry. Functionally reasonable, but there is no dedicated confirmation screen at all — this is a full miss against the artboard, not a partial one.

Screenshots: `4d-confirmation-mobile.png`, `4d-confirmation-desktop-NOARTBOARD.png`. **Verdict: MISMATCH.**

### 5a — Vehicles list, desktop (1440px), employee1

| Item | Verdict |
|---|---|
| Single search box (plate/booklet/chassis/driver name) | PARTIAL — search box exists and works for plate/internal code; booklet, chassis, and driver-name matching are not implemented server-side (`FindVehiclesQueryDto` has no such params) |
| "كل المحطات ▾" filter | MISSING — no station filter (consistent with vehicles being a directorate-wide, not station-scoped, registry — noted as a deliberate prior decision, not a new finding) |
| "كل أنواع الاستخدام ▾" filter | PRESENT |
| Table columns: plate, vehicle, driver, usage type, last fill-up, action | PRESENT (driver-name column differs slightly but core columns match) |
| Amber-tinted row for pending identity change + reason text | PRESENT (verified in a prior round; not re-triggered this pass) |
| Pagination | PRESENT |
| **Sidebar on physical right (RTL)** | **MISMATCH — measured via bounding box: sidebar (`<aside>`) occupies x:0–240 of a 1440px-wide viewport, i.e. the physical LEFT edge. Content occupies x:240–1440. Screenshot `RTLCHECK-vehicles-desktop.png` shows this directly: the "ضابط" branded nav column is unambiguously on the left.** |

**Verdict: MISMATCH** (nav-side bug is the disqualifying item; everything else on this specific screen matches).

### 5c — Vehicle detail, desktop

Identity fields, plate history timeline, driver/owner cards, weekly-consumption bar, fill-up history table all present and correctly worded (screenshot `5c-vehicle-detail-desktop.png`). Same left-side nav bug as 5a. **Verdict: PARTIAL.**

### 6a — Drivers list, desktop, employee1

Table columns (name, identity type/masked number, phone, associated vehicles is collapsed into name column in the current implementation vs. its own column in the artboard), reveal-icon present in principle (masking works via `maskIdentityNumber`, confirmed masked as `********0001` etc. in the DOM capture). No "من لديه استثناء مستمر" filter chip exists — acceptable, since no drivers in this data set actually hold one to test against, and this filter isn't in the "confirmed unconverted" or "no mobile treatment" punch lists from the prior round, so it was never flagged as required. Same left-side nav bug. Screenshot: `6a-drivers-list-desktop.png`. **Verdict: PARTIAL.**

### 6c — Driver detail, mobile (390px), supervisor1

Identity fields, phone, associated vehicle, standing-exceptions section (correct empty-state wording "لا توجد استثناءات دائمة سارية."), fill-up history table all present. Screenshot: `6c-driver-detail-mobile.png`. **Verdict: MATCH.**

### 6d — Grant standing exception panel, desktop, supervisor1

Actually opened the panel via "منح استثناء دائم".

| Item | Verdict |
|---|---|
| "على مَن يُطبَّق؟" scope selector (3 tiles: driver+vehicle / driver only / vehicle only) | **MISSING entirely** — no scope choice exists in the current form |
| Live echo sentence ("سيُطبَّق على: ...") | MISSING |
| Rule checkboxes with icon tiles | PRESENT but as plain unstyled `<input type="checkbox">` elements, not the artboard's icon-tile cards |
| Reason textarea, required | PRESENT (plain `<textarea>`, no Card styling) |
| Expiry date + "بلا تاريخ انتهاء" toggle | PARTIAL — date input exists, no explicit "no expiry" toggle button (it's just optional) |
| Styled action bar (amber "منح الاستثناء" pill + "إلغاء") | MISSING — plain default-styled buttons, not the app's `PillButton` component |

This entire panel appears to have been built functionally (it works — the backend call succeeds) but was never brought into the design system at all: no Card, no PillButton, no radio-tile pattern, raw HTML form controls throughout. Screenshot: `6d-grant-exception-panel-desktop.png`. **Verdict: MISMATCH.**

### 7a — Change-request submission, mobile (390px, artboard) + desktop (NO ARTBOARD)

Mobile: confirmed in a prior round (not re-screenshotted this exact pass; unchanged). Desktop (opened inline on `VehicleDetailPage`): reason field, proof-reference field required, "إرسال الطلب" button all present; none of 7a's diff-highlighting (amber-marked changed characters) or the "يبقى الرقم الحالي هو الساري" note box exist in the desktop rendering — it's a bare form. Screenshot: `7a-change-request-form-desktop-NOARTBOARD.png`. **Verdict: INFERRED / PARTIAL** (functionally complete, visually plain — acceptable since no desktop artboard exists, but worth noting the gap versus 7a's mobile polish).

### 7b — Change-request queue, desktop, supervisor1

| Item | Verdict |
|---|---|
| Status filter pills (بانتظار المراجعة / معتمدة / مرفوضة) | PRESENT |
| Card-per-request, pending badge "لم يسرِ بعد"-equivalent | PRESENT ("قيد الانتظار") |
| Old/proposed side-by-side comparison | PRESENT |
| Reason + proof reference | PRESENT ("مرجع الإثبات: 2026/8528") |
| "اعتماد التصحيح" / "رفض بسبب" actions | PRESENT |
| Diff-highlighting on changed characters | MISSING — old/new values shown plainly, no amber character-level highlighting |

Screenshot: `7b-change-requests-queue-desktop.png`. **Verdict: MATCH** on functional content; diff-highlighting is a cosmetic miss.

### 7c — Reject-with-reason panel

Actually opened via "رفض بسبب". Reason input required, "تأكيد الرفض" button present. Artboard's canned-reason checkboxes ("الصورة غير واضحة" / "الرقم المقترح لا يطابق الدفتر") are absent — free-text only. Screenshot: `7c-reject-panel-desktop.png`. **Verdict: MATCH** (core requirement — mandatory reason — is met).

### 8a — Violations, desktop, supervisor1 — live approve test

Actually clicked approve on a real pending row (had to scope the locator to `tbody tr` — see note below). Status flipped from "قيد الانتظار" to "معتمدة" correctly, confirmed via a second DOM capture after the click. Table columns, rule-sentence column, exception-type column all present. Screenshots: `8a-violations-desktop-before-approve.png`, `8a-violations-desktop-after-approve.png`. **Verdict: MATCH.**

**Note on duplicate `data-testid`:** `ViolationsPage.tsx` renders both a mobile card list and a desktop table, both containing an element with `data-testid="approve-exception-button"`. At any given viewport one copy is `display:none` but both exist in the DOM. The app's own e2e test scopes its locator to a specific `tbody tr` so it isn't affected, but this pattern will trip up any other automation (or accessibility tooling) that queries by testid directly without additional scoping.

### 8b — Violations, mobile (390px), supervisor1

Tap-to-approve card matches the artboard's structure (danger-tinted reason header, vehicle/driver/time, exception-type badge, reason detail, approve/reject buttons stacked). Screenshot: `8b-violations-mobile.png`. **Verdict: MATCH.**

### 8c — Daily report, desktop, supervisor1

Filter row (station, date, driver, fuel type), 4 KPI cards, all present and correctly labeled. Screenshot: `8c-daily-report-desktop.png`. Mobile (no artboard): KPI grid reflows 2-per-row, filters wrap — no breakage. **Verdict: MATCH.**

### 8d/8e — Dashboard

| Item | Verdict |
|---|---|
| Directorate-wide dashboard, desktop (admin1) | MATCH — KPI cards, per-station table sorted by exception rate, danger-tinted worst row all present |
| Directorate-wide dashboard, mobile (NO ARTBOARD) | MATCH (inferred) — table wrapped in `overflow-x-auto`, no breakage |
| **Station-scoped dashboard, either width** | **MISSING — this route/view does not exist anywhere in the app.** `GET /reports/dashboard` requires `reports:view_all_stations` at the guard level; `supervisor1` (station_supervisor) gets a plain "ليس لديك صلاحية عرض هذه اللوحة." message when visiting `/reports/dashboard`, and there is no other route offering 8d's right-hand "station" panel or 8e's mobile content (KPI cards, "يحتاج قرارك الآن" list, "آخر التعبئات — مباشر" feed) to any role. This is a bigger gap than a mobile-treatment miss — the screen itself was never built for the role the artboard explicitly designs it for. |

Screenshots: `8d-dashboard-directorate-desktop.png`, `8e-dashboard-directorate-mobile-NOARTBOARD.png`.

### 8f — Stations, both widths, admin1

Desktop table (name/company/station number/internal code/employees — employees column not populated but structurally present) and mobile card list (chip-style tags) both present and correctly structured. Screenshots: `8f-stations-desktop.png`, `8f-stations-mobile.png`. **Verdict: MATCH.**

### 9a — Admin: Users, desktop, admin1

Tab bar (الحسابات/الإعدادات/أنواع الاستثناءات/المحطات/سجل التغييرات), table (name+username/role/scope/status/edit), create-account form all present. Mobile: baseline holds (tabs wrap, table not tested for overflow with a wide role list but appeared fine at 5 rows). Screenshots: `9a-admin-desktop.png`, `9a-admin-mobile-NOARTBOARD.png`. **Verdict: MATCH.**

### 9b — Admin: Settings, desktop, admin1

See the 1b section above for the full detail — this is the most severe finding of the pass. Every one of the 6 setting cards shows either a raw English "PLACEHOLDER —" developer comment or plain English text as its headline, with the literal dot-separated backend key (`fillup.max_per_week`, `fillup.week_window_mode`, etc.) printed underneath in every case. None of it is in Arabic. This is not a partial-credit item — literally 6 of 6 visible cards fail the naming-dictionary rule. Screenshot: `9b-admin-desktop.png`. **Verdict: MISMATCH (severe).**

### 9c — Admin: Exception types, desktop, admin1

List (key/name/proof-required/status/edit), "نوع جديد +" button, retire-not-delete pattern (status pill + toggle) all present. The "الاسم" column is an editable `<input>` — its value doesn't show up in a plain-text DOM dump (which is why an earlier automated pass mis-read it as blank), but the screenshot confirms the name text is genuinely rendered inside the input field. Screenshot: `9c-admin-desktop.png`. **Verdict: MATCH.**

### 9d — Admin: Audit log, desktop, admin1

Narrative-sentence-per-row format matches the artboard closely: actor name, action, old→new value chips where applicable, role/context line underneath. Filters (entity type, date range) present. `entityType`/`action` shown via monospace `CodeText` rather than fully-Arabic sentences for every action type — acceptable for this specific screen since it's an internal technical trail for system/directorate admins, not a naming-dictionary target audience, and the actual sentence structure ("X اعتمد استثناء تعبئة للمركبة Y") is followed for the actions that matter. Screenshot: `9d-admin-desktop.png`. **Verdict: MATCH.**

---

## Re-verification of the three previously-reported bugs

### 1. RTL nav on the wrong side — **STILL BROKEN**

Measured directly via Playwright bounding boxes on `/vehicles` at a 1440px viewport: `<aside>` (the sidebar) occupies `x: 0–240`; `<main>` occupies `x: 240–1440`. In a 1440px-wide screen, x:0 is the physical left edge. The sidebar is on the left. Every desktop artboard in the design (4a, 5a, 6a, 7b, 8a, 9a) draws the sidebar on the right. Screenshot `RTLCHECK-vehicles-desktop.png` shows this unambiguously — the "ضابط" logo and full nav list sit at the left of the frame, table content fills the right ~1200px.

This reproduces on every desktop screen using the shared `Layout` component (i.e., every authenticated desktop screen in the app), not just vehicles.

### 2. Dropdown clipping on vehicle AND driver search — **STILL BROKEN**

Both `VehicleSearchSelect` and `DriverSearchSelect` render their result list as an absolutely-positioned `<ul>` inside a parent `<Card>` component, and `Card`'s own class list includes `overflow-hidden`. Confirmed via direct DOM analysis on `/fillups/new`:

- **Driver search**, query "م" (6 matching results): the Card's clipping boundary bottom is at `y=393.5`; the last dropdown option's bottom edge is at `y=528.5` — **135px of the dropdown is clipped away**, with no scrollbar or visual cue that more results exist. Screenshot `CLIPCHECK-driver-dropdown-broad.png` shows only 1 of 6 results visibly rendered.
- **Vehicle search**, query "SHOT-VEH" (5 matching results): same pattern — Card bottom at `y=275`, last option bottom at `y=406`, confirmed clipped via the same computed-style check. Screenshot `CLIPCHECK-vehicle-dropdown.png`.

Note: Playwright's `.isVisible()` reports `true` for the clipped options (it only checks CSS visibility/opacity/display, not ancestor overflow clipping), which is almost certainly why the previous verification pass's screenshots — taken with only 1–2 seed results in the database, never enough to overflow the card — missed this. This pass added extra vehicle/driver fixtures specifically to force a long enough list to reproduce it.

### 3. Inline vehicle creation — **STILL MISSING, not a partial fix**

`grep -rln "post('/vehicles'" apps/web/src` returns zero results. There is no code path anywhere in the frontend that calls `POST /vehicles`, despite the backend endpoint existing and requiring only `vehicles:manage` (which `station_supervisor` and above hold). The 4a/4b artboards show a "مركبة جديدة" button directly beside the plate-search field, parallel to the driver side's working "السائق غير موجود؟ إضافة سائق جديد" inline-creation flow (`DriverCreateForm.tsx`, which does exist and works). No equivalent `VehicleCreateForm` component exists in the codebase at all.

---

## What this pass did not cover

- 5b, 5d, 7b-mobile were confirmed in the prior round and not re-screenshotted here (no reason to suspect regression, but "not re-verified" is stated explicitly rather than silently assumed still-correct).
- Dark mode (t10, 10a–10e) — explicitly out of scope per the round-2 brief ("not required this round").
- Did not test whether a user can actually bypass the forced password-change via the nav links visible in 3c's chrome (observed the links are present and clickable; did not verify server-side whether `mustChangePassword: true` blocks the resulting API calls). Flagged as an open question, not a confirmed security bug.
