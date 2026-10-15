# Phase 7: Mohamed's review fixes (and the Part B leftovers)

The prompt is `Claude outputs/claude-code-phase7-client-review-fixes.md`. Branch:
`feat/p7-review-fixes`, from `main` at `555330f`.

Screenshots, desktop and 390 px:
- before the changes: `docs/ux-round-screenshots/phase7/before/`;
- after the changes: `docs/ux-round-screenshots/phase7/after/`.

Both sets come from `apps/web/e2e/phase7-shots.spec.ts`. Run it with `PHASE7_SHOTS=before|after`. The file names start with the prompt's item number, for example `p43-date-picker-390.png` is item 4.3.

## 1. Identity and vehicle field rules

| Item | Before | After |
|---|---|---|
| 1.1 Administrative number | 12 digits, starting with 9 | **10 digits, starting with 5 (male) or 6 (female).** There is no birth-year or age check. The same shared check runs in the API and the web (`checkAdministrativeId`). The message is «الرقم الإداري يتكوّن من 10 أرقام ويبدأ بـ 5 (ذكر) أو 6 (أنثى).» Registration shows 10 digit boxes for this type and 12 for a national ID. |
| 1.2 Booklet number | 6–12 English letters or digits | **Digits only, 6–12 digits.** The help text is «أرقام فقط، من 6 إلى 12 رقمًا.» The field opens the number keyboard. |
| 1.3 Plate N suffix | an «تنتهي اللوحة بحرف N» tick | **Gone everywhere** (see the list after this table). The `normalizedPlate` and `currentPlate` columns are kept. A plate stored with an N before Phase 7 still displays it. |
| 1.4 Manufacturing year | a typed field | **A dropdown, newest first,** from next year down to 1950 (`manufactureYearOptions`). Used in registration and in the vehicle edit form. The edit form also keeps a stored year that falls outside the list. |
| 1.5 Placeholders | «مثال: Toyota», «مثال: Hilux», «8-xxxxxxxx» | «مثال: تويوتا», «مثال: كامري», «مثال: 5-1234567» |
| 1.6 Plate change | a free-text box | **The same digit boxes as registration** (`DigitBoxInput` with `PLATE_DIGIT_GROUPS`) |

Where the N suffix was removed:
- the registration screen;
- the shared normaliser (`splitPlate`, `normalizePlate` and `plateSearchTerm` refuse an N);
- the API's plate validator, which uses the shared normaliser;
- the plate change form;
- the duplicate check, which compares normalised plates;
- the pump search, which uses `plateSearchTerm`;
- the web input helpers.

The card prints the plate as it was stored.

**Counts asked for:**
- **Dev database on this machine** (the clean demo): 0 owners and 0 vehicles. So 0 administrative numbers fail the new rule, 0 plates carry an N, and 0 booklets contain letters.
- **Mohamed's laptop and production:** run the read-only query below. It changes nothing.

```sql
SELECT 'admin numbers failing the new rule', count(*) FROM "VehicleOwner"
 WHERE "identityType" = 'ADMINISTRATIVE_ID' AND "identityNumber" !~ '^[56][0-9]{9}$'
UNION ALL SELECT 'vehicles with N in the plate', count(*) FROM "Vehicle"
 WHERE "currentPlate" ~* 'n' OR "normalizedPlate" ~* 'n'
UNION ALL SELECT 'vehicles with letters in the booklet', count(*) FROM "Vehicle"
 WHERE "registrationBooklet" ~ '[^0-9]';
```

None of those rows were changed. An owner whose number fails the new rule keeps it until someone corrects it through «طلب تصحيح الهوية».

## 2. «رقم المرجع / الإثبات» removed

