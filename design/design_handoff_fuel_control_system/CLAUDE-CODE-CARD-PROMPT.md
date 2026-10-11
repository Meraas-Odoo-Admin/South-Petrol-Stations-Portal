# Prompt for Claude Code — the printed vehicle card (بطاقة تعبئة الوقود)

Paste this file as the first message of a session in the `South Petrol Stations Portal` repo. The design reference is `design/Vehicle Card.dc.html`. Open it in a browser and use the Tweaks panel to switch layers.

---

## What to build

An endpoint that returns a **2-page PDF** (front and back) for one vehicle's fuel card, plus a "print card" action on the vehicle detail page. The card is standard ID-1 (CR80) size, **portrait: 53.98 × 85.60 mm**.

The design is authored at **300 dpi, 638 × 1011 px**. Every element in the file is absolutely positioned, and **all coordinates below are in those px**. Convert with `mm = px × 25.4 / 300`, or `pt = px × 72 / 300 = px × 0.24`.

Assets in `design/`:
- `logo/dabt-alwaqud-symbol-white.svg` — the system mark in the front header
- `assets/qr-SBH-7K2M9Q4X-symbol.svg` — a sample QR, verified to decode. Use it as a visual reference only; generate the real one per card.

---

## Decide this first: what the QR and the "card number" are

The design brief used a placeholder card number `SBH-7K2M9Q4X`. In the codebase, `Vehicle.internalCode` is `V-######` (`VehiclesService.generateInternalCode`). The earlier QR design (round 3) says the QR carries **`internalCode` alone**, and the scan-in design (round 4) looks a vehicle up by that value.

Pick one and apply it consistently. The PDF, the round-3 on-screen QR and the round-4 scanner must all agree.
- **(a) Card number = `internalCode`.** Simplest. No schema change. The QR encodes `V-000123`, and the printed "رقم البطاقة" shows the same value.
- **(b) A separate card record** (e.g. `VehicleCard { cardNumber, vehicleId, issuedAt, issuedByStationId, revokedAt }`). Needed if a lost card must be cancelled without changing the vehicle's identity. A reprint then gets a new number, and scanning the old card is refused. The scanner needs a new state for "revoked card".

The card's back tells the owner to go to a registration desk if the card is lost. That points toward (b). Raise this with the user before building if it isn't already decided. Either way, the QR carries **only** that code: no plate, no URL, no name.

---

## Rendering approach

The API already uses `pdfkit` (`reports-export.service.ts`). **Check its Arabic output before relying on it.** pdfkit has no bidi support and its Arabic letter-joining is unreliable, and this card is mostly Arabic mixed with left-to-right codes. If connected letters or mixed-direction lines render wrong, render the card as an HTML page in headless Chromium and use `page.pdf({ width: '53.98mm', height: '85.6mm', printBackground: true })`. Playwright is already a dev dependency. Whichever you choose, **embed Cairo** (the licence allows embedding) and compare the output against the design at 100%.

---

## Front — fixed pre-print (colour)

| Element | x | y | w | h | Spec |
|---|---|---|---|---|---|
| Header band | 0 | 0 | 638 | 250 | `#0D5C52`, full bleed |
| Band stripes | 0 | 0 | 638 | 250 | `#11695E` lines, 3 px wide, 135°, repeating every 22 px |
| Amber strip | 0 | 250 | 638 | 8 | `#E8A53D`, full bleed |
| System mark | 284 | 30 | 70 | 70 | white SVG, centred in the 84 px header circle |
| Issuing office name | 35 | 112 | 568 | 76 | Cairo 800, 32 px, line height 38, white, centred; **up to 2 lines** (names vary by municipality) |
| Card title «بطاقة تعبئة الوقود» | 35 | 190 | 568 | 40 | Cairo 900, 34 px, `#E8A53D`, centred |
| Bottom strip | 0 | 997 | 638 | 14 | `#0D5C52`, full bleed |

## Front — per-card fields (pure black `#000000` only)

| # | Field | x | y | w | h | Spec |
|---|---|---|---|---|---|---|
| ٢ | QR code | 142 | 316 | 354 | 354 | black on white. Keep 57 px of white on every side (4 modules): x 85–553, y 259–727 must hold nothing else. Error-correction level **H**. |
| ٣ | Plate | 35 | 732 | 568 | 104 | Cairo 900, 96 px, centred, **left to right**, e.g. `8-1234567`. The largest text on the card. |
| ٤ | Make, model, colour | 35 | 848 | 568 | 44 | Cairo 700, 36 px, centred, e.g. «تويوتا هايلكس — أبيض» |
| ٥ | Card data | 35 | 900 | 568 | 66 | Cairo 600, 27 px, line height 33, 2 lines: «رقم البطاقة ‹code›» / «صدرت ‹YYYY-MM-DD› · المحطة ‹station code›». Put each code in its own left-to-right isolated run with `nowrap`, so a hyphen never breaks a line. |

**No owner name and no national ID anywhere on the card.** The card identifies the vehicle, not the person.

## Back — all fixed pre-print

| Element | y | Spec |
|---|---|---|
| Band + stripes | 0–150 | same as front |
| Amber strip | 150–158 | same |
| «طريقة الاستعمال» | 44 | Cairo 900, 34 px, white, centred |
| «بطاقة تعبئة الوقود» | 90 | Cairo 700, 26 px, amber, centred |
| 3 numbered steps | starting at 206, gap 30 | 52 px teal circle with an Arabic numeral (١ ٢ ٣), and step text in Cairo 700, 31 px, line height 46, black. Copy the three sentences exactly from the file. |
| Divider | 760 | 2 px, `#0D5C52`, x 35–603 |
| Inquiry line | 790 | Cairo 700, 30 px, line height 44, black, centred — «للاستفسار أو لأي تعديل على بيانات المركبة، راجع أقرب مركز تسجيل.» |
| Office name | 900 | Cairo 600, 26 px, black, centred |
| Bottom strip | 997–1011 | `#0D5C52` |

---

## Print rules (these are why the design looks the way it does)

- **Safe margin:** 35 px (3 mm) on every edge. Only the bands and strips may reach the edge.
- **Corners:** 38 px radius (3.18 mm). The printer trims these. Don't draw them in the PDF, but keep the content clear of them.
- **Flat colour only:** no gradients, shadows or transparency.
- **Per-card content is pure `#000000`.** It's meant to go down in a separate black-only pass over pre-printed colour stock later. In the design's "طبقة الأسود فقط" view, those fields read fully on their own.
- **Minimum text is 6 pt (25 px); minimum line weight is 0.25 pt (2 px).** Nothing in the design goes below either.
- **Two output modes are worth building:** the full card (colour plus black, for now), and black-only (for pre-printed stock later). This is the same template with the fixed layer hidden.

## Done means

- The generated PDF, overlaid at 100% on a screenshot of `design/Vehicle Card.dc.html`, lines up.
- A phone camera scanning the printed QR opens the right vehicle through the round-4 scan-in flow.
- Printing a card writes an `AuditLog` row, per `CLAUDE.md` rule 6. Scanning does not.
- The station-scoping test still applies: a station user can print only cards for vehicles their role can see.
