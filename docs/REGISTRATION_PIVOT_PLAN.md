# Registration pivot — plan of record

The client moved vehicle registration off the petrol stations and onto dedicated registration employees at police-station registration desks. Each registered vehicle gets a printed card with a QR code; petrol-station employees only scan that card and record fill-ups. Rollout is one municipality at a time, starting with Sabha, and fill-up limits are counted per vehicle **per municipality**.

This document is the background every phase prompt refers to. Sections 1–14 are the agreed plan as of 27 Sep 2026. Section 0 describes the code as it was *before* Phase 1, so treat it as history, not current state.

## Build phases

| Phase | Scope | Status |
|---|---|---|
| 1 | Municipality foundation: one security authority per municipality, preparing/live status, municipality stamped on every fill-up, per-municipality rule engine | Built on `feat/p1-municipality-foundation`; decisions logged in `OPEN_ITEMS.md` #53 |
| 2 | New roles and permission clean-up, registration stations, registration screen, removing vehicle creation and WhatsApp sharing from the pump side, admin screens for municipalities and authorities | Built on `feat/p2-roles-registration-stations`; decisions logged in `OPEN_ITEMS.md` #54 |
| 3 | The card: card record, QR holds the card number, card PDF, printing flow, desks and printers, card panel on the vehicle page, scan-first fill-up screen | Built on `feat/p3-vehicle-card`; decisions logged in `OPEN_ITEMS.md` #55. Kiosk printing on real hardware and scanning a printed plastic card in noon and night light are still to be tested by the client |
| 4a | Launch day for vehicles without a card: per-municipality stages (grace, awareness, card required), typed-plate fill-ups for unregistered vehicles, linking at registration, awareness message, A4 registration-stations sheet, emergency override | Built on `feat/p4a-grace-period`; decisions logged in `OPEN_ITEMS.md` #56 |
| 4b | Accounts: a redesigned users screen (one job per person, searchable places, phone-friendly), edit / deactivate / reset password / unlock, supervisors managing their own employees, stage dates for the directorate admin, developer housekeeping | Built and merged to main (`bc5ed9c`); decisions logged in `OPEN_ITEMS.md` #57 |
| 4c | Registration-station monitoring reports, card-stock reconciliation, deadline-readiness report | Built and merged to main (`f334707`); decisions logged in `OPEN_ITEMS.md` #58 |
| 5A | Municipalities as the core, the final user structure (each level creates the one below), archive instead of delete, fill-up rule switches, owner national-ID checks and institutions, vehicle fields, field-validation audit | Built on `feat/p5a-structure`, awaiting review; decisions logged in `OPEN_ITEMS.md` #59 |
| 5B | Fuel storage per station and fuel type (deliveries, computed level, low-stock alert, reset), the notification bell, reports per role, the three 4c pages folded into the station and office pages, clearer person settings | Built on `feat/p5b-operations`, awaiting review; decisions logged in `OPEN_ITEMS.md` #60 |
| 4d | Older screens brought to the DESIGN.md text sizes, ink text on amber buttons, the pump flow audit | Built inside Phase 5C (`feat/p5c-golive`); the real-iPhone check is hardware-only and is listed in `OPEN_ITEMS.md` #61 |
| 5C | Sabha's 29 real stations imported from the client's list, non-Sabha data removed, go-live clean-up (`golive:clean`), the first super admin and the go-live order in `infra/DEPLOYMENT.md`, municipality columns required in the database, final polish and test stability | Built on `feat/p5c-golive`, awaiting review; decisions logged in `OPEN_ITEMS.md` #61. What remains is client and hardware only: the client's answers to the import's check notes and the «مملوكة» question, the real-iPhone check, kiosk printing and card scanning on real hardware |

---

## 0. What the code looks like today — the starting point

- **Station employees can currently register vehicles.** In `rbac-catalog.ts`, `station_employee` holds `vehicles:manage`, `owners:manage`, `vehicles:request_change` and `owners:request_change` — all four must come off that role.
- **The QR is built and live.** `VehicleQrPanel` shows it on the vehicle page and on the fill-up success screen, and it encodes the vehicle's `internalCode`. `QrScanPanel` reads it on the fill-up plate step. The WhatsApp share (`lib/share.ts` plus the share buttons and phone-number prompt inside `VehicleQrPanel`) is also live — and now comes out.
- **Vehicle creation lives in two places**: inside the fill-up wizard (`RecordFillUpPage`) and on the vehicles list page (`VehiclesListPage`). The first one goes; the second becomes the starting point for the registration employee's screen.
- **The real station rosters are seeded**: about 116 stations across the south. Only **17** of them are labeled `سبها`.
- **A fill-up doesn't record which municipality it happened in.** `FillUpTransaction` knows its station, and the station knows its municipality, but the fill-up itself carries no municipality. That matters for section 10.
- **`SecurityAuthority` is a small list of supervising bodies.** The schema's own comment gives examples: مديرية أمن سبها, الحرس البلدي, الجمارك. Only مديرية أمن سبها is seeded.

