Phase 5B: fuel storage at stations, the notification bell, reports per role, the 4c pages folded into the station and office pages, and clearer user settings. The second of three closing phases. **Build only what's listed here.**

Start `feat/p5b-operations` from `main` **after Phase 5A is merged**. If it isn't, stop and tell me.

**Use the impeccable skill for all UI work** (run `/impeccable critique` on the three 4c report pages before redesigning them, and `/impeccable audit` at the end). Follow PRODUCT.md and DESIGN.md: minimum text sizes, colour meanings, never colour alone. Use the dataviz skill's guidance for every chart. Permissions are data; migrations are additive.

## 1. Fuel types and storage tanks per station

**Fuel types:**

- The **station supervisor** chooses which fuel types their station currently sells (`StationFuelAvailability` exists). It lives in «محطتي», the station page 5A created, next to the station's employees.
- The fill-up screen only offers the station's active fuel types.

**Storage:** per station, per fuel type.

- **Tank capacity** (liters) and an **opening level**, entered by the supervisor when the station starts using the system.
- **Deliveries:**
  - the supervisor records each truck delivery: date and time, fuel type, liters, truck plate, waybill (بوليصة) number, optional driver name;
  - deliveries can't be edited or deleted: a mistake is fixed with a linked correction entry with a reason, as for card stock in 4c;
  - every entry is audited.
- **Current level** = opening level + deliveries − liters dispensed by fill-ups since then.
  - Computed by the server, never typed.
  - If it goes **below zero**, show it as a data warning (an unrecorded delivery or a wrong opening level), never as a negative number without an explanation.
- **Who sees it:**
  - the supervisor and the station's employees see the current level per fuel type on their home and fill-up screens;
  - the supervisor has a switch **«إظهار المخزون للموظفين»** per station to hide it from employees whenever they want;
  - municipality managers and the super admin see all stations' levels.
- **Low-stock alert:**
  - when a fuel type at a station drops **below 1,000 L**, notify the station supervisor and the municipality managers (section 2);
  - alert once when it crosses below, and again only after it's been refilled above 1,000 L and drops again; no repeated spam;
  - the 1,000 L threshold is a setting only the super admin can change.
- **Reset to zero** (the client asked for it):
  - a supervisor button that sets a fuel type's level to zero;
  - it asks for confirmation (a dialog with the fuel type, the current level, a required reason, and a typed confirmation word);
  - it's recorded as a reset entry (who, when, previous level, reason), audited, and notified to the municipality managers;
  - the level then continues from zero with the next delivery.
- **Don't block fill-ups** because of stock. The stock is a monitoring tool, and records can lag behind reality. Show a warning on the fill-up screen when the level for that fuel is at or below zero.

## 2. Notification bell, for every user

- A bell in the header for every role, with an unread count. A list shows newest first: a short Arabic title, a line of detail, the time, and a link to the thing it's about. There's a "mark all as read".
- **In-app only** (no SMS or email), stored per user, kept 90 days. Polling every 60 seconds is fine.
- Notifications **only reach users inside the scope of the thing** (station, office, municipality).
- **What each role is told:**

| Role | Notified of |
|---|---|
| موظف محطة | low stock at their station (only if stock is visible to employees); their own password reset by a supervisor |
| مشرف محطة | low stock or a negative level at their stations; exceptions waiting for approval; emergency overrides recorded at their stations; a fuel-type mismatch at their station; an employee locked out |
| موظف تسجيل | their correction requests approved or rejected; a failed print they haven't resolved |
| مدير مكتب التسجيل | correction requests waiting; a card-stock shortfall at their office; low blank-card stock (threshold set by the super admin); an employee locked out |
| مدير البلدية | low stock or a reset at any station in the municipality; a card-stock shortfall at any office; emergency overrides; a station or office archived; the deadline 7 days away when the readiness estimate says registration won't finish |
| المدير العام للنظام | only what needs them: a municipality with no manager, rule switches and system settings changed, and repeated failed logins on a manager account. Not every station event: the municipality managers own those |

- Build it as one notification service that features call, so later events are one line each.

## 3. Reports per role

Rebuild the report screens so each role gets the information its job needs, with filters and sorting. **Every report:** date range (Tripoli days), sortable columns, CSV export, PDF where it already exists (with the Chromium renderer and Cairo, Arabic correct). Readable at 390px.

