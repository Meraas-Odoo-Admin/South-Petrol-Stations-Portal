# Build from the REPO ROOT (docker build -f apps/web/Dockerfile . , or via
# infra/docker-compose.prod.yml which already sets the right context) —
# this is a pnpm workspace, so the web build needs the whole monorepo,
# not just apps/web on its own.

FROM node:22-bookworm-slim AS base
RUN corepack enable
WORKDIR /repo

# ---- deps: install once, cached separately from source changes ----
FROM base AS deps
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml tsconfig.base.json ./
COPY packages/shared-types/package.json packages/shared-types/
COPY apps/web/package.json apps/web/
COPY apps/api/package.json apps/api/
RUN pnpm install --frozen-lockfile

# ---- build: compile shared-types, then the static web bundle ----
FROM deps AS build
COPY packages/shared-types packages/shared-types
COPY apps/web apps/web
RUN pnpm --filter @fuel-tracking/shared-types run build
# Relative path (not a real domain) — see docker/nginx.conf below, which
# proxies /api/v1 through this same origin. Override at build time
# (--build-arg VITE_API_BASE_URL=https://api.example.com/api/v1) only if
# the API is genuinely served from a different origin than this app.
ARG VITE_API_BASE_URL=/api/v1
ENV VITE_API_BASE_URL=$VITE_API_BASE_URL
RUN pnpm --filter @fuel-tracking/web run build

# ---- runtime: a plain static file server + reverse proxy ----
FROM nginx:1.27-alpine AS runtime
COPY apps/web/docker/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /repo/apps/web/dist /usr/share/nginx/html
EXPOSE 80
# wget ships with this base image (busybox) — nothing extra to install.
# 127.0.0.1, not localhost — this image resolves "localhost" to the
# IPv6 loopback first, which nginx doesn't listen on here, and the
# healthcheck failed with a false "connection refused" until caught in
# testing.
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget -q -O /dev/null http://127.0.0.1/ || exit 1
# Not run as a fully unprivileged user: nginx's master process needs root
# to bind port 80, then drops its worker processes (the ones that
# actually handle requests) to the unprivileged `nginx` user by default
# in this image — the standard, accepted posture for this exact image,
# not an oversight. Swapping to the nginx-unprivileged image would avoid
# even that if a stricter policy ever requires it, at the cost of moving
# the listen port to 8080 and updating docker-compose.prod.yml to match.
