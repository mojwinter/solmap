# Infrastructure

Owner: **B (API & Infra)**. Goal: every merge to `main` is live at
**https://solmap.yardstick.football** within a few minutes. Solmap shares a VPS with puckbank and
yardstick and deploys exactly the way yardstick does.

## Shape

```
GitHub ──CI on PRs (typecheck, lint, test, build w/ synthetic fixtures; Docker smoke test)──► main
   │ push main → deploy.yml: CI → build image → ghcr.io/mojwinter/solmap:{latest, sha-<7>}
   │                              → SSH deploy@VPS → git pull ~/solmap → compose pull + up -d solmap
   ▼
Shared VPS 2.24.120.101 (Hostinger, Ubuntu 24.04, ~8 GB RAM): also runs puckbank and yardstick
   ~/solmap/                    git checkout of this repo (box-wide GitHub key, like yardstick)
   ~/solmap-ops → ~/solmap/ops  symlink; the deploy job cds here
      docker-compose.yml        (tracked)   the one `solmap` service, joined to puckbank's network
      .env                      (untracked) runtime env from .env.example (+ optional SOLMAP_TAG)
      solar-cache/              (untracked) disk cache of real Google responses, owned by uid 1001

Cloudflare (proxied, Full Strict, Access) → puckbank's Caddy :443 ─┬─ puckbank.com …
                                                                   ├─ yardstick.football         → yardstick:3000
                                                                   └─ solmap.yardstick.football  → solmap:3000
                                      (all on the docker network `puckbank_puckbank`)
```

- **Caddy belongs to puckbank** (`apps/ops/` in mojwinter/puckbank). It owns ports 80/443 for the whole
  box. Solmap publishes no ports; its hostname is a block in puckbank's Caddyfile.
- **One service, no staging.** Until demo day the site sits behind **Cloudflare Access** (team emails), which
  also keeps strangers from spending our Solar quota. Open it for the demo.
- **CI builds, the box only pulls.** The box's ~8 GB is shared with two other apps (≈2 GB in use), and a Next build peaks at 2–3 GB.
- No Redis or DB in P0/P1: the app is stateless apart from the disk cache.

## One-time VPS setup (≈20 min)

Already on the box from puckbank/yardstick: Docker, the `deploy` user (in the `docker` group; `sudo` needs a
password), the puckbank stack (Caddy and the `puckbank_puckbank` network), and `~/.ssh/config` routing
`github.com` through `~/.ssh/gha_deploy`, which can already read mojwinter/solmap. Work as `deploy`
(from a laptop: `ssh deploy@2.24.120.101` with your key in `~deploy/.ssh/authorized_keys`).

**1. Checkout, symlink, cache dir, env**

```bash
git clone git@github.com:mojwinter/solmap.git ~/solmap      # same GitHub key as puckbank/yardstick
ln -s ~/solmap/ops ~/solmap-ops && cd ~/solmap-ops
# The container runs as uid 1001. Chown through docker (deploy is in the docker group), so no sudo password:
mkdir -p solar-cache && docker run --rm -v "$PWD/solar-cache:/c" alpine chown 1001:1001 /c
cp ../.env.example .env && chmod 600 .env && nano .env      # start with SOLAR_SOURCE=fixtures, no key needed
docker network inspect puckbank_puckbank >/dev/null && echo "network ok"
```

Never `git clean` in `~/solmap`: `ops/.env` and `ops/solar-cache/` are untracked on purpose.

**2. Caddy (a PR to mojwinter/puckbank).** Add to `apps/ops/Caddyfile`, next to the yardstick blocks:

```
# Solmap: BC rooftop-solar estimator (hackathon). Own compose stack in ~/solmap-ops, joined to this
# stack's `puckbank` network. Gated by Cloudflare Access until demo day.
solmap.yardstick.football {
	import common
	reverse_proxy solmap:3000
}
```

After it merges, on the box (puckbank's ops runbook: check for a clean tree first, and **recreate** Caddy
rather than reloading it, because the single-file bind mount keeps the old inode):

```bash
cd ~/puckbank-ops && git status --short        # expect only ?? docker-compose.override.yml
git pull && docker compose config -q && docker compose up -d --force-recreate --no-deps caddy
```

`--no-deps` matters: without it compose can recreate puckbank's frontend/backend too, which strands their
tailscale sidecar. The recreate drops connections for every site on the box for a second or two.

