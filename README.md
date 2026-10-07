# Fuel Tracking System

Fuel fill-up tracking system for stations under Sabha Security Directorate's oversight.
User-facing app name (Arabic UI): **ضبط الوقود** ("Fuel Control") — see `apps/web/src/lib/appInfo.ts`.
The repo/package name (`@fuel-tracking/*`) is unrelated and intentionally left as-is.

For business context, the full data model, and the security architecture, see
[docs/IMPLEMENTATION_PLAN.md](docs/IMPLEMENTATION_PLAN.md). For standing engineering
rules Claude Code (or any contributor) follows on this project, see
[CLAUDE.md](CLAUDE.md). Open questions still pending from the client are tracked in
[docs/OPEN_ITEMS.md](docs/OPEN_ITEMS.md).

## Prerequisites

- Node.js 20+
- pnpm (`corepack enable` or `npm install -g pnpm`)
- Docker (for local Postgres via `docker compose`)

## Local setup

1. Install dependencies:

   ```sh
   pnpm install
   ```

2. Copy the environment templates and adjust as needed:

   ```sh
   cp .env.example .env
   cp apps/api/.env.example apps/api/.env
   cp apps/web/.env.example apps/web/.env.local
   ```

3. Start local Postgres (+ Adminer at http://localhost:8080):

   ```sh
   docker compose -f infra/docker-compose.yml up -d
   ```

   Postgres is exposed on host port **5433**, not the default 5432 — this
   avoids colliding with any Postgres already running locally. Adminer
   still connects to it as `postgres:5432` internally (the Docker network
   hostname), so no change is needed there.

4. Run the initial Prisma migration:

   ```sh
   pnpm --filter @fuel-tracking/api run prisma:migrate
   ```

5. Start both apps in dev mode:

   ```sh
   pnpm dev
   ```

   - API: http://localhost:3000/api/v1 (health check at `/api/v1/health`, Swagger at `/api/docs`)
   - Web: http://localhost:5173

## Testing on a real phone (HTTPS tunnel)

The camera and QR scanner only work in a secure context (HTTPS). `pnpm dev:phone` starts the API, the web
dev server and a [Cloudflare quick tunnel](https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/do-more-with-tunnels/trycloudflare/),
then prints a public `https://<random>.trycloudflare.com` address to open on the phone.

1. Install `cloudflared` once: `winget install --id Cloudflare.cloudflared` on Windows (open a new terminal
   afterwards so it is on the PATH), `brew install cloudflared` on macOS, or the
   [downloads page](https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/downloads/).
2. Make sure local Postgres is running and the normal setup above is done (`apps/api/.env`, migrations, seed).
3. From the repo root run `pnpm dev:phone` (`npm run dev:phone` works too).
4. Open the printed `https://….trycloudflare.com` address on the phone and log in as usual.
5. When you finish, press **Ctrl+C** in that terminal. That stops the API, the web server and the tunnel, on Windows
   too. If a server from an earlier run is still listening on port 3000 or 5173, the script stops with an error
   instead of silently using another port: close the old one first.

How it works: the tunnel forwards to the web dev server over plain HTTP. In this mode (`PHONE_TUNNEL=1`) the web
app calls the API through a relative path (`VITE_API_BASE_URL=/api/v1`), and Vite proxies `/api` to the local API,
so the login cookie stays first-party and no CORS setting is needed for the random hostname. Vite accepts only
`*.trycloudflare.com` as a tunnel host (`server.allowedHosts`). The local mkcert HTTPS (`.certs/`) is not used in this mode.

> **The link is public while it runs.** Anyone who has the address can reach your dev server and its data. Use
> test accounts, share the address with nobody, and close the tunnel (Ctrl+C) right after testing. A new run gives
> a new address.

## Monorepo layout

```
apps/api            NestJS backend
apps/web             React + Vite + TypeScript frontend
packages/shared-types  Types shared between api and web
infra/                docker-compose for local Postgres + Adminer
docs/                 Implementation plan, open items, ERD
```

## Scripts

Run from the repo root, across all workspaces:

```sh
pnpm dev         # start apps/api and apps/web in watch mode
pnpm dev:phone   # same, plus a public HTTPS tunnel for testing on a real phone
pnpm build       # build all workspaces
pnpm lint        # ESLint across all workspaces
pnpm typecheck   # TypeScript project checks across all workspaces
pnpm test        # test suites across all workspaces
```

## Deployment (Docker)

Full checklist (secrets, TLS, backups) lives in
[infra/DEPLOYMENT.md](infra/DEPLOYMENT.md) — read it before deploying anything
real. This section is the quick-reference version.

### Project path

This repo was developed at a Windows path local to one developer's machine
(`C:\Users\...\South Petrol Stations Portal`). **Nothing in the application
depends on that path** — it's not baked into any config, script, or Docker
build; every path used at build/run time is either relative to the repo root
or a container-internal path. DevOps can check this repo out anywhere.

### Requirements

- Docker + Docker Compose v2 (`docker compose`, not the old `docker-compose`)
- Nothing else needs to be installed on the deployment host — Node, pnpm, and
  all dependencies are built into the images.

### Environment variables

Copy `infra/.env.prod.example` to `infra/.env.prod` and fill in every value
that has no default — compose refuses to start without them
(`${VAR:?message}` syntax), rather than silently using a dev-shaped secret.
Required: `POSTGRES_PASSWORD`, `CORS_ORIGINS`, `JWT_ACCESS_SECRET`. See the
example file for what each one is for.

### Docker build

```sh
cp infra/.env.prod.example infra/.env.prod   # then fill in real values
docker compose -f infra/docker-compose.prod.yml --env-file infra/.env.prod build
```

Run from the **repo root** — both Dockerfiles build the whole pnpm workspace
(the API and web app both depend on `packages/shared-types`), so the build
context matters.

### Docker startup

```sh
docker compose -f infra/docker-compose.prod.yml --env-file infra/.env.prod up -d
```

### Database / migrations

Migrations run **automatically** on every API container startup
(`prisma migrate deploy` — the non-interactive production form, never
`migrate dev`). Nothing manual to run for a normal deploy.

The seed script (`apps/api/prisma/seed.ts`) is **not** run automatically — it
creates demo accounts and sample data with no place in a real deployment.
Run it deliberately, and only after reading what it does:

```sh
docker compose -f infra/docker-compose.prod.yml exec api npx prisma db seed
```

**For a real deployment**, use `bootstrap-prod.ts` instead — it seeds only
what the app cannot function without (the permissions/roles catalog, and the
tunable `SystemSetting` rows the fill-up rule engine reads at request time
and throws on if missing), plus exactly one real admin account, with **zero**
demo companies/stations/vehicles/owners/test users. Everything else
(companies, stations, further user accounts, ...) gets created afterward
through that admin's own account in the app's admin screens:

```sh
docker compose -f infra/docker-compose.prod.yml exec \
  -e BOOTSTRAP_ADMIN_USERNAME=<a real username> \
  -e BOOTSTRAP_ADMIN_PASSWORD='<a real password, 8+ chars>' \
  api npx ts-node --transpile-only prisma/bootstrap-prod.ts
```

The account is created with `mustChangePassword: true` and the
`system_admin` role (every permission) — log in with it once to set a real
password, then use its own Users admin screen to create the rest of the
team's accounts. Safe to re-run (every write is an upsert); it never resets
an already-created admin's password.

### Ports

| Port | Where | Purpose |
|---|---|---|
| `80` (container) → `${WEB_PORT:-8080}` (host) | `web` | The only port meant to be reached from outside — serves the app and reverse-proxies `/api/v1/*` to `api` internally. This is what Cloudflare (or any reverse proxy) should point at. |
| `3000` (container only, not published) | `api` | Reached only by `web`'s nginx over the internal Docker network (service name `api`), not exposed to the host by default. Uncomment the `ports:` block in `docker-compose.prod.yml` only for direct Swagger/debugging access, behind your own auth. |
| `5432` (container only, not published) | `postgres` | Reached only by `api` over the internal Docker network. Never expose this publicly. |

### Volumes

Only one thing needs to survive a container recreation: **the Postgres
database** (`postgres-data` named volume, mounted at
`/var/lib/postgresql/data`). Nothing else — this app has no file uploads and
generates its Excel/PDF reports in memory, streamed straight to the HTTP
response, never written to disk.

### Cloudflare

**No Cloudflare configuration exists in this repository** — no Tunnel config,
no Workers/Pages, no `wrangler.toml`. If Cloudflare sits in front of this
deployment, that setup lives entirely outside this repo (Cloudflare
dashboard, or a `cloudflared` service configured directly on the deployment
host) and DevOps needs to point it at:

```
Cloudflare → [Tunnel / proxy — configured outside this repo] → deployment host → web container, port ${WEB_PORT:-8080}
```

The `web` container is the only thing that should ever be reached from
outside — never point anything directly at `api` or `postgres`. Whichever
Cloudflare product is used, it needs to terminate (or forward) HTTPS to that
one port — see the TLS note in `infra/DEPLOYMENT.md`, since the app's session
cookie requires the browser-facing hop to be HTTPS to work at all.

### Updates (deploying a new version)

```sh
git pull
docker compose -f infra/docker-compose.prod.yml --env-file infra/.env.prod up -d --build
```

Migrations apply automatically on the API container's next start, same as a
fresh deploy.

### Logs

```sh
docker compose -f infra/docker-compose.prod.yml logs -f          # all services
docker compose -f infra/docker-compose.prod.yml logs -f api      # one service
```

### Restart

```sh
docker compose -f infra/docker-compose.prod.yml restart api      # one service
docker compose -f infra/docker-compose.prod.yml restart          # everything
```

### Backup

Only the Postgres volume needs backing up — a standard `pg_dump` against the
`postgres` service (or a volume-level snapshot of `postgres-data`) covers
100% of this app's persistent state:

```sh
docker compose -f infra/docker-compose.prod.yml exec postgres \
  pg_dump -U fuel_tracking fuel_tracking > backup-$(date +%F).sql
```

### Rollback

```sh
git checkout <previous-tag-or-commit>
docker compose -f infra/docker-compose.prod.yml --env-file infra/.env.prod up -d --build
```

Migrations are additive-only by convention (see `CLAUDE.md`), so rolling the
app back to an older commit while the database is on a newer schema is safe
in the common case — an older commit's Prisma client just won't know about
newer columns it doesn't query. Rolling back a database schema change itself
would need its own down-migration, decided at the time, not a generic
command.

## Roadmap

Work proceeds in phases (M0–M6), one per branch/session — see
[docs/IMPLEMENTATION_PLAN.md §11](docs/IMPLEMENTATION_PLAN.md#11-phased-roadmap).
This repo is currently at **M0 — repo scaffold & security baseline**: infrastructure
only, no domain entities or business logic yet.
