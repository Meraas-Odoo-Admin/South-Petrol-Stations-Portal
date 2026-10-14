# Design Brief — Fuel Fill-Up Control System (Sabha Security Directorate)

*This brief describes what the system needs to contain, who uses it and under what conditions, and what it should feel like. It deliberately does not prescribe layout, color, typography, or component choices — that's for Claude Design to work out.*

**Working name:** ضابط (proposed — meaning "regulator" and, in everyday Arabic, "officer," which doubles nicely for a Security Directorate system). Naming isn't fully finalized yet, so treat this as a placeholder rather than a locked brand name.

---

## 1. What this system is

An internal government system that tracks and controls fuel fill-ups for official vehicles at petrol stations. Every fill-up is recorded against a specific vehicle and driver, checked against rules (how much fuel, how often), and logged. When a fill-up would break a rule, staff can still record it as a flagged exception with a reason, which then needs approval from someone senior. Vehicle identity — plate, chassis number — is tracked carefully with a full history and a change-approval process, specifically to prevent fraud (swapped plates, altered registration booklets). Nothing in the system is ever silently deleted or overwritten; every action is attributed and logged.

This is not a consumer product and not a public-facing service. It exists purely so that a security directorate can account for every liter of fuel dispensed to its fleet, and prove it.

---

## 2. Who uses it, and the conditions they use it in

Four roles, each with a genuinely different job and a different working environment. The interface needs to feel like it was built for each of these situations specifically, not one generic "user" smoothed over four permission levels.

**Station Employee** — works the pump at one assigned station, recording each fill-up as it happens. Often does this during a fuel shortage, with a long line of vehicles waiting and real time pressure. When a driver or vehicle hasn't been seen at that station before, the employee is the one who enters that person's information for the first time, on the spot — so registering someone new has to be fast enough to do mid-queue, not a separate errand. This is the highest-pressure, highest-frequency role in the whole system, and the one most likely to be used on a phone or tablet outdoors, sometimes one-handed.

**Station Supervisor** — runs one station. Makes sure things work properly there day to day, reviews and approves exceptions their employees flag, and creates new employee accounts for their own station with the appropriate access. Their view of the system is scoped to their station — it should feel like a station manager's command center, not a directorate-wide console.

**Directorate Admin** — operates above the station level. Creates accounts for supervisors and employees, manages access rights, and has visibility into reports and audit logs across all stations. Also controls system-wide settings. Their job is oversight and administration across the whole directorate, not day-to-day station operations.

**System Admin** — has control over everything, full stop. Every setting, every account, every permission, every configuration detail in the system is theirs to manage. This is the root-level role.

---

## 3. What the whole thing should feel like

The tension to resolve: this has to read as serious, official, and trustworthy — the digital equivalent of a well-run checkpoint, not a consumer app — while still being fast and forgiving enough for someone entering data one-handed at a crowded pump under time pressure. Calm authority rather than corporate-SaaS friendliness. Precise rather than playful. It should feel like it belongs to a security directorate, and it should feel unmistakably like *one* system end to end — right now the underlying build has grown screen by screen and it shows; part of the job here is making the whole thing feel designed as a single coherent product, not a set of forms stapled together.

---

## 4. Brand voice

The system should sound like a competent, exact official — not a machine issuing error codes, not a friendly app assistant. Plain, direct, procedural language. When something is blocked, it says exactly which rule was broken and why, in one clear sentence, not a vague error message. No exclamation marks, no hype language, no cute empty states. Under time pressure (the fill-up screen especially), every word of copy should earn its place — brevity isn't a style choice there, it's a practical necessity for someone with a line of cars waiting.

---

## 5. What the logo should represent

Leaving the actual form entirely to Claude Design, but the idea it needs to carry: precise, accountable control over something valuable that moves through many hands and is easy to abuse — publicly funded fuel, tracked litre by litre. Not a generic fuel-pump icon, not a generic shield/checkmark cliché. Somewhere in the territory of measurement-plus-verification — a gauge's exactness, a seal's finality, a ledger entry with a mark against it — is worth exploring, but that's a starting thought, not a brief. The one hard requirement: it needs to still read correctly as a small monochrome icon, since staff will be finding it among a dozen other apps in a taskbar or on a homescreen.

---

## 6. What the system needs to contain, screen by screen

