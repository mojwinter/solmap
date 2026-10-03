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
# Code is root-owned and read-only to the app user (uid 1001), so a compromised process can't
# rewrite server.js, node_modules or the compiled routes. COPY without --chown gives root:root.
COPY --from=build /app/public ./public
COPY --from=build /app/.next/standalone ./
COPY --from=build /app/.next/static ./.next/static
# Synthetic fixtures ship in the image (fixtures/solar is excluded by .dockerignore).
COPY --from=build /app/fixtures ./fixtures
# The only paths the app writes at runtime, each owned by uid 1001:
# - .next/cache: next/image (.next/cache/images) and the fetch cache (.next/cache/fetch-cache).
# - .next/server/route-cache: Next 16's response cache (ISR, revalidation). Next copies each
#   prerendered page there on its first request, so `/` writes here even with no ISR routes
#   (next/dist/server/lib/incremental-cache/file-system-cache.js → getFilePath, promoteSeed).
#   The compiled routes next to it in .next/server/app stay root-owned.
# - fixtures/solar: the disk cache of real Google responses. compose.yml mounts the VPS's
#   solar-cache over it; the empty dir here keeps SOLAR_SOURCE=cache writable when nothing is mounted.
RUN mkdir -p .next/cache .next/server/route-cache fixtures/solar \
 && chown -R app:app .next/cache .next/server/route-cache fixtures/solar
USER app
EXPOSE 3000
# busybox wget (alpine has no curl). ops/docker-compose.yml's healthcheck runs the same command.
HEALTHCHECK --interval=30s --timeout=3s CMD wget -qO- http://127.0.0.1:3000/api/health || exit 1
CMD ["node", "server.js"]
