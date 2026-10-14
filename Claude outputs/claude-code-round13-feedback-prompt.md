Round 13. One feature, not a numbered list of complaints this time — the client wants the QR-code feature `OPEN_ITEMS.md` #45(d) already flagged as coming: a vehicle QR code, a "send via WhatsApp" button, and scanning that same QR back in at the fill-up screen. Everything below comes from actually reading `VehicleDetailPage.tsx`, `VehicleCreateForm.tsx`, `VehicleSearchSelect.tsx`, `RecordFillUpPage.tsx`, `App.tsx`'s route list, `schema.prisma`, and `OPEN_ITEMS.md` — treat it as verified, not guessed, with one exception called out explicitly below (the API-side vehicles module isn't in the repo snapshot I had access to). Implementation approach is yours to decide wherever this says so.

## Designs — build to match, don't freelance

The approved screens for this whole feature are in `design/design_handoff_fuel_control_system`. That folder covers: the QR + WhatsApp-share card on the vehicle detail screen, the compact version of it on the fill-up success screen, and every state of the scan-QR option on the fill-up plate step (the offer itself, the permission-priming copy, the live camera view, success, and the two failure states). Match what's drawn there — layout, spacing, copy, states — rather than inventing a visual treatment. Anything genuinely not covered by an artboard should follow the app's own existing patterns (`Card`/`CardHeader`, `PillButton`, `StatusPill`, the RTL/logical-property conventions already used everywhere) rather than a fresh style. If anything in this prompt and the design folder appear to conflict, the design folder wins on anything visual; this prompt wins on anything about data, state, or wiring, since that's what it was actually written from.

## What's actually being asked

Two halves of the same feature, both in scope for this round:

1. **Giving the QR out** — a QR code that encodes the vehicle's identifier, shown alongside a "إرسال عبر واتساب" (send via WhatsApp) button, plugged into the vehicle screens that already exist.
2. **Scanning it back in** — a "scan QR" option on the fill-up plate-entry step that reads the code, resolves it to a vehicle, and fills the plate in on the digit-entry itself (visibly, the same as if it had been typed) before advancing exactly the way a typed match already does.

## What's already there, confirmed by reading it

- **`VehicleDetailPage.tsx`** renders an identity card (plate, chassis, booklet, type, model, color, year, usage, owner), a plate-history table, drivers, standing exceptions, and fill-up history — all as `Card`/`CardHeader` sections. There is no QR or sharing section today. This is the one screen every vehicle (old or newly created) can always be reached at via `/vehicles/:vehicleId`, so it's the natural place for something that has to exist for every vehicle, not just ones created going forward.
- **`VehicleCreateForm.tsx` is only ever mounted inline inside the fill-up wizard** — from `RecordFillUpPage.tsx`'s plate step and from `VehicleSearchSelect.tsx`'s "لا توجد نتائج — إضافة مركبة جديدة" row. Confirmed against `App.tsx`'s full route list (`/vehicles`, `/vehicles/:vehicleId`, `/vehicles/change-requests` — no `/vehicles/new`) and `VehiclesListPage.tsx` (no create entry point on that page today). There is currently no way to create a vehicle outside of being mid-fill-up.
- **No QR/barcode library exists anywhere in this codebase**, generating or decoding. Checked `apps/web/package.json`'s dependencies and grepped the whole source tree for `qrcode`/`qr-code`/`react-qr`/`BarcodeDetector`/`jsQR`/`zxing`/`html5-qrcode` — nothing. Matches `OPEN_ITEMS.md` #45(d)'s own "clean slate" finding exactly (that audit also confirmed `Vehicle.internalCode` is unique, always-selected, and already searchable — i.e., a real target for this already exists server-side).
- **`CLAUDE.md`'s non-negotiable rule 1**: `internalCode`, not `currentPlate`, is `Vehicle`'s durable identifier, specifically because plates change over time. Whatever the QR encodes follows that same rule rather than encoding the plate.
- **No reliable phone number to target.** `Driver.phone` and `VehicleOwner.phone` are both nullable in `schema.prisma`, and `OPEN_ITEMS.md` #7 already has driver phone as "Pending — likely moot." There's nothing to build a "send straight to this stored number" flow on top of. That's why the button is a generic share (the person clicking it picks the recipient in their own WhatsApp), not a targeted send.

## Decided already — build these as given, not as open questions

- **QR payload: the vehicle's `internalCode`, plain text, nothing else.** Not the plate (goes stale when the plate changes), not a link (the record isn't reachable without logging in).
- **Where the QR/share card lives: two places.**
  1. `VehicleDetailPage.tsx` — the permanent home, one new card, reachable for every vehicle at any time.
  2. The fill-up success screen — a compact version, shown **only** when the vehicle just recorded against was created inline during that exact transaction, so a walk-in owner leaves with their QR the same visit without a second trip to the vehicle detail screen. An already-registered vehicle's success screen is unchanged.
- **Scanning lives inside the existing `'plate'` step** of the fill-up wizard — not a new `MobileStep`, not a fourth segment in the 3-segment progress bar (`MOBILE_STEP_SEGMENT`). It's a second way to identify the vehicle, offered next to the digit-box entry, the same way `showManualSearchMobile` already offers a second way today.

## Proposed shape — giving the QR out

1. **A new "رمز QR للمركبة" card on `VehicleDetailPage.tsx`**, same `Card`/`CardHeader` pattern every other section on that page already uses, rendering a QR code for `vehicle.internalCode` plus the code itself printed in legible text beside it (per the design).

