Phase 2 of the registration pivot: the two new roles, registration stations, and the registration screen. Background is in `docs/REGISTRATION_PIVOT_PLAN.md` — sections 3 and 4 above all. **Build only what's listed here** this session. Everything below was checked against the current code; where I state intent rather than exact code, the implementation approach is yours.

## Why

The client moved vehicle registration off the petrol stations. Station employees aren't equipped for multi-step data entry, so registration now happens only at police-station **registration stations**, done by trained **registration employees**. The two jobs must never overlap. That's the client's requirement, and it's also the main fraud protection: the person who creates a vehicle's identity is never the person who records its fuel.

## 1. Roles and permissions (`apps/api/prisma/rbac-catalog.ts`)

**Two new roles:**
- **`registration_employee`:** look up the vehicle and owner registry, register vehicles and owners, request corrections to existing vehicle/owner data. No `fillups:*` permission of any kind.
- **`registration_supervisor`:** everything a registration employee can do, plus approve those corrections (`vehicles:approve_change`, `owners:approve_change`) and reveal owner identity numbers. No `fillups:*`.

**Take registration away from the petrol-station roles:**
- **`station_employee`** loses `vehicles:manage`, `owners:manage`, `vehicles:request_change`, `owners:request_change`. It keeps `vehicles:read`, because the fill-up lookup needs it.
- **`station_supervisor`** loses `vehicles:manage`, `owners:manage`, and the vehicle/owner request and approve permissions. It keeps everything on the fill-up side: fill-ups, exception approval, standing exceptions, reports.
- **`directorate_admin`** and **`system_admin`** keep everything.

**Separation rule, enforced server-side:** one user can't hold a petrol-station role and a registration role at the same time. Assigning the second must be refused with a clear message, and that refusal needs an end-to-end test.

**Only add permissions this phase actually uses.** Card and printing permissions belong to Phase 3. `OPEN_ITEMS.md` #45(a) is the lesson here: a permission seeded but never checked (`fillups:update`) becomes a trap for later.

**Critical — make the permission lists sync, not just add.** `seed.ts` (around line 938) and `bootstrap-prod.ts` (around line 68) only *upsert* role permissions. They never remove one. So taking `vehicles:manage` off `station_employee` in the catalog would leave it granted in any database that already exists — including production after go-live. Make both scripts remove role-permission rows that are no longer in the catalog, log what they removed, and cover it with a test. Per-user grants (`UserPermission`) are separate and must be left alone.

## 2. Registration stations

A new entity, managed by `directorate_admin` and `system_admin`. Fields per plan §4:
- Name.
- Official code (optional).
- Auto-generated internal code, same pattern as petrol stations.
- Municipality (required).
- Address.
- Latitude and longitude (optional).
- Contact phone.
- Working hours (free text).
- Status: active / temporarily closed / closed, plus a status note.

- **No authority field.** The authority comes from the municipality, as built in Phase 1.
- **No desks or printers yet.** That's Phase 3.

**Scoping, mirroring `UserStationScope`:** a user-to-registration-station scope table. Registration employees and supervisors are scoped to one or more registration stations. Every registration action records **which registration station** and **which user** did it, enforced server-side per `CLAUDE.md` rule 3, with a boundary end-to-end test like the petrol-station one.

**Registration is refused** at a registration station that is closed or temporarily closed, or whose municipality is still preparing. Same pattern as Phase 1: the API returns a code, and the UI turns it into Arabic.

**Record the origin on the vehicle:** `registeredAtRegistrationStationId` and `registeredById`, nullable for vehicles that already exist. The monitoring reports in Phase 4 depend on these.

## 3. The registration screen

Build the registration employee's screen from the existing create flow on `VehiclesListPage` (`VehicleCreateForm`). It's their main workspace, so it should be a proper page, not a small inline form.

- **Find the owner first:** search by identity type and number. Pick the existing owner, or create a new one.
- **Then the vehicle:** all the fields the registry holds (plate, chassis, booklet, type and brand, model, color, year, usage).
- **Duplicate checks before saving**, on plate, chassis and booklet, each with a clear message saying which field clashes and which existing vehicle it belongs to.
- A registration employee scoped to more than one registration station picks which one they're working at. With exactly one, it's filled in.

**Leave the driver's-license "provisional owner" path (round 11, `OWNER_IDENTITY_PROVISIONAL`) exactly as it is.** Whether registration desks still allow it depends on an open client question: which documents an owner must bring.

## 4. Take registration and WhatsApp off the petrol-station side

- Remove `VehicleCreateForm` from `RecordFillUpPage`, including its `onCreated` / `onDuplicateFound` wiring and the "just created this transaction" state that feeds the success screen. Then remove the "لا توجد نتائج — إضافة مركبة جديدة" option from `VehicleSearchSelect`.
- When a plate isn't found, the fill-up screen says the vehicle isn't registered and must be registered at a registration station, with no way to create it. The staged grace-period behavior comes in Phase 4, so for now it's simply "not registered."
- Remove the QR block from the fill-up success screen.
- Remove WhatsApp sharing completely: `lib/share.ts`, the share buttons, and the phone-number prompt in `VehicleQrPanel`. Keep the QR itself displayed on the vehicle page as it is today. Phase 3 replaces that panel with the card panel.
- Keep `QrScanPanel` exactly as it is. Phase 3 changes what it looks up.

## 5. Admin screens left over from Phase 1

- **Municipalities:** list with status, and switching preparing → live. Live requires an authority, as built in Phase 1. Switching **live → preparing** must demand a strong confirmation: typing the municipality's name. It instantly stops every fill-up there.
- **Security authorities:** create, edit, and link one to a municipality, using the existing endpoints.
- Add a one-line "no longer used — see Phase 1" schema comment on `Station.securityAuthorityId` and on `Municipality.isActive`.

## Not in this phase

Cards, card numbers, printing, desks and printers, the grace period and awareness month, monitoring reports, supervisors managing their own employees' accounts (Phase 4), and removing non-Sabha data (Phase 5).

## Close-out

Same as every round: lint, typecheck, and the full test suite green, including the **web** Playwright suite in `apps/web/e2e`, not only the API end-to-end tests. Both scoping boundary tests must pass: petrol stations, and the new one for registration stations.

Then a real browser pass. Re-seed first, and note any changed test passwords in your report rather than skipping the check.
1. A registration employee registers a new owner and vehicle.
2. A duplicate plate is caught.
3. A station employee has no way to create a vehicle anywhere, and gets the "not registered" message for an unknown plate.
4. The permission sync removes `vehicles:manage` from `station_employee` in an already-seeded database.

Report every migration in order, and confirm each is additive.