---

## 1. Decisions you've made — recorded, not open

1. The WhatsApp share is removed entirely. The printed card replaces it.
2. Only Sabha exists in the system. Anything outside Sabha is removed, and a municipality that hasn't launched simply doesn't appear.
3. Petrol station employees never create or edit vehicle or owner records. All data entry, QR generation and card printing happen at registration stations.
4. Registration stations are real records that admins create and manage, with full monitoring reports on each one.
5. Every municipality has exactly one security authority, which oversees the petrol stations in that municipality.
6. Two supervisor roles: one for registration stations, one for petrol stations.
7. A grace period for vehicles without a card, with about a month of awareness at the petrol stations before the deadline: staff tell drivers the date after which no card means no fuel, and hand out flyers listing the registration stations.
8. Sabha goes live with real data first. Each later municipality joins the running system without touching Sabha's data. Nothing is ever wiped after go-live.
9. Petrol stations scan the card with a smartphone camera, then enter the fill amount. No handheld scanners.

---

## 2. Reducing the system to Sabha — and the catch

**What gets removed:** every station whose municipality isn't Sabha, every municipality row except Sabha, and every supply route except `خط سبها`. Companies stay only if they still have at least one Sabha station.

**The catch — "Sabha" isn't one clean label in the data yet.** The seed's municipality column follows the source documents, which are written at *town/neighborhood* level, not at official municipality level. There are 46 different values. Here's a concrete example of the mix-up: the station "حجارة الجديدة" is labeled `سبها`, while two other stations are labeled `حجارة` as if that were a separate municipality — but حجارة is a neighborhood of Sabha city. The same question applies to names like `القرضة`, `الزهراء`, `المثلث`, `الشرقية` and `تمنهنت`.

So "keep only Sabha" can't be done safely by keeping the 17 rows that happen to say `سبها`. **The client needs to confirm which of these labels fall inside بلدية سبها.** It's a short list for them to tick, not a research task. I won't guess at Libyan administrative boundaries.

**A recommendation so no work is lost:** take the removed stations out of the *system*, but keep the client's original rosters archived in `docs/` as source files. When the next municipality launches, re-importing them takes minutes instead of redoing the data collection.

---

## 3. The roles — six in total, two new

Think of the system as two buildings that never share a key. The **registration building** (the police station desk) creates identities and prints cards. The **fuel building** (the petrol station) only reads those identities and records fuel. Admins stand above both.

| Role | Where they work | What they can do | What they can never do |
|---|---|---|---|
| **Registration employee** (new) | A registration station | Search the vehicle registry (to avoid duplicates), register vehicles and owners, issue and print cards, request corrections to already-registered data | Record a fill-up, approve anything |
| **Registration supervisor** (new) | One or more registration stations | Everything a registration employee can do, plus: approve data corrections, approve replacement cards for lost ones, cancel cards, manage the employee accounts at their stations, see their stations' reports | Record fill-ups, approve fill-up exceptions |
| **Station employee** (existing, reduced) | One petrol station | Scan a card (or type a plate), record a fill-up, record an exception if they personally hold that permission | Create or edit any vehicle or owner data, print cards |
| **Station supervisor** (existing) | One or more petrol stations | Everything a station employee can do, plus: approve fill-up exceptions, manage the employee accounts at their stations, see their stations' reports | Register vehicles, issue or cancel cards |
| **Directorate admin** | All of Sabha | Manage both kinds of stations, all users, reports, and settings | — |
| **System admin** | Everything | Everything | — |

### My supervisor recommendation: two separate supervisor roles, one per building

The reason is fraud, not tidiness. Picture one supervisor who can both print a vehicle card *and* approve extra fill-ups. That person alone could print a second card for a friend's car and then wave through every "exceeded the weekly limit" exception it triggers. One person, one building, no witnesses.

Split the roles and that same fraud needs two people, in two different buildings, under two different chains of command, to cooperate. Auditors call this "separation of duties." It's the same reason a bank teller can't also approve their own loan.

Within each building, a supervisor *can* do their employees' work. A registration supervisor can register a car when an employee is absent, and a station supervisor can record a fill-up. They just never cross into the other building.

A supervisor can cover several stations of their own kind. This uses the scoping the system already has for petrol stations (`UserStationScope`), plus an equivalent new one for registration stations.

