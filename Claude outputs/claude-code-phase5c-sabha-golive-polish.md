Phase 5C: Sabha's real stations, go-live clean-up, and the final polish. The last of three closing phases. **Build only what's listed here.**

Start `feat/p5c-golive` from `main` **after Phase 5B is merged**. If it isn't, stop and tell me.

Use the impeccable skill for all UI work, and follow PRODUCT.md and DESIGN.md.

## 1. Sabha's 29 real stations

The client confirmed Sabha's stations. The data is in **`data/private/sabha-stations.csv`** (29 rows: company, number, name, locality, status, ownership, supervisor and operator with phones, fuel types where known, the source row, and a check note).

1. Make sure **`data/private/` is git-ignored** before anything else. It holds real people's names and phone numbers and must never be committed. Then copy the file from `Claude outputs/sabha-stations.csv` (already git-ignored) into `data/private/sabha-stations.csv`.
2. **Use the `locality` field Phase 5A already added** to stations (migration `20261012100400_p5a_locality`). Don't add it again.
   - All 29 stations belong to the **سبها municipality**, even where the place is غدوة, تمنهنت, سمنو, الزيغن, بردي, حجارة or similar.
   - The place name goes into `locality`, so nothing is lost.
3. **Write an idempotent import command** (`pnpm --filter @fuel-tracking/api stations:import <csv>`) that creates or updates stations by company + station number.
   - It sets the municipality to سبها, plus the locality, status, status note, supervisor/operator details, and fuel availability where the CSV gives it.
   - **Rows with a `check_note` are imported as written.** List the notes in your report so the client can confirm them.
   - Ownership: map «خاصة» → PRIVATE. For «مملوكة», leave ownership empty and log it as a client question («مملوكة» may mean company-owned, not government).
   - The new station **أخشوم خيل (425, الطرق السريعة)** is created.
4. **Remove the real roster from the code:**
   - delete the `REAL_STATIONS` list (and any other real names or phone numbers) from `seed.ts`;
   - the seed creates only test fixtures;
   - real stations come only from the import command.
   - Report every place real personal data was removed from.
5. **Remove non-Sabha data** (the client's original instruction, now possible because we have Sabha's list):
   - stations not in the CSV;
   - municipalities other than سبها;
   - their related test rows.
   - Do it as a **clean-up command with a `--dry-run` mode** that lists what it would delete first. It must refuse to run against a database with real fill-ups outside test fixtures unless given an explicit flag.
6. Now that every station has a municipality, add the planned constraints: **station municipality and fill-up municipality become required**, in a new migration that first checks no nulls remain and stops with a clear message if any do.

## 2. Go-live clean-up and first accounts

- **A `golive:clean` command** removes all test data before real use: test users (including `admin2` and the renamed office manager from 5A), synthetic fixtures, the dev activity seed (with 5B's deliveries, resets and notifications), test owners (including the old provisional ones and test institutions), vehicles, cards and fill-ups, card-stock entries, Playwright leftovers.
  - It has `--dry-run` (the default) and `--confirm`, prints counts per table, and refuses in production unless both `--confirm` and an environment flag are set.
  - Audit-log rows of real activity are never deleted.
  - **Insert-only tables:** `FuelStockEntry` (5B) has a database trigger that refuses UPDATE and DELETE, and the 4c card-stock entries may have one too. `golive:clean` must still remove *test* rows. Do it through one controlled path (for example a transaction-local setting the trigger checks, set only by `golive:clean`), never by dropping or weakening the trigger. Add a test proving that normal API and SQL deletes are still refused.
  - Also clear the leftover test municipalities from the 5A/5B spec runs (the «P5…» ones) and every row that references them.
- **The first super admin:**
  - `bootstrap-prod.ts` creates exactly one super admin from environment variables, with a forced password change at first login;
  - it never seeds the test accounts in production.
  - Document the go-live steps in `infra/DEPLOYMENT.md` in plain order, following the structure from 5A:
    1. create the super admin from the environment variables;
    2. the super admin checks that the سبها municipality and its «مديرية أمن سبها» exist (created automatically in 5A), and creates its **municipality managers**;
    3. import the petrol stations with the import command;
    4. the municipality managers create the **registration offices** (the CSV has none), then the **station supervisors** and **registration office managers**, from «إدارة المحطات»;
    5. supervisors create their **station employees** in «محطتي», and office managers their **registration employees** in «مكتبي»;
    6. supervisors enter each station's fuel types, tank capacities and opening levels (5B).
  - Nothing in these steps uses a standalone users screen or a «الجهات الأمنية» section: both were removed in 5A. Confirm that in your report.
- **Default settings at go-live:**
  - Sabha LIVE, with no stage dates (grace);
  - rules as decided in 5A (all on, owner liters off);
  - «إظهار المخزون للموظفين» on for every station;
  - low-stock threshold 1,000 L.

## 3. Final polish (the old 4d)

- **Ink text (#132524) on every amber button** across the app (decided). Check every primary button for contrast.
- **Older screens to the DESIGN.md text sizes:** phone body 16px and nothing below 13px; desktop body 14px and nothing below 12px. Start with the pump flow (scan, confirm, amount, done), then every remaining screen.
- **The pump flow** (`/impeccable audit` on `RecordFillUpPage.tsx` and its components):
  - readable in direct sun and at night;
  - large plate and amount;
  - every message in plain short Arabic;
  - one-handed use;
  - nothing important hidden below the fold on a 390px phone.
- **Test stability:**
  - stabilise the vehicle-cards timing flake (OPEN_ITEMS #57);
  - stabilise `grace.spec`, which failed in 2 of 4 whole-suite runs in 5B. The likely cause is the refresh limit below; confirm it;
  - stop the cold-run 30 s hook timeouts in the API e2e suites;
  - the close-out needs **three whole-suite Playwright runs in a row**, all green.
- **Login and refresh limits per IP** (`auth.controller.ts`: login 5 per minute, refresh 10 per minute, per IP).
  - A registration office or station on one Wi-Fi, or many phones behind one mobile carrier address, shares one IP. At shift start the 6th person logging in would be blocked, and refreshes could throw people back to the login screen.
  - Keep brute-force protection, but key it per **username** for login and per **user/token** for refresh, with a looser per-IP ceiling (for example 60 per minute). The existing account lockout stays.
  - Add e2e tests: 8 different users logging in from the same IP within a minute all succeed; 6 wrong passwords for one username are still throttled or locked.

## Close-out

- Lint, typecheck and the full suite through the root scripts, all boundary tests passing.
- **Tests:**
  - the import is idempotent (run twice, same result);
  - the clean-up `--dry-run` deletes nothing;
  - `golive:clean` refuses without its flags;
  - the NOT NULL migration stops cleanly on nulls;
  - no real personal data remains in tracked files (a test that greps the seed for phone patterns is fine).
- **Dry run of go-live on the dev DB:** import the CSV → clean non-Sabha → `golive:clean --dry-run`. Report the counts.
- **Browser pass** with screenshots (desktop + 390px): `admin1`'s «إدارة المحطات» showing the 29 Sabha stations with localities, searched and filtered by company and locality; the pump flow before/after; amber buttons; one older screen before/after.
- **Hand me a short list for the real-iPhone check** (zoom, home-indicator gap, pump flow).
- Update the phase table (5C built; the remaining items are client and hardware only). Log decisions as OPEN_ITEMS #61. List migrations in order, and state clearly that the NOT NULL step is a constraint tightening, guarded by its null check.
- **Stop before committing so I can review.** Never force-push.
