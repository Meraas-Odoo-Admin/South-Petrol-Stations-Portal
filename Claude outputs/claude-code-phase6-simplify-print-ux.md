Phase 6: simplify to what the client needs, make cards print correctly on the real printer, then level up the whole UI/UX. **Two parts. Do Part A, then stop and report. Do Part B only after I approve.**

Start `feat/p6-simplify-print` from `main` (438eaf4 or later). Permissions stay data. Migrations stay additive: **never drop a column or table**. Remove features from the API, the UI and the navigation, and leave old data in place. Keep every existing test that still applies green. Delete or rewrite tests only for behaviour that was removed on purpose, and list them.

---

# PART A: Remove what the client doesn't want, fix printing, list what else could go

## A1. No grace period, no stages. One activation switch per municipality

The client's decisions:
- the pump **never accepts a typed plate**: a fill-up is only ever recorded from a **card scan**;
- the grace / awareness / card-required stages and their dates are removed;
- each municipality gets one **activation switch** that marks when it started working.

**Remove:**
- the stage logic and the stage dates (awareness start, deadline) in the API, the rule engine and the UI;
- the stage banners and countdowns;
- the deadline typed-name confirmation;
- the A4 stage-announcement sheet;
- the «الجاهزية للموعد النهائي» readiness panel, report and PDF;
- every typed-plate path at the pump: typed registered, typed unregistered, the «مركبة غير مسجلة» flow and the type-the-plate link.

**The pump flow becomes:**
1. scan the card;
2. confirm the vehicle;
3. enter the fuel type and amount;
4. review the rules;
5. done.

When a card can't be read, show a clear Arabic message and the next step. For example: «تعذّرت قراءة البطاقة. نظّف الكاميرا وأعد المحاولة، أو اطلب من صاحب المركبة مراجعة مكتب التسجيل لإعادة طباعة البطاقة.»

**Emergency override:** don't remove it yet. Put it in the A4 list as a question for me (see below).

**Activation switch:** reuse the municipality status.
- It shows as «مفعّلة منذ ‹التاريخ›» or «غير مفعّلة».
- Only the super admin switches it. It asks for confirmation, records the date and who switched it, and is audited.
- Turning it off asks for a reason.
- It gates nothing. The system works the same either way.
- Reports default their date range to start from the activation date.

**Data:** keep `identifiedBy` and the old columns. Only stop writing the removed values.

## A2. Blank-card stock is removed

The client tracks blank cards outside the system.

**Remove** from the API, the UI, the navigation and the notifications:
- card-stock entries (deliveries and counts) and their corrections;
- the reconciliation, and «بطاقات فارغة غير مبرّرة» in the summary rows;
- the low blank-card notification and its setting;
- the «البطاقات والمخزون» office tab.

**Keep:**
- printing, reprinting and failed-print handling;
- the per-card history;
- the **test card**, which is needed to set up the printer. Keep the test-card PDF but stop counting its prints.

## A3. Cards print correctly on the Evolis Zenius Classic

The client's printer is an **Evolis Zenius Classic**:
- single-sided;
- thermal transfer, 300 dpi, edge-to-edge;
- ISO CR80 cards, 85.60 × 53.98 mm, 0.25–0.76 mm thick;
- colour (YMCKO) or monochrome ribbon;
- USB, with the Evolis Windows driver.

There is no time for trial and error at the desk. **Audit the card rendering from Phase 3 against all of this and fix whatever doesn't match.** We can't test on the real printer here, so build it to the spec and give me a one-page check for the first real print.

**Size and page:**
- The PDF page is exactly **85.60 × 53.98 mm, landscape**.
- `@page { size: 85.6mm 53.98mm; margin: 0 }`.
- No browser headers or footers, no scaling and no blank second page.
- Verify the PDF page box in code with a test.

**Resolution:**
- Everything is vector where possible: text, the QR code, lines.
- Any raster image is at least 300 dpi at its printed size; the full card is 1011 × 638 px at 300 dpi.
- No blurry upscaling.