**Fix at the same time:** today's seeded `supervisor1` has no station scope at all (found last round). The new seed should give each supervisor a real scope.

---

## 4. Registration stations — what admins record, and what they can monitor

### The record an admin creates

| Field | Required | Notes |
|---|---|---|
| Name | yes | e.g. the police station's name |
| Code | no | Many won't have an official one. The system also gives every registration station its own automatic internal code, the same way petrol stations get one. |
| Municipality | yes | Picked from the list. Today that's only Sabha. |
| Address | yes | Free text — Libyan street addresses aren't standardized |
| Location on a map | no | Latitude and longitude. This is what later lets a petrol station screen say "your nearest registration station is…" (see section 9). |
| Contact phone | no | The desk's landline or duty phone |
| Working hours | no | Free text, e.g. "Saturday–Thursday 8:00–14:00" |
| Status | yes | Active / temporarily closed / closed |
| Status note | no | Why it's closed, same idea as on petrol stations |
| Desks / printers | — | A small list under each station: desk name, printer model, printer serial number (see section 8) |

### What admins can monitor per registration station

Each of these can be filtered by date range, and each station can be compared side by side with the others:

- **Cards:** cards issued; first-time cards vs. replacements (lost/damaged) vs. reprints after a failed print (wasted cards); cards currently active vs. cancelled.
- **Vehicles:** new vehicles registered; how many were caught as duplicates (the plate or chassis number already existed); corrections requested and their outcomes.
- **People:** how many users the station has, broken down by role and active/inactive; last login for each.
- **Per-user activity:** for each employee — vehicles registered, cards printed, reprints, corrections requested, and their full activity timeline from the audit log.
- **Card stock reconciliation — worth building from day one:** cards the *system* says were printed, compared with blank cards the *station* reports it used, which a supervisor enters from a physical count. If 200 blanks left the box but the system only recorded 180 prints, 20 cards are unaccounted for. For a security directorate, that one number may be the most valuable report on the page.

---

## 5. Security authorities — settled: one per municipality

**Your answer:** every municipality has one security authority, and it oversees that municipality's petrol stations. Sabha's is مديرية أمن سبها.

**The picture:** the authority is the head office for its municipality. Everything inside the municipality — its petrol stations, and the police-station registration desks — sits under that one head office.

```
Municipality: سبها
└── Security authority: مديرية أمن سبها        (exactly one)
    ├── Petrol stations in سبها                 (fuel)
    └── Registration stations in سبها           (police-station desks)
```

**What this changes in the design:**
- **The authority is attached to the municipality, not chosen station by station.** Today every petrol station has its own "which authority?" field, which someone has to fill in by hand. Once the rule is "one per municipality," that field fills itself from the station's municipality. There's nothing to pick and nothing to get wrong.
- **Registration stations don't need their own authority field either.** They get it the same way, through their municipality. The "belongs to authority" link I suggested last time is no longer needed.
- **Adding a municipality means adding its authority at the same moment** (see section 11). A municipality can't go live without one.
- **An older question closes.** The client's open item about "which authority oversees which station" (`OPEN_ITEMS.md` #4) is answered by this. The schema comment that listed الحرس البلدي and الجمارك as other examples of authorities reflects an earlier assumption and should be updated.
- **Reports can group by authority for free.** Since each municipality has exactly one authority, "per municipality" and "per authority" are the same grouping.

---

## 6. The vehicle card — why it needs its own record, and a change to what the QR holds

### Why the QR should stop encoding the vehicle's internal code

Today the QR holds the vehicle's permanent internal code. That was the right choice when the QR lived on a phone. On a physical card it creates two real problems:

1. **A lost card works forever.** The internal code never changes, so a lost, stolen or photocopied card identifies that vehicle permanently. Nothing can be switched off without changing the vehicle itself.
2. **Nobody can count cards.** You asked for "how many cards each station issued." If the card isn't a record of its own, there's nothing to count — only vehicles.

**Recommendation:** every printed card becomes its own record, with its own **card number**, and **the QR holds the card number**, not the vehicle code. Scanning then works like this: find the card, check that it's still active, then get its vehicle.

A hotel key card works the same way. The room number never changes, but every guest gets a new key, and the old key stops opening the door the moment a new one is cut.

### The card record

- Card number: short, uppercase letters and digits, random rather than sequential, so nobody can guess a neighbor's number and fake a QR for it. It avoids characters that are easy to confuse, like 0/O and 1/I. For example: `SBH-7K2M9Q4X`, where the prefix marks the issuing municipality.
- Which vehicle it belongs to.
- Which registration station, desk and employee issued it, and when.
- Why it was issued: first card, replacement for a lost card, replacement for a damaged card, reprint after a failed print, or reissue after the vehicle's details changed.
- Status: **active**, **replaced** (a newer card exists), or **cancelled** (with a reason).
- **Rule: only one active card per vehicle at a time.** Issuing a new card automatically sets the previous one to "replaced."

