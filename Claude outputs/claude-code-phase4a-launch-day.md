Phase 4a of the registration pivot: launch day for vehicles without a card. Background is in `docs/REGISTRATION_PIVOT_PLAN.md`, section 10 above all. **Build only what's listed here** this session. Phase 4 was split in two: the monitoring reports and supervisors managing their own staff come in 4b. Start a new branch, `feat/p4a-grace-period`, from `main` (`e495b34`, which now holds Phases 1–3).

## Why

On the day Sabha goes live, **zero vehicles have a card**. "No card, no fuel" from day one would stop every car in the city. So there is a grace period in which a station employee can still record a fill-up by typing the plate. It is followed by an awareness month in which every no-card fill-up tells the driver the deadline and where to register. After the deadline a card is required, and only a supervisor can make an exception.

## 0. First, a small tooling fix

The root `pnpm lint`, `pnpm typecheck` and `pnpm test` abort whenever there's no terminal to answer pnpm's "purge node_modules?" question. The same check broke the husky pre-commit hook in a VS Code commit, and you had to run the tools per package last session. pnpm is pinned at 11.22.0.

- Configure pnpm's dependency check before `run` so it never waits for a terminal. Check the right setting name and values for pnpm 11; it lives in `pnpm-workspace.yaml` or `.npmrc`.
- Confirm that the root scripts, the husky hook and the CI workflow all run without a terminal.
- Don't weaken what the check protects: a stale install should still be reported clearly.

## 1. Three stages per municipality, two dates

The plan describes three dates. Go-live is already a fact the system has: switching a municipality to LIVE (Phase 1). So add only two optional dates to `Municipality`:

- **awareness start**
- **card required from** (the deadline)

That gives each LIVE municipality its stage at any moment:

| Stage | When | A vehicle without a card |
|---|---|---|
| Grace | before awareness start, or when no dates are set | typed-plate fill-up allowed |
| Awareness | awareness start ≤ now < deadline | allowed, and the confirmation screen shows the awareness message |
| Card required | now ≥ deadline | refused; supervisor emergency override only |

Rules for the dates:

- **Libya time.** Dates are calendar days in `Africa/Tripoli`. A stage begins at 00:00 Tripoli time on its date. Test the exact boundary, one minute before and after midnight.
- **Both optional.** No deadline set means grace indefinitely. Admin screens show a clear warning when a LIVE municipality has no deadline.
- **Validation:** awareness start must be before the deadline.
- **Admin screen:** on the municipalities admin page, show the current stage.
  - Setting or moving a date is audited with old and new values.
  - Moving the deadline to today or earlier (enforcement starts immediately) needs the same strong confirmation as live → preparing: typing the municipality's name.
- **Stage computed server-side** from the municipality stamped on the fill-up. The UI only displays what the API returns.
- **Seed:** leave Sabha's dates empty, so dev runs in grace. The client hasn't given the real dates yet.

## 2. One plate normalizer — needed before anything counts by plate

There is no plate normalization today. `Vehicle.currentPlate` is a raw unique string, so `8-1234567`, `8 1234567` and `٨-١٢٣٤٥٦٧` are three different vehicles to the system. Typed-plate fill-ups would make that a hole: change one character and the weekly limit restarts.

- Write **one** normalizer shared by the API and web: Arabic-Indic digits → Western digits, and strip spaces, dashes and other separators. Choose the canonical form and log it in `OPEN_ITEMS.md`.
- Use it everywhere a plate is matched: registry search, the registration duplicate check, the fill-up plate lookup, and the typed-plate counting below.
- Store a normalized plate alongside the plate exactly as it was entered. Never overwrite what was typed.
- **Existing data:** report how many existing vehicles would collide once normalized. **Don't merge or change any**; just list them for me.

## 3. Fill-ups for a vehicle without a card

On the fill-up screen the employee types a plate, through the small "type the plate" link from Phase 3. Then:

1. **Plate matches a registered vehicle** → the normal flow: the confirmation view, then a fill-up against that vehicle.
   - During grace and awareness this is allowed whether or not the vehicle has a card.
   - **From the deadline:** allowed only if the vehicle has an **active card** (the damaged-QR case; the plate is printed on the card). A registered vehicle with no active card is treated like an unregistered one: refused, override only.
2. **Plate not registered**, during grace or awareness → a fill-up recorded as «مركبة غير مسجلة» against the normalized plate.
   - The confirmation view shows the plate very large and says it is unregistered. The employee still taps one big button to confirm.
   - **Limits still apply, counted by normalized plate, per municipality:** the minimum gap and the weekly cap, with the same settings and the same rule engine. Owner-level rules can't apply because there's no owner; say so in the rule result, don't silently skip them.
   - `GET /fillups/rule-preview` must give the same answer as the real submit, as in Phase 1.
   - The existing exception and standing-exception flows behave as they do for registered vehicles wherever they still make sense. Note any that can't apply.
3. **From the deadline**, an unregistered plate or a registered one with no active card → refused, with a clear Arabic message and the list of active registration stations in that municipality (name, address, working hours).

**Record how every fill-up identified its vehicle:** card scan, typed plate of a registered vehicle, typed unregistered plate, or emergency override. Phase 4b's reports and the deadline-readiness numbers depend on it. Backfill existing rows as best you can and say how.

