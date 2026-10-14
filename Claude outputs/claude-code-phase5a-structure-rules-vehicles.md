Phase 5A: municipalities as the core, the final user structure, fill-up rule switches, owners (with national-ID checks and institutions), vehicle fields, and a full field-validation audit. The client gave final requirements, and this is the first of three closing phases (5A → 5B → 5C). **Build only what's listed here.**

Start a new branch `feat/p5a-structure` from `main` **after Phase 4c is merged**. If `main` doesn't contain the 4c merge, stop and tell me.

Use the impeccable skill for every UI change, and follow `apps/web/PRODUCT.md` and `apps/web/DESIGN.md`. Permissions stay data (rows in `rbac-catalog.ts`), never role-name checks. All migrations stay additive (CLAUDE.md rule 11). All error messages are **clear Arabic**, next to the field.

## 1. Municipalities become the core of the system

**The principle:** each level owns its own work, and nobody above them has to do it for them. The super admin only creates municipalities and their managers. Everything inside a municipality is run by its managers, and everything inside a station by that station's own manager or supervisor.

**The roles** (Arabic labels as shown; reuse existing internal keys where possible, and explain what you chose):

| Role | Scope | Owns |
|---|---|---|
| **المدير العام للنظام** (`system_admin`) | everything | creates, edits and archives **municipalities**, and creates **municipality managers** assigned to one municipality. Can create, edit and archive any other user too, but that isn't their job and the UI doesn't push it on them |
| **مدير البلدية** (today's `directorate_admin`, now scoped to one municipality) | one municipality | full control of their municipality: create, edit and **archive** its **petrol stations** and **registration offices**; create, edit and archive **station supervisors** and **registration office managers**, and their permissions; sees everything in the municipality (registration, fill-ups, quantities, vehicles, reports); sets the stage dates |
| **مدير مكتب التسجيل** (today's `registration_supervisor`, renamed and extended) | their registration office(s) | creates, edits and archives **registration employees** for their office; controls the office (desks and printers, card stock); full view of their employees' activity; approves corrections and card cancellations as today |
| **موظف تسجيل** (`registration_employee`) | their office(s) | registers owners and vehicles, issues and prints cards |
| **مشرف محطة** (`station_supervisor`) | their station(s) | creates, edits and archives **station employees** for their station; controls the station (the fuel types it sells; the storage per fuel type, built in 5B); full view of their employees' activity |
| **موظف محطة** (`station_employee`) | one station | records fill-ups only: by card scan, or by typed plate where 4a allows it |

**Rules for every level:**

- **Each level can only create the level directly below it,** inside its own scope:
  - super admin → municipality managers;
  - municipality manager → supervisors and office managers in their municipality;
  - supervisor or office manager → their employees.
- **Enforced in the API,** with boundary e2e tests for every level, including "can't create a level above or beside themselves" and "can't reach another municipality or station".
- **Nobody below the super admin grants extra individual permissions.** Except: a municipality manager may adjust the permissions of the supervisors and office managers in their municipality, **within** the set those roles are allowed to have.
- **"Delete" means archive** for municipalities, stations, offices and users. Their history (fill-ups, cards, audit) must stay. Archived items disappear from daily screens, stay visible under an "archived" filter, and can be restored by the level that archived them.
- Municipality scope: a user-to-municipality scope, mirroring the station scopes. Every read and write of a municipality manager is limited to their municipality.

**Each municipality gets its security directorate automatically.**

- When a municipality is created, the system creates its security authority automatically, named «مديرية أمن ‹اسم البلدية›». The name is editable by the super admin.
- **Remove the «الجهات الأمنية» admin section** entirely. The card header keeps reading the municipality's authority, as built in Phase 3.
- Existing data: سبها keeps «مديرية أمن سبها».

**Where management lives: no separate "users" section any more.**

- **Super admin → «إدارة البلديات»** in settings. A list of municipalities with search, filters (status) and sorting. Opening one shows everything about it: its stations and offices, its people (by role), its stage and dates, and its activity. Creating a municipality manager happens here, already assigned to that municipality. Status preparing/live stays with the super admin.
- **Municipality manager → «إدارة المحطات»**. All petrol stations and registration offices of their municipality in one place, with search, filters (type, company, status, locality) and sorting. Opening a station or office shows its details, its people (create, edit, archive the supervisor or office manager, plus their permissions) and its activity. Users are managed from inside the station they belong to, never from a free-floating users list.
- **Station supervisor → «محطتي»**, and **office manager → «مكتبي»**. Their station or office: its employees (create, edit, archive, reset password, unlock), their activity, and the station's own controls (fuel types and storage from 5B; desks, printers and card stock for offices).
- **Reuse the 4b users components** (list, person page, create flow, one-time password panel) inside these places. Don't rebuild them. Remove the standalone «الحسابات» admin tab and the `/staff` page, and redirect them to the right new place for each role.
- Every list has **search, filters and sortable columns**, and lets the person act directly from the row.

**Seed:**

- `sysadmin1` (super admin);
- `admin1` and `admin2` (municipality managers for سبها);
- `supervisor1` (station);
- `regsupervisor1`, renamed to stay compatible with existing tests or aliased (registration office manager);
- the employees as today.

Record any renames in your report.

## 2. Fill-up rules: each one can be switched on or off

- Every rule the rule engine applies can be switched on or off: vehicle minimum gap, vehicle weekly count, owner minimum gap, owner weekly count, **owner liters**, and any others.
- **Defaults:** all **on**, except **owner liters, which is off**. Existing databases get the same defaults without overwriting a value an admin already set.
- **Only the super admin** switches rules, in settings, with clear switches (the switch style is defined in 5B; a plain accessible switch is fine now). Every change is audited.
- The rule engine skips a switched-off rule completely, in both the submit and `GET /fillups/rule-preview`. Tests for each switch, plus one proving preview = submit.

## 3. Owners: national ID checks, administrative numbers, institutions

**Remove the provisional "driver's license" owner path** (`OWNER_IDENTITY_PROVISIONAL`) from registration, the API and the UI. Report how many provisional owners exist in the dev DB, and don't delete them (5C clears test data).

**National ID (الرقم الوطني): 12 digits, checked strictly.** The client gave the structure:

- **Digit 1:** `1` (male) or `2` (female). Anything else → «الرقم الوطني يجب أن يبدأ بالرقم 1 (ذكر) أو 2 (أنثى).»
- **Digits 2–5:** the birth year. It must be a real year, no earlier than 1900 and not in the future → «سنة الميلاد في الرقم الوطني (‹السنة›) غير صحيحة.»
- **Owner must be 18 or older:** reject when the birth year is later than (current Tripoli year − 18) → «صاحب هذا الرقم الوطني عمره أقل من 18 سنة، ولا يمكن تسجيله مالكًا لمركبة.» With only the birth year known, someone born in (current year − 18) is accepted. Note that edge in OPEN_ITEMS.
- **Digits 6–11:** the registry sequence. Digits only, no further check.
- **Digit 12:** a check digit. **Don't invent a checking formula.** Accept any digit for now, and log in OPEN_ITEMS that the official formula is needed from the civil registry to validate it.
- **Exactly 12 digits,** Arabic-Indic digits converted automatically, and a clear message for wrong length → «الرقم الوطني يجب أن يتكوّن من 12 رقمًا.»
- Show the rule as live help under the field («يبدأ بـ 1 أو 2، ثم سنة الميلاد…»), and show each error the moment it applies.
- **The same check in the API and the web,** from `packages/shared-types`, with unit tests for every rule and edge (17 vs 18 years, 1899, future year, digit 3, wrong length).
- Mention in your report that these checks stop typing mistakes and obvious fakes. Only the civil registry can confirm a number is real.

**Administrative number (الرقم الإداري):** 12 digits starting with 9, as today.

**Institution-owned vehicles** (banks, hospitals, companies). The client's decision for now:

- When registering an owner, choose **فرد** (individual) or **جهة / مؤسسة** (institution).
- An **institution** has: the institution's name (shown as the owner's name everywhere), and the **national ID of the responsible driver**, checked with all the rules above, including 18+. Optional: the driver's name and phone.
- Duplicate checks: the same institution name shouldn't be created twice. Suggest the existing one while typing.
- **Owner-level fill-up rules must not lump an institution's vehicles together.** An institution with 20 cars would otherwise hit the owner weekly limit at once. For institution owners, apply only the vehicle-level rules, and say so in the rule result. Test it.
- Log in OPEN_ITEMS that a fuller institutional model (registration number, several drivers) is waiting on the client.

## 4. Vehicle fields

**Required:** plate, chassis number, booklet number, make, model, colour, manufacturing year, and the new fuel type. Report every vehicle field and whether it's required.

- **Vehicle fuel type** (بنزين / ديزل), new and required. At the pump, warn clearly if the chosen fuel doesn't match the vehicle's fuel type (don't block it). The warning is recorded so supervisors can see mismatches in reports.
- **Make and model stay free text,** typed exactly as written in the vehicle's booklet. No lists.
- **Colour:** a list of common colours (ابيض, رصاصي, اسود, ازرق, اخضر, ذهبي, احمر, سماوي, رمادي, بني, سحابي, عنابي, بيج, فضي, اصفر, برتقالي) plus «أخرى» with text.
- **Chassis number:** 17 characters is the norm, upper-cased automatically. 6–20 characters only when the employee ticks **«رقم هيكل غير قياسي»** (19% of real vehicles in the old southern system aren't 17 characters). The tick is recorded and shown. The duplicate check stays strict, with a message naming the existing vehicle.
- **Plate:**
  - support an optional trailing **N** (12% of real plates, e.g. `5-1234567N`) as **part of the plate identity**, so `5-123456N` ≠ `5-123456`;
  - this applies in registration, the pump's typed plate (two digit groups plus an N toggle), the normaliser, search and duplicate checks;
  - don't build the three-part form (`5-25-123456`). Log it as an open client question.
- **Manufacturing year:** 4 digits, from 1950 to next year.
- **No stolen/wanted flag** (the client doesn't want it). No import of the old system's vehicles.

## 5. Field-validation audit, every form in the app

Go through **every input** (municipalities, stations, offices, desks, users, owners, institutions, vehicles, fill-ups, exceptions, settings, card stock). Check and fix:

- **Format:** Libyan mobile `09[1-6]` + 7 digits, with `+218` accepted and normalised; national ID as above; administrative number; plate, chassis and booklet; liters and amounts positive with sensible maximums; dates not in the future where that makes no sense; names in Arabic letters where a name is expected.
- **Required vs optional,** matching the real data and the client's rules.
- **The same rule in the API and the web.** Move the hand-duplicated regexes (`libyanFormats.ts` vs `libyan-formats.ts`) into `packages/shared-types`.
- **Field order** in each form follows how a person actually fills it in: owner before vehicle, identity before details.
- **Clear Arabic error messages** using the shared error pattern from 4b.

Deliver the audit as a table in your report (form, field, rule before, rule after).

## Close-out

- Lint, typecheck and the full suite through the root scripts, all boundary tests passing.
- **New tests:**
  - each level can create only the level below it, inside its scope;
  - archive and restore keep history;
  - the auto-created security directorate;
  - the municipality-manager scope boundary;
  - each rule switch, and preview = submit;
  - the provisional path is gone;
  - every national-ID rule;
  - institution owners and the owner-rule exemption;
  - N plates stay distinct;
  - non-standard chassis only with the tick;
  - the fuel-mismatch warning;
  - the shared validators are used by both the API and the web.
- **Browser pass with screenshots** (desktop + 390px):
  - `sysadmin1` creating a municipality (and seeing its directorate created) and a municipality manager;
  - `admin1` in «إدارة المحطات» creating a station, its supervisor and an office manager, then archiving and restoring a station;
  - `supervisor1` creating an employee in «محطتي»;
  - an office manager creating a registration employee;
  - registration with each national-ID error shown in Arabic, and an institution owner;
  - the rule switches.
- Update the phase table in `docs/REGISTRATION_PIVOT_PLAN.md` (4c merged, 5A built, 5B next). Log decisions as OPEN_ITEMS #59. List migrations in order, confirming each is additive. Record any test passwords or account renames.
- **Stop before committing so I can review.** Never force-push.