**3. Cloudflare (yardstick.football zone)**
- DNS: `solmap` → A record to the VPS IP, **DNS only (gray cloud)** until
  `docker compose logs caddy | grep -i solmap` shows the certificate was obtained, then **Proxied (orange)**.
  The zone already runs Full (Strict).
- Zero Trust → Access → Applications → Self-hosted: `solmap.yardstick.football`, policy "Allow" for the
  team's emails (one-time PIN). Scripts (e.g. `/demo-check`) need an Access **service token**
  (`CF-Access-Client-Id` / `CF-Access-Client-Secret` headers) while it's on. Remove the app on demo day.

**4. GitHub (this repo).** Give Actions its own login key, so it can be revoked without touching
puckbank/yardstick. On the box: `ssh-keygen -t ed25519 -f ~/.ssh/solmap_gha -N '' -C solmap-gha &&
cat ~/.ssh/solmap_gha.pub >> ~/.ssh/authorized_keys`. Copy the private key to your laptop for the next command,
then delete that copy. (Or reuse the existing `gha_deploy` private key if you still have it.)

```bash
gh secret set VPS_HOST --body "<vps ip>"
gh secret set VPS_USER --body deploy
gh secret set VPS_SSH_KEY < solmap_gha            # the private key from the box
gh variable set NEXT_PUBLIC_MAPS_API_KEY --body "<browser key>"   # baked into the client at build
gh variable set NEXT_PUBLIC_MAP_ID --body "<map id>"
gh variable set DEPLOY_ENABLED --body true        # until this is set, the SSH step is skipped
```

