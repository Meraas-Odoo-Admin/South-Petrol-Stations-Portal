Phase 7: fixes from Mohamed's full review of the merged Phase 6 build (14 Oct 2026). Everything below is **new**. None of it was in Phase 6 or its Part B, so none of it exists yet.

Start `feat/p7-review-fixes` from the latest `main`. Read `Claude outputs/HANDOVER.md` first and keep all of its rules:
- migrations additive only;
- permissions as data;
- clear Arabic everywhere;
- the impeccable skill for every UI change;
- tests on a scratch DB only;
- stop before committing;
- never force-push.

## 1. Identity and vehicle field rules

1. **Administrative number (الرقم الإداري): 10 digits.**
   - It starts with **5** (male) or **6** (female). This replaces the old "12 digits starting with 9" rule.
   - Arabic messages, for example «الرقم الإداري يتكوّن من 10 أرقام ويبدأ بـ 5 (ذكر) أو 6 (أنثى).»
   - No birth-year or age check: the administrative number has no birth year.
   - The same shared validator for the API and the web, with unit tests.
   - Report how many existing owners fail the new rule, and don't change them.
2. **Booklet number (رقم الدفتر): digits only.** Keep today's length range unless the data shows otherwise. Update the message and the help text («أرقام فقط»).
3. **Remove the plate's N suffix completely** («تنتهي اللوحة بحرف N»): Libyan plates are digits only.
   - Remove it from registration, the pump search, the plate change form, the normaliser, the card and the duplicate check.
   - Keep the data column.
   - Report any existing plates that contain N.
4. **Manufacturing year:** a dropdown of years, newest first, from next year back to 1950. Not a typed field.
5. **Arabic placeholders:** «مثال: تويوتا» and «مثال: كامري», never English examples, in every field.
6. **Plate change (تغيير رقم اللوحة):** use the same digit-box plate input as registration.

## 2. Remove «رقم المرجع / الإثبات» everywhere

- There is no such document in practice. Remove the field from every form, report, export and API DTO (exceptions, the no-card fallback, corrections, anything else).
- Each logged action already gets a system code. Show that **automatically generated reference code** (read-only) in the lists and details instead.
- Keep the old column. Update the tests.

## 3. Registration offices: simpler

1. **Remove «المكاتب والطابعات» (desks and printers)**: the tab, the desk picker on the card screen («المكتب: الشباك 2 — Evolis …») and the desk APIs.
   - Card prints are recorded against the **office and the employee** only.
   - The black-only ribbon option stays, as a per-device setting.
   - Keep the old tables and columns.
2. **The municipality manager can issue cards**, not only register vehicles, in any registration office of **their own municipality**. Today it fails with «لا تملك صلاحية هذا الإجراء في مكتب التسجيل هذا.»
   - Every print is logged under their name.
   - API-enforced, with e2e tests: allowed in their own municipality, 403 in another.

## 4. Bugs seen in screenshots

1. **«اليوم» for the municipality manager** shows «تعذر تحميل التقرير — تأكد من اختيار محطة…» with «جميع المحطات» selected. A municipality manager must see all the stations of their municipality without picking one. Fix it and add an e2e test.
2. **Two date controls on «اليوم»:** a single «التاريخ» in the filters, plus a separate «من / إلى» range further down. Keep one, clear date control.
3. **The date picker overflows the screen** at the left edge in RTL, for example the «إلى» calendar on «اليوم». Every date picker must stay inside the viewport on desktop and at 390 px.
4. **The tab bars show a scrollbar with arrows** (municipality page, office page) on Windows. Tabs never show a visible scrollbar on desktop. Let them wrap or fit; on phones a hidden-scrollbar swipe is fine.
5. **The password field has a second inner border** (an input box inside the bordered box). One clean border, matching every other field.

## 5. Places: two lists, not one

In «إدارة المحطات» and in the municipality's «المحطات والمكاتب» tab, **petrol stations and registration offices are mixed in one list**, which confuses users. Split them into two clearly named tabs, «محطات الوقود» and «مكاتب التسجيل». Each has its own columns, filters and «إضافة» button.

## 6. Settings: clear and simple

1. **Remove «+ إضافة قاعدة رقمية جديدة»** (custom numeric rules). It's too complicated for users, so remove it from the UI. Keep existing data.
2. **Show the unit on every number:** يوم، ساعة، لتر، تعبئة، دينار، استثناء. It goes next to the value and in the description, for example «3 تعبئات في الأسبوع» or «300 لتر».
3. **Remove the placeholder notes** «رقم مبدئي بانتظار تأكيد العميل» from every setting card. List the values that had them in your report, so Mohamed can confirm them with the client.
4. **Hide settings that don't apply.** For example, «يوم بداية الأسبوع» says it's unused under the current counting method: show it only when it's used.
5. **Move «القوائم» into «الإدارة» (settings)** as a tab there, with full add / edit / archive for exception types and vehicle types. Remove it from the main side menu.

## 7. Visual: buttons and colour still too weak

Mohamed's verdict: the buttons still don't stand out, and the screens need more colour. Using the impeccable skill, define one clear button system and apply it everywhere:
- **Primary:** solid, high contrast, with Ink text on amber or white on teal.
- **Secondary:** a clearly outlined teal button, not a pale pill.
- **Disabled:** obviously disabled, never mistaken for an active button. Today the pale «حفظ» on the settings cards looks like a disabled primary.
- **Danger:** red, for irreversible actions only.

Also:
- give section headers and summary cards more colour structure (teal headers, tinted panels) so a page doesn't read as grey on grey;
- check the result on the weak-screen simulation from Part B;
- run a **full** `/impeccable critique` and `/impeccable audit` (not only the detector) on the main screens of every role.

## 8. Leftovers from Part B (still open)

- skeleton loaders on all lists;
- first-error focus in the older forms;
- the 12-box ID row clipping at 390 px;
- the 7 older side-tab anti-patterns;
- the pump figure font sizes.

## Close-out

- Run lint, typecheck, `pnpm test`, API e2e and the full Playwright suite (twice) on a scratch DB, then drop it.
- **Screenshots, before and after** (desktop + 390 px), of every item above.
- List the removed fields, endpoints and permissions, and the counts from 1.1 and 1.3. Log decisions as OPEN_ITEMS #66.
- **Stop before committing** so Mohamed (or his supervisor) can review.