- **The field is gone from:**
  - every form: the pump's exception step, the vehicle change request and the owner identity correction;
  - every API DTO: `CreateFillUpDto.proofReference`, `CreateVehicleChangeRequestDto.proofReference` and `CreateOwnerChangeRequestDto.proofReference`. Sending it now gets a 400, because DTOs refuse unknown fields;
  - the «يتطلب مرجع إثبات» switch on exception types (`requiresProof` in both exception-type DTOs and in the API responses).
- **Nothing requires it any more.** An exception type that used to require proof records without one.
- **The data stays:**
  - the columns are kept;
  - migration `20261015090000_p7_proof_reference_optional` makes the two change-request columns nullable (an additive change);
  - `ExceptionType.requiresProof` stays in the database, unused.
- **What is shown instead: the system's own reference code.** It is read-only, derived from the row's id, and every row (old ones included) already has one:
  - `EX-…` for an exception;
  - `NC-…` for a fill-up without a card;
  - `VC-…` for a vehicle change request;
  - `OC-…` for an owner change request.

  `referenceCode()` in `packages/shared-types` builds it. It is shown:
  - in the exceptions list and its CSV;
  - in «اليوم», under the status of an exception or a no-card fill-up, and in its CSV;
  - in the change-requests queue;
  - in the confirmation after a change request is sent («رمز المرجع: VC-…»).
- The reports and exports never showed the proof reference, so nothing needed removing there.

## 3. Registration offices: simpler

**3.1 Desks and printers removed.** Gone from the app:
- the «المكاتب والطابعات» tab and its editor;
- the desk picker on the card screen («المكتب: …» and «تغيير المكتب»);
- the desk picker on a reprint;
- the desk APIs.

A card and a print are recorded against the office and the employee only. The black-only ribbon tick stays, as a setting remembered on each device, next to «بطاقة إعداد الطابعة».

The tables are kept:
- `RegistrationDesk` keeps its rows;
- migration `20261015090100_p7_cards_without_desk` makes `VehicleCard.deskId` and `CardPrint.deskId` nullable;
- old cards keep their desk.

**3.2 The municipality manager issues cards.**
- `cards:issue` is now granted to `directorate_admin`.
- The API confines the manager to the registration offices of their own municipality, through the registration-station scope of a municipality-scoped role.
- Every issue and print is logged under the manager's name: `VehicleCard.issuedById`, `CardPrint.printedById`, and the `ISSUE_CARD` / `PRINT_CARD` audit rows.
- E2E tests cover both cases: allowed in the manager's own municipality, and 403 in another (`apps/api/test/phase7-review-fixes.e2e-spec.ts`).

**Removed, as listed for the review:**
- **Endpoints:**
  - `GET /registration-stations/:id/desks`
  - `POST /registration-stations/:id/desks`
  - `PATCH /registration-desks/:id`
- **Request fields:**
  - `deskId` on `POST /vehicles/:id/cards`
  - `deskId` on `POST /cards/:id/print`
  - `deskId` on `POST /cards/:id/failed-print`
- **Permission:** `registration_desks:manage`. `rbac-sync` takes it off every role on the next seed or `bootstrap:prod`. Its Permission row stays, unused.
- **Permission added:** `cards:issue` on `directorate_admin`.
- **Error code:** `DESK_NOT_AVAILABLE`.

**On an existing database, re-run the catalog sync once** to pick up both permission changes. On Mohamed's laptop or production that is `bootstrap:prod`, which is safe to re-run. Without it, a municipality manager still gets 403 when issuing a card.

«مكتبي» and the office manager's home order used to recognise an office manager by the desk permission. They now use the office's own reports permission (`registration_reports:view` together with `users:manage_staff`, without `registration_stations:manage`).

## 4. Bugs seen in the screenshots

**4.1 «اليوم» for the municipality manager.**
- **The API already handled «جميع المحطات» correctly.** The manager's own municipality is the filter. I confirmed this, and the new e2e test checks it.
- **The cause I reproduced:** when the date field was empty or half-typed, the page sent `date=` and the API refused it (400). The page then showed its single hard-coded message, «تأكد من اختيار محطة…», whatever the real reason.
- **The fix:**
  - the page never sends an incomplete date: it keeps the last full date and says «اكتب التاريخ كاملًا»;
  - a failure is shown with the shared Arabic error text (`describeApiError`);
  - there is an API e2e test and a web e2e test.