This is a content inventory, not a layout spec. Where something appears, how it's grouped, what's a button vs. a card vs. a list — all of that is open.

**Fill-up recording** (the core, highest-frequency screen)
Confirm the station (usually fixed to the employee's own assignment). Identify the vehicle — normally by plate, with a fast path to register a brand-new vehicle, owner, and driver inline if this is their first visit. Identify the driver the same way. Choose fuel type and enter quantity. Submit. If a rule would be broken, the system explains which one in plain language, and lets the employee submit anyway as a flagged exception with a required reason — this has to stay fast, it's used constantly under pressure. Confirmation once recorded.

**Vehicles** — a searchable directory, and a detail view per vehicle showing its identity (internal code, plate, chassis number, model, type, use type, year, color), its complete plate history (plates change over time — all past plates need to stay visible, not just the current one), its current driver and owner, and its full fill-up history. Also the entry point to request a chassis-number correction (see below).

**Drivers** — a searchable directory, and a detail view per driver showing name, phone, national ID (masked by default — employees see the full value only while entering it for a new driver; supervisors and above can reveal it on demand), the vehicle(s) associated with them, and their fill-up history. Vehicle and driver records should feel connected — looking at one should make it easy to jump to the other, not require a fresh search.

**Vehicle identity change requests** — currently has no interface at all and needs to be designed from nothing. A station-side flow to flag that a vehicle's chassis number doesn't match what's on record and submit a correction (old value shown, new value entered, reason required). A review queue, for supervisors and above, to compare old vs. new and approve or reject with a reason. Critically: the old value stays the one in effect everywhere in the system until a request is approved, so the UI has to make it obvious that a pending request hasn't taken effect yet.

**Exceptions / violations** — a list of flagged fill-ups, what rule each one broke, and why. Supervisors and above approve them (a reject path doesn't exist yet in the backend but is coming, so leave room for one). Exportable as a clean, organized report — not a plain-text dump.

**Reports** — a filterable view of fill-up activity (station, date range, fuel type, vehicle, driver, exception status, etc.), with results updating live as filters are set rather than requiring a manual "run" step. This should feel like a genuine reporting tool someone could hand to upper management, not a raw data table. Exportable.

**Dashboard / monitoring overview** — an at-a-glance view of today's activity and anything needing the viewer's attention (pending approvals, exceptions, etc.), scoped to what that role can see — a supervisor's is about their one station, an admin's or system admin's spans everything.

**Stations** — a directory of stations and their basic details (company, station number, name, internal code).

**Administration** — entirely missing today and needs to be designed as a real, coherent section, not a set of bolted-on forms:
- Account management: creating users, assigning roles, assigning which station(s) a user can operate in — with the understanding that who can create which kind of account differs by role (a supervisor creates employees for their own station; an admin creates supervisors and employees; a system admin has no limits)
- System settings: the numeric rules that drive the whole system (how many fill-ups per week, minimum days between fill-ups, and room for more like it later) — these are the actual levers the whole system exists to enforce, so this matters more than a typical settings page would
- Audit log: every change in the system is recorded (who, what, when, old value → new value) — admins and system admins need to browse, search, and filter this
- Roles & permissions, at the system admin level

**Search** should not be its own separate destination — looking someone or something up needs to be reachable from wherever it's relevant, and lead straight into the related record.

---

## 7. Constraints Claude Design should design around

The interface is Arabic-first and right-to-left — this needs to be designed natively in RTL, not adapted from an English layout afterward. A number of fields mix RTL and LTR content in the same string (plate numbers, national ID numbers, phone numbers, timestamps) — these need to stay legible and correctly ordered inside an RTL page; it's caused real bugs before, so it's worth your engineering counterparts' attention regardless of visual style. Several fields (plates, national IDs, phone numbers) follow strict Libyan formats, so the design should account for showing people the expected format, not just a blank box. And design for mobile as a first-class case, not an afterthought — the busiest role in the system (station employee) is realistically using this on a phone or tablet outdoors, sometimes one-handed, with people waiting.

---

## 8. Round 2 — why this brief is being reissued

The first pass through this brief produced a visual language (cards, status pills, a color/type system) that got applied correctly to some screens and inconsistently or not at all to others, and mobile was never actually designed for despite being called out as a first-class requirement in section 7. Two concrete problems came out of live testing on a real phone-width viewport:

**The mobile nav doesn't work at all.** At a real phone width, the full desktop nav — every section, plus the account menu — renders as a long unstyled vertical list stacked above the page content, with no collapsing, no hamburger menu, nothing. This needs an actual mobile navigation pattern designed on purpose: what collapses, what's always visible, how someone reaches a section that isn't one of the first few. Design this as its own explicit artboard, not an assumption that the desktop nav will "just wrap."

**Internal rule codes are leaking into the interface as English text.** When a fill-up is blocked, the system is correctly explaining why in plain Arabic — but the underlying rule identifier (something like `VEHICLE_GAP_TOO_SHORT`) is also being shown, verbatim, in English, in the same place a station employee is reading. Nothing in this system should ever show a raw code, enum value, or internal identifier to a user — every status, rule name, exception type, and error needs a real Arabic label designed for it. Treat this as a content requirement: wherever the app currently has any internal identifier as user-facing text, design what should be there instead.

**This round needs to be a complete, explicit screen set — not tokens plus a pattern to extrapolate from.** Design every screen below as its own artboard, at both a standard desktop width and a real mobile width (a phone, not just a narrowed browser window), fully in Arabic with no placeholder English left in. The goal is that implementing this round should be a matter of matching what's drawn, not interpreting a design system and applying judgment screen by screen — that's exactly the step that went missing twice now.

### Current, accurate screen inventory

The system has grown since the first brief. Design all of the following (section 6 above still describes what each one needs to *contain* — this list is just to make sure nothing is missed as its own artboard):

- Login and forced first-login password change
- Fill-up recording (including the rule-violation / exception-submission state inline on the same screen)
- Vehicles: directory/list, and detail view (identity, plate history, current driver + owner, fill-up history, entry points to request a chassis or booklet-number correction)
- Drivers: directory/list, and detail view (identity, masked/revealable national ID, associated vehicles, fill-up history)
- Vehicle identity change requests: the station-side submission form, and the supervisor/admin approval queue (showing old vs. proposed value clearly distinguished, approve and reject with reason)
- Exceptions / violations: list and filtering, approval action
- Daily report: filterable (station, date range, fuel type, driver, exception status), live-updating results, export
- Monitoring dashboard: role-scoped overview (a station supervisor's one-station view vs. a directorate-wide view)
- Stations: directory/list
- Administration section: Users (list, create, role assignment, station-scope assignment), System Settings (the numeric rule thresholds), Exception Types (admin-managed list, not hardcoded), Audit Log (filterable, read-only)
- Standing / continuous exceptions: shown on the driver and vehicle detail pages — an active-exceptions panel and a "grant a new one" flow (scope: driver, vehicle, or both; which rule(s) it covers; reason; optional expiry)

### Mobile is not optional on any of these

Every screen above needs a real mobile treatment, designed as its own artboard — not assumed to be "the desktop layout, narrower." The fill-up recording screen in particular needs to work one-handed, outdoors, under time pressure, which was the entire reason mobile mattered in the first brief.

---

Everything above is the "what." Composition, visual hierarchy, color, type, iconography, motion, and every other design decision are entirely Claude Design's to make.

---

## 9. Round 3 — vehicle QR code + "send via WhatsApp"

New content, not a fix to anything already designed. This needs its own artboard(s) rather than being treated as a one-line addition to the vehicle detail screen already designed in round 2 — it introduces a genuinely new interaction (sharing something outside the app) that nothing else in the system does yet.

**Where it lives — two places, decided:**
- **The vehicle detail screen** (section 6/round 2's vehicle detail view) is the permanent home — a QR code that stands in for the vehicle's internal code, plus a way to hand it to someone via WhatsApp, reachable for every vehicle at any time, not just ones just created.
- **The fill-up success screen** (the confirmation screen shown once a fill-up is recorded) also gets a compact version of the same thing — but only for the specific transaction where a brand-new vehicle was just created inline. This does NOT touch the identification/fuel/review steps that come before submission — that timed sequence (section 3: fast, one-handed, under time pressure) stays exactly as designed, untouched. The success screen already exists as a natural pause after that pressure is over, which is why this is the right place for it: a walk-in owner leaves with their QR the same visit, without a second trip back to the vehicle detail screen later. This only appears when this transaction's vehicle is new — an existing, already-registered vehicle's success screen looks exactly as it does today, no QR block added.

**What has to be shown, not just the QR image itself:**
- The QR code, and — beside it, in real legible text, not buried in alt text — the internal code it represents. Same reasoning as section 7's format-hinting requirement: someone should be able to read and manually confirm the code even if a scan fails, not treat the QR as an opaque black box. The QR itself encodes the internal code alone — nothing else is packed into it (see below).
- A share action. Two genuinely different real behaviors need designing as two states, not one button with one assumed outcome:
  - **On a phone**, tapping share can hand the QR image itself straight to WhatsApp (or whatever the person picks) in one step — design the button and, if there's any confirmation/feedback after sharing, that state; the OS's own share sheet is not something to design.
  - **On desktop**, there is no one-step equivalent — WhatsApp's compose link can carry text but not an attached image. This has to be designed honestly as two steps: a "download the code" action and a separate "open WhatsApp" action, with a short, plain, procedural sentence (section 4's brand voice — no hype, no exclamation marks) telling the person to attach the downloaded image themselves. Don't design this as if a single click does both.
  - The compact version on the success screen needs its own take on this same share action — small enough to fit alongside the existing summary card and the "تعبئة جديدة" / "عرض تعبئات اليوم" actions already there, not a full repeat of the vehicle detail screen's treatment.
- Nothing new is needed for a missing-data state — every vehicle already has an internal code, so there's no empty/error case to invent here.

**What the QR carries — decided:** the vehicle's internal code, and nothing else. Not the plate (plates change over time, so baking one into a QR that never gets regenerated would go stale) and not a link (the vehicle record isn't reachable without logging in, so a link wouldn't do anything useful for an outside scanner). The internal code is also always what's printed in legible text beside the QR, regardless.

---

## 10. Round 4 — scanning the QR back in, at the fill-up screen

Round 3 designed the giving-out half (a vehicle gets a QR, an owner can be handed it). This round is the other half: an employee at the pump scanning that same QR back in, as a faster alternative to the plate-entry step already designed. This is new ground for the system — nothing today asks for camera access — so treat every state below as needing its own real design, not a one-line addition to the existing plate screen.

**Where it lives:** inside the existing fill-up plate-entry step (round 1's fill-up recording screen, still the first of the 3 segments in that flow) — not a new step and not a new segment in the progress indicator. This is an alternative way to identify the vehicle, offered alongside the plate digit-entry already designed, the same way a manual-search fallback already sits alongside it. Whatever this ends up looking like, the 3-segment structure of that flow doesn't change.

**States to design, each a real state, not implied:**
- **The offer itself** — a clearly-labeled scan action next to/near the existing digit-entry, at both mobile and desktop widths. This is the single highest-frequency screen in the whole system (section 2) — the scan option needs to read as at least as fast as typing, not like a secondary, buried feature.
- **A short explanation before the camera opens.** The system has never asked for camera access before now — a cold OS permission prompt with no context reads as suspicious and gets declined more often. One plain, procedural sentence (section 4's voice) explaining why the camera is needed, shown before that prompt fires.
- **The live scanning state** — a camera viewfinder, designed as its own screen/overlay, with a clear way to cancel back out to typing the plate manually instead. Someone standing at a pump with a line of cars needs an obvious, fast way to abandon this and fall back to typing if the scan isn't working.
- **Success** — the moment a code is read: the plate is filled in on the digit-entry the same way it would look if the employee had typed it themselves (this is the client's own framing of what "success" should feel like — the plate visibly appears, not just a silent jump to the next screen), immediately followed by the same match/confirmation state the existing typed-plate flow already reaches once a vehicle is found.
- **Two real failure states, distinct from each other:** camera access denied or unavailable (needs its own plain explanation and a path straight to manual entry, not a dead end), and a scanned code that doesn't match any vehicle in the system (a damaged, mis-scanned, or foreign code) — same "name exactly what went wrong, in one clear sentence" standard section 4 already sets for rule violations, not a generic error.

**Same non-negotiables as every other round:** real Arabic content throughout, no internal codes or English leaking into user-facing text, designed as explicit artboards at both mobile and desktop widths, and consistent with the visual language already established — this is a new capability, not a new visual style.

**Same non-negotiables as every other round:** real Arabic content throughout, no internal codes or English leaking into user-facing text, designed as explicit artboards at both a real mobile width and a desktop width, and built on the same card/type/color language already established in rounds 1-2 — this is one more piece of the same system, not an excuse to introduce a new visual style for a single feature.
