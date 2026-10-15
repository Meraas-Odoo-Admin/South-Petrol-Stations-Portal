# Deploying with Docker

This gets the API, the web app, and Postgres running together in
containers. It has **not** been run against real production
infrastructure — read this whole checklist before pointing it at
anything real, and treat it as a solid starting point to adapt to your
actual environment (orchestrator, secrets manager, backup strategy),
not a finished ops setup.

## What's here

- `apps/api/Dockerfile` — multi-stage build, ends in a slim
  `node:20-bookworm-slim` image running the compiled API.
- `apps/web/Dockerfile` — multi-stage build, ends in `nginx:1.27-alpine`
  serving the built static app and reverse-proxying `/api/v1/*` to the
  API container (see `apps/web/docker/nginx.conf`).
- `infra/docker-compose.prod.yml` — wires the three together.
- `infra/.env.prod.example` — copy to `infra/.env.prod` and fill in real
  values. Never commit `infra/.env.prod` itself.

## Quick start

```bash
cp infra/.env.prod.example infra/.env.prod
# edit infra/.env.prod — every value with no default is required and
# compose will refuse to start without it
docker compose -f infra/docker-compose.prod.yml --env-file infra/.env.prod up -d --build
```

Run this from the **repo root** — the Dockerfiles build the whole pnpm
workspace (the API and web app both depend on `packages/shared-types`),
so `context: ..` in the compose file matters.

Database migrations run automatically on API container startup
(`prisma migrate deploy`, the non-interactive production form — never
`migrate dev`). The seed script (`prisma/seed.ts`) is **not** run
automatically and must **never** be run against a real database: it creates
test fixtures and the test accounts (`employee1`/`ChangeMe123!` etc.). A
production database is started with `bootstrap:prod`, in the order below.

## Go-live, in order (Sabha)

Run the commands from the repo root (or inside the API container, from
`apps/api`, with the same environment). Each step needs the one before it.

1. **Create the super admin.** One account, from environment variables, with
   a forced password change at first login. Nothing else is created: no test
   accounts, no demo data.

   ```bash
   BOOTSTRAP_ADMIN_USERNAME=<name> BOOTSTRAP_ADMIN_PASSWORD='<temporary password>' \
     pnpm --filter @fuel-tracking/api bootstrap:prod
   ```

   This also loads the roles, permissions and settings, and creates the
   municipality **سبها** (LIVE, no stage dates — the grace stage) with its
   security authority **مديرية أمن سبها**. It refuses to create a second super
   admin; later ones are created in the app by the first.

2. **Sign in as the super admin** (choose a new password), open
   «إدارة البلديات», and check that **سبها** and **مديرية أمن سبها** are there
   (step 1 created them). Create the municipality's **managers** (مديرو البلدية).

3. **Import Sabha's petrol stations** from the client's CSV (it holds names and
   phone numbers: keep it outside git, e.g. `data/private/`, which is
   git-ignored):

   ```bash
   pnpm --filter @fuel-tracking/api stations:import data/private/sabha-stations.csv --dry-run
   pnpm --filter @fuel-tracking/api stations:import data/private/sabha-stations.csv
   ```

   Safe to run twice. Rows with a `check_note` are imported as written and
   listed at the end; take that list back to the client.

4. **The municipality managers create the registration offices** (the CSV has
   none), then the **station supervisors** and the **registration office
   managers**, from «إدارة المحطات».

5. **Supervisors create their station employees** in «محطتي»; office managers
   create their registration employees in «مكتبي».

6. **Supervisors enter each station's fuel types, tank capacities and opening
   levels** (the «الوقود والمخزون» tab of «محطتي»).

Nothing in these steps uses a standalone users screen or a «الجهات الأمنية»
section: both were removed in Phase 5A (their old addresses redirect to the
places above).

### Defaults at go-live

سبها LIVE with no stage dates; the five rule switches on except owner liters
(off); «إظهار المخزون للموظفين» on for every station; low fuel threshold
1,000 L (`stock.low_threshold_liters`). The super admin changes them in the
app; a re-run of `bootstrap:prod` never overwrites a value that was changed.

### If the database held test data first (a staging copy, a rehearsal)

```bash
pnpm --filter @fuel-tracking/api stations:clean-non-sabha data/private/sabha-stations.csv   # lists what it would delete
pnpm --filter @fuel-tracking/api golive:clean                                                # dry run: counts per table
ALLOW_TEST_DATA_REMOVAL=yes pnpm --filter @fuel-tracking/api golive:clean --confirm          # production needs both
```

Both are dry runs unless `--confirm` is given, both refuse to delete a
fill-up that no test marker explains (override: `--allow-real-fillups`, only
after reading the sample they print), and neither deletes audit rows of real
activity. Test rows in the insert-only stock tables are removed through one
guarded path (a transaction-local setting their triggers check); the triggers
themselves are never dropped. Run them *before* real use, never after.

## Before this touches anything real

- [ ] **TLS.** Neither container terminates HTTPS — the web container's
      nginx listens on plain HTTP (port 80 inside the container, mapped
      to `WEB_PORT` on the host). Put a real reverse proxy, load
      balancer, or ingress with a real certificate in front of it. This
      isn't optional cleanup: the app's refresh-token cookie is
      `Secure`-flagged by design (a non-negotiable rule in this
      codebase — see `apps/api/src/auth/auth.controller.ts`), which
      means **without HTTPS on the browser-facing hop, logins will
      never stay logged in** — same failure mode as the LAN-testing
      HTTP fallback during development, just now in production.
- [ ] **Secrets.** Generate a real `JWT_ACCESS_SECRET`
      (`openssl rand -hex 48`) and a real `POSTGRES_PASSWORD` — never
      reuse the values checked into `apps/api/.env`, which are
      local-dev-only and effectively public (they're in git history).
- [ ] **CORS_ORIGINS.** Set to your actual public domain(s). With the
      default nginx setup here, the browser never crosses origins (the
      web app proxies `/api/v1` through itself), so this mostly matters
      for anything calling the API directly.
- [ ] **Backups.** `postgres-data` is a named Docker volume — decide on
      a real backup strategy for it (this compose file doesn't set one
      up).
- [ ] **The mkcert / LAN-HTTPS dev setup does not apply here.**
      `apps/api/src/main.ts` and `apps/web/vite.config.ts` have an
      optional local-HTTPS code path (only activates if
      `.certs/dev-*.pem` exist) purely for testing the app on a phone
      during development. It's inert in this Docker setup (those files
      are gitignored and excluded from the build context via
      `.dockerignore`) — don't try to carry that certificate into
      production; it's self-signed and only trusted on the machine that
      generated it.
- [ ] **Don't skip the phase checklist.** `docs/IMPLEMENTATION_PLAN.md`
      §11 has the "done means" bar this project holds itself to
      (lint/typecheck/tests green, station-scoping boundary tested) —
      worth a read before treating any branch as deploy-ready.

## Updating a running deployment

```bash
git pull
docker compose -f infra/docker-compose.prod.yml --env-file infra/.env.prod up -d --build
```

Migrations apply automatically on the API container's next start, same
as above.

When an update changes the roles' permissions (`apps/api/prisma/rbac-catalog.ts`), re-run
`bootstrap:prod` once (step 1 above, same variables): it makes every role match the
catalog, and never overwrites a tuned setting or a password. Phase 7 needs it: the municipality manager gains
`cards:issue` and `registration_desks:manage` is taken off every role.
