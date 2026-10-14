Phase 3 of the registration pivot: the vehicle card. Background is in `docs/REGISTRATION_PIVOT_PLAN.md`, sections 6–9 above all. **Build only what's listed here** this session. Start a new branch from `feat/p2-roles-registration-stations`.

## The design handoff — and where it's overruled

The card and logo designs are final and in `design/design_handoff_fuel_control_system/`:
- `Vehicle Card.dc.html` — the visual reference. Open it in a browser and use its panel to switch layers.
- `CLAUDE-CODE-CARD-PROMPT.md` — exact positions, sizes, colors and print rules.
- `logo/` — the symbol in six variants, with its own README.
- `assets/` — a sample QR.

**`CLAUDE-CODE-CARD-PROMPT.md` is the source of truth for anything visual or print-related.** Three parts of it were written before later decisions and are overruled here:
1. Its "decide this first" section is decided: **option (b), a separate card record**. The QR carries the **card number**, not `internalCode`.
2. It says a *station* user prints cards from the vehicle page. Wrong. Only **registration roles**, at a registration station, issue and print cards. Petrol-station roles never do.
3. `issuedByStationId` means the **registration station** (and desk), not a petrol station. The card-data line's «المحطة ‹code›» shows the issuing registration station's code.

## 1. The card record

- **Card number:** random, not sequential, so nobody can guess a neighbor's number. Uppercase letters and digits with no look-alike characters (no 0/O, no 1/I), prefixed with the issuing municipality's short code, e.g. `SBH-7K2M9Q4X`. Add an optional short `code` to `Municipality` for the prefix (seed سبها → `SBH`).
- **Links:** vehicle, registration station, desk, issuing user, issue time.
- **Why it was issued:** first card, lost, damaged, reprint after a failed print, or the vehicle's printed details changed.
- **Status:** active, replaced, or cancelled (with a reason, who, and when).
- **Only one active card per vehicle**, enforced in the database. Issuing a new card sets the previous active one to replaced, in the same transaction.
- **Store a snapshot of exactly what was printed:** plate, make/model/color line, issuing office name, card number, issue date, station code.
  - Reprinting the same card regenerates the PDF from this snapshot, so a reprint is always identical and there are no PDF files to store.
  - "Needs reissue" is simply: the snapshot no longer matches the vehicle's current plate, make, model or color.
- **Permissions:**
  - Registration employees and supervisors can issue cards.
  - Cancelling a card *without* replacing it needs the registration supervisor.
  - Admins can read and cancel.
  - Petrol-station roles get the scan lookup only (below).
  - Add only the permissions this phase actually uses.
- **Lost card replacement:** whether it needs supervisor approval, a fee or a police report is an open client question. Until it's answered, a registration employee may issue a replacement with a required reason, and every replacement appears in the audit log. Build it so an approval step can be added later without restructuring.

## 2. Desks and printers

Each registration station has a small list of desks: desk name, printer model, printer serial number, active or not. Registration staff pick their desk once per device (remember it on that device), and every card records its desk. Admins manage desks alongside registration stations.

## 3. The card PDF

- Follow `CLAUDE-CODE-CARD-PROMPT.md` exactly for layout, the print rules, and **both output modes**: the full card (color plus black), and black only, which is the same template with the fixed layer hidden.
- **Header office name:** the security authority of the issuing registration station's municipality (the Phase 1 relation). It must wrap to two lines cleanly for long names. The back's office line shows the same authority name.
- **Rendering engine — decide with a test render first**, as the handoff says. `reports-export.service.ts` currently uses pdfkit with Helvetica only, which has no Arabic glyphs. Render a real card with Arabic and mixed left-to-right codes. If pdfkit's letter-joining or direction is wrong anywhere, render the card template in headless Chromium instead.
  - If Chromium wins, it must be installed in the API **runtime** image (`apps/api/Dockerfile` — today that stage is `node:22-bookworm-slim` with only openssl added). Note the change for whoever deploys.
  - Either way: **bundle the Cairo font files in the repo** and embed them in the PDF. Never fetch fonts from the internet at runtime; production may not have access.
  - Report which engine you chose and why, with the test render attached.
