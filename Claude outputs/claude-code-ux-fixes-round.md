UX fixes round after the client's walkthrough of the merged build. **Build only what's listed here.**

Start `fix/ux-round` from `main` (db6b4fe or later). **Use the impeccable skill for all UI work:** run `/impeccable critique` on the municipality page *before* redesigning it, and `/impeccable audit` on everything you touch at the end. Follow `apps/web/PRODUCT.md` and `apps/web/DESIGN.md`. Permissions stay data; migrations (if any) stay additive.

## 1. The municipality page is one endless scroll. Split it up and paginate everything

**What's wrong.** `/admin/municipalities/:id` (super admin) stacks everything on one page:

- the summary cards and the readiness panel;
- every station and office;
- every person;
- the activity log;
- the archive box;
- the reports with their filters;
- all the report tables (fill-ups per station, stock, offices, top vehicles, institutions).

None of the lists has pagination, so the page grows without end and nobody can find anything. The client called it unusable.

**Fix:**

- **Tabs** at the top of the municipality page, under the header and summary cards. The active tab and page number go in the URL, so the back button and refresh keep your place:
  1. **نظرة عامة**: the summary cards and the readiness panel only.
  2. **المحطات والمكاتب**: one list with a type filter (محطة / مكتب تسجيل), search, status, company and locality filters, and sortable columns.
  3. **الأشخاص**: grouped or filtered by job, with search and status.
  4. **التقارير**: the municipality reports, each in its own sub-tab or chooser. Show one report at a time, never all tables stacked.
  5. **سجل النشاط**: the activity log.
  6. **الإعدادات**: the name, directorate name, status, stage dates, and archive at the bottom as a clearly separated danger zone.
- **Server-side pagination on every list and table** (20–25 rows per page, page controls and «1–20 من 340»), with filters and sort applied on the server. No list may load unbounded rows. Load a tab's data only when the tab is opened.
- Apply the same rule to every other page that has a long list. Audit the whole app for unbounded lists and fix them all:
  - «إدارة المحطات»;
  - a station's page and an office's page (employees, deliveries, activity);
  - the reports;
  - the vehicles list.

  List each one in your report.
- **Phone (390px):** the tabs scroll horizontally or become a select. Tables become stacked rows, as elsewhere.

## 2. Notification bell

Shown in the client's screenshot:

- **The panel opens off-screen.** In RTL it overflows the left edge, and its content is cut off. Anchor it so it always stays inside the viewport. On desktop, open it toward the page interior with a max height and its own scroll. On phones, use a full-width sheet.
- **Raw values are shown to the user** (`false ← true`, `03: 2 ← 2`). Every notification needs a plain Arabic sentence, for example «تم تفعيل قاعدة الحد الأسبوعي للمالك» or «تم تعديل مدة الانتظار بين التعبئتين من 2 إلى 3 ساعات». No raw keys, booleans or arrows.
- **The badge shows +99.** Check whether notifications are created in duplicate or too broadly: test runs changing settings, or one event notifying the same person several times. Fix any duplication. Collapse repeated identical events. Keep «تحديد الكل كمقروء».

## 3. Side navigation highlights two items at once

From the screenshots: on `/reports/daily`, both «التقارير» and «تقرير المحطة اليومي» are highlighted. On `/reports/violations`, both «المخالفات والاستثناءات» and «التقارير» are highlighted.

- **Exactly one item is active** for any address. Use the longest matching path, not "starts with".
- Fix it in the shared `navAccess.ts` logic, so the side panel, the phone bottom bar and the home cards all agree.
- Add a unit test that walks every route in the nav list and asserts exactly one active item.

## 4. Registration employees can reprint or reissue any registered vehicle's card

Today a registration employee can't regenerate a card, or use «إصدار بطاقة جديدة», for a vehicle that was first registered at a different office. Vehicles are global (5A decision), so this must work from any office.

- Any registration employee, in any office, can find any registered vehicle. They can **reprint** its current card or **issue a new card** (lost, damaged or details changed).
- The existing rules stay:
  - a required reason;
  - the previous card is cancelled when a new one is issued;
  - every print is counted against the **printing** employee's office and desk blank-card stock;
  - existing approvals (office manager for cancellations) still apply;
  - every action is audited.
- Owner and vehicle *editing* rules don't change. This is about cards only.
- Add e2e tests: an employee at office B reprints, and issues a new card for, a vehicle registered at office A. The print is counted at office B, and the old card is cancelled.

## 5. Small things seen in the screenshots

- **Daily report chart:** the fuel-type labels (بنزين 95, ديزل, كاز) sit on top of the bars. Give the labels their own space, and label the axis (count of fill-ups or liters, whichever it is).
- **Violations list:** the reason text shows a garbled date (`13p 3:32:21 ،2026/10/`). Format dates in Arabic order, and isolate numbers and dates inside Arabic text (`<bdi>` or Unicode isolates), everywhere this pattern occurs.
- **Readiness sentence:** «نحو 1 يومًا» is wrong Arabic. Use correct number agreement (يوم واحد، يومان، 3 أيام، 11 يومًا…) through one shared helper, and use it everywhere a count of days, cards, liters or stations is written in a sentence.

## Close-out

- Lint, typecheck, `pnpm test`, API e2e and the full Playwright suite, all through the root scripts, on the dev DB.
- **New tests:**
  - pagination on the paginated endpoints (page size, total, filters with paging);
  - one active nav item per route;
  - notification text has no raw values;
  - cross-office reprint and new card.
- **Screenshots, before and after,** desktop and 390px:
  - each tab of the municipality page;
  - «إدارة المحطات»;
  - the bell panel open on desktop and phone;
  - the side nav on `/reports/daily` and `/reports/violations`;
  - a cross-office reprint;
  - the daily chart;
  - a violation row.
- List every list you paginated. Log decisions as OPEN_ITEMS #63.
- **Stop before committing so I can review.** Never force-push. Don't commit `docs/card-rendering/*.pdf`, `.env` files, `Claude outputs/`, `data/private/` or `.impeccable/` at the repo root.
