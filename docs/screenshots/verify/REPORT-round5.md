# Round 5 — Client Feedback Implementation Report

Source: `claude-code-round5-feedback-prompt.md` (client feedback after reviewing round 4's fixes live, with 3 new screenshots in `design/feedback-2026-08-30/`).

## Checklist before calling this done

- `pnpm lint` — clean across all workspaces.
- `pnpm --filter @fuel-tracking/api exec tsc --noEmit` — clean.
- `pnpm --filter @fuel-tracking/web exec tsc --noEmit` — clean.
- API unit tests: **18/18** passing.
- API e2e: **131/131** passing (129 pre-existing + 2 new — auto-generated internal code, driver search by ID).
- Web e2e (Playwright, real browser): **5/5** passing, including the fill-up flow's driver field updated to search by ID instead of name.

## What was built, item by item

### 1. Plate field placeholder font
Root cause: the placeholder text repeated the instructional label ("ابحث برقم اللوحة أو الرمز الداخلي") but rendered in the same bold 20px plate-numeral font as a real typed value — reading as a bug, not a hint. Applied the client's own recommended fix: placeholder now reads `8-xxxxxxxx` (an example-shaped hint that legitimately earns the bold plate styling), with a muted `text-ink-faint` color so it still reads as a hint rather than a filled value.

### 2. Vehicle-brand dropdown
Diagnosis: there was no bug to find — round 4's `VehicleBrandPicker` was built as an explicitly-documented scaffold that always rendered a generic category glyph, never a real logo, for every brand. The two npm packages named in the round 4 scope turned out not to work as hoped: `car-logos-dataset` doesn't exist on the npm registry (404), and `@avto-dev/vehicle-logotypes` ships only metadata pointing at a third-party image CDN (`vl.imgix.net`) — hotlinking, which round 4's own brief said to avoid. Used `car-brand-logos` instead (MIT-licensed, ~100 real self-hosted SVG files, no network dependency) — copied the 41 files that overlap with brands relevant here into `apps/web/src/assets/brandLogos/`, wired via `import.meta.glob` (Vite's standard bulk-asset-import pattern) so they bundle as inline data URIs, no runtime fetch. Expanded the brand list from ~50 to 71 names.

**Still not covered by a real logo** (generic glyph fallback, not a broken image): Honda, Ford, Chevrolet, Chery, MG, Great Wall/Haval, and every truck/heavy-equipment/motorcycle brand — `car-brand-logos` has zero coverage for those. See `docs/OPEN_ITEMS.md` #24.

**Trademark question — still flagged, still not resolved.** Unchanged from round 4: bundling real manufacturer marks is generally low-risk for internal, non-commercial government software, but nobody on this project is positioned to clear that unilaterally. More logos now rendering is not the same as this being settled — flagging again rather than letting it go quiet.

