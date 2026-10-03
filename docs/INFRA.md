# Infrastructure

Owner: **B (API & Infra)**. Goal: by hour 5, every merge to `main` is live on staging within a
few minutes, and `git tag v0-demo && git push --tags` ships to prod.

## Shape

```
GitHub ──CI on PRs (typecheck, lint, test, build w/ synthetic fixtures)──► main
   │ push main   → deploy.yml: CI again → SSH → scripts/deploy.sh staging <sha>
   │ push tag v* → deploy.yml: CI again → SSH → scripts/deploy.sh prod <sha>
   ▼
VPS  /srv/solmap/
   ├─ src/            git clone of the repo (deploy key, read-only)
   ├─ compose.yml     copy of docker/compose.yml
   ├─ Caddyfile       copy of docker/Caddyfile
   ├─ .env            domains + staging basic-auth (see .env.vps.example)
   ├─ .env.prod       app env for prod    (from .env.example)
   ├─ .env.staging    app env for staging (from .env.example)
   └─ solar-cache/    disk cache of real Google responses (≤ 25 days old, owned by uid 1001, shared by both envs)

   Caddy :443 ─┬─ solmap.<domain>          → prod:3000
               └─ staging.solmap.<domain>  → staging:3000 (basic auth)
```

The VPS builds the images itself (it has plenty of compute), so we need no registry.
There's no Redis or DB in P0/P1: the app is stateless and caches in memory.

## One-time VPS setup (≈30 min, do before the event)

Do all of this **as the deploy user** (the `VPS_USER` that GitHub Actions will SSH in as), not
as root. Keys, the checkout and Docker access all have to belong to that one user.

```bash
curl -fsSL https://get.docker.com | sudo sh
sudo usermod -aG docker "$USER" && newgrp docker          # deploy user can run docker without sudo
sudo mkdir -p /srv/solmap && sudo chown "$USER" /srv/solmap && cd /srv/solmap
mkdir -p solar-cache && sudo chown 1001:1001 solar-cache   # the app container runs as uid 1001

# Read-only GitHub *deploy key* for the clone. Persist it with core.sshCommand, otherwise every
# later `git fetch` in deploy.sh fails (GIT_SSH_COMMAND only applies to the one command).
ssh-keygen -t ed25519 -f ~/.ssh/solmap_deploy -N ''     # add the .pub under repo → Settings → Deploy keys
git clone -c core.sshCommand='ssh -i ~/.ssh/solmap_deploy -o IdentitiesOnly=yes' \
  git@github.com:<org>/solmap.git src

cp src/docker/compose.yml src/docker/Caddyfile .
cp src/.env.vps.example .env        && $EDITOR .env          # keep the hash in single quotes
cp src/.env.example .env.prod       && $EDITOR .env.prod
cp src/.env.example .env.staging    && $EDITOR .env.staging
# Point DNS A records for both hostnames at this box, then (order doesn't matter):
src/scripts/deploy.sh staging main
src/scripts/deploy.sh prod main
```

