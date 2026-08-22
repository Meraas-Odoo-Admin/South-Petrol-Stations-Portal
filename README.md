# Fuel Tracking System

Fuel fill-up tracking system for stations under Sabha Security Directorate's oversight.

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
pnpm build       # build all workspaces
pnpm lint        # ESLint across all workspaces
pnpm typecheck   # TypeScript project checks across all workspaces
pnpm test        # test suites across all workspaces
```

## Roadmap

Work proceeds in phases (M0–M6), one per branch/session — see
[docs/IMPLEMENTATION_PLAN.md §11](docs/IMPLEMENTATION_PLAN.md#11-phased-roadmap).
This repo is currently at **M0 — repo scaffold & security baseline**: infrastructure
only, no domain entities or business logic yet.
