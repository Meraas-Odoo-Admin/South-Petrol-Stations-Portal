# Build from the REPO ROOT (docker build -f apps/api/Dockerfile . , or via
# infra/docker-compose.prod.yml which already sets the right context) —
# this is a pnpm workspace, so the API's build needs the whole monorepo,
# not just apps/api on its own.

FROM node:22-bookworm-slim AS base
RUN corepack enable
WORKDIR /repo

# ---- deps: install once, cached separately from source changes ----
FROM base AS deps
# python3/build-essential: argon2's native binding ships prebuilt
# binaries for common platforms, but this stage keeps a source-build
# fallback available rather than failing outright on an
# unanticipated platform. Build-time only — never copied into the
# runtime stage below, so the final image stays slim.
# openssl: Prisma's query/schema engine binaries link against libssl —
# absent from the slim base image, and without it Prisma silently
# defaults to a guessed OpenSSL version and can fail to connect at all.
RUN apt-get update && apt-get install -y --no-install-recommends python3 build-essential openssl \
  && rm -rf /var/lib/apt/lists/*
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml tsconfig.base.json ./
COPY packages/shared-types/package.json packages/shared-types/
COPY apps/api/package.json apps/api/
COPY apps/web/package.json apps/web/
RUN pnpm install --frozen-lockfile

# ---- build: compile shared-types, the Prisma client, and the API ----
FROM deps AS build
COPY packages/shared-types packages/shared-types
COPY apps/api apps/api
RUN pnpm --filter @fuel-tracking/shared-types run build
RUN pnpm --filter @fuel-tracking/api exec prisma generate
RUN pnpm --filter @fuel-tracking/api run build
# Produces a standalone, production-only copy of just this package —
# workspace:* deps resolved to real files, devDependencies dropped —
# so the runtime image below never needs pnpm, the workspace, or any
# other app's source.
# --legacy: pnpm v10+ otherwise refuses to deploy a workspace that
# doesn't have inject-workspace-packages=true set — this repo's
# workspace:* deps are resolved as real symlinked-then-copied files at
# build time instead, which --legacy is exactly for.
RUN pnpm --filter @fuel-tracking/api deploy --prod --legacy /deploy

# ---- runtime: the smallest image that can actually run it ----
FROM node:22-bookworm-slim AS runtime
ENV NODE_ENV=production
WORKDIR /app
# openssl: the Prisma query engine binary needs libssl at RUN time too,
# not just when `prisma generate` picked which binary to ship (see the
# deps stage's own comment) — omitting it here made the container crash-
# loop on every startup in testing.
# chromium (registration pivot, phase 3): the API renders the printed
# vehicle card to PDF with headless Chromium, driven by playwright-core.
# Debian's package, not Playwright's own browser download — the image
# never fetches a browser at runtime. Fonts need nothing extra: the card
# template embeds the bundled Cairo files (apps/api/assets/fonts).
RUN apt-get update && apt-get install -y --no-install-recommends openssl chromium \
  && rm -rf /var/lib/apt/lists/*
ENV CARD_CHROMIUM_PATH=/usr/bin/chromium
# Runs as a dedicated non-root user — the API needs no privileged port
# (listens on 3000) and no reason to hold root inside the container.
# -m gives it a real home directory; some npx/prisma runs want a
# writable $HOME for their own cache files.
RUN groupadd --system --gid 1001 nodejs \
  && useradd --system --uid 1001 --gid nodejs --create-home nestjs
COPY --from=build --chown=nestjs:nodejs /deploy .
USER nestjs
# Render a real test card at BUILD time: Debian's chromium and
# playwright-core are versioned separately, and a pair that can't work
# together must break the image build, not a registration desk.
RUN node dist/cards/render/render-check.js
EXPOSE 3000
# node's own built-in fetch (Node 22) — avoids installing curl/wget just
# for this. 127.0.0.1, not localhost — this base image resolves
# "localhost" to the IPv6 loopback first, which the app doesn't listen
# on, and the healthcheck failed with a false "connection refused" until
# caught in testing. start-period gives `prisma migrate deploy` (which
# runs before the app starts listening) room to finish before healthcheck
# failures count against the container.
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:3000/api/v1/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
# migrate deploy (never migrate dev — that's a local-only command that
# can prompt or reset) applies any pending migrations non-interactively,
# then starts the API. Requires DATABASE_URL, JWT_ACCESS_SECRET, and
# CORS_ORIGINS set at runtime — see infra/docker-compose.prod.yml and
# infra/DEPLOYMENT.md.
CMD ["sh", "-c", "npx prisma migrate deploy && node dist/main.js"]