GitHub → Settings → Secrets → Actions: `VPS_HOST`, `VPS_USER`, `VPS_SSH_KEY` (a *separate*
key in the deploy user's `authorized_keys`, used only by Actions; not the deploy key).
Then turn deploys on: Settings → Secrets and variables → Actions → **Variables** → `DEPLOY_ENABLED` = `true`
(or `gh variable set DEPLOY_ENABLED --body true`). Until it's set, pushes to `main` run CI only.

If you change `compose.yml` or `Caddyfile` in the repo, copy them to `/srv/solmap` again and run
`docker compose up -d` by hand. `deploy.sh` only rebuilds the app container and makes sure Caddy is up.

## Rollback

`deploy.sh` keeps the previous image as `solmap:<env>-prev` and fails the workflow if the new
container doesn't answer `/api/health` within 60 s. To roll back in seconds, without a rebuild:

```bash
cd /srv/solmap && docker tag solmap:prod-prev solmap:prod && docker compose up -d --no-deps prod
```

Or redeploy a known-good tag: Actions → Deploy → Run workflow, or `src/scripts/deploy.sh prod v0-demo`.

Google Cloud: restrict the **server key** to the VPS's public IP. Restrict the **browser key**
to `https://solmap.<domain>/*`, `https://staging.solmap.<domain>/*`, `http://localhost:3000/*`.

## Repo bootstrap (hour 0, the lead)

> **Done on 2026-10-03** (Next.js 16.3.8, pnpm 10.33.0). The kit repo *is* the app repo, so the app was
> scaffolded in a temp folder and moved in; `.gitignore.additions` was merged into `.gitignore`. Next 16's
> generated `AGENTS.md` is kept and imported from `CLAUDE.md`. The steps below are kept for reference.

```bash
pnpm create next-app@latest solmap --ts --tailwind --eslint --app --no-src-dir \
  --import-alias "@/*" --use-pnpm        # accept the defaults for any remaining prompts
cd solmap
pnpm dlx shadcn@latest init
pnpm add @vis.gl/react-google-maps zod recharts server-only
pnpm add -D vitest tsx @types/google.maps
# P1: pnpm add geotiff
# If pnpm prints "Ignored build scripts", run `pnpm approve-builds` and allow the ones listed.
# Copy this kit in: CLAUDE.md PLAN.md DESIGN.md docs/ src/ fixtures/ docker/ scripts/ .github/ .claude/
#                   .env.example .env.vps.example .dockerignore .gitattributes
cat .gitignore.additions >> .gitignore && rm .gitignore.additions
```

Then:
- `next.config.ts`: `output: 'standalone'`.
- `package.json`: add `"packageManager": "pnpm@<version>"` (needed by `pnpm/action-setup`; use the
  output of `pnpm --version`), and scripts `typecheck: "next typegen && tsc --noEmit"` (Next 16's global `LayoutProps`/`PageProps` types come from typegen), `test: "vitest run"`,
  `solar:warm: "tsx scripts/warm-cache.ts"`.
- `vitest.config.mts`: `resolve: { tsconfigPaths: true }` (Vite 8 resolves `@/src/...` natively), `environment: 'node'`.
- Add `app/api/health/route.ts` returning `{ ok: true }` (deploy.sh and the Docker healthcheck call it).
- `lib/solar/client.ts` starts with `import 'server-only'`, so importing it from a client component
  fails the build instead of leaking the key.
- Commit, push, and confirm CI is green on the empty app **before** anyone branches off.
- The kit's `src/types` and `src/config` sit at the repo root next to `app/`, so imports are
  `@/src/types/app` and `@/src/config/bc`. Don't move them. Everyone's prompts and docs assume these paths.
- Protect `main`: require PR + CI green. Squash merges.

## Caching and rate limiting (in-app, no extra services)

- Two cache layers in `lib/solar/cache.ts`: an in-memory LRU (`Map`, cap ~500,
  `SOLAR_CACHE_TTL_SECONDS`) in front of the **disk cache** described in Data sources below.
- Cache the *in-flight promise*, not just the result, so two simultaneous requests for the same
  roof make one Google call.
- API responses send `Cache-Control: private, no-store`.
- Per-IP token bucket on `/api/solar/*` (`RATE_LIMIT_PER_MINUTE`). Return 429 with `{error:"RATE_LIMITED"}`.
  Take the client IP from the **first** `X-Forwarded-For` entry. That's safe here because Caddy
  replaces untrusted incoming `X-Forwarded-For` headers by default; without Caddy in front it wouldn't be.
- dataLayers is only called when the user opens the heatmap.

## Data sources (`SOLAR_SOURCE`)

The goal: build everything against free data first, then let real data in gradually, paying for
each roof **once**. PLAN.md → Data roadmap has the phases.

| `SOLAR_SOURCE` | Lookup order | On a miss | Where |
|---|---|---|---|
| `fixtures` | memory → disk cache → nearest synthetic roof ≤ 250 m | 404 `NO_COVERAGE`. Never calls Google | Every laptop, CI, emergency demo fallback |
| `cache` | memory → disk cache | Call Google once, write the result (200 **and** 404) to disk | Staging, prod, `pnpm solar:warm` |
| `live` | memory | Call Google | Debugging only |

**Folders.** Read with `path.join(process.cwd(), …)`; in the standalone image `cwd` is `/app`.

| Folder | What | Committed? |
|---|---|---|
| `fixtures/synthetic/` | Hand-made roofs in the exact buildingInsights shape, made by `pnpm tsx scripts/make-synthetic.ts`: `south-gable` (Strong with default inputs), `shaded-gable` (Weak), `flat-roof` (3° commercial flat roof), `east-west` (no south face), `tiny-roof` (no panels, no `solarPanelConfigs`), `multi-unit` (180 panels, large-building note) and `base-quality` (`imageryQuality: BASE`). Not Google content, never expire | Yes |
| `fixtures/solar/` (`SOLAR_CACHE_DIR`) | The disk cache: real Google responses | **Never** (gitignored and dockerignored). On the VPS it's `/srv/solmap/solar-cache`, mounted into both containers |

**Cache entry format.** One file per Google call, written atomically (temp file + rename, since
prod and staging share the folder):

```
fixtures/solar/building/<YYYY-MM-DD>_<lat.5f>_<lng.5f>.json
{ "fetchedAt": "2026-10-03T18:22:05Z",
  "request":   { "lat": 49.26, "lng": -123.11, "requiredQuality": "LOW", "experiments": [] },
  "status":    200,                      // or 404 (no coverage is cached too)
  "body":      { …raw buildingInsights response… } }
```

P1 adds `fixtures/solar/layers/…json` (dataLayers responses) and `fixtures/solar/geotiff/<sha256 of id>.tif`
(the raster bytes, not the URLs). Same expiry rules.

**Matching.** A cached building answers a request if the point is inside its `boundingBox` (that's
the building `findClosest` would return anyway) or within 5 m of the originally requested point
(how cached 404s match). Ties → the newest entry.

**Expiry (Google: ≤ 30 days).** Entries older than `SOLAR_CACHE_MAX_AGE_DAYS` (25, never above 29)
are ignored on read, and deleted on server start and every hour. The age comes from `fetchedAt`
inside the file, not the file's mtime. Synthetic fixtures never expire.

**Warming.** `scripts/warm-cache.ts` (B writes it in hour 1; `pnpm solar:warm -- --lat … --lng … --label …`
or `--file fixtures/demo-addresses.json`) runs the same `cache`-mode code path with the server key, so a
warmed roof is byte-for-byte what the app would have saved. Run it on the VPS (its IP is on the key) or
from B's whitelisted machine and copy the files to `/srv/solmap/solar-cache/`.

**Demo-day fallback.** If the API or venue Wi-Fi misbehaves, set `SOLAR_SOURCE=fixtures` in
`.env.prod` and run `docker compose up -d --no-deps prod` (env changes don't need a rebuild).
Every roof that was ever looked up in the last 25 days keeps working; nothing calls Google.

**After the event:** `rm -rf /srv/solmap/solar-cache/*` and the same on B's laptop.

## Observability (cheap)

- `docker compose logs -f prod` during the demo.
- Log one line per Solar lookup: `lat,lng,source=live|cache|fixture,layer=memory|disk|google,quality,status,ms`.
  Count `layer=google` lines to see quota burn: `docker compose logs prod | grep -c layer=google`.
- Google Cloud console → APIs → Solar API → Metrics, open in a tab.

## Alternatives if the team prefers

- **Coolify / Dokploy** on the same VPS gives Git-push deploys and per-PR previews with a UI.
  It's nice but adds setup risk; only use it if someone has run it before.
- **Vercel** for the app, VPS unused. It's the fastest to set up, but the server-key IP restriction
  won't work (dynamic egress IPs), so you'd rely on API restrictions + quotas only.
