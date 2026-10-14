Phase 1 of the registration pivot: the municipality foundation. Background for the whole pivot is in `docs/REGISTRATION_PIVOT_PLAN.md` — read it first, but **build only what's listed here** this session. Everything below was checked against the current code; where I'm stating intent rather than exact code, the implementation approach is yours.

## Why this comes first

Sabha is going live with real data, and other municipalities will join the live system later without touching Sabha's data. Fill-up limits must be counted **per vehicle per municipality**: a car that fills up in Sabha on Saturday morning and drives to another municipality that afternoon draws on that municipality's separate allowance. Building this **before** go-live means no real data ever needs migrating. It doesn't depend on any open client question, so it's safe to do now.

## 1. One security authority per municipality

Client confirmed: every municipality has exactly one security authority, which oversees that municipality's petrol stations.

- Today `SecurityAuthority` is a free-standing list, and `Station.securityAuthorityId` is picked by hand per station (nullable; `OPEN_ITEMS.md` #4). Tie each authority to exactly one municipality, and let a station's authority come from its municipality instead of being chosen per station. Remove the manual authority picker from the station form.
- Keep the migration additive, per `CLAUDE.md`. Backfill: مديرية أمن سبها → سبها.
- Update the schema comment that lists الحرس البلدي and الجمارك as example authorities — it reflects an assumption the client has now replaced. Mark `OPEN_ITEMS.md` #4 as answered, with the date.

## 2. Municipality status: preparing vs. live

`Municipality` has `isActive` today. Replace or extend it so a municipality is either **preparing** (being set up — visible only on admin screens) or **live**.

- A preparing municipality's stations don't appear anywhere outside admin screens, and no fill-up can be recorded at them.
- Seed and bootstrap: سبها is live. Leave the other municipality rows as they are for now — removing non-Sabha data is a later phase, and it's waiting on the client's list of which place names belong to Sabha.

## 3. Stamp every fill-up with its municipality

- Add a municipality reference to `FillUpTransaction`, set at creation from the station's municipality, and **never updated afterward**. It must not be looked up live from the station at rule time. If an admin later corrects a station's municipality, past fill-ups have to keep the municipality they actually happened in.
- `Station.municipalityId` is nullable. Recording a fill-up at a station with no municipality must fail with a clear Arabic message, not stamp null.
- Backfill existing fill-ups (test data) from their station's municipality.
- Add an index that serves the rule engine's per-vehicle-per-municipality history query, alongside the existing `@@index([vehicleId, occurredAt])`.

## 4. Rule engine counts per municipality

- Every history lookup in `fillups.repository.ts` that feeds `FillUpRuleEngine` — vehicle gap, vehicle cap, owner gap, owner cap, owner liters — must count only fill-ups in the **same municipality as the one being recorded**. `GET /fillups/rule-preview` must give the same answer as the real submit.
- The numbers stay system-wide from `SystemSetting`. Don't build per-municipality overrides yet — that's an open client question.
- Standing exceptions are unchanged.
- Write the unit tests **before** wiring anything, per `CLAUDE.md`:
  - A fill-up in municipality A, then B the same day → allowed.
  - A second fill-up back in A too soon → blocked by the gap rule.
  - The weekly cap counts A and B separately.
  - The owner-level rules are split the same way.
  - With only one municipality, results are identical to today's behavior.

## Not in this phase

Registration stations, the new roles, removing vehicle creation from the fill-up wizard, the card, printing, the grace period, and removing non-Sabha data. Those are later phases, each with its own prompt.

## Close-out

Same as every round: lint, typecheck, full test suite green, and the station-scoping boundary test passing. Report the migrations you added, in order, and confirm each is additive.