| Role | Reports | Filters / sort |
|---|---|---|
| موظف تسجيل | their own day: vehicles registered, cards issued, failed prints | date |
| مدير مكتب التسجيل | the office's day/period: registrations and cards per employee, wasted cards, duplicates caught, corrections pending and decided, card stock and reconciliation, each employee's activity and last login | date, employee, card reason; sort by date, employee or count |
| موظف محطة | their shift: today's fill-ups and liters (no other report) | — |
| مشرف محطة | fill-ups per day per fuel type (count and liters), by identification (card / typed / override), per employee; exceptions and violations; storage: deliveries, dispensed, level over time, low-stock and reset history; fuel-type mismatch warnings | date, fuel type, employee, identification; sort by date, liters or employee |
| مدير البلدية | the whole municipality: fill-ups and liters per station, fuel type and day; **fuel reconciliation per station** (delivered − dispensed − current level, which highlights stations where fuel is unaccounted for); stations low on stock; registration progress per office; deadline readiness; violations, exceptions and overrides; fuel-type mismatches; top vehicles by liters; institution-owned vehicles' consumption | date, station, company, office, fuel type; sort by any numeric column |
| المدير العام للنظام | inside «إدارة البلديات»: one municipality at a time, with the same reports as its managers, plus a cross-municipality summary and the audit log | the same, plus municipality |

**Where each report lives:** through the shared `navAccess.ts` list, so home cards, menu and bottom bar stay consistent.

## 4. Fold the three confusing 4c pages into the station and office pages

The client found «متابعة مكاتب التسجيل», «مخزون البطاقات» and «الجاهزية للموعد النهائي» confusing:

- the tables are unclear;
- fields are misaligned (for example the «عدد الأيام الأخيرة للتقدير» field);
- there's too much white and grey, with nothing guiding the eye.

**Remove them as separate pages, and put their content where it belongs** in the structure 5A built:

- **One registration office** (opened from «إدارة المحطات» by the municipality manager, or «مكتبي» by the office manager): tabs **نظرة عامة** · **الموظفون** · **البطاقات والمخزون** · **المكاتب والطابعات**.
  - The overview: today's cards, wasted cards, the stock status, and each employee's activity.
- **One petrol station** (from «إدارة المحطات» or «محطتي»): tabs **نظرة عامة** · **الموظفون** · **الوقود والمخزون** · **التقارير**.
- **The top of «إدارة المحطات»** (municipality manager) and of a municipality in «إدارة البلديات» (super admin): a short summary row:
  - for registration: cards issued today, offices active, blank cards unaccounted for;
  - for fuel: stations low on stock, fuel unaccounted for;
  - a **«الجاهزية للموعد النهائي»** panel laid out as one sentence answer at the top («يحتاج التسجيل نحو ‹س› يومًا — باقٍ على الموعد ‹ص› يومًا»), then the chart, then the details, with the inputs (like the number of days) properly aligned.
- **Visual hierarchy,** using DESIGN.md:
  - teal for structure;
  - amber for the next action;
  - green, amber and red status badges with words;
  - summary numbers large;
  - tables with clear headers and row separators;
  - no grey-on-white walls.
- Redirect the old routes to their new place for each role.

## 5. Clearer user settings (inside the station, office and municipality pages)

- **Active / inactive** becomes a clear iOS-style switch on the person page. Switching off still asks for the reason (4b rule). Archiving is a separate action, as defined in 5A.
- **Advanced permissions:**
  - show the permissions **grouped by area**, in plain Arabic;
  - the permissions that come from the person's job are shown **ticked and locked**, labelled «من الوظيفة»;
  - extra ones can be switched only by the levels 5A allows (super admin; a municipality manager for supervisors and office managers, within their allowed set);
  - changing the job updates the locked ticks immediately.
- Use the same switch component for the rule switches from 5A and the «إظهار المخزون للموظفين» switch. Record it in DESIGN.md.

## Close-out

- Lint, typecheck and the full suite through the root scripts, all boundary tests passing.
- **New tests:**
  - stock arithmetic (opening, deliveries, dispensed, reset, corrections, negative case);
  - the low-stock alert fires once per crossing;
  - the hide-from-employees switch is enforced by the API, not just the UI;
  - notifications only reach users in scope;
  - each role's reports return only its scope;
  - the fuel reconciliation figures;
  - locked job permissions can't be removed.
- **Dev data:** extend the dev-only activity seed with deliveries, a low-stock crossing, one reset and a negative-level case.
- **Browser pass** with screenshots (desktop + 390px), for each role: the bell with real notifications, their reports, a station's and an office's tabs, the summary row and readiness panel, the stock screen with a delivery, a reset (with confirmation) and the hide switch, and the person page with the switch and the locked permissions.
- Run `/impeccable audit` on everything new.
- Update the phase table (5B built, 5C next). Log decisions as OPEN_ITEMS #60. List migrations, confirming each is additive.
- **Stop before committing so I can review.** Never force-push.
