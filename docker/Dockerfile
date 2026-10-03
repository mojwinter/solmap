# Next.js standalone image. Requires `output: 'standalone'` in next.config.ts and the kit's
# .dockerignore at the repo root (keeps .env*, node_modules and cached Google responses out of the build context).
# NEXT_PUBLIC_* values are baked in at build time, so pass them as build args.
# CI builds and smoke-tests this file on every PR that touches it (.github/workflows/docker.yml).
FROM node:22-alpine AS base
WORKDIR /app
# pnpm comes from corepack at the exact version in package.json "packageManager". Fetch it once here
# so deps and build share it, and never stop to ask (there's no TTY in a build).
ENV COREPACK_ENABLE_DOWNLOAD_PROMPT=0 NEXT_TELEMETRY_DISABLED=1
COPY package.json ./
RUN corepack enable && corepack install

FROM base AS deps
# pnpm-workspace.yaml carries onlyBuiltDependencies/ignoredBuiltDependencies, so install needs it.
COPY pnpm-lock.yaml pnpm-workspace.yaml ./
RUN pnpm install --frozen-lockfile

FROM base AS build
COPY --from=deps /app/node_modules ./node_modules
COPY . .
ARG NEXT_PUBLIC_MAPS_API_KEY
ARG NEXT_PUBLIC_MAP_ID
ENV NEXT_PUBLIC_MAPS_API_KEY=$NEXT_PUBLIC_MAPS_API_KEY \
    NEXT_PUBLIC_MAP_ID=$NEXT_PUBLIC_MAP_ID
RUN pnpm build

FROM node:22-alpine AS run
WORKDIR /app
ENV NODE_ENV=production PORT=3000 HOSTNAME=0.0.0.0 NEXT_TELEMETRY_DISABLED=1
# Fixed uid/gid 1001 so the mounted solar-cache dir on the VPS can be chowned to match.
RUN addgroup -S -g 1001 app && adduser -S -u 1001 -G app app
COPY --from=build /app/public ./public
# The app owns .next: Next writes its disk cache there at runtime (next/image → .next/cache/images,
# ISR → .next/server). Root-owned, those writes fail with EACCES and get logged on every request.
COPY --from=build --chown=app:app /app/.next/standalone ./
COPY --from=build --chown=app:app /app/.next/static ./.next/static
# Synthetic fixtures ship in the image (fixtures/solar is excluded by .dockerignore). The disk cache
# of real Google responses is mounted at /app/fixtures/solar by compose.yml; the empty dir created
# here (owned by the app) keeps SOLAR_SOURCE=cache writable when nothing is mounted.
COPY --from=build /app/fixtures ./fixtures
RUN mkdir -p fixtures/solar && chown app:app fixtures/solar
USER app
EXPOSE 3000
# busybox wget (alpine has no curl). ops/docker-compose.yml's healthcheck runs the same command.
HEALTHCHECK --interval=30s --timeout=3s CMD wget -qO- http://127.0.0.1:3000/api/health || exit 1
CMD ["node", "server.js"]