- I could not see Mohamed's own screen, so if he still meets the message, the exact steps will settle it.

**4.2 One date control.** The «من / إلى» range is gone. The directorate section follows the page's one «التاريخ» and covers the 30 days that end on it. It says so: «آخر 30 يومًا حتى ‹التاريخ› (التاريخ المختار أعلاه)».

**4.3 Date picker inside the screen.**
- **The cause:** `PortalDropdown` placed every popup at the field's left edge with the field's width, so the 288 px calendar ran off the left of the screen in RTL.
- **The fix:**
  - a popup now starts at the field's start side;
  - it is as wide as it needs (`minWidth`);
  - it is clamped 12 px inside the screen, and narrowed on a phone when it has to be;
  - it opens upward when there is more room above.
- The rule is `lib/placePanel.ts`, with 6 unit tests. It applies to every popup: the calendar, the owner search and the brand picker.

**4.4 Tab bars.** On a desktop a tab row wraps and never scrolls, so it has no scrollbar and no arrows. On a phone it is swiped with the scrollbar hidden (`scrollbar-none`). This covers the municipality, office, station and «القوائم» tabs and the report chooser.

**4.5 Password field.**
- **The cause:** the global field-edge rule from Phase 6 B1 (`index.css`) also drew an edge on the input inside the bordered password box.
- **Why the first fix did nothing:** that rule had nine `:not()` selectors, so it outranked every Tailwind class (specificity 0,9,1). Giving the inner input `border-0` had no effect, so the box inside a box was still there. The critique caught it (see below).
- **The same bug hid every field's error:** `border-danger` could never show, so the red edge of a field in error never appeared.
- **The fix:** the rule is now wrapped in `:where()`, so it has no specificity. Login and change-password show one edge, with a focus ring on the box, and a field in error shows its red edge again.

## 5. Places: two lists

«إدارة المحطات» and the municipality's «المحطات والمكاتب» tab now hold two tabs, «محطات الوقود» and «مكاتب التسجيل» (in the address as `?kind=`). Each tab has its own:
- columns: stations show name and code, company, station number, area and status; offices show name and code, address, area and status;
- filters: the company filter is on stations only;
- count;
- «إضافة» button: «إضافة محطة وقود» or «إضافة مكتب تسجيل», shown when the person may add.

The mixed list and its «النوع» filter are gone. The API (`GET /municipalities/:id/places?kind=`) is unchanged.

## 6. Settings: clear and simple

1. **«+ إضافة قاعدة رقمية جديدة» is removed** from the screen. The `POST /system-settings` endpoint and any rows already added stay.
2. **Every number shows its unit:**
   - beside the figure: «تعبئة», «يوم», «لتر», «دينار للتر», «استثناء في اليوم»;
   - in a sentence: «الحالي: 3 تعبئات في الأسبوع», «يومان», «1000 لتر», «0.15 دينار للتر»;
   - in the impact note.

   The units come from `settingValueText()` and use proper Arabic number agreement (`arabicCount`, which gained «استثناء» and «دينار»). No setting today is in hours, so «ساعة» is not used.
3. **The «رقم مبدئي بانتظار تأكيد العميل» notes are removed** («مؤكَّد من العميل» too). The settings that carried the note are listed under "Values to confirm with the client" at the end of this file.
4. **«يوم بداية الأسبوع» appears only when it is used.** That is when the week is counted «ثابت», whether saved or just chosen. The card's «غير مُستخدم حاليًا» line is gone.
5. **«القوائم» is a tab of «الإدارة»** (`/admin/lists`; `/lists` and the old addresses lead there). Its side-menu item and home card are gone.
   - Exception types and vehicle types each have full add, edit and archive:
     - edit covers the name, the rules and the daily limit, «استثناء في اليوم»;
     - archive and restore were previously «إيقاف» / «تفعيل».
   - A municipality manager now sees «الإدارة» with only «القوائم» in it. Their API permissions are unchanged.