### What happens in real life

- **Lost card:** the owner goes back to a registration station, where a new card is issued with the reason "lost." The old card stops working immediately. Whether a supervisor must approve it, or a fee or police report is required, is the client's call (see section 12).
- **Plate change:** the card has the plate printed on it. If the plate changes, the old card still scans, but the plate printed on it no longer matches the car. The system marks the card "needs reissue." It still works, but the pump screen shows a clear warning, and the registration station prints an updated card on the owner's next visit.
- **Damaged QR:** the station employee types the plate instead, which is already built. The card number printed on the card is there for registration staff and audits, not for pump staff to type.
- **Where the card works:** at every petrol station in every launched municipality. The card identifies the *vehicle*. It isn't a Sabha-only pass.

---

## 7. The card's design — size, material, orientation and content

### Size and material

A "business card" isn't one fixed size — it differs from country to country. Plastic card printers, though, all print one international standard: the size of a bank card. It's officially called **ID-1**, and the card trade calls it **CR80**.

- **85.60 mm × 53.98 mm**, with corners rounded to about 3.18 mm.
- **0.76 mm thick** PVC plastic — the same stiffness as a bank card.

I recommend plastic, not paper. This card will live in a hot car in Sabha, be handed over at a pump, and be scanned hundreds of times. Paper fades, bends and tears within weeks, and a paper card can be photocopied onto paper so easily that nobody could tell the fake from the real one.

### Vertical or horizontal? My recommendation: vertical

1. **The QR can be bigger.** In a vertical layout the QR sits centered across the card's full 54 mm width. In a horizontal layout it has to share the width with a text column beside it, so both get squeezed. A bigger QR scans faster and still scans when the card is scratched.
2. **One reading column suits Arabic.** Header, then QR, then plate, then details, all top to bottom. A horizontal layout creates a two-column arrangement where Arabic text (right to left) sits beside a QR and a plate number (left to right). This project has already fought bugs from exactly that mixing more than once.
3. **It reads like a pass, and stands out in a wallet.** Nearly every bank card is horizontal, so a vertical card is instantly recognizable as "the fuel card" when a driver digs for it at the pump. Vertical cards are also the convention for staff and security passes.
4. **Nothing technical stands in the way.** Card printers print vertical designs; you set the printer driver's orientation to "portrait" once.

### What goes on it

**Front** (vertical, top to bottom):
1. Header: the issuing authority's emblem and name, plus the card title (e.g. "بطاقة تعبئة الوقود"). The authority is the one for the municipality that issued the card — مديرية أمن سبها for now, a different name once other municipalities launch — so the header must fit a longer name too.
2. The QR code: about **30 × 30 mm**, black on plain white, with a clear white margin all around it. No background pattern may touch it — the phone camera needs that quiet border to find the code.
3. The plate number, large and left-to-right — the first thing the pump employee compares with the actual car.
4. Vehicle make, type and color on one line, e.g. "تويوتا هايلكس — أبيض", so a mismatched card on the wrong car is obvious at a glance.
5. Small print: card number, issue date, issuing station code.

**Back:** short instructions in plain Arabic — "show this card at the pump," "this card belongs to this vehicle only and may not be transferred," "if lost or damaged, visit the nearest registration station," plus a contact number.

**Deliberately left off: the owner's name and national ID.** The card stays in the car. If it's lost or stolen, it shouldn't hand anyone a person's identity. The vehicle is what's being identified, not the person. If the client insists on the owner's name, that's their call — but I'd still never print the national ID.

**The QR's error tolerance:** generate it at the highest error-correction level, "H." At that level a QR can still be read with roughly 30% of it scratched or dirty. The card number is so short that this costs nothing in size.

### Printing it: two phases

- **Pilot phase (first weeks in Sabha):** blank white cards, printed full-color on both sides by the card printer. This is simple to start with, and while the design is still changing after real-world feedback, no pre-printed stock gets thrown away.
- **Settled phase:** once the design is final and volumes are known, a local print shop pre-prints the fixed design — colors, emblem, back-side instructions, and ideally a fine security background pattern — on blank cards in bulk. The card printer then prints only what changes per card: QR, plate, vehicle details and card number. Those are printed in **black resin**, a scratch-resistant black ink ribbon.

  The settled phase gives cheaper cards, faster printing, a sharper QR, and a card that's much harder to fake with an ordinary office printer. **Design implication for Claude Design:** every per-card field must sit on a plain, light area of the design, so it still reads when printed in black only.

---

