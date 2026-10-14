Round 11. Seven items. Items 1-3 come from reading the actual schema and components before writing this, so treat those findings as verified, not guesses. Items 4-7 came out of the client actually using round 10's build — a screen recording plus three screenshots of the live app, referenced by filename below — so treat those as confirmed-by-evidence rather than source-verified; pin the exact file/line the same way items 1-3 do before changing anything. Implementation approach is yours to decide where noted, on all seven.

## 1. Owner identity becomes mandatory, with a one-time driver's-license fallback

Client, verbatim: owner information should be mandatory, but since a national/administrative ID isn't always available from the car owner on the spot, the system needs an alternate that's always available — the driver's license — usable *only for the vehicle's first-ever fill-up*. After that, the vehicle profile stays visibly flagged as incomplete, and no further fill-ups are allowed until the real national/administrative ID is added.

What I found in the actual schema (`apps/api/prisma/schema.prisma`):
- `Vehicle.ownerId` is currently nullable (`ownerId String?`) — a vehicle can exist with no owner at all today. That's the "owner is optional" the client is flagging, confirmed real, not a misreading.
- `VehicleOwner.identityType`/`identityNumber` are both currently required, and `IdentityType` only has `NATIONAL_ID` / `ADMINISTRATIVE_ID` — no concept of a provisional identity exists yet.

Proposed shape, for you to confirm/adjust against the fuller schema in `docs/IMPLEMENTATION_PLAN.md`: add `DRIVERS_LICENSE` as a third `IdentityType` value, explicitly provisional (not equal standing to the other two — this is the piece that makes an owner profile "incomplete," not just a third valid option). Make `Vehicle.ownerId` required going forward. Add whatever's needed to know a given owner's identity is still provisional (either derive it from `identityType === 'DRIVERS_LICENSE'` directly, or an explicit status field if the model needs to track more than just the identity type later) and surface it the same way `StationStatus.UNVERIFIED` already does — `labels.ts` has a real precedent for this exact "غير مؤكدة — تحتاج مراجعة"-style badge, reuse that pattern rather than inventing a new visual language for "incomplete."

Rule-engine side: this reads as a hard gate, not a flaggable/exception-routable rule like the others — the client's wording is "only the first fill is available," not "flag it and let a supervisor approve going over." Confirm that reading before building it as one more `RuleFailureReason` alongside the exception-routable ones; it may need to be structurally different (block with no exception path) rather than reusing the existing pattern.

Two things I could not responsibly resolve myself, flag rather than guess:
- **No standard digit format for a Libyan driver's license turned up in research** ([Vehicle registration plates of Libya](https://en.wikipedia.org/wiki/Vehicle_registration_plates_of_Libya) covers plates, not licenses; the other results were application-process pages, not a documented number format). Don't invent a regex — leave validation permissive (or a simple length/character-class placeholder, clearly commented as unconfirmed) the same way `docs/OPEN_ITEMS.md` already carries other client-pending numbers, and add a line there for this specifically.
- **Existing vehicles with no owner at all** (real today, per the nullable `ownerId`) need a migration/backfill decision once `ownerId` becomes required — don't silently pick one. Flag it for the client the same way the other schema-affecting decisions have been.

## 2. Vehicle list — real filters and sorting, not just the current search box

Client wants the vehicle to be treated as a profile (owner included), and the list view (`VehiclesListPage.tsx`) properly filterable/sortable. I checked what's there now: a search query and one `usageFilter`, and the code's own comment says the usage filter is client-side-only "over the loaded page... out of scope for a visual pass" — i.e., already a known, flagged shortcut, not something I'm newly discovering as broken.