2. **A compact version on the fill-up success screen** (the `if (success) { ... }` block in `RecordFillUpPage.tsx`), sitting alongside the existing summary card and the "تعبئة جديدة"/"عرض تعبئات اليوم" actions, not replacing anything there. This needs new state, since nothing today distinguishes "this transaction's vehicle was just created" from "it already existed" by the time the success screen renders:
   - Add a small piece of state (e.g. `newlyCreatedVehicle: { id: string; internalCode: string } | null`), set **only** inside `VehicleCreateForm`'s `onCreated` callback (both places it's mounted: the plate step's inline form, and `VehicleSearchSelect`'s "إضافة مركبة جديدة" row) — **not** inside `onDuplicateFound` (resolves to an existing vehicle), and not from `matchedVehicle`'s auto-advance or a clicked live-search candidate either.
   - Thread it through `ConfirmationSummary` (a new optional field, e.g. `newVehicleInternalCode?: string`) via `buildConfirmationSummary`, and clear it in `resetAll()` alongside every other per-submission piece of state that function already resets.
   - The success screen renders the compact QR block only when `success.newVehicleInternalCode` is set.

3. **Library**: nothing to reuse — `qrcode.react` (or an equivalent client-side generator) needs adding to `apps/web/package.json`. Flag before adding if a different library is preferred, but there's nothing already in the project to build on instead.

4. **"إرسال عبر واتساب" button** — two real technical constraints, build around them deliberately:
   - WhatsApp's plain link scheme (`https://api.whatsapp.com/send?text=...` / `whatsapp://send?text=...`) can pre-fill **text** and — deliberately, with no phone number in the URL — let the user pick who to send it to themselves. It **cannot** pre-attach an image. Don't build a single click that assumes both.
   - Where available (mobile browsers supporting the Web Share API with file sharing), `navigator.share({ files: [qrImageFile], text: ... })` can hand the QR image itself to WhatsApp (or whatever's picked) in one action — the primary path where supported.
   - Fallback (desktop, or no file-share support): a "تنزيل الرمز" download button for the QR image, plus the plain `api.whatsapp.com/send?text=` link — two separate steps (download, then manually attach), not one.
   - The compact success-screen version needs its own take on this same action, sized to fit beside the existing summary card, not a full repeat of the vehicle-detail treatment.

5. **No backend or schema change for this half.** The QR is generated client-side from data `VehicleDetailPage` already fetches (`GET /vehicles/:id`); nothing new needs to be stored or migrated.

## Proposed shape — scanning it back in

**Resolving the scanned code.** A scanned QR decodes to plain `internalCode` text. Resolve it through the exact same endpoint every other identification path already uses — `GET /vehicles?search=<code>` — the same call `VehicleSearchSelect.tsx` and `plateLookupQuery` already make, whose own comment confirms it ORs `internalCode` and `currentPlate` server-side. No new endpoint needed.

**Wiring the result in.** Once resolved, do exactly what every other identification path in this file already does, not a parallel implementation:
- `fillUpForm.setValue('vehicleId', vehicle.id, { shouldValidate: true })`
- `setSelectedVehicleLabel(formatLicensePlate(vehicle.currentPlate))`
- `setMobileStep('match')`

Plus one addition specific to what was asked for: call `setPlateValue(...)` with the resolved vehicle's plate (through the same formatting the digit boxes already use) **before** advancing, so the plate visibly fills in on the box row itself — the client's own framing of what this should feel like — rather than jumping straight to the match step with the boxes left blank.

**Don't reintroduce the round 11 station-gating bug.** The existing `matchedVehicle` auto-advance effect only advances for a `canViewAllStations` user once `stationId` is actually set (see that effect's own comment — this exact bug already shipped and got fixed once). The scan-resolution effect needs the identical gate, not a fresh implementation that skips it.

**Failure states** (per the design — build both, they're visually and behaviorally distinct): camera permission denied/unavailable, with a path straight back to manual entry; and a scanned code that doesn't resolve to any vehicle, with its own specific one-sentence message — not the generic error copy, and not silently falling through to the "no vehicle — add new" panel the plate-typing path uses (that panel assumes a plate someone is actively typing; a bad scan is a different situation).

**Library**: nothing to reuse — a library that manages the camera stream directly (e.g. `@zxing/browser` or `html5-qrcode`) is likely a better fit than hand-rolling the browser's native `BarcodeDetector` API plus a manual fallback, given that API's inconsistent browser support. Flag before committing, it's a new dependency either way.

**Scan UI mechanics**: whether the camera view opens as a full-screen overlay/modal on top of the existing plate step (recommended — cancels cleanly back to the untouched digit-box state) or replaces the step's content in place is yours to decide; the design covers the states, not how they're mounted in the component tree.

**Camera access requires a secure context (HTTPS).** Not a bug if this fails on a plain HTTP staging URL — worth knowing going in rather than debugging it live.

## Open questions — flag, don't guess

- **The API-side vehicles module isn't in the repo snapshot I had for this pass** (`apps/api/src` here only has `audit/auth/common/companies/health/prisma/rbac/stations/users` — no `vehicles`/`drivers`/`fillups`/`standing-exceptions` folders). Everything above about `GET /vehicles?search=`'s behavior is confirmed from the frontend's own code and comments, not from reading the controller directly — worth a quick sanity check against the live module before relying on it.
- Both new dependencies (QR generator, QR/barcode decoder) above are proposals, not locked choices — confirm before adding if there's a preference either way.

## Close-out

Same as every round: lint, typecheck, full test suite green. No schema/migration and no new backend endpoint needed for either half — two new frontend dependencies only, both flagged above as open picks. Every existing vehicle-identification path in the fill-up wizard — manual plate entry, live search-as-you-type, inline creation, the exact-match auto-advance and its station-gating — needs to keep working exactly as it does today; scanning is an addition alongside those paths, not a replacement for any of them, and it must reuse their same integration point and gating rather than a parallel path that quietly drifts out of sync with the next fix any of them gets.