## 8. The card printer — how it connects, mapped end to end

### The short answer

**Connect the printer to the desk computer with a USB cable, not to the system itself.** The system never talks to the printer. It produces a print-ready card at the exact card size; the computer's browser and the printer's driver do the printing. (The "driver" is the small program from the printer maker that lets the computer talk to that printer.)

### Why not connect it to the system directly

- The system's server sits in a data center. Police stations are separate buildings on separate, often unreliable connections. Sending print jobs from the server to a printer across the internet is fragile, and it means opening the police station's network to outside traffic — a real security risk for exactly the wrong kind of building.
- Some printer makers also offer small helper programs that let a website control their printers directly. They're only worth it if you need to *read* the printer's state, like "ribbon almost empty." They tie you to one printer brand and add software to install and maintain on every desk. Treat this as a possible later upgrade, not part of the first build.

### The full map, one desk

```
Registration station (police station)
└── Desk 1
    ├── Desk computer (Windows) ── USB cable ──► Card printer
    │     ├── Card printer's driver installed (set to card size, portrait)
    │     ├── Card printer set as the computer's DEFAULT printer
    │     └── Desktop shortcut "منظومة التسجيل" that opens Chrome on the
    │         system with silent printing switched on
    ├── UPS (backup power) feeding BOTH the computer and the printer
    └── Supplies: blank cards, ribbons, cleaning kit (all counted)
```

**What "silent printing" means:** Chrome has a start-up setting (`--kiosk-printing`) that skips the print dialog and sends straight to the default printer. The employee presses "طباعة البطاقة" and the card comes out — no settings to get wrong, no wrong printer picked. Put it on a dedicated shortcut used only for this system, so the desk's other everyday printing still behaves normally.

### Step by step, from registration to card in hand

1. The employee registers the vehicle and owner. The system checks for duplicates by plate, chassis number and booklet number.
2. They press **"إصدار البطاقة"**. The system creates the card record (section 6) and shows a preview.
3. They press **"طباعة"**. The system produces the card's PDF (see "The card file" below), and Chrome sends it to the card printer. If the pilot uses double-sided printing, it's a two-page job: front, then back.
4. The screen then asks: **"هل طُبعت البطاقة بشكل سليم؟"**
   - **Yes:** done. The card is handed to the owner.
   - **No** (jammed, smudged, misaligned): that card number is cancelled on the spot and a new one is printed. A failed card must never stay "active," because a half-printed card could still be picked up and used.
5. Every print, successful or failed, is recorded with: who printed it, which station, which desk, and when. That's where the monitoring reports in section 4 come from.

### The card file — which format, and why it avoids printing problems

**First, the reassuring part: the printer never reads a file format.** Think of the printer's driver as a translator standing between the computer and the printer. Whatever the computer prints — a PDF, a web page, a photo — the driver translates it into the printer's own language. So "the printer doesn't support this format" isn't a real risk with a proper card printer and its driver installed.

The problems that *do* ruin cards come from three other places:

1. **Blurriness** — the card was sent as a *picture* (PNG or JPG). A picture is a grid of dots at a fixed size. If anything along the way resizes it even slightly, the QR's sharp edges turn soft and the small text gets fuzzy.
2. **Wrong size** — the computer "helpfully" shrinks the card to fit a sheet of A4 paper, or adds margins. The QR comes out smaller, and everything shifts off center.
3. **Broken Arabic** — the Arabic font isn't on that particular desk computer, so letters print disconnected, in the wrong shapes, or as empty boxes.

**The format that removes all three: PDF, built a specific way.** Each card becomes one PDF file with:

