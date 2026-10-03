# Design: owner-based fill-up identity (round 6 item 1)

Status: **confirmed and implemented (2026-09-01).** Client decisions: (1) Driver is dropped from
the fill-up flow entirely — no driver field on the transaction, and the whole Driver list/detail/
create UI and permission set are removed since nothing uses them anymore (resolves "What happens
to Driver" below as option (a)). (2) OPEN_ITEMS #20 becomes a per-owner aggregate liters cap —
summed across every vehicle the same owner has, replacing the per-driver version. Both are reflected
in the schema, rule engine, and frontend as of this pass; see "Sequencing if confirmed" below for
what actually shipped.

## The ask

Client, verbatim: *"we do not need the driver's information, we only need to make sure that the
vehicle belongs to a Libyan person... the system needs to have a vehicle card that is linked to an
owner and then the restrictions will become either in the vehicle or the owner."*

Confirmed against the current codebase (not assumed):

- `VehicleOwner` already exists as its own model (`apps/api/prisma/schema.prisma:197`), already
  `@relation`'d from `Vehicle.ownerId` (`schema.prisma:229`). It currently has `fullName`,
  `nationalId` (untyped — no `identityType`/`identityNumber` split), `phone`, `address`.
- `Driver` is a separate model, required on every `FillUpTransaction` (`driverId String` — not
  nullable, `schema.prisma:338-339`).
- Three `RuleFailureReason` values are driver-scoped today, evaluated by `driverId` in
  `FillUpRuleEngine.evaluate()` (`apps/api/src/fillups/rule-engine/fill-up-rule-engine.ts:90-102`):
  `DRIVER_GAP_TOO_SHORT`, `DRIVER_WEEKLY_CAP_REACHED`, `LITERS_PER_PERSON_CAP_REACHED`.
- `StandingException` has independent nullable `driverId`/`vehicleId` (`schema.prisma:381-384`) —
  the driver/vehicle/both scope picker in the exceptions UI is built directly on that nullability.
- `RecordFillUpPage.tsx` requires `driverId` on the fill-up form, with `DriverSearchSelect` +
  inline `DriverCreateForm`, gated on `drivers:create`.
- `docs/OPEN_ITEMS.md` #19 (standing-exception scope model) and #20
  (`fillup.max_liters_per_week_per_driver`) are both already flagged pending for unrelated reasons —
  this proposal would resolve both differently than either item currently assumes.

This is a real identity-model change, not a rename: today the system tracks *who filled up*
(driver); the ask is to track *who owns the vehicle* (owner) and stop caring who was driving.

## Proposed data model changes

1. **`VehicleOwner` gains `identityType`/`identityNumber`**, mirroring `Driver`'s existing shape:
   ```prisma
   model VehicleOwner {
     id             String       @id @default(cuid())
     identityType   IdentityType
     identityNumber String
     fullName       String
     phone          String?
     address        String?
     vehicles       Vehicle[]
     ...
     @@unique([identityType, identityNumber])
   }
   ```
   Replaces the current untyped `nationalId String?` — additive column-wise (new columns,
   backfill/deprecate `nationalId` rather than drop it immediately, per CLAUDE.md's
   additive-migration preference). Matches the screenshots' owner-data step exactly (نوع الملكية /
   الجهة المالكة / رقم هوية المالك).

2. **`FillUpTransaction.driverId` becomes nullable**, not deleted. Historical fill-ups keep their
   driver attribution; new ones stop requiring it. Dropping the column outright would be
   destructive and would also erase the historical record CLAUDE.md's audit-trail rules imply we
   should keep.

3. **Rule engine re-scopes to `(vehicleId, ownerId)` instead of `(vehicleId, driverId)`.**
   `evaluate()`'s signature changes from `(vehicleId, driverId, occurredAt)` to
   `(vehicleId, ownerId, occurredAt)`; `getRecentForDriver` becomes `getRecentForOwner`, querying
   across all vehicles that share that `ownerId` (mirroring how it currently queries across all
   vehicles a `driverId` is linked to via `DriverVehicle`).

4. **Rename, don't just repoint, the three driver-scoped `RuleFailureReason` values** —
   `DRIVER_GAP_TOO_SHORT` → `OWNER_GAP_TOO_SHORT`, `DRIVER_WEEKLY_CAP_REACHED` →
   `OWNER_WEEKLY_CAP_REACHED`, `LITERS_PER_PERSON_CAP_REACHED` stays (already owner/person-neutral
   wording) but its aggregation key changes from driver to owner. A silent repoint (same enum
   value, different meaning) would be a landmine for anyone reading old `AuditLog`/`Exception`
   rows later.

