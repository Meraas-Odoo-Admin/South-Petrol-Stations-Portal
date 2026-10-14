Phase 4b of the registration pivot: accounts, and a redesigned users screen. Background is in `docs/REGISTRATION_PIVOT_PLAN.md`, sections 3 and 4. **Build only what's listed here** this session. The monitoring reports are Phase 4c, a separate session.

Start a new branch, `feat/p4b-accounts`, from `main` **after** `fix/scan-confirm` has been merged into it. If `main` doesn't contain `fix/scan-confirm` yet, stop and tell me.

## Why

The client tested the admin screens, and the users screen is the weakest part of the system. It's confusing, it looks old, and it's missing basic actions.

What's wrong with it today (checked against the code and a real screenshot):

- **One person can't be edited at all.** There is no API or screen to change a user's name or phone, deactivate them, reactivate them, reset a forgotten password or unlock a locked account. The users controller only has create, list, get, and add/remove roles, permissions and scopes. The "نشط / موقوف" pill is shown but can't be changed.
- **Roles are checkboxes**, as if one person held several jobs. In practice everyone has exactly one.
- **Every station shows as one long checkbox list** (100+ rows), with no search.
- **The wrong side is offered.** A station employee is offered registration-office checkboxes, which the server then refuses (separation rule, Phase 2).
- **"Extra permissions" sit in plain view** as a raw list, for every admin, next to everyday controls.
- **Everything is crammed into a four-column panel** that opens inline under the row.
- **The admin subtitle under «الإدارة» lists «البلديات والجهات الأمنية»** even for users who can't see those tabs.

The goal is a screen built around how an admin actually thinks: **who is this person, what is their job, and where do they work.**

## 0. Design: use the impeccable skill

**Use the impeccable skill for the users screen and the account flows.** If it isn't installed in this environment, stop and tell me before building any UI.

- Stay inside the existing design system: tokens, Cairo, RTL Arabic, the components already in `apps/web/src/components`. This is a better-organized screen in the same product, not a new visual language.
- **It must work at phone width.** Station supervisors will manage their staff from their phones (section 3).
- Show me the layout first. Before wiring anything, put a short written plan of the screens (list, person page, create flow) in your report draft and continue. I review it with the finished result, but write it first so the structure is deliberate.

## 1. The users list

- **Search** by name or username.
- **Filters:** side (fuel / registration / administration), job, station or office, and status.
- **Columns:**
  - name and username;
  - **job** (one role name);
  - **where**: station or office **names**, not codes, with "+2" when there are more;
  - **status**: active, deactivated, locked, or must change password;
  - **last login**.
- Add `User.lastLoginAt` (nullable, additive), set on every successful login. Phase 4c's reports need it too.
- Clicking a person opens **their page or a side panel**, not an inline expansion.

## 2. One person's page

Sections, in this order:

1. **Identity:** full name, username (read-only after creation), phone.
2. **Job and place:**
   - **One job**, picked from a list grouped by side. Changing the job replaces the old role.
   - **Then the place picker for that side only:**
     - petrol stations for fuel jobs;
     - registration offices for registration jobs;
     - nothing for administration jobs, which see everything.
   - The place picker is **searchable** and shows the chosen places as removable chips. Never a wall of 100 checkboxes.
3. **Account:**
   - **Deactivate and reactivate**, with a required reason. Users are never deleted; their history must stay.
   - **Reset password** (see below).
   - **Unlock**, shown only when the account is locked.
4. **Advanced:** extra individual permissions. **Collapsed by default**, with a one-line warning about what it's for, and visible only to holders of `roles:manage`.
5. **Recent activity:** the latest audit-log entries about this person's account.

**Reset password:**

- The system generates a strong temporary password and shows it **once**, with a copy button. It sets `mustChangePassword = true` and clears the lockout.
- The temporary password is never stored in plain text, never written to the audit log, and never sent back by any other endpoint.
- **Deactivating, resetting a password or changing a job ends that user's existing sessions at once** (revoke their refresh tokens). A deactivated employee must be logged out on their phone within the access token's lifetime. Report what that lifetime is.

**One role per person:**

- Enforce it in the API: a "set job" operation replaces the role in one transaction, and the separation rule from Phase 2 still applies.
- Keep the existing role endpoints working for compatibility, but the new screen doesn't use them.
- Report any existing users with more than one role. Don't change them.

## 3. Supervisors manage their own staff

New permission (name it to fit the catalog), granted to `station_supervisor` and `registration_supervisor`.

**A station supervisor can:**

