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
automatically; it creates demo/test data (`employee1`/`ChangeMe123!` etc.)
that has no place in a real deployment. If you want the initial
lookup-table rows it also creates (companies, real station data,
permission/role rows), read through `apps/api/prisma/seed.ts` first and
decide deliberately what to run — don't run it wholesale against a real
database without reviewing it.

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