Proposed filter/sort set, grounded in what the schema actually has (adjust if something below doesn't hold up against the fuller model):

- **Station** — reuse `StationSelect` as-is, same component already used elsewhere for exactly this.
- **Usage type** — `VehicleUsageType` (`GOVERNMENT`/`PRIVATE`/`COMMERCIAL`) via `labels.ts`'s existing label map; already exists as a filter, just currently client-side-only.
- **Owner-identity status** — verified vs. provisional/incomplete (ties directly to item 1 — this is a genuinely useful filter, not filler: "which vehicles still need their owner's real ID"). Worth having regardless of how item 1's exact field shape lands.
- **Brand** — now that `VEHICLE_BRANDS` exists, filter by manufacturer.
- **Search** — keep the existing query box, but confirm it actually covers plate/chassis/internal code/owner name+ID together; extend if it doesn't.
- **Sort** — internal code, most recent fill-up, plate. Newest-vehicle-first as a reasonable default if nothing else is specified.

Given this is now a real filters/sorting pass rather than the earlier "visual pass," reconsider whether usage-type (and the new owner-status filter) should move server-side rather than staying client-side-over-one-page — that was an explicit scope cut before, not an oversight, so it's worth deciding deliberately rather than just inheriting the old shortcut.

## 3. Date-field icon overlapping text — found the exact cause

`components/DateField.tsx`'s default styling reserves `pe-9` (36px) of end-padding for the calendar-icon button, which sits at `end-2.5` and is `w-6` (24px) wide — so the icon occupies out to 34px from the end edge, and the default class's 36px reservation clears it correctly.

But every filter-row usage overrides that with its own `inputClassName`, and all five current call sites use `pe-8` (32px) instead of `pe-9`: `DailyReportPage.tsx:133`, `DashboardPage.tsx:80` and `:88`, `ViolationsPage.tsx:120` and `:124`. That's a 4px shortfall — the icon's left edge sits 2px inside where the text is allowed to run, which is exactly what "smashed logo over text" looks like, especially with right-aligned typed digits ending right where the icon sits.

Fix all five call sites, but also consider making `DateField` itself enforce the icon-safe padding regardless of what `inputClassName` passes (e.g., always append the reserved end-space rather than letting a caller's class fully override it) — five call sites already got this wrong once; a component that can't be misused this way prevents a sixth.

## 4. Fill-up search doesn't find a previously-entered vehicle until the plate is fully typed

Client, verbatim: "I write a plate number of a vehicle I have entered previously and it doesn't appear as you see in the screenshot, but you have to write the entire plate number for it to pop up."

The attached screenshot shows one symptom of this directly: the plate boxes read `8-4180_` (municipality digit plus 4 of the 7 sequence digits — 3 boxes still empty), and the panel already reads "لا توجد مركبة بهذا الرقم في المنظومة" ("no vehicle with this number in the system") with an "add new vehicle" button, while the field is still mid-entry. A follow-up round of testing narrowed this down to three distinct problems, not one — check all three, don't assume fixing one resolves the others:

- **Live suggestions start too late.** As-you-type matching only kicks in once the user is typing digits in the boxes *after* the dash (the 7-digit sequence group) — nothing happens while typing the municipality digits before the dash. It should start suggesting matches from the very first digit typed anywhere in the plate, not just once the cursor reaches the second group.
- **Clicking a suggested result does nothing.** Once a live match does appear in the dropdown, clicking it doesn't select the vehicle or populate the form — the suggestion just disappears. This is a separate, more serious bug than the timing issue above: even when the search correctly finds the right vehicle, there's currently no way to actually pick it.
- **The premature "not found" state** shown in the attached screenshot — the plate is still incomplete (`data-complete="false"` is visible in a second screenshot's DOM inspector) but the panel already renders the negative "no vehicle in system" result. That shouldn't render until all 8 boxes are filled, and needs to be checked separately from the two bugs above rather than assumed fixed alongside them.
- **New, from a second screen recording against a later build (with real seeded stations, not just the synthetic fixture):** after typing a digit past the dash, results now visibly appear — then vanish on their own about a second later, with no click and no further typing. That's a different failure mode from "clicking does nothing" above, not the same bug re-described: something is populating the dropdown correctly and then a moment later clearing it back out. Smells like a race — a debounced search resolving, then a second effect (a stale request, a blur/refocus, a state reset tied to the keystroke timer) overwriting it — but that's a guess, not a diagnosis; trace the actual state updates rather than assuming which one it is.

## 5. Mobile plate-entry boxes touch the edge of their card

A DevTools screenshot at a 374px mobile width shows the 8-box plate row spanning edge-to-edge inside its card — the first and last boxes sit flush against the card's left/right boundary with no inset, reading as broken rather than intentional. Whatever wraps the box row needs horizontal padding so the boxes clear the card edge at real phone widths (check the ~360-390px range specifically, not just a scaled-down desktop view).

## 6. Digit-entry can't take a two-digit municipality/prefix code in natural typing order — a real regression from round 10's own fix

This is the same municipality-code box group round 10 fixed (`PLATE_DIGIT_GROUPS[0]`, `{ boxes: 2, minFilled: 1 }`), and the client's new report is a direct consequence of that fix, confirmed frame-by-frame from the attached screen recording:

- Typing a single digit ("8") correctly lands it in the box next to the dash — that part of round 10's fix holds up.
- But the group is then treated as already complete: the very next digit typed goes straight into the first box of the 7-digit sequence group, not into the still-empty left box of the municipality group. So a user who wants a two-digit prefix (e.g. "84") can never type it in sequence — they have to type one digit, then explicitly arrow or click back to the left box to add the second. That's exactly what round 10's fix didn't account for: right-aligning the moment a single digit lands is correct only if the group *stays* single-digit; it shouldn't also stop the group from accepting a second digit typed immediately after.

Client's own framing of the fix: "I want the mapping of the numbers to make sense when a user wants to enter a two digit prefix plate, they can easily, and when they enter a one digit prefix plate they can easily." Concretely, that reads as: fill the group left-to-right as digits are typed while it still has room (first digit → left box, second digit → right box, no reordering needed), and only right-align a single leftover digit toward the separator when the group is finalized — focus leaving the group, or the rest of the plate completing — rather than repositioning on every keystroke. This box group has now been wrong twice; worth writing explicit test cases before touching it again: single digit only (ends up right-aligned, empty left box, on finalize), two digits typed back-to-back (left-right, untouched), and single digit followed by backspace (clears cleanly, no half-migrated state).

## 7. No "record as exception" path when a fill-up actually fails a rule

The attached rule-review screenshot shows two rules genuinely failed — "الفاصل الزمني — المركبة" and "الفاصل الزمني — المالك" (vehicle and owner minimum-days-since-last-fill), each reading "0 days since last fill — minimum 2 days" in the rejected/red state — and yet the only button on the screen is the plain "تسجيل التعبئة" ("record the fill-up"), with no "record as exception" option and no amber pending-approval path anywhere. This is exactly the flow round 7 specified (failing rule → red block naming the rule and the overage, plus a "record as exception" screen ending in the amber "awaiting supervisor approval" state) and rounds 8/9's summaries both described as built. So either it regressed since, or it was never actually wired to this specific condition (simultaneous owner + vehicle gap failures). Same evidence standard round 9 asked for applies here: confirm in the real component whether the exception button's visibility is conditioned on rule-failure state at all, and if so why it isn't rendering in this exact case, rather than assuming a partial fix already covers it.

---

Same close-out as every round: lint, typecheck, full test suite green. Item 1 is a real schema/rule-engine change with open questions above — same as every other fundamental change this project has made, write up the design and flag what needs the client's confirmation rather than picking an interpretation silently. Items 4-7 are all regressions/gaps in things this project already claimed were done (round 10's plate-box fix, round 7-9's exception flow) — re-verify against the running app with fresh evidence before reporting any of them fixed, not just against the prior round's own summary.