5. **`StandingException.driverId` → `StandingException.ownerId`.** Same nullable-pair pattern
   (`ownerId`/`vehicleId`, both nullable, at-least-one-set), so the "owner only / vehicle only /
   both" scope selector in the UI needs no structural change — just relabeling.

6. **`DriverVehicle` join table and `Driver` model survive as-is.** Nothing here requires deleting
   driver data or breaking the model — it just stops being wired into the fill-up transaction and
   the rule engine. See "What happens to Driver" below for the UI-level decision this implies.

## What happens to `Driver` — confirmed: (a)

**Client confirmed (a):** Driver is fully vestigial. `features/drivers/*` (list/detail/create
pages), the `DriversModule` backend (controller/service/DTOs), and the `drivers:manage`/
`drivers:create`/`drivers:read`/`drivers:reveal_identity` permissions are all removed — not hidden,
not read-only, deleted. `Driver` and `DriverVehicle` remain in the schema only so historical
`FillUpTransaction`/`DriverVehicle` rows recorded before this change keep their driver attribution;
nothing writes to them going forward.

## StandingException and the two already-open items this touches — confirmed

- **OPEN_ITEMS #19** (standing-exception scope model): confirmed owner-scoped.
  `StandingException.driverId` is now `ownerId` (FK to `VehicleOwner`); the grant-form scope
  selector is "owner + vehicle / owner only / vehicle only" instead of driver-based.
- **OPEN_ITEMS #20** (`fillup.max_liters_per_week_per_driver`): confirmed as a per-owner aggregate
  cap, summed across every vehicle the same owner has — same aggregate reading the placeholder
  setting already used, just re-keyed to owner. Setting renamed to
  `fillup.max_liters_per_week_per_owner`; `fillup.max_per_week_per_driver`/`min_gap_days_per_driver`
  renamed to `..._per_owner` the same way, since they're the same owner-scoped check family.

## Frontend flow — what shipped this pass

- `RecordFillUpPage.tsx`: the `driverId` field, `DriverSearchSelect`, inline `DriverCreateForm`,
  and the `drivers:create` gate are gone from the fill-up form — not hidden, removed, so there's no
  stale hidden-but-validated field silently blocking submissions. The confirmation screen shows the
  vehicle's owner instead of a driver.
- `VehicleDetailPage.tsx`/`VehiclePreviewCard.tsx`/`DailyReportPage.tsx`/`ViolationsPage.tsx`: all
  driver display surfaces now show the vehicle's owner (masked identity number, same rule as
  before) instead. The "drivers" tab on the vehicle detail page is removed.
- **Not built this pass** (out of scope — item 1 was the schema/rule-engine confirmation, not item
  3's flow redesign): the rule-review screen showing each rule individually with its actual
  numbers, the new-vehicle owner-data step (ownership type / owning authority / owner ID number)
  with its own boxed-input UI, and an owner-search filter to replace the removed driver filter on
  the daily report. These remain tracked under item 3 (OPEN_ITEMS #31).

## Sequencing — what shipped this pass

1. Migration `20260901000000_m6_owner_based_fillups`: added `VehicleOwner.identityType`/
   `identityNumber` (backfilled from `nationalId`, which was then dropped), made
   `FillUpTransaction.driverId` nullable, re-pointed `StandingException.driverId` → `ownerId`
   (FK now `VehicleOwner`, not `Driver`).
2. Rule engine: `FillUpRuleEngine.evaluate()` takes `ownerId` (nullable) instead of `driverId`;
   `OWNER_GAP_TOO_SHORT`/`OWNER_WEEKLY_CAP_REACHED` replace the `DRIVER_*` reasons; owner-scoped
   checks are skipped entirely when a vehicle has no owner set. No dual-running period was needed
   since the client confirmed the full cutover rather than an incremental one.
3. Backend: `DriversModule` deleted; `vehicles.controller/service` lost the
   `addDriver`/`removeDriver` endpoints; `reports` lost the driver-history endpoint and gained an
   `ownerId` daily-report filter; `owners.controller/service` gained
   `identityType`/`identityNumber` (mirroring `Driver`'s shape) and a `reveal-identity` endpoint
   (`owners:reveal_identity` permission, replacing `drivers:reveal_identity`).
4. Frontend: `features/drivers/*` deleted; nav/routes/quick-links cleaned up; `RecordFillUpPage`,
   `StandingExceptionsSection`, and the reports pages re-scoped to owner as described above.
5. Seed/tests: `seed.ts`'s permission/role/setting rows updated to the new keys; all 5 backend e2e
   spec files and the 2 Playwright specs that touched driver fixtures were rewritten to use
   `VehicleOwner` fixtures instead — full suite green (125 Jest e2e + 19 unit + 5 Playwright).