**Data model.** `FillUpTransaction.vehicleId` is required today. The model needs to allow a fill-up with no vehicle but a plate. Relaxing a NOT NULL is acceptable under the additive rule; dropping or rewriting data is not. Enforce in the database that every fill-up has either a vehicle or a typed plate. Add an index serving the by-plate-per-municipality history query.

**Every place that assumes a fill-up has a vehicle must be checked:** reports, the CSV/PDF exports, the fill-up list and detail screens, the audit views and the vehicle history. List what you changed.

## 4. Linking grace fill-ups when the vehicle registers

When a registration employee registers a vehicle whose normalized plate matches earlier unregistered fill-ups, attach those fill-ups to the new vehicle **in the same transaction**. Its history and its limits then continue without a gap.

- Keep the typed plate and the "identified by" value on each linked row unchanged. Only the vehicle link is added. The stamped municipality stays as it is.
- Audit the linking, with the count.
- The registration screen shows "X earlier fill-ups were found for this plate and linked."
- If a plate change on an existing vehicle later matches unregistered fill-ups, don't auto-link. Log it in `OPEN_ITEMS.md` as a question for me.

## 5. The awareness message

During the **awareness** stage, after every fill-up recorded **without a card scan** (typed registered plate or unregistered), the success screen shows:

> ابتداءً من ‹التاريخ› لن تتم تعبئة أي مركبة بدون بطاقة. استلم بطاقتك من أحد مكاتب التسجيل التالية:

- The message continues with the municipality's **active** registration stations: name, address and working hours.
- Then a visible reminder for the employee: «سلّم السائق نشرة التوعية».
- The date and the list come live from the data, so a station that opens or closes mid-month is right on the next fill-up.
- Write the date in Arabic, in the same format the rest of the app uses.

## 6. The posted "registration stations" sheet

An A4 PDF that each petrol station prints and posts at the pump, generated from live data. It shows:

- the municipality, and the deadline if one is set;
- every active registration station with address, working hours and contact phone;
- the print date, so an old sheet is recognizable.

Station supervisors and admins can print it. Reuse the Chromium renderer and the bundled Cairo font from Phase 3; nothing is fetched at runtime. Black-and-white friendly, because stations will print it on ordinary office printers.

## 7. Emergency override — from the deadline on

A station supervisor can authorize **one** fill-up for a vehicle that would be refused for having no card: an ambulance, an official convoy, a genuine emergency.

- **New permission**, held by `station_supervisor`, `directorate_admin` and `system_admin` only. Never by a station employee, never by a registration role.
- A written reason is required. Reuse the existing `emergency` exception type if it fits, otherwise explain why not.
- The override waives **only the card requirement**. The gap and weekly limits still apply, and the existing exception flow still covers those.
- It's identified as "emergency override", flagged as an exception in reports, and audited with who, when, the plate and the reason.
- Server-side only: the API refuses an override from anyone without the permission, whatever the UI shows.
- If the supervisor isn't physically at the pump, they record it from their own phone, logged in as themselves. No shared logins, and no "supervisor PIN typed on the employee's phone". Note this in `OPEN_ITEMS.md` as a decision.

## Keep unchanged

- The Phase 1 rules: the station's municipality decides the allowance, and a station in a PREPARING municipality is refused.
- The Phase 3 card outcomes: a replaced or cancelled card is refused, an unknown code gets its own message, and "needs reissue" still allows the fill-up with a notice.
- The separation of roles: registration roles never record fill-ups.

## Not in this phase

Monitoring reports for registration stations, card-stock reconciliation, the deadline-readiness report, supervisors managing their employees' accounts (all Phase 4b); the printed flyer (designed separately in Claude Design); removing non-Sabha data and test data (Phase 5).

## Close-out

Same as every round: lint, typecheck and the full test suite green (unit, API end-to-end, Playwright), with both scoping boundary tests passing. **Run them through the root scripts this time**, to prove item 0 works.

Add tests for:

- every stage boundary at Tripoli midnight, including no dates set;
- the plate normalizer: Arabic-Indic digits, separators and spaces;
- the limits counted by normalized plate per municipality, including the same car typed two different ways;
- linking on registration;
- each of the three typed-plate outcomes after the deadline;
- the override's permission: an employee and a registration role are both refused;
- rule-preview matching the submit for an unregistered plate.

**Browser pass, after re-seeding:**

1. In grace, record a fill-up for an unregistered plate, then try it again too soon, typed differently: it must be blocked.
2. Register that vehicle and confirm the earlier fill-up is linked.
3. Set awareness start to today and check the message and the list.
4. Set the deadline to today (with the name confirmation) and confirm an unregistered plate is refused.
5. Do the same fill-up as a station supervisor through the override.
6. Print the A4 sheet.
7. Put the dates back afterwards.

Then:

- update the phase table in `docs/REGISTRATION_PIVOT_PLAN.md` (4a built on `feat/p4a-grace-period`; 4b next);
- log your decisions in `OPEN_ITEMS.md` as #56;
- report every migration in order, confirming each is additive;
- record any test passwords you changed.

**Stop before committing so I can review.** Don't commit or push until I approve. When you do, never force-push.
