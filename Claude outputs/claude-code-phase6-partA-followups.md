Phase 6, Part A follow-ups: the client's decisions on Part A. Work on `feat/p6-simplify-print`. Do the steps **in order**.

## Step 0. Upload everything to GitHub first, safely

The client wants the whole project on GitHub, including `Claude outputs/`, before anything else changes.

1. **Check the repository is private** (`gh api repos/<owner>/<repo>` → `"private": true`). If it isn't private, **stop and tell me**. Push nothing.
2. **Commit the current Part A work as it is** on `feat/p6-simplify-print`, with a message starting `wip(p6): Part A before follow-ups`. Don't bypass the pre-commit hooks. If a hook fails, stop and report.
3. **Add `Claude outputs/` to the repository.**
   - Remove it from `.gitignore`, but keep these ignored:
     - `Claude outputs/sabha-stations.csv`;
     - any other CSV or spreadsheet holding real people's names or phone numbers.
   - Before staging, **scan every file in `Claude outputs/`** for:
     - the person names and phone numbers in `data/private/sabha-stations.csv`;
     - any Libyan mobile number pattern.
   - Replace each hit with «[محذوف]» in the committed copy, and list every file and line you changed.
   - The existing `no-real-data` test must pass with `Claude outputs/` included.
4. **Still never commit:**
   - `.env` files;
   - `data/private/`;
   - the root `.impeccable/`;
   - `docs/card-rendering/*.pdf`.
5. Push the branch normally, never force. **Don't merge into `main`.** Report the hash and `git status`.

## Step 1. Dev DB

Run `prisma migrate deploy` on the dev DB `fuel_tracking`. Nothing else on that DB.

## Step 2. Only individuals register vehicles: remove institutions

- From now on, only vehicles owned by **individuals** are registered.
- Remove the فرد / جهة choice and every institution field from the registration screens, the owner forms, the API DTOs and the reports. That includes the «استهلاك مركبات الجهات والمؤسسات» report.
- Owner-level rules apply to every owner again, with no institution exemption. Update the rule engine and its tests.
- Keep the database columns and any existing rows. Don't drop anything.

## Step 3. Pump fallback: search when the card can't be used (replaces the emergency override)

- Station employees and supervisors can search a **registered** vehicle by plate, owner name or booklet number when the card can't be used.
- A short reason is required: «البطاقة تالفة» / «الكاميرا لا تعمل» / «البطاقة غير موجودة».
- It never works for unregistered vehicles.
- The fill-up is recorded as «بدون بطاقة», with a count in the station, municipality and daily reports, filterable by station and employee.
- Remove the supervisor-only emergency override, since this replaces it.
- API-enforced, audited, with e2e tests.

## Step 4. Exceptions: redesigned around exception types with daily limits

This replaces both today's approve-each-exception flow and per-vehicle standing exceptions.

**Exception types, defined by admins:**
- The super admin, and a municipality manager for their own municipality, manage exception types in «القوائم».
- Each type has:
  - an Arabic name;
  - the rule(s) it may override, or "any rule";
  - a **daily limit per station** (how many times it can be used at one station in one Tripoli day);
  - active / inactive.

**Using an exception:**
- When a rule blocks a fill-up at the review step, the station employee or supervisor picks an active exception type and writes a short reason. The fill-up then goes through.
- **No supervisor approval step.**
- Every use is logged: who, station, vehicle, type, the rule it overrode, the reason and the time. It appears immediately in the supervisor's and the municipality manager's views.

**Limits:**
- **Over a type's daily limit at that station:**
  - by default, the user sees a clear Arabic warning («تجاوزت المحطة الحد اليومي لاستثناء ‹النوع› (‹الحد›). سيتم تسجيله وإبلاغ المشرف ومدير البلدية.»), and the fill-up is still allowed;
  - the use is **flagged**, and the station supervisor and municipality manager get a notification (once per type per station per day, not once per use).
- **A strict switch,** «منع تجاوز حد الاستثناءات»:
  - set by the super admin for everyone, or by a municipality manager for their own municipality (the municipality's value wins);
  - when on, use beyond the limit is **refused** with a clear Arabic message, for employees and supervisors alike;
  - audited.
- **An unreasonable-station flag:**
  - a setting, «عدد الاستثناءات اليومي غير المعقول لمحطة» (total exceptions of all types at one station in one day), set by the super admin, with an optional override per municipality by its manager;
  - when a station passes it, the station is flagged and the municipality manager (and the supervisor) get one notification that day.

**Views:**
- **Station supervisor:** their station's exceptions, with filters (date, type, employee) and the flagged ones marked.
- **Municipality manager:** exceptions **station by station**, with each station's count for the period. Stations over the threshold are clearly flagged (with a word, never colour alone), and they can drill into one station.
- **Super admin:** the same, per municipality.

**Remove:**
- per-vehicle standing exceptions (UI, API, permission grants);
- the old "pending exception" approval flow and its notification.

Keep old rows in the database; don't drop anything.

**Tests:**
- a use within the limit;
- an over-limit warning plus a flag plus notifications, once per day;
- the strict switch refusing, with the municipality value overriding the global one;
- the station threshold flag;
- scope: a supervisor sees only their station, a manager only their municipality;
- Tripoli day boundaries.

## Step 5. Removals and merges from the inventory

- Remove the guided tour.
- Merge the dashboard into the daily report as one «اليوم» screen.
- Use one export pattern on every table: one CSV button, plus PDF only where printing makes sense.
- Merge the test card into the printer setup card.
- Make one «القوائم» page for vehicle types and exception types (with the new exception-type fields).
- Keep everything else in the inventory: routes, fuel stock, every remaining notification. **Card layout: option A is approved.**

## Step 6. Gates, commit, Part B

1. Run lint, typecheck, `pnpm test`, API e2e and the **full** Playwright suite on a scratch DB, then drop it.
2. If everything is green, commit Part A on `feat/p6-simplify-print` and push the branch normally. **Don't merge into `main` yet.**
3. Report removed routes, endpoints and permissions, the new settings, and the redaction list from Step 0. Log decisions in OPEN_ITEMS #64.
4. Then start **Part B** (in `Claude outputs/claude-code-phase6-simplify-print-ux.md`) on the same branch, and **stop before committing Part B** so I can review.