## 7. Buttons and colour

Built with the impeccable skill (Operate mode). DESIGN.md "Buttons", "Cards" and "KPI Cards" are rewritten to match.

**One button system** (`PillButton`, the only button component):

| Variant | Look | Used for |
|---|---|---|
| primary | solid amber, Ink text (7.5:1), 2px amber-deep edge | the next action, one per region |
| brand (new) | solid teal, white text (7.9:1) | a confirming action that repeats down a page (each settings card's «حفظ», «اعتماد التصحيح») |
| secondary | 2px teal outline, teal text, on white | a real secondary button, no longer a pale pill |
| ghost | text only | «إلغاء» / «تراجع» |
| danger | 2px red outline, red text | irreversible actions only |
| disabled (any variant) | dashed grey edge on mist, faint text, no shadow, not-allowed cursor | never mistaken for a primary; the settings cards also say «غيّر القيمة أولًا ليُفعَّل الحفظ.» |

Small buttons are 40 px tall on a phone.

**Colour structure:**
- every card header (`CardHeader`) and section card (`SectionCard`) has a teal-tinted band with the title in teal deep;
- neutral summary figures (`KpiCard`) sit on a light teal panel;
- page titles are teal deep.

**Focus ring (changed after the audit):** it is now Petrol Teal Deep: 10.4:1 on white, 8.6:1 on the page and 9.5:1 in a field. The amber ring was 2.1:1 on white, which fails WCAG 1.4.11. The contrast script had been checking teal for the ring, so it reported a pass for a ring the code never drew. It now checks the real ring. DESIGN.md is updated to match.

**Checks:**
- **Contrast:** `scripts/contrast-check.mjs` gained seven new pairs: the four button and header pairs, and the three focus-ring pairs. All pass, and `docs/contrast-table.md` is regenerated.
- **Weak screen:** checked with the Part B simulation (`weak-*.png` in the after folder).
- **Detector:** the impeccable detector (`detect`) reports **0 findings** on `apps/web/src`, down from 8 at the start of this round. The full critique and audit are summarised below.

## 8. Part B leftovers

- **Skeleton loaders on all lists.** About 30 places that showed «جارٍ التحميل» now show the shared `SkeletonRows`. Three loading lines are left as words on purpose, because they are not lists: the station dropdown option, the pump's fuel-price line and the sign-in check.
- **First-error focus in the older forms.** `lib/focusField.ts` holds `focusField` and `focusFirstInvalid`. The cursor now goes to the first field that needs fixing in:
  - registration, for both the owner and the vehicle;
  - the vehicle edit form;
  - the owner edit form;
  - both change-request forms;
  - station create and edit;
  - office create and edit;
  - person create;
  - both «القوائم» lists.
- **The 12-box ID row at 390 px.** A row of more than 10 boxes uses 23 px boxes and 3 px gaps on a phone (317 px for 12 boxes), so it fits without scrolling.
- **The side-tab anti-patterns.** None are left. The cases fixed:
  - the change-request success notices became the shared `Notice`;
  - the pending vehicle card has a full amber edge on an amber tint;
  - the rejected review card has a full red edge;
  - the QR viewfinder corners are one drawn SVG (the old ones also ignored RTL).
- **The pump figure font sizes.** They are kept large on purpose (44 px plate, 48 px amount, read at arm's length in the sun). They are now documented in DESIGN.md's type scale, which is what the detector asked for.

## After review: the side menu stays in place (Khalil, 15 Oct 2026)

On a desktop the side menu used to scroll away with the page. It is now sticky to the top at the height of the screen (`Layout.tsx`): the page scrolls under it, a long menu scrolls inside itself, and the account card with «كلمة المرور» / «خروج» stays at the bottom. Checked in the browser: after scrolling 1,450 px on the settings page the menu is still at the top, full height. The phone already had a fixed top bar and bottom bar.

## After review: 10 rows a page on every list (Khalil, 15 Oct 2026)

Every table and row list now shows 10 rows a page. Before, it was 20 to 50 depending on the screen, and some lists had no pager at all. The number lives in one place (`lib/pageSize.ts`, `LIST_PAGE_SIZE`), and every list uses the one pager (`Pagination`: «1–10 من 340», the page in the address, so a refresh keeps it).

- **Paged by the server, now 10 a page:**
  - vehicles, a vehicle's history, people, stations and offices with their activity;
  - the municipality tabs, the daily report, exceptions, the operations report and fuel stock;
  - the audit log and an employee's activity. The last two had their own «السابق / التالي» buttons; they now use the shared pager.
- **Already loaded whole, now paged on the screen** (`useClientPage`, same pager):
  - the exception types and vehicle types in «القوائم»;
  - vehicle and owner change requests (each list keeps its own page: `?page=` / `?opage=`; up to 100 are loaded);
  - exceptions by station;
  - the per-station table on the dashboard (the «الأعلى» mark is still worked out over all stations);
  - the municipalities list.

  A filter that shrinks a list goes back to page 1.
- **The side rail on «تسجيل تعبئة»** shows the latest 10 fill-ups of the day, not 25, and links to the full daily report. It has no pager because the employee records one fill-up after another.
- **Lists left as they are:** search pickers (8 to 10 suggestions), and the pending-changes lookup on the vehicles list. The lookup only marks rows and draws no rows of its own.

## After review: the station employee only records fill-ups (Khalil, 15 Oct 2026)

The station employee's job is «تسجيل تعبئة» (`/fillups/new`) and nothing else. They had ten permissions and now have five, exactly what the fill-up screen calls:

| Kept | Why |
|---|---|
| `stations:read` | the fuels their station sells (the fuel buttons) |
| `vehicles:read` | the plate lookup and the vehicle preview after a scan |
| `cards:scan` | reading the card |
| `fillups:create` | recording |
| `fillups:record_exception` | a blocked fill-up recorded as an exception, on the same screen (the client's decision, OPEN_ITEMS #46) |

**Removed:**
- `reports:own_shift` («ورديتي»);
- `fuel_stock:read_visible` (the stock strip and its warning);
- `notifications:read` (the bell);
- `vehicle_types:read`.

What the employee sees now:
- **The app opens on «تسجيل تعبئة».** There is no home screen.
- **The side menu has one item.** On a phone there is no bottom bar of one tab, and the bell is hidden.
- **Any other address** (`/`, `/vehicles`, `/stations`, `/reports`) brings them back to the fill-up screen.

How it is done, without checking a role's name:
- **A new permission for the record screens.** `vehicles:read` and `stations:read` are also what the fill-up screen calls, so they no longer decide who gets «المركبات» (with its search tab) and «المحطات». A new permission does: `records:browse`. It is held by every catalog role that reads vehicles (station supervisor, both registration roles, municipality manager, super admin), so nobody else loses anything.
- **One destination means no home screen.** Someone whose permissions give exactly one destination has no home screen (`singleDestination`, `lib/navAccess.ts`). Today that is only the station employee.
- **No refused requests.** The stock strip no longer asks for stock when the person may not see it, so there is no refused request every minute.

**Before go-live:** existing databases get the new grants from `pnpm --filter @fuel-tracking/api run bootstrap:prod` (the catalog sync). Without it, the old ten permissions stay.

**To confirm with the client:** the supervisor's «إظهار المخزون للموظفين» switch (in «محطتي») no longer governs any catalog role. It still works for an account a super admin gives `fuel_stock:read_visible` to. It can stay, or it can be removed.

## The impeccable audit and critique (main screens of every role)

Both were run on this branch after sections 1–8 were built.

**Audit** (code-level, `reference/audit.md`): **12/20, "Acceptable"**, with 1 P0, 7 P1, 10 P2 and 6 P3. What was fixed in this round:

| Severity | Finding | Fix |
|---|---|---|
| P0 | `Dialog` moved focus on every keystroke: the reason field of every archive or deactivate dialog lost focus after one character (the e2e tests type with `fill()`, so they missed it) | the focus effect runs only on open and close; `onClose`/`busy` are read from refs; new e2e test types one key at a time |
| P1 | focus ring 2.1:1 | teal-deep ring, see section 7 |
| P1 | unlabelled fields | login (and its errors are now announced), change password, the pump amount, the station picker and date fields (both take an `id`; «اليوم» and exceptions now tie their labels), and the digit boxes (each named «رقم اللوحة: الخانة 3 من 9», with «حذف آخر رقم» on the keypad) |
| P1 | the exception buttons forced solid red with `!important`, which hid the disabled state | plain `danger` variant |
| P1 | the fuel and amount toggles at the pump showed their state by colour only, and the amount field had no focus ring | `aria-pressed` and a ✓; a teal chosen state, so amber is again the one next action; a focus ring |
| P1 | «خروج» was red text on a tint at 4.2:1; «تعديل» was amber text at 2.1:1 | «خروج» is a neutral outlined button (signing out is not irreversible); «تعديل» is teal deep |
| P1 | «اليوم» and the exceptions list scrolled sideways on a phone | stacked rows on a phone |
| P2 | login, change-password and paging buttons bypassed the button system | `PillButton`; the unused `PrevNext.tsx` was deleted |
| P2 | 4 different header bands | one band; `CardHeader`'s title is a real heading |
| P2 | prices could only be stepped by 0.01 per tap | the number can be typed |
| P3 | DESIGN.md said 8.7:1 for Ink on amber (it is 7.5:1) and still described the gradient primary | corrected |
| — | login copy said fill-ups record a driver; Arabic text had letter-spacing | corrected |

**Critique** (`reference/critique.md`, two independent sub-agents): **Assessment A (design review) 28/40, "Good"**. Assessment B (detector and browser) found:
- **Detector:** 0 findings.
- **Sideways scrolling:** none, on 12 pages at 1280 and 390 px.
- **Console errors:** none.
- **Rendered-page findings:** faint placeholders, a skipped heading level, and the camera error colour.

What was fixed in this round:
- **The `:where()` field rule** (4.5 above).
- **The directorate figures on «اليوم»:**
  - litres were shown as «3865.040000000001»; `KpiCard` now formats every number;
  - the «مرتبة بنسبة الاستثناءات» table was not sorted; it is now sorted, with a rate column;
  - the exception-rate card was red even at 0%; it is now amber when there are exceptions and neutral when there are none;
  - the amber fuel bars are now teal, and the off-palette line colour is now the red token;
  - the station table is stacked rows on a phone.
- **Placeholders** were the browser's grey (2.3:1); they are now Ink Faint (5.4:1 or more).
- **The heading level** in the places lists is fixed.
- **The camera error on the dark scanner panel** is now light text with ⚠, and its button has no glow.
- **Small fixes:**
  - the date field on «اليوم» was cut off on a phone;
  - the exception filters' labels are now tied to their fields;
  - registration's locked vehicle step now says why («تُفتح بعد اختيار المالك أو تسجيله في الخطوة 1.»);
  - «مكتبي» no longer mentions printers.

**Recommended next (not done in this round; they change flows rather than fix them):**
1. **The pump when the camera is denied.** Today it shows a large black panel whose only action is «إعادة المحاولة»; the no-card search sits underneath, and on a phone it can fall under the bottom bar. Proposal: collapse the scanner to a short notice and open the no-card search as the main action. "The pump flow is sacred", so this needs Mohamed's decision.
2. **«اليوم» mixes one day with a 30-day directorate view.** Proposal: give the directorate view its own destination.
3. **Navigation names and layers:**
   - the menu says «تقرير المحطة اليومي» while the page says «اليوم»;
   - «طلبات تصحيح الهوية» and «طلبات التعديل» name the same thing;
   - the phone's bottom bar has two items for the vehicles page, and a desk role's bar starts with «تعبئة»;
   - on a municipality's page, the stations/offices tabs sit under two other tab rows.

   Names on screen should be changed with Mohamed.
4. **Settings save card by card** (9 «حفظ» buttons). One form with a single «حفظ التغييرات (3)» bar would be calmer.
5. **The vehicle page has 6 separate «طلب تغيير …» buttons.** One «طلب تصحيح» that asks what is wrong would be simpler.
6. **Smaller items:**
   - a shared segmented control in place of the 6 hand-made ones;
   - arrow keys on tabs and radio groups;
   - modal behaviour for the phone menu sheet;
   - 44 px phone targets for the small controls (the date-field arrows, the eye icons, the menu button);
   - route-level code splitting so the charts and scanner are not loaded at sign-in;
   - loading Cairo 900 and Mono 800, which are used but not loaded.
7. **The sidebar and the login page show «مديرية أمن سبها» as fixed text.** That is right while Sabha is the only live municipality. Before a second municipality, the sidebar should show the user's own directorate.

## Values to confirm with the client (were «رقم مبدئي بانتظار تأكيد العميل»)

- الحد الأسبوعي لعدد تعبئات مالك المركبة (`fillup.max_per_week_per_owner`)
- أقل فاصل زمني بين تعبئتين لنفس مالك المركبة (`fillup.min_gap_days_per_owner`)
- الحد الأسبوعي للترات مالك المركبة (`fillup.max_liters_per_week_per_owner`)
- يوم بداية الأسبوع (`fillup.week_start_day`)
- سعر لتر الديزل (`fillup.price_per_liter.DIESEL`)
- سعر لتر الكاز (`fillup.price_per_liter.KEROSENE`)

## Checks (on the final code, scratch database `fuel_scratch`)

| Check | Result |
|---|---|
| `pnpm lint` and `pnpm typecheck` | pass, 0 warnings |
| `pnpm test` | API 209/209 (23 suites), web 25/25 (6 new: popup placement), scripts 24/24 |
| API e2e (`jest --config test/jest-e2e.json`) | **387/387**, 27 suites, including the new `phase7-review-fixes.e2e-spec.ts` (13 tests). 6 older suites were updated for the new rules (desks, proof reference, N plate, booklet letters). |
| Playwright, full suite | two clean full runs on the final code: **49 passed, 0 failed** each (6 skipped = the on-demand screenshot spec). One run in between had 2 failures in the two fake-camera scan tests; run alone 3 times in a row, they passed every time (timing of the simulated QR scan, not a defect). |
| impeccable detector | 0 findings on `apps/web/src` (8 at the start) |
| `node scripts/contrast-check.mjs` | every pair passes (7 new pairs) |

The screenshot specs of earlier phases rewrite their own folders on every run; those files were restored, so the only screenshots in this change are under `docs/ux-round-screenshots/phase7/`.

## After review: «طلبات التعديل» hidden (Khalil, 15 Oct 2026)

The «طلبات التعديل» entry (`/vehicles/change-requests`) is hidden from every role:
- **What is gone:** the side menu item, the phone menu item and the home card. One switch in `lib/navAccess.ts` (`changeRequests`) controls all three, and its pending-count request no longer runs.
- **What stays:**
  - the screen itself, the API and the forms that send a request;
  - the «طلبات تعديل بانتظار الاعتماد» figure and the row highlight on «المركبات».
- **To bring it back:** set the switch to `has('vehicles:approve_change')` again.