- create `station_employee` accounts;
- edit them, deactivate and reactivate them, reset their passwords and unlock them;
- **only** when every station on that employee is inside the supervisor's own station scope;
- assign them only stations inside the supervisor's own scope.

**A registration supervisor:** the same, for `registration_employee` and registration offices.

**A supervisor can never:**

- create or edit another supervisor or an admin;
- give any job other than their own side's employee job;
- grant extra permissions;
- act on an employee who also works somewhere outside their scope (read-only for them);
- act on their own account here (their own password goes through the normal change-password screen).

All of this is **enforced in the API**, not just hidden in the UI, with an end-to-end boundary test like the station-scoping ones. Supervisors use the same redesigned screen, showing only what they're allowed to do. They reach it from their own menu, not from «الإدارة».

## 4. Admin rules

- **No privilege escalation:**
  - only a `system_admin` can create a `system_admin` or turn someone into one;
  - a `directorate_admin` can manage everyone else;
  - nobody can raise their own role or permissions.
- Every account action writes an audit-log row (who, whom, what, reason where required). Never the temporary password.

## 5. Stage dates for the directorate admin

Today only `system_admin` holds `municipalities:manage`, so the directorate admin can't move Sabha's deadline. The deadline is the Directorate's day-to-day operational decision, though: the plan expects them to push it back if registration is lagging.

- **New permission** for setting a municipality's **two stage dates only** (awareness start and the deadline), granted to `directorate_admin`. `system_admin` has everything anyway.
- The dates endpoint accepts either permission. Creating municipalities and switching preparing/live stay `municipalities:manage`, system admin only.
- The «البلديات» tab shows for holders of either permission. A directorate admin sees the stage, the dates and the A4-sheet button, but not the status or authority controls.
- The deadline's typed-name confirmation stays.
- **Fix the «الإدارة» subtitle** so it lists only the tabs the user can actually see.

## 6. Developer housekeeping

These all bit us during the 4a phone test:

1. **After a pull, nothing refreshes generated code.** The shared-types `dist` and the Prisma client went stale and broke the seed twice.
   - Add one command, e.g. `pnpm refresh`, that rebuilds the shared packages and regenerates the Prisma client.
   - Run it automatically before `dev`, `dev:phone` and the seed (pre-scripts are fine).
   - Document "after a pull" in the README in one short paragraph.
2. **Locked-out test users.** The seed never resets an existing user's password, so a test user whose password was changed is stuck.
   - Add a **dev-only** command that resets the six seeded test users to `ChangeMe123!` (must-change on, lockout cleared).
   - It must **refuse to run** when `NODE_ENV=production` or against the production database settings.
3. **Fragile e2e test:** `drivers-owners-vehicles` reads only the first page of owners (assumes 50) and failed with 65 owners in the database. Make it independent of how much data exists.
4. **`dev:phone` on Windows:** winget installs cloudflared to `C:\Program Files (x86)\cloudflared\` without adding it to PATH. If `cloudflared` isn't on PATH on Windows, also look there before failing.

## Not in this phase

The monitoring reports, card-stock reconciliation and the deadline-readiness report (Phase 4c); removing non-Sabha data, test data and the seeded real roster (Phase 5).

## Close-out

Same as every round:

- lint, typecheck and the full test suite green through the **root scripts**, with all scoping boundary tests passing.

Add tests for:

- a supervisor can't manage an employee outside their scope, can't create a supervisor or admin, can't grant permissions, and can't act on themselves;
- a directorate admin can't create a system admin;
- nobody can raise their own role;
- deactivation and password reset end the user's sessions;
- a reset sets must-change, clears the lockout, and never exposes the password again;
- one role per person;
- the directorate admin can set stage dates but can't switch a municipality live or preparing.

**Browser pass, after re-seeding.** Screenshots at **desktop and phone width**, plus a **before/after** pair of the users screen:

1. As `admin1`: find a user by search, change their job and place, and deactivate and reactivate them with a reason.
2. As `admin1`: reset a password, and log in with the temporary password (forced change).
3. As `supervisor1`: create a station employee for their station, and confirm other stations and other jobs aren't offered.
4. As `supervisor1`: try to open a user outside their scope, and confirm it's refused.
5. As `admin1`: set and clear Sabha's stage dates.

Then:

- update the phase table in `docs/REGISTRATION_PIVOT_PLAN.md`: 4a built, 4b built on `feat/p4b-accounts`, 4c next;
- log your decisions in `OPEN_ITEMS.md` as #57;
- report every migration in order, confirming each is additive;
- record any test passwords you changed.

**Stop before committing so I can review.** Never force-push.