**Safe area:**
- All text, the QR code and anything that must be read sit **at least 2 mm inside every edge**.
- Background colour may run edge to edge.
- No hairlines thinner than 0.25 mm (3 dots).

**Text:**
- Cairo is embedded.
- Arabic shaping is checked in the PDF itself, not only in HTML.
- The smallest text is no less than **7 pt** regular or **6 pt** bold.
- The plate number is the largest element.
- No light-grey small text: at 300 dpi thermal it disappears.

**QR code:**
- Pure black `#000000` on white, vector, with a quiet zone of at least 4 modules and a module size of at least 0.5 mm.
- Size it so it scans from a phone camera at the pump in poor light, and **test the scan** from the rendered PDF.
- Pure black text and QR let the driver print them with the black resin (K) panel, which is sharp and scannable. Avoid large pure-black filled areas.
- Keep the black-only PDF for monochrome ribbons, and check both versions.

**One face only (client decision).** Today the card has two faces. The printer prints one side, so the card must be **one face, printed once**. Redesign it:

- **The QR code is the most important element.** Give it the most room: about 26–30 mm square including its quiet zone, on one side of the card, never crowded, and checked to scan from a phone at the pump.
- **Every vehicle detail goes on the same face, beside the QR code:**
  - the plate, as the largest text;
  - make and model;
  - colour;
  - manufacturing year;
  - fuel type;
  - chassis number, in full, readable at 7 pt or larger;
  - booklet number;
  - card number and issue date;
  - the municipality / «مديرية أمن ‹البلدية›» header line.

  Keep the rules from Phase 3: **no owner name or national ID on the card**, and no imitation of the official emblem.
- **Layout:**
  - a clear reading order (header → plate → details in a tidy two-column grid);
  - the 2 mm safe area, Arabic right-to-left, and the minimum text sizes above.
- Remove the back face everywhere: the PDF, the preview, the print flow and the test card. A reprint or new card prints the same single face.
- Deliver two or three layout options rendered to PNG at 300 dpi in your report, with your recommendation. Build your recommended one; I'll confirm it with the client.

**Printer setup card:** a new downloadable PDF for the first print on the real printer. It shows:
- lines at 1, 2 and 3 mm from each edge;
- the centre cross;
- a font-size ladder (6–14 pt, Arabic and Latin);
- the QR code at three sizes;
- a sample plate.

The client prints it once and tells us which lines survive.

**`docs/PRINTING.md`** (Arabic and English), covering:
- the Evolis driver settings: card size CR80, landscape orientation, ribbon type, black text on the K panel, no "fit to page" or scaling;
- Chrome's print dialog settings: margins none, scale 100%, no headers or footers, or printing the PDF directly from a PDF viewer;
- troubleshooting: shifted print, cut-off edges, faint text, a QR code that won't scan.

Also show short Arabic print instructions in the app, next to the print button.

**Report:** a table of every spec above, with "matches / fixed / can't verify without the printer".

## A4. List every feature the client might not need. Don't remove them yet

Go through the whole app, role by role. Produce `docs/feature-inventory.md` as a table with these columns:

| Feature | Screen(s) | Role(s) | What it does, in one plain Arabic line | Used by the main daily flow? | Your recommendation (keep / remove / merge) and why |
|---|---|---|---|---|---|

Include at least:
- the emergency override at the pump;
- exceptions and violations, and standing exceptions;
- correction requests;
- vehicle types and exception types admin;
- routes (خط الإعداد);
- institutions;
- each report;
- the dashboard vs the daily report (overlap?);
- the guided tour;
- the activity log in each place;
- the notification types;
- CSV vs PDF exports;
- companies admin;
- desks and printers;
- anything else you find.

**Don't remove anything from this list.** I'll ask the client and tell you.

## Part A close-out