- **One page per card side**, sized *exactly* 53.98 mm × 85.60 mm, vertical, with zero margins. There's no "fitting" to do, because the page already *is* the card.
- **The QR and all text drawn as shapes, not as a picture** (the technical term is "vector"). Shapes stay perfectly sharp at any size; the only limit on sharpness is the printer's own resolution.
- **The Arabic font carried inside the file** ("embedded"). The card prints identically on any computer, whether or not that font is installed.
- **The QR and small text in pure black** (#000000). Most color card printers have a separate, sharper black ink layer reserved for text and barcodes, and pure black is what the driver sends to that layer. Near-black gets mixed from colors instead, which prints softer. Confirm this setting once in the driver during setup — the printer's Windows driver guide covers its color and black-layer settings.
- **Emblems and logos as shapes too** where possible. Any logo that only exists as a picture should be at least 300 dpi at its printed size.

**Why PDF rather than printing a web page directly:** the PDF is the one official file of each card. It's generated once by the server, the same way for every desk, and kept. A reprint is byte-for-byte identical, and auditors can see exactly what was issued on any date. Never use PNG, JPG or Word files for the card.

**How the PDF reaches the printer:** through Chrome on the desk computer, to the card printer set as the default. The goal is silent printing (one press, no dialog). **This is the one step to prove on a real desk, with the real printer, before rollout.** I couldn't confirm from documentation that Chrome prints a PDF silently in every setup. If silent printing doesn't hold up, the fallback is the normal print dialog with "Actual size / 100%". That's acceptable here, because registration employees are the trained staff — one extra confirmation click is not a burden for them.

**One-time setup checklist per desk,** in the printer driver: card size CR80 · orientation portrait · no scaling / actual size · black text and barcodes printed on the black layer · then print the test card below and check it by eye.

### Also build

- **A "طباعة بطاقة اختبار" (test card) button** for installing a new desk and after every ribbon change. It prints alignment marks and a sample QR, so a shifted print is caught before a real card is wasted.
- **Desks and printers as simple records** under each registration station (desk name, printer model, printer serial number). This lets reports show cards per desk, and when a printer starts misprinting, you know exactly which one.

### Hardware to budget for, per desk

- **Printer:** a "direct-to-card" plastic card printer at 300 dpi (dots per inch — the sharpness level), with USB. I recommend a **double-sided** model, so the pilot can print both sides without anyone flipping cards by hand. The Zebra ZC300 is a current, widely sold example in both single- and double-sided versions; Evolis and HID Fargo make equivalents. **Choose by who can supply ribbons, spare parts and repairs in Libya**, not by the model name — a printer you can't get ribbons for is a paperweight.
- **Cards:** standard-size PVC, 0.76 mm, blank white.
- **Ribbons:** full-color with a clear protective layer for the pilot (it guards against sun and wear), then black resin for the pre-printed phase.
- **A UPS** (backup battery) for the computer and printer. A power cut in the middle of a print ruins that card and can confuse the printer.

### A reality to decide on up front

Issuing a card needs a live connection to the system — that's how duplicates are caught and card numbers are guaranteed unique. **If a desk's internet drops, that desk can't issue cards until it's back.** Building an offline mode is possible but complex. I recommend *not* building it for the Sabha pilot. Give each desk a backup mobile data connection instead, and revisit only if outages turn out to be common.

---

## 9. The petrol station side — scanning with a smartphone

**Your decision:** station staff use a smartphone camera to scan the card, then enter the fill amount. The camera scanner is already built (`QrScanPanel`), so this is about making it the *main* path and making it dependable at a real pump.

### The station employee's whole job, in four touches

1. **Scan** — the fill-up screen opens straight into the camera. Scanning is the first thing on the screen, not a button to look for. Typing the plate stays available as a small secondary link, for a damaged card.
2. **Confirm** — the vehicle appears (see below); one tap on "نعم، هذه هي المركبة".
3. **Amount** — enter the amount in دينار, as today.
4. **Record** — the rules run, and the fill-up is saved.

No typing of names, numbers or vehicle details anywhere in that flow. That's the whole point of the registration pivot.

### Making the phone dependable at the pump

- **Add the system to the phone's home screen.** It then opens full-screen like an app, with no browser address bar to confuse anyone, and the camera permission is asked once and remembered.
- **Prefer Android phones.** On Android, Chrome lets the scan screen switch on the phone's flashlight, which matters for night shifts. iPhone browsers generally don't allow a website to control the flashlight.
- **Any recent mid-range phone with an auto-focusing camera is enough.** The QR is large (30 mm) and tolerant of scratches (section 7). But test the exact phone model the stations will get, before buying in quantity.
- **Glare:** a glossy card can reflect the Sabha midday sun straight into the camera. Teach one habit: tilt the card slightly, or shade it with a hand. Test scanning at noon and at night before rollout — not just indoors.
- **A shared phone needs individual accounts.** If one phone serves a whole shift, each employee signs in under their own name, so every fill-up is attributed to the person who actually recorded it. The system should also sign out automatically after a period of inactivity.
- **The system must be on a secure (https) address.** Phones refuse camera access to websites without it. It already is in production, but it's worth checking on the go-live address.

### What the station employee sees after a scan

- The plate in very large characters, plus make, type and color.
- One big confirmation button: **"نعم، هذه هي المركبة"**. The employee must look at the car and confirm it matches before continuing.

This one tap is the main protection against a copied or borrowed card. A photocopied card might scan, but it won't make a white Hilux out of a blue Hyundai.

### Card problems at the pump — clear messages, never a dead end

- **Cancelled or replaced card:** "هذه البطاقة ملغاة — راجع مكتب التسجيل لاستلام بطاقة جديدة". No fill-up.
- **Card needs reissue** (the vehicle's details changed): fill-up allowed, with a visible reminder to renew the card.
- **Unknown code** (not a card from this system): a message saying exactly that.

---

## 10. A vehicle with no card at all — the grace period and the awareness month

On launch day in Sabha, **zero vehicles will have cards.** "No card, no fuel" from day one would stop every car in the city at once. You've approved a grace period, plus a month of the petrol stations telling people the deadline and handing out flyers. Here's how the system carries that.

### The timeline — three dates, set by admins, per municipality

```
Go-live ──────────── Awareness start ──────────── Deadline ────────────►
   │   grace period: cards OR typed plate accepted   │  enforcement:
   │                    │◄─── awareness month ──────►│  card required
   │                    │  (every no-card fill-up     │  (supervisor emergency
   │                    │   shows the deadline and    │   override only)
   │                    │   the registration list)    │
```

- **All three dates live in settings, per municipality.** Sabha has its own. When the next municipality launches, it gets its own dates without touching Sabha's.
- **The deadline can be moved.** If the reports (below) show too many cars still without cards a week before the deadline, the admin pushes the date instead of causing a crisis at the pumps.

### During the grace period — for a vehicle without a card

- The station employee types the plate (they already do this well). No other data is entered.
- The fill-up is recorded as **"مركبة غير مسجلة"** against that plate. The normal weekly-limit and minimum-gap rules still apply, counted by plate.
- Once the vehicle registers and gets its card, its grace-period fill-ups are linked to it by plate, so no history is lost.

### During the awareness month — what the pump screen does

After every fill-up for a vehicle *without* a card, the confirmation screen shows the employee a short message to read or show to the driver:

> "ابتداءً من [التاريخ] لن تتم تعبئة أي مركبة بدون بطاقة. استلم بطاقتك من أحد مكاتب التسجيل التالية:" — followed by the list of registration stations with their addresses and hours.

- **The date and the list are filled in automatically** from settings and from the admin's registration-stations list. If a registration station is added or closes mid-month, the message is right the next minute, with nothing to reprint.
- **A reminder to hand over a flyer** appears on the same screen.

### The flyers

- **Design once, in Claude Design** — A5 or A6 (half or quarter of an A4 sheet), which is cheap to print in bulk. Content: the deadline date, the list of registration stations with addresses and hours, and one line on what to bring to register (the documents the client requires).
- **Also have the system print an up-to-date "registration stations" sheet** (A4) from live data, for each petrol station to post at the pump. Flyers are printed in advance and go out of date if a station changes; the posted sheet is always current.

### The report that tells the admins whether the deadline is realistic

- **Per day, per petrol station: fill-ups with a card vs. without a card**, plus how many *different* plates filled up without a card.
- **Per day, per registration station: cards issued.**

The two side by side answer the key question with simple arithmetic. Say 6,000 cars are still without a card a week before the deadline, and the registration stations together issue 400 cards a day. They can't finish in a week, and the admins can see that *before* the deadline, not on the day the pumps start refusing cars.

### After the deadline — enforcement

- No card, no fill-up. The screen says so plainly and shows where to register.
- **A supervisor's emergency override stays available permanently:** a station supervisor can authorize a single fill-up for a vehicle without a card, with a written reason (an ambulance, an official convoy, a genuine emergency). It appears in the reports as an exception.

---

## 11. Per-municipality limits, and the best migration

### What changes in the rules

Today, "at most 3 fill-ups a week, at least 2 days apart" (and the owner-level rules) count *every* fill-up anywhere. The new rule: **count only the fill-ups in the same municipality as the station where this fill-up is happening.** Your Sabha-Saturday example then works as intended. The Saturday fill-up in Sabha doesn't count against the same car's allowance in the next municipality that afternoon.

### The best migration: stamp each fill-up with its municipality — built before Sabha goes live

**The mechanism:** when a fill-up is recorded, copy the station's municipality *onto the fill-up itself* and never change it afterward. The rule engine then counts only fill-ups carrying the same municipality stamp.

**Why stamp it** instead of looking up "the station's municipality" every time the rules run: suppose an admin later corrects a station's municipality. With a live lookup, every past fill-up at that station would silently move to the other municipality, and people's allowances would change under their feet. A stamp freezes history as it actually happened — like a receipt that shows the branch you bought from, even if that branch later moves.

**Why this is the best option for you specifically:** Sabha isn't live yet. So build the stamp *before* go-live, and Sabha's very first real fill-up is recorded with its municipality already attached. There's never a migration of real data — not at Sabha's launch, not at any later one. The only fill-ups that exist without a stamp today are test data, and those get cleared before go-live anyway.

**To be clear about "starting from zero":** I only ever meant clearing the *test* data (test vehicles, test fill-ups, the two synthetic test stations, test accounts) once, just before Sabha goes live with real data — which is normal before any launch. After go-live, nothing is ever wiped. Every later municipality joins the running system alongside Sabha.

### Adding a municipality to the live system — without disturbing Sabha

The whole thing is an admin action inside the running system. No shutdown, no new code, no change to Sabha's data. A new municipality has two states: **preparing** (visible only on admin screens) and **live**.

1. The admin adds the municipality. It starts as **preparing**, so no petrol station, card or rule anywhere sees it yet. This is what "a not-yet-launched municipality does nothing" means in the system.
2. The admin adds its **security authority** (section 5).
3. The admin adds its **petrol stations** (re-imported from the rosters archived in section 2) and its **registration stations**.
4. The admin creates its **users** — supervisors and employees — scoped to those stations.
5. The admin sets its **dates** (go-live, awareness start, deadline — section 10) and, if needed, its own **rule numbers**. Otherwise it uses the system-wide numbers.
6. On go-live day, the admin switches it to **live**.

What stays untouched throughout: every Sabha fill-up, card, allowance and report. What connects the two: a card issued in Sabha works in the new municipality from its first day — a Sabha car arriving there counts as "has a card," with that municipality's own separate allowance (section 11).

### Two things for the client to decide, not me

- **Same numbers everywhere, or different numbers per municipality?** Separate counters doesn't automatically mean different limits. My recommendation: one set of numbers for now, with the settings built so a municipality *can* override them later without new code.
- **A known side effect, worth saying out loud:** separate allowances per municipality mean a car near a boundary can fill up in two municipalities every day — double the allowance. The client chose this deliberately, and it's a fair choice. But since the whole system exists to stop fuel from being hoarded, an optional system-wide daily ceiling (off by default, switched on by an admin if abuse appears) is a cheap safety net to have ready.

---

## 12. What changes in what's already built

| Built piece | What happens to it |
|---|---|
| WhatsApp share (`lib/share.ts`, the share buttons and phone prompt in `VehicleQrPanel`) | Removed |
| QR on the fill-up success screen | Removed — station employees no longer create vehicles |
| QR card on the vehicle page | Replaced by a **card panel**: current card number and status, card history, and "issue / reissue card" for registration roles only |
| Vehicle creation inside the fill-up wizard (`RecordFillUpPage`) | Removed |
| Vehicle creation on the vehicles list (`VehiclesListPage`) | Becomes the base for the registration employee's full registration screen |
| QR scanning (`QrScanPanel`) | Kept, and becomes the first thing the fill-up screen shows. The lookup changes from vehicle code to card number, with the card-status checks from section 9 |
| Driver's-license "provisional owner" fallback (round 11) | Probably no longer needed. It existed because a pump employee might not have the owner's national ID on the spot; a registration desk can require it. Recommend dropping it — client to confirm |
| Vehicle/owner correction requests | Now started by registration staff and approved by registration supervisors, not petrol-station roles |
| `station_employee` permissions | Loses `vehicles:manage`, `owners:manage`, `vehicles:request_change`, `owners:request_change` |
| QA manifest sections M4–M6 | Rewritten once this is built |

---

## 13. Questions only the client can answer

Answered since the first version of this plan: supervisors (two roles), the grace period and awareness month, one authority per municipality, real data from Sabha's go-live, smartphone scanning.

Still open:

1. Which of the seed's place names (حجارة, القرضة, تمنهنت, الزهراء, المثلث, الشرقية, …) count as بلدية سبها?
2. Sabha's three dates: go-live, the start of the awareness month, and the deadline.
3. Same fill-up limits in every municipality, or different ones?
4. Lost card: does a replacement need supervisor approval, a fee, or a police report?
5. Whose emblem and name go on the card? Using an official emblem usually needs explicit permission.
6. Owner's name on the card: yes or no? (I recommend no.)
7. What documents must an owner bring to a registration station? This goes on the flyer, and it decides whether round 11's driver's-license fallback can be dropped.

## 14. Suggested next steps

1. You take section 13 to the client.
2. Meanwhile, the card design can start in Claude Design — the prompt is in the second file. The size, orientation and content don't depend on the open questions, except the emblem, which can be a placeholder. The awareness flyer can follow once Sabha's deadline date and the registration stations are known.
3. Before buying printers or phones in quantity: one desk and one phone, tested for real — silent printing of the card PDF (section 8), and scanning at noon and at night (section 9).
4. Once the answers come back, I write the Claude Code prompt for the whole change: new roles and permissions, registration stations and desks, the card record and QR change, printing, the scan changes, the Sabha cleanup, the per-municipality rules, and the migration. After that, the design-brief addition for the new registration screens.