- **A test-card PDF** with alignment marks and a sample QR, available to registration staff for setting up a desk and after changing a ribbon.

## 4. Issuing and printing at the desk

1. From the registration screen after registering a vehicle — and from the vehicle page, for registration roles — "إصدار البطاقة" creates the card and shows a preview.
2. "طباعة" opens the card PDF for printing.
3. The screen then asks "هل طُبعت البطاقة بشكل سليم؟"
   - **Yes:** done.
   - **No:** that card is cancelled on the spot (reason: failed print) and a new card number is issued and printed.
4. Every issue, reprint and cancellation writes an audit-log row. Scanning never does.

## 5. Scanning at the pump

- Card lookup by card number, for petrol-station roles through the fill-up flow. Stop accepting the old `internalCode` QR codes: no real cards were ever printed with them.
- **Outcomes:**
  - Active card → the vehicle.
  - Active but needs reissue → the vehicle, plus a visible "renew this card" notice.
  - Replaced or cancelled → refused, with «هذه البطاقة ملغاة — راجع مكتب التسجيل لاستلام بطاقة جديدة».
  - Unknown code → a message saying it isn't a card from this system.
  - As always, the API returns codes and the UI turns them into Arabic.
- **Scan-first fill-up screen:** the plate step opens straight into the camera. Typing the plate becomes a small secondary link, for damaged cards.
- **After a scan:** a confirmation view with the plate very large, plus make and color, and one big button «نعم، هذه هي المركبة». No fill-up is recorded without that tap.
- **A flashlight toggle** in the scanner where the browser supports it (Chrome on Android). Hide it elsewhere.
- **Keep the Phase 1 rules unchanged:** the station and its municipality decide the allowance, and a station in a preparing municipality is refused.

## 6. Vehicle page: card panel instead of the QR panel

Replace `VehicleQrPanel` with a card panel:
- Current card number, status, issue date and registration station.
- A "needs reissue" indicator.
- The card history.
- Actions (issue, reissue, cancel) for registration roles only.

Remove `VehicleQrPanel` and anything that still renders a QR on screen from `internalCode`.

## 7. Logo and phone install

- **Symbol:** put it in the sidebar beside the text name, and on the login and change-password screens, using the variants per `logo/README.md`. The drawn Arabic wordmark isn't designed yet, so the name stays in Cairo text.
- **Favicon:** `dabt-alwaqud-favicon.svg`.
- **Phone install:** there's no web app manifest today (`apps/web/public` holds only `dev-ca.pem`). Add one so station phones can "Add to home screen" as a full-screen app: name «ضبط الوقود», standalone display, theme color `#0D5C52`, using `dabt-alwaqud-app-icon.svg`, plus PNG sizes where a platform needs them. Don't add offline caching — the app needs a live connection anyway.

## Not in this phase

The grace period, awareness month and enforcement dates; fill-ups for vehicles without a card; the emergency override; monitoring reports; supervisors managing staff accounts; removing non-Sabha data.

## Close-out

Same as every round: lint, typecheck, and the full test suite green (unit, API end-to-end, Playwright), with both scoping boundary tests passing. Add tests for:
- one active card per vehicle;
- card number format and uniqueness;
- the failed-print path;
- each scan outcome;
- the separation rule (a petrol-station role cannot issue or print).

**Browser pass**, after re-seeding:
1. Register a vehicle, issue a card, and check the PDF at 100% against `Vehicle Card.dc.html`.
2. The black-only mode.
3. Scan the on-screen card PDF with a real phone through the fill-up flow.
4. Replace the card, and confirm the old one is refused.

Record any test passwords you changed.

Then update the phase table at the top of `docs/REGISTRATION_PIVOT_PLAN.md`: Phase 2 built, Phase 3 built, with the branch names. Log your decisions in `OPEN_ITEMS.md`, and report every migration in order, confirming each is additive.

**Left for the user to test on real hardware:** printing to the card printer without a print dialog (Chrome's `--kiosk-printing`) on a real desk, and scanning a *printed* plastic card at noon and at night.