**5. First deploy and the image.** Run Actions → Deploy → Run workflow (or merge anything to main). The
first push creates the `ghcr.io/mojwinter/solmap` package as **private**, so the box's pull fails until you
make it public: github.com/users/mojwinter/packages/container/solmap/settings → Change visibility →
Public (same as puckbank's images). Then re-run the workflow and check
`https://solmap.yardstick.football/api/health` → `{"ok":true}`.

**Box budget.** The `solmap` container idles at ~150–250 MB; heatmap renders spike briefly. Don't build on
the box during the event. If Actions is down (e.g. minutes exhausted), the fallback is puckbank's pattern:

```bash
cd ~/solmap && git pull --ff-only && docker build -f docker/Dockerfile -t ghcr.io/mojwinter/solmap:latest .
cd ~/solmap-ops && docker compose up -d --pull never solmap && docker image prune -f
```

`--pull never` matters: with `pull_policy: always`, a plain `up` re-pulls the stale registry image over
your local build and reports `Running` instead of `Recreated`.

## Rollback and demo freeze

Every build is also tagged `sha-<7-char commit>`. The box follows `latest` unless `SOLMAP_TAG` is set in
`~/solmap-ops/.env`:

```bash
cd ~/solmap-ops && nano .env        # SOLMAP_TAG=sha-abc1234 (a known-good commit on main)
docker compose up -d solmap
```

The same line **freezes the demo**. Pin the known-good sha about an hour before presenting; later merges
still build, but the deploy job's `compose pull` keeps fetching the pinned tag. Delete the line to follow
`latest` again. (`git tag v0-demo` on that commit is still a useful marker.)

CI builds and smoke-tests the image (`.github/workflows/docker.yml`: `/api/health`, uid 1001, writable solar-cache mount) on every PR that touches `docker/`, `.dockerignore`, `package.json`, the pnpm lockfile/workspace or `next.config.ts`, so a broken Dockerfile shows up before a deploy does.

Google Cloud: restrict the **server key** to the VPS's public IPv4 **and** IPv6. Restrict the **browser key**
to `https://solmap.yardstick.football/*` and `http://localhost:3000/*`.

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
#                   .env.example .dockerignore .gitattributes
cat .gitignore.additions >> .gitignore && rm .gitignore.additions
```

Then:
- `next.config.ts`: `output: 'standalone'`.
- `package.json`: add `"packageManager": "pnpm@<version>"` (needed by `pnpm/action-setup`; use the
  output of `pnpm --version`), and scripts `typecheck: "next typegen && tsc --noEmit"` (Next 16's global `LayoutProps`/`PageProps` types come from typegen), `test: "vitest run"`,
  `solar:warm: "tsx scripts/warm-cache.ts"`.
- `vitest.config.mts`: `resolve: { tsconfigPaths: true }` (Vite 8 resolves `@/src/...` natively), `environment: 'node'`.
- Add `app/api/health/route.ts` returning `{ ok: true }` (the compose healthcheck and the deploy job's health wait use it).
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
  The client IP is `CF-Connecting-IP` first: Cloudflare is proxied, so the peer Caddy sees (and puts in
  `X-Forwarded-For`) is a Cloudflare edge shared by a whole room. Without that header, the **first**
  `X-Forwarded-For` entry (Caddy replaces untrusted incoming XFF). The origin is still reachable directly,
  so `CF-Connecting-IP` can be spoofed by bypassing Cloudflare; acceptable here (the Google quotas are the
  real cap), and locking the origin to Cloudflare's IPs is a box-wide puckbank decision.
- dataLayers is only called when the user opens the heatmap.

## Data sources (`SOLAR_SOURCE`)

The goal: build everything against free data first, then let real data in gradually, paying for
each roof **once**. PLAN.md → Data roadmap has the phases.

| `SOLAR_SOURCE` | Lookup order | On a miss | Where |
|---|---|---|---|
| `fixtures` | memory → disk cache → nearest synthetic roof ≤ 250 m | 404 `NO_COVERAGE`. Never calls Google | Every laptop, CI, emergency demo fallback |
| `cache` | memory → disk cache | Call Google once, write the result (200 **and** 404) to disk | The VPS, `pnpm solar:warm` |
| `live` | memory | Call Google | Debugging only |

**Folders.** Read with `path.join(process.cwd(), …)`; in the standalone image `cwd` is `/app`.

| Folder | What | Committed? |
|---|---|---|
| `fixtures/synthetic/` | Hand-made roofs in the exact buildingInsights shape, made by `pnpm tsx scripts/make-synthetic.ts`: `south-gable` (Strong with default inputs), `shaded-gable` (Weak), `flat-roof` (3° commercial flat roof), `east-west` (no south face), `tiny-roof` (no panels, no `solarPanelConfigs`), `multi-unit` (180 panels, large-building note) and `base-quality` (`imageryQuality: BASE`). Not Google content, never expire | Yes |
| `fixtures/solar/` (`SOLAR_CACHE_DIR`) | The disk cache: real Google responses | **Never** (gitignored and dockerignored). On the VPS it's `~/solmap-ops/solar-cache`, mounted into the container |

**Cache entry format.** One file per Google call, written atomically (temp file + rename, so a
reader never sees a half-written file):

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
warmed roof is byte-for-byte what the app would have saved. Run it from B's whitelisted machine and copy
the files up: `scp -r fixtures/solar/* deploy@<vps>:~/solmap-ops/solar-cache/`, then
`docker run --rm -v ~/solmap-ops/solar-cache:/c alpine chown -R 1001:1001 /c`. Simpler still: while the VPS runs `SOLAR_SOURCE=cache`,
open each demo address on the deployed site once. That warms the box's own cache.

**Demo-day fallback.** If the API or venue Wi-Fi misbehaves, set `SOLAR_SOURCE=fixtures` in
`~/solmap-ops/.env` and run `docker compose up -d solmap` (env changes don't need a rebuild).
Every roof that was ever looked up in the last 25 days keeps working; nothing calls Google.

**After the event:** `docker run --rm -v ~/solmap-ops/solar-cache:/c alpine sh -c 'rm -rf /c/*'` and `rm -rf fixtures/solar/*` on B's laptop.

## Observability (cheap)

- `cd ~/solmap-ops && docker compose logs -f solmap` during the demo, or puckbank's Dozzle UI
  (logs.puckbank.com), which shows every container on the box, solmap included.
- Log one line per Solar lookup: `lat,lng,source=live|cache|fixture,layer=memory|disk|google,quality,status,ms`.
  Count `layer=google` lines to see quota burn: `docker compose logs solmap | grep -c layer=google`.
- Google Cloud console → APIs → Solar API → Metrics, open in a tab.

## Alternatives if the team prefers

- **Vercel** for the app, VPS unused. It's the fastest to set up, but the server-key IP restriction
  won't work (dynamic egress IPs), so you'd rely on API restrictions + quotas only.