### 3. Vehicle-creation flow
- **Inline "add new" row inside the dropdown**: both `VehicleSearchSelect.tsx` and `DriverSearchSelect.tsx` now render a "لا توجد نتائج — إضافة مركبة/سائق جديدة" row inside the dropdown itself (accent-colored, matching the design system's other accent affordances) when a search comes up empty and the caller opted in via a new `onCreateNew` prop. The static link below the field is kept alongside it, not replaced — belt-and-suspenders, since some users may not think to look inside the dropdown.
- **Auto-generated internal code**: confirmed there was no existing generation logic anywhere (`internalCode` was a required, blank text field with only a uniqueness check) — the `V-SB-1042` shape shown on `VehicleDetailPage.tsx`'s mockup was never actually implemented. Built one: `VehiclesService.generateInternalCode()` assigns the next `V-######` sequential code (probing past any already-taken code, cheap since collisions should be rare) whenever `internalCode` is omitted from `POST /vehicles`. `CreateVehicleDto.internalCode` is now optional. `VehicleCreateForm.tsx`'s field is now a disabled display (`"سيُحدَّد تلقائيًا عند الحفظ"`) instead of a text input — nothing is sent for it, the backend assigns it.

### 4. Driver selection follows the vehicle, de-duplicates by ID
- Once a vehicle is matched, its linked drivers (`DriverVehicle` rows, already fetched via the existing vehicle-preview query — no new endpoint needed, react-query dedupes the shared queryKey) render as selectable cards above the search field, primary driver first with a "الأساسي" badge (reuses the existing `isPrimary` field, same one already shown as "السائق الأساسي" on the driver-detail page).
- `DriverCreateForm.tsx` now catches a 409 on create (same anti-duplication idiom `VehiclesService` already used for chassis/booklet identity fields — re-check uniqueness, don't just fail), looks the person up by identity number, and hands back the existing driver as a normal selection instead of a dead-end error.
- Selecting a new vehicle clears whichever driver was previously selected — see `docs/OPEN_ITEMS.md` #27 for why this wasn't explicitly asked for but seemed like the safer default.

### 5. Filter row heights
Root cause: native `<input type="date">` doesn't reliably match a `h-9` Tailwind class's actual rendered height the way a plain text input does — confirmed exactly at the field the client circled (`DailyReportPage.tsx`'s التاريخ filter). Fixed by reusing the `DateField` component (built in round 4 for the standing-exceptions form) everywhere a raw `<input type="date">` remained: `DailyReportPage.tsx`, `DashboardPage.tsx` (×2), `ViolationsPage.tsx` (×2) — audited the rest of the app's filter/control rows per the client's "general pattern, not a one-off" instruction and found no other native date inputs left. `DateField` gained an `inputClassName` override so each call site can match its own row's sizing instead of the component's own default.

### 6. Simplified "add new setting"
Replaced the free-text key/value/description form with two concrete dropdown+stepper templates matching the rest of the settings page's visual language: a new per-fuel-type price, or a new per-usage-type max-liters-per-fillup setting (the exact gap `docs/OPEN_ITEMS.md` #22 describes) — each auto-derives its own dotted key from the dropdowns picked, with a real +/- stepper for the value, same styling as every other setting card on this page. A de-emphasized "إعداد آخر (متقدّم)" option remains as an escape hatch for anything that fits neither template, kept last in the list rather than the default. The "won't automatically wire into the rule engine" caveat is still shown — simplifying the entry UX doesn't change that underlying limitation, so it stays honest about it.

### 7. Driver field — search by ID, shown as cards
Rebuilt `DriverSearchSelect.tsx`: was client-side name-filtering over one fetched page of up to 100 drivers; now a real debounced server-side search against `GET /drivers?search=` (already ORs across `identityNumber`/`fullName`/`phone` — confirmed against the actual `FindDriversQueryDto`, no backend change needed), restricted to digit entry to match the ID-search intent. Results show the matched name next to the (permission-masked) ID for visual confirmation before selecting. Combined with item 4's vehicle-linked driver cards and item 3's inline "add new" row.

Two judgment calls the client explicitly delegated — see `docs/OPEN_ITEMS.md` #27 for the full reasoning, summarized here:
- A driver selected who isn't one of the vehicle's registered drivers gets a plain amber note (reusing the standing-exceptions amber pattern the client pointed at), not a block.
- Picking a different vehicle clears the previously-selected driver.

## Bugs fixed along the way (not explicitly asked, but found while verifying)

- **`e2e/fillups.spec.ts`** still searched the driver field by full name — updated to search by `driverIdentityNumber` to match item 7's new behavior; otherwise every subsequent round's test run would have silently broken.
- Re-confirmed the `nest start --watch` / stale `tsconfig.build.tsbuildinfo` race from round 4 (killing the watch process mid-compile leaves `dist/` deleted and a stale incremental cache that makes the next manual build silently emit nothing) — same fix applied each time it recurred: delete `tsconfig.build.tsbuildinfo` before rebuilding.

## Open items added this round (see `docs/OPEN_ITEMS.md` for full text)

| # | Summary |
|---|---|
| 24 (updated) | Real npm packages for brand logos didn't pan out as scoped; used `car-brand-logos` instead — 41/71 brands have real logos, the rest (notably Honda/Ford/Chevrolet and all trucks/heavy-equipment/motorcycles) still show the generic glyph. Trademark question still unresolved. |
| 27 | Two judgment calls on the driver-selection redesign (item 7), flagged for review rather than buried in the diff. |
| 28 | The two "add new setting" templates chosen (item 6) are a judgment call — confirm they cover what's actually needed. |
