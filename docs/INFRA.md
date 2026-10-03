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
   └─ fixtures-recorded/  real Google responses for the demo fallback (≤ 30 days old, mounted read-only)

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
mkdir -p fixtures-recorded

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

```bash
pnpm create next-app@latest solmap --ts --tailwind --eslint --app --no-src-dir \
  --import-alias "@/*" --use-pnpm        # accept the defaults for any remaining prompts
cd solmap
pnpm dlx shadcn@latest init
pnpm add @vis.gl/react-google-maps zod recharts server-only
pnpm add -D vitest vite-tsconfig-paths tsx @types/google.maps
# P1: pnpm add geotiff
# If pnpm prints "Ignored build scripts", run `pnpm approve-builds` and allow the ones listed.
# Copy this kit in: CLAUDE.md PLAN.md DESIGN.md docs/ src/ fixtures/ docker/ scripts/ .github/ .claude/
#                   .env.example .env.vps.example .dockerignore .gitattributes
cat .gitignore.additions >> .gitignore && rm .gitignore.additions
```

Then:
- `next.config.ts`: `output: 'standalone'`.
- `package.json`: add `"packageManager": "pnpm@<version>"` (needed by `pnpm/action-setup`; use the
  output of `pnpm --version`), and scripts `typecheck: "tsc --noEmit"`, `test: "vitest run"`,
  `fixtures:record: "tsx scripts/record-fixture.ts"`.
- `vitest.config.ts`: `plugins: [tsconfigPaths()]` (so `@/src/...` imports resolve in tests), `environment: 'node'`.
- Add `app/api/health/route.ts` returning `{ ok: true }` (deploy.sh and the Docker healthcheck call it).
- `lib/solar/client.ts` starts with `import 'server-only'`, so importing it from a client component
  fails the build instead of leaking the key.
- Commit, push, and confirm CI is green on the empty app **before** anyone branches off.
- The kit's `src/types` and `src/config` sit at the repo root next to `app/`, so imports are
  `@/src/types/app` and `@/src/config/bc`. Don't move them. Everyone's prompts and docs assume these paths.
- Protect `main`: require PR + CI green. Squash merges.

## Caching and rate limiting (in-app, no extra services)

- `lib/solar/client.ts` keeps an LRU (`Map` with size cap ~500) keyed by
  `lat.toFixed(5),lng.toFixed(5)` with `SOLAR_CACHE_TTL_SECONDS` TTL. It dedupes repeat calls
  during the demo. It's process memory only; nothing is written to disk. (Google allows temporary
  caching of Building Insights for up to 30 days, so minutes is well inside the terms.)
- Cache the *in-flight promise*, not just the result, so two simultaneous requests for the same
  roof make one Google call.
- API responses send `Cache-Control: private, no-store`.
- Per-IP token bucket on `/api/solar/*` (`RATE_LIMIT_PER_MINUTE`). Return 429 with `{error:"RATE_LIMITED"}`.
  Take the client IP from the **first** `X-Forwarded-For` entry. That's safe here because Caddy
  replaces untrusted incoming `X-Forwarded-For` headers by default; without Caddy in front it wouldn't be.
- dataLayers is only called when the user opens the heatmap.

## Fixtures mode

`USE_FIXTURES=1` makes `/api/solar/building` load every JSON in `fixtures/solar/` (recorded) and
`fixtures/synthetic/` (committed), and return the one whose `center` is nearest to the request
if it's within 250 m (else 404 `NO_COVERAGE`), trimmed as usual with `source: "fixture"`. Read them
from `path.join(process.cwd(), 'fixtures', …)`; in the standalone image `cwd` is `/app`.

| Folder | What | Committed? |
|---|---|---|
| `fixtures/synthetic/` | Hand-made roofs in the exact buildingInsights shape: `south-gable` (Strong with default inputs) and `shaded-gable` (Weak). Not Google content | Yes. CI and hour-0 dev use these |
| `fixtures/solar/` | Real responses recorded with `pnpm fixtures:record`, named `<YYYY-MM-DD>_<label>.json` so the 30-day deletion date is obvious | **Never** (gitignored and dockerignored) |

CI always runs with `USE_FIXTURES=1`, so it only sees synthetic fixtures. On demo day, copy the
recorded demo addresses to `/srv/solmap/fixtures-recorded/` (mounted into both containers). If the
API or venue Wi-Fi misbehaves, set `USE_FIXTURES=1` in `.env.prod` and run
`docker compose up -d --no-deps prod`. Env changes don't need a rebuild, so that takes seconds.
Delete the recorded files after the event.

`scripts/record-fixture.ts` (B writes it in hour 1): calls Google with the server key and writes
`fixtures/solar/<date>_<label>.json`. Dev machine or VPS only.

## Observability (cheap)

- `docker compose logs -f prod` during the demo.
- Log one line per Solar call: `lat,lng,quality,status,ms,cache=hit|miss`. It tells us about quota burn.
- Google Cloud console → APIs → Solar API → Metrics, open in a tab.

## Alternatives if the team prefers

- **Coolify / Dokploy** on the same VPS gives Git-push deploys and per-PR previews with a UI.
  It's nice but adds setup risk; only use it if someone has run it before.
- **Vercel** for the app, VPS unused. It's the fastest to set up, but the server-key IP restriction
  won't work (dynamic egress IPs), so you'd rely on API restrictions + quotas only.