- Lint, typecheck, `pnpm test`, API e2e and the full Playwright suite, on the dev DB. **Don't re-seed and don't run anything that recreates test data on the dev DB without telling me.** It's currently a clean demo. Run the API e2e and Playwright against a separate scratch database, and drop it afterwards.
- Screenshots (desktop + 390px):
  - the new pump flow;
  - a card that can't be read;
  - the activation switch;
  - an office page without the stock tab;
  - the card PDF and the printer setup card, rendered to PNG at 300 dpi.
- List removed routes, endpoints, permissions and tests. Log decisions as OPEN_ITEMS #64.
- **Stop. Don't commit.** Send me the report and `docs/feature-inventory.md`.

---

# PART B: The whole UI/UX, re-evaluated and levelled up (only after I approve Part A)

Goal: the client opens the system and feels it is **organised, helpful and fast**. Every person finds their work immediately, errors are explained in clear Arabic with what to do next, and every screen reads clearly on an old, low-contrast laptop screen, not only on a good monitor.

**Skills:**
- Use the **impeccable** skill throughout: `critique` before changing each area, its layout, colour and typography guidance while changing, and `audit` at the end.
- If a React skill is installed (e.g. `/react-expert`), use it for component structure, state and performance. If none is installed, say so; don't install unknown skills.
- Follow PRODUCT.md and DESIGN.md, and update DESIGN.md with every new rule.

## B1. Contrast and colour: no more beige-on-white

- The client says many pages feel "all beige and white" and are hard to tell apart on a weaker screen. Rework the surface system:
  - the page background, cards, inputs, table headers and selected states must be clearly distinct;
  - every UI boundary (input border, card edge, divider, tab) meets **3:1** against what's next to it (WCAG 1.4.11);
  - all text meets **4.5:1** (3:1 for large text).
- Check every token pair with a script and include the table in the report.
- Simulate a poor laptop screen (reduced contrast, about −20%, and lower brightness) and check the key screens still read. Include those screenshots.
- Keep the brand (teal, amber, Cairo) and colour meanings. Red stays reserved for broken rules and irreversible actions, and colour never carries meaning alone.

## B2. Find everything easily

- **For each role:** list its top 3–5 daily tasks, then make sure:
  - its home screen puts them first;
  - its navigation shows only what it uses, grouped and in task order;
  - nothing important is more than 2 clicks or taps away.
- Report click counts before and after for each top task.
- **Page structure everywhere:**
  - a clear title, and one line saying what the page is for;
  - the main action in the same place;
  - filters in one consistent bar;
  - tabs where a page has several areas, as already done for municipalities.
- **Lists:** search first, with sensible default sorting, readable density, row actions visible, and empty states that tell you what to do next.
- **Desktop productivity**, especially for registration employees, who type all day:
  - logical tab order and autofocus;
  - Enter moves to the next step;
  - no mouse needed for the registration form;
  - remembered filters per user.

## B3. Errors, feedback and confidence

- **Every API error** maps to a clear Arabic message: what happened and what to do. No raw codes or English.
- **Network failures** show a calm banner with a retry.
- **Forms:**
  - errors appear inline next to the field the moment they apply;
  - the first error is focused on submit;
  - entered data is never lost on an error.
- **States:**
  - loading uses skeletons, not blank screens;
  - success shows a short confirmation;
  - destructive actions get a confirmation that names the thing being changed.
- Build a shared error and feedback layer if one doesn't exist, and use it everywhere.

## B4. Don't break anything

- Behaviour and API contracts don't change in Part B. This is presentation, structure and feedback only.
- All tests stay green, and a Playwright pass covers each role's top tasks.
- Before and after screenshots (desktop + 390px) of every main screen, for every role.

## Part B close-out

- The gates as in Part A: lint, typecheck, `pnpm test`, API e2e and the full Playwright suite twice, on the scratch DB.
- The contrast table, the click-count table and the impeccable audit results.
- Log decisions as OPEN_ITEMS #65.
- **Stop before committing so I can review.** Never force-push.
- Don't commit `docs/card-rendering/*.pdf`, `.env` files, `Claude outputs/`, `data/private/` or the root `.impeccable/`.
