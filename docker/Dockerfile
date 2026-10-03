# Next.js standalone image. Requires `output: 'standalone'` in next.config.ts and the kit's
# .dockerignore at the repo root (keeps .env*, node_modules and cached Google responses out of the build context).
# NEXT_PUBLIC_* values are baked in at build time, so pass them as build args.
FROM node:22-alpine AS deps
WORKDIR /app
RUN corepack enable
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN pnpm install --frozen-lockfile

FROM node:22-alpine AS build
WORKDIR /app
RUN corepack enable
COPY --from=deps /app/node_modules ./node_modules
COPY . .
ARG NEXT_PUBLIC_MAPS_API_KEY
ARG NEXT_PUBLIC_MAP_ID
ENV NEXT_PUBLIC_MAPS_API_KEY=$NEXT_PUBLIC_MAPS_API_KEY \
    NEXT_PUBLIC_MAP_ID=$NEXT_PUBLIC_MAP_ID \
    NEXT_TELEMETRY_DISABLED=1
RUN pnpm build

FROM node:22-alpine AS run
WORKDIR /app
ENV NODE_ENV=production PORT=3000 HOSTNAME=0.0.0.0 NEXT_TELEMETRY_DISABLED=1
# Fixed uid/gid 1001 so the mounted solar-cache dir on the VPS can be chowned to match.
RUN addgroup -S -g 1001 app && adduser -S -u 1001 -G app app
COPY --from=build /app/public ./public
COPY --from=build /app/.next/standalone ./
COPY --from=build /app/.next/static ./.next/static
# Synthetic fixtures ship in the image (fixtures/solar is excluded by .dockerignore). The disk cache
# of real Google responses is mounted at /app/fixtures/solar by compose.yml.
COPY --from=build /app/fixtures ./fixtures
USER app
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=3s CMD wget -qO- http://127.0.0.1:3000/api/health || exit 1
CMD ["node", "server.js"]
