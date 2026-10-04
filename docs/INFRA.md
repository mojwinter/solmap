# Infrastructure

Owner: **B (API & Infra)**. Goal: every merge to `main` is live at
**https://solmap.yardstick.football** within a few minutes. Solmap shares a VPS with puckbank and
yardstick and deploys exactly the way yardstick does.

## Shape

```
GitHub ──CI on PRs (typecheck, lint, test, build w/ synthetic fixtures; E2E smoke; Docker smoke test)──► main
   │ push main → deploy.yml: CI + E2E smoke → build image → ghcr.io/mojwinter/solmap:{latest, sha-<7>}
   │                              → SSH deploy@VPS (host key pinned) → ff ~/solmap to the commit
   │                              → compose pull + up -d solmap on sha-<7> (skipped if .env pins SOLMAP_TAG)
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
  (`CF-Access-Client-Id` / `CF-Access-Client-Secret` headers) while it's on, and the policy needs a
  **Service Auth** rule for that token. On demo day remove the app **and** clear `CF_ACCESS_TEAM_DOMAIN` /
  `CF_ACCESS_AUD` on the box (Demo-day runbook → step 4), or the origin rejects everyone.

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
gh variable set VPS_HOST_FINGERPRINT --body 'SHA256:AjYFycy/LNCUJqeqdad2gEv7JV50bx70lmsqc9kO+Vc'
```

`VPS_HOST_FINGERPRINT` pins the box's SSH host key (`appleboy/ssh-action`'s `fingerprint:` input), so the
deploy job won't hand its root-equivalent `deploy` session to anything else answering on `VPS_HOST`. The
deploy job fails up front if it's unset. The format is the whole `SHA256:…` string, exactly as
`ssh-keygen -l` prints it (no `=` padding). The value above is the box's **ED25519** key, read on the box:

```bash
ssh-keygen -lf /etc/ssh/ssh_host_ed25519_key.pub | cut -d' ' -f2
```

Watch out for which key the action sees: its Go SSH client asks for **ECDSA before ED25519**, so if the box
also has an ECDSA host key (`ls /etc/ssh/ssh_host_*_key.pub`; Ubuntu creates one by default), the server
presents that one and the deploy fails with `ssh: host key fingerprint mismatch`. In that case set the
variable to `ssh-keygen -lf /etc/ssh/ssh_host_ecdsa_key.pub | cut -d' ' -f2` instead. Either way, a wrong
value fails closed. If the host key ever changes (rebuilt box), update the variable.

**5. First deploy and the image.** Run Actions → Deploy → Run workflow (or merge anything to main). The
first push creates the `ghcr.io/mojwinter/solmap` package as **private**, so the box's pull fails until you
make it public: github.com/users/mojwinter/packages/container/solmap/settings → Change visibility →
Public (same as puckbank's images). Then re-run the workflow and check
`https://solmap.yardstick.football/api/health` → `{"ok":true}`.

**Box budget.** The `solmap` container idles at ~150–250 MB; heatmap renders spike briefly. Compose caps it
at 768 MB and 1 CPU (`mem_limit`, `cpus`) so it can't starve puckbank or yardstick; past the memory cap it's
OOM-killed and restarted. It also runs with every capability dropped and `no-new-privileges`, and its code
is root-owned and read-only to the app user (only `.next/cache`, `.next/server/route-cache` and the
solar-cache mount are writable). Don't build on the box during the event. If Actions is down (e.g. minutes exhausted), the fallback is puckbank's pattern:

```bash
cd ~/solmap && git pull --ff-only && docker build -f docker/Dockerfile -t ghcr.io/mojwinter/solmap:latest .
cd ~/solmap-ops && docker compose up -d --pull never solmap && docker image prune -f
```

`--pull never` matters: with `pull_policy: always`, a plain `up` re-pulls the stale registry image over
your local build and reports `Running` instead of `Recreated`.

## Rollback and demo freeze

Every build is tagged `sha-<7-char commit>`; builds from `main` (and only `main`) also move `latest`. The
deploy job runs the exact image of the commit it deploys: it fast-forwards `~/solmap` to that commit, then
`SOLMAP_TAG=sha-<7> docker compose pull solmap && … up -d solmap`. It never relies on `latest`, which only
matters for a manual `docker compose up` with no tag set.

**Roll back** by pinning a tag in `~/solmap-ops/.env`:

```bash
cd ~/solmap-ops && nano .env        # SOLMAP_TAG=sha-abc1234 (a known-good commit on main)
docker compose up -d solmap
```

The same line **freezes the demo**. Pin the known-good sha about an hour before presenting. While `.env` pins
a `SOLMAP_TAG` (anything other than empty or `latest`), the deploy job still builds and pushes every merge
but **skips the box**: no `git` update, no pull, no restart. Its log says `DEPLOY SKIPPED: ~/solmap-ops/.env
pins SOLMAP_TAG=…`, and the job stays green. To resume, delete the line, then re-run the latest Deploy
workflow on `main` (or merge anything), which deploys that commit's sha. A plain `docker compose up -d
solmap` also works and lands on `latest`, the newest `main` build. (`git tag v0-demo` on the pinned commit is
still a useful marker.)

CI builds and smoke-tests the image (`.github/workflows/docker.yml`: `/api/health`, uid 1001, the compose file's
hardening flags, only the cache dirs writable, writable solar-cache mount) on every PR that touches `docker/`,
`.dockerignore`, `package.json`, the pnpm lockfile/workspace, `next.config.ts` or `ops/docker-compose.yml`, so a
broken Dockerfile shows up before a deploy does.

Google Cloud: restrict the **server key** to the VPS's public IPv4 **and** IPv6. Restrict the **browser key**
to `https://solmap.yardstick.football/*` and `http://localhost:3000/*`.

## Demo-day runbook

Exact commands, in the order you'll need them. Every step ends with how to check it worked. Unless a step
says otherwise, run it on the box as `deploy`:

```bash
ssh deploy@2.24.120.101
cd ~/solmap-ops
```

Two things that bite:

- **Pin first (step 1).** With no `SOLMAP_TAG` in `.env`, any manual `docker compose up` runs `latest`, which
  is the newest `main` build and not necessarily what the deploy job last started. Every step below assumes
  prod is pinned.
- **`.env` changes need a recreate, not a restart.** `docker compose up -d solmap` recreates the container
  when `.env` changed (the output says `Recreated`). `docker compose restart` keeps the old environment.

Quick status at any point:

```bash
docker inspect -f '{{.Config.Image}} {{.State.Health.Status}}' "$(docker compose ps -q solmap)"
grep -E '^(SOLMAP_TAG|SOLAR_SOURCE|CF_ACCESS_[A-Z_]+|RATE_LIMIT_[A-Z_]+|SOLAR_CACHE_TTL_SECONDS|SOLAR_DAILY_MAX_[A-Z]+)=' .env
docker compose logs --since 10m solmap | grep -c layer=google      # Google calls in the last 10 min
```

### 1. Pin prod to a known-good image (demo freeze), roll back, unpin

Images are tagged `sha-<first 7 chars of the commit>`. List candidates (the box checkout sits at the last
commit the deploy job deployed):

```bash
git -C ~/solmap log -10 --format='%H %s' | sed -E 's/^([0-9a-f]{7})[0-9a-f]+/sha-\1/'
docker inspect -f '{{.Config.Image}}' "$(docker compose ps -q solmap)"   # what's running now
```

Pin (replace `sha-abc1234` in both lines). The first line fails with `manifest unknown` if that tag was never
built, before anything changes:

```bash
SOLMAP_TAG=sha-abc1234 docker compose pull solmap
sed -i '/^SOLMAP_TAG=/d' .env && echo 'SOLMAP_TAG=sha-abc1234' >> .env
docker compose up -d solmap
```

Verify:
- `grep '^SOLMAP_TAG=' .env` prints exactly one line, the tag you pinned.
- After ~30 s, the status line above prints `ghcr.io/mojwinter/solmap:sha-abc1234 healthy`.
- The next Deploy run on `main` logs `DEPLOY SKIPPED: ~/solmap-ops/.env pins SOLMAP_TAG=sha-abc1234` and stays green.

**Roll back** = the same three lines with the previous good tag. Try it once before the event (issue #35):
pin the current tag, roll back to the one before it, then pin forward again, checking the status line each time.

**Unpin** (after the event, or to resume auto-deploys):

```bash
sed -i '/^SOLMAP_TAG=/d' .env
```

then Actions → Deploy → Run workflow on `main` (or `gh workflow run deploy.yml --ref main` from a laptop),
which deploys that commit's `sha-` tag. Verify: the run logs `solmap healthy on sha-…` and the status line
shows that tag. (A plain `docker compose up -d solmap` also works but lands on `latest`.)

### 2. Offline fallback: `SOLAR_SOURCE=fixtures` and back (target: under a minute)

In `fixtures` mode the app never calls Google. It answers from the disk cache (every roof looked up in the
last 25 days, still shown as `cache` with Google attribution) and the synthetic roofs; any other roof is a
404 `NO_COVERAGE`. Use it if Google, the key or the quota misbehaves. Prod is pinned and its image is
already on the box, so skip the registry with `--pull never`:

```bash
time (sed -i 's/^SOLAR_SOURCE=.*/SOLAR_SOURCE=fixtures/' .env && docker compose up -d --pull never solmap)
```

Back to normal:

```bash
time (sed -i 's/^SOLAR_SOURCE=.*/SOLAR_SOURCE=cache/' .env && docker compose up -d --pull never solmap)
```

Verify each switch:
- Compose printed `Recreated` (not `Running`), and `time` shows well under a minute (a few seconds).
- `docker compose exec solmap printenv SOLAR_SOURCE` prints the new mode.
- Reload a demo roof in the browser: it still renders. In `fixtures` mode,
  `docker compose logs --since 2m solmap | grep -c layer=google` stays `0`.

If `grep '^SOLAR_SOURCE=' .env` prints nothing, the line is missing: add it with
`echo 'SOLAR_SOURCE=fixtures' >> .env`. Don't switch with prod unpinned (see the top of this section).

### 3. Demo roofs are cached and fresh

Every `live` roof in `fixtures/demo-addresses.json` must have a disk-cache entry younger than
`SOLAR_CACHE_MAX_AGE_DAYS` (25) on demo day; the app ignores and deletes older ones. List the cache with the
age of each entry (runs inside the container, which can read the uid-1001 files):

```bash
docker compose exec solmap node -e '
const fs = require("fs"), dir = "fixtures/solar/building";
for (const f of fs.readdirSync(dir).filter((f) => f.endsWith(".json")).sort()) {
  const e = JSON.parse(fs.readFileSync(dir + "/" + f, "utf8"));
  const days = (Date.now() - Date.parse(e.fetchedAt)) / 864e5;
  console.log(days.toFixed(1).padStart(5) + "d", e.status, e.request.lat, e.request.lng, days > 22 ? "RE-WARM" : "ok", f);
}'
```

Verify: each demo roof's lat/lng appears with `ok` (status 200, or 404 for the no-coverage roof). `ENOENT`
means nothing is cached yet. The end-to-end check is `/demo-check https://solmap.yardstick.football`: every
`live` address must come back with `source` `cache`. A `live` there means it wasn't warm (and that request
just warmed it).

**Re-warm.** A fresh entry is never re-fetched, so to renew one marked `RE-WARM` delete it first, then
restart so the in-memory copy goes too (`restart` is fine here: nothing in `.env` changed):

```bash
docker compose exec solmap rm fixtures/solar/building/<file from the list above>
docker compose restart solmap
```

Then warm with **one** of:

- **Through the site** (simplest; prod must be on `SOLAR_SOURCE=cache`, and the call goes out from the box's
  whitelisted IP): open each demo address on the site once, or run `/demo-check` (it fetches every `live`
  address). While Access is on, scripts need the service token (step 4 has the Windows curl syntax):

  ```bash
  curl -s -H "CF-Access-Client-Id: $CF_ACCESS_CLIENT_ID" -H "CF-Access-Client-Secret: $CF_ACCESS_CLIENT_SECRET" \
    "https://solmap.yardstick.football/api/solar/building?lat=<lat>&lng=<lng>"
  ```

- **`pnpm solar:warm` on B's machine** (its IP must be on the server key; `SOLAR_API_KEY` in `.env.local`).
  The image has no `tsx` or scripts, so it doesn't run on the box. On the laptop:

  ```bash
  pnpm solar:warm -- --file fixtures/demo-addresses.json        # add --layers once the heatmap ships
  scp -r fixtures/solar deploy@2.24.120.101:~/warm-upload
  ```

  Expect one `200   <label>: HIGH buildings/… (fetched)` line per roof (`already cached` = no Google call).
  The cache dir belongs to uid 1001, so `deploy` can't scp straight into it. Copy it in through docker on the box:

  ```bash
  docker run --rm -v ~/warm-upload:/src:ro -v ~/solmap-ops/solar-cache:/c alpine \
    sh -c 'cp -r /src/. /c/ && chown -R 1001:1001 /c' && rm -rf ~/warm-upload
  ```

  The app notices new files on its next lookup; a roof it already holds in memory switches over within 15 min
  (`SOLAR_CACHE_TTL_SECONDS`), or straight away after `docker compose restart solmap`.

Verify: re-run the listing above. The renewed roofs show `0.0d ok`.

### 4. Open the site to judges

Two locks guard the site, and both must come off: the Cloudflare Access **app** (at the edge) and the
**origin check** in `proxy.ts`, which is on while `CF_ACCESS_TEAM_DOMAIN` and `CF_ACCESS_AUD` are both set.
Delete only the app and the origin answers every request with 403 (`{"error":"FORBIDDEN"}` from the API, a
plain-text "403 Forbidden" page otherwise). So turn the origin check off first; the edge still keeps
strangers out until the app goes:

```bash
cp .env .env.with-access && chmod 600 .env.with-access       # keep the values for putting Access back
sed -i -e 's/^CF_ACCESS_TEAM_DOMAIN=.*/CF_ACCESS_TEAM_DOMAIN=/' -e 's/^CF_ACCESS_AUD=.*/CF_ACCESS_AUD=/' .env
docker compose up -d --pull never solmap
docker compose exec solmap sh -c 'echo "team=[$CF_ACCESS_TEAM_DOMAIN] aud=[$CF_ACCESS_AUD]"'
```

The last line must print `team=[] aud=[]`. Then Cloudflare Zero Trust → Access → Applications →
`solmap.yardstick.football` → Delete.

Verify from a laptop that isn't logged in to Access (private window, or no cookies with curl). This query
is rejected before any lookup, so it never costs a Google call:

```bash
curl -s -o /dev/null -w "%{http_code}\n" https://solmap.yardstick.football/
curl -s "https://solmap.yardstick.football/api/solar/building?lat=0&lng=0"
```

- Good: `200`, then `{"error":"BAD_REQUEST",…}`.
- A `302` (redirect to `….cloudflareaccess.com`) or a Cloudflare login page means the Access app is still there.
- A `403` or `{"error":"FORBIDDEN"}` means the origin check is still on: check `.env` and recreate.

Then re-run `/demo-check https://solmap.yardstick.football` **without** `CF_ACCESS_CLIENT_ID` /
`CF_ACCESS_CLIENT_SECRET` in the shell, from a laptop tethered to a phone on cellular data (not the venue
Wi-Fi). Also open the site on that phone with Wi-Fi off, search the hero address and check the report loads
with no Access login.

**Windows `cmd.exe`** (curl ships with Windows 10+): use double quotes only (single quotes aren't quotes there,
and an unquoted `&` splits the command), `NUL` instead of `/dev/null`, `%VAR%` instead of `$VAR`, one line
(no `\` continuations), and no `# comment` at the end of a line: cmd has no inline comments, so curl gets the
words as extra URLs. In PowerShell, type `curl.exe`, because `curl` there is `Invoke-WebRequest`.

```bat
curl -s -o NUL -w "%{http_code}\n" https://solmap.yardstick.football/
curl -s "https://solmap.yardstick.football/api/solar/building?lat=0&lng=0"
curl -s -H "CF-Access-Client-Id: %CF_ACCESS_CLIENT_ID%" -H "CF-Access-Client-Secret: %CF_ACCESS_CLIENT_SECRET%" "https://solmap.yardstick.football/api/solar/building?lat=0&lng=0"
```

(In a `.bat` file, double the `%` in `%{http_code}`: `%%{http_code}`.)

#### Rate limits for a room on one IP (#58)

Venue and campus Wi-Fi put everyone behind **one public IP**, and the limiter keys on `CF-Connecting-IP`, so
the whole room shares one bucket. That's fine for anything already cached: a roof answered from memory or
disk, a cached 404 and a sun map still in memory never take a token, so the demo roofs (step 3) and any roof
someone in the room already opened can't get a 429. Tokens go only on real work
(→ Caching and rate limiting):

- a building lookup that is about to call Google (a roof nobody has looked up): `RATE_LIMIT_PER_MINUTE`;
- a sun map that isn't in memory (a disk read + render, or a Data Layers call): `RATE_LIMIT_LAYERS_PER_MINUTE`.

This needs an image with the #58 change; on an older one, every request counts and these values don't help.

**Values for the event.** Our Cloud project has only per-minute Solar quotas (no per-day ones): 10/min
Building Insights, 3/min Data Layers and 10/min GeoTIFF (2 per sun map, so 5 sun maps a minute), shared by
every visitor. The daily caps below are ours alone.
Past them Google answers 429, which the app shows as "the solar data service didn't answer" and remembers
for that roof (±30 m) for 5 minutes. Our own 429 says "wait a moment" and clears in seconds. So the buckets
match Google's quotas instead of being raised past them:

| Variable | Default | Event | Why |
|---|---|---|---|
| `RATE_LIMIT_PER_MINUTE` | 30 | **10** | Only new roofs count now. 10 = the Building Insights quota, so the room hits our retryable 429 before Google's 5-minute one. |
| `RATE_LIMIT_LAYERS_PER_MINUTE` | 3 | 3 (leave unset) | = the Data Layers quota. Sun maps already in memory are free. |
| `SOLAR_CACHE_TTL_SECONDS` | 900 | **14400** | Keeps every roof and sun map someone opened in memory for 4 h instead of 15 min, so re-opens stay free and skip the layers bucket. Memory is still capped (500 roofs, 100 sun maps) and never outlives the 25-day limit. |
| `SOLAR_DAILY_MAX_BUILDING` | 300 | **600** | Judges type their own addresses, and each new roof is one call. Our Cloud project has only per-minute Solar quotas, so this in-app cap is the only daily limit on spend. 600 is an hour at the 10/min quota and well inside the free monthly allowance (PLAN.md → Google Cloud). |
| `SOLAR_DAILY_MAX_LAYERS` | 50 | 50 (leave unset) | The only daily limit on Data Layers (there's no Cloud per-day quota), and it's the pricier SKU. Sun maps of judges' own roofs are a nice-to-have, and at the 3/min quota 50 still covers a busy day. |

The daily counters live in memory, so the recreate below also resets today's count to 0.

**Apply** (on the box, prod pinned). Note what's there now, then replace those lines:

```bash
grep -E '^(RATE_LIMIT_[A-Z_]+|SOLAR_CACHE_TTL_SECONDS|SOLAR_DAILY_MAX_[A-Z]+)=' .env
sed -i -E '/^(RATE_LIMIT_PER_MINUTE|RATE_LIMIT_LAYERS_PER_MINUTE|SOLAR_CACHE_TTL_SECONDS|SOLAR_DAILY_MAX_BUILDING|SOLAR_DAILY_MAX_LAYERS)=/d' .env
printf '%s\n' RATE_LIMIT_PER_MINUTE=10 RATE_LIMIT_LAYERS_PER_MINUTE=3 SOLAR_CACHE_TTL_SECONDS=14400 SOLAR_DAILY_MAX_BUILDING=600 SOLAR_DAILY_MAX_LAYERS=50 >> .env
docker compose up -d --pull never solmap
docker compose exec solmap sh -c 'echo "rl=$RATE_LIMIT_PER_MINUTE layers=$RATE_LIMIT_LAYERS_PER_MINUTE ttl=$SOLAR_CACHE_TTL_SECONDS daily=$SOLAR_DAILY_MAX_BUILDING/$SOLAR_DAILY_MAX_LAYERS"'
```

The last line must print `rl=10 layers=3 ttl=14400 daily=600/50`, and compose must have said `Recreated`.

**Verify** from a laptop **on the venue Wi-Fi** (the shared IP), with a `live` demo roof that step 3 showed as
cached (replace `<lat>` and `<lng>`). 40 quick requests must all be `200`; if the roof wasn't cached, the first
one costs one Google call and the other 39 are still free:

```bash
for i in $(seq 40); do curl -s -o /dev/null -w "%{http_code}\n" "https://solmap.yardstick.football/api/solar/building?lat=<lat>&lng=<lng>"; done | sort | uniq -c
```

Good: `40 200`. Windows `cmd.exe` (one line; it prints `40`):

```bat
(for /L %i in (1,1,40) do @curl -s -o NUL -w "%{http_code}\n" "https://solmap.yardstick.football/api/solar/building?lat=<lat>&lng=<lng>") | find /c "200"
```

In a `.bat` file, double both: `%%i` and `%%{http_code}`. While Access is still on (the #35 rehearsal), add the
two `-H "CF-Access-Client-…"` headers from the step 4 examples after `curl -s`. A `429` here means the image
predates #58 or the roof isn't cached.

**After the event**, put the defaults back (the same lines, default values; then recreate and check):

```bash
sed -i -E '/^(RATE_LIMIT_PER_MINUTE|RATE_LIMIT_LAYERS_PER_MINUTE|SOLAR_CACHE_TTL_SECONDS|SOLAR_DAILY_MAX_BUILDING|SOLAR_DAILY_MAX_LAYERS)=/d' .env
printf '%s\n' RATE_LIMIT_PER_MINUTE=30 SOLAR_CACHE_TTL_SECONDS=900 >> .env
docker compose up -d --pull never solmap
docker compose exec solmap sh -c 'echo "rl=$RATE_LIMIT_PER_MINUTE layers=$RATE_LIMIT_LAYERS_PER_MINUTE ttl=$SOLAR_CACHE_TTL_SECONDS daily=$SOLAR_DAILY_MAX_BUILDING/$SOLAR_DAILY_MAX_LAYERS"'
```

Expect `rl=30 layers= ttl=900 daily=/` (empty = the built-in defaults: 3, 300 and 50). If the first `grep` above
showed other values before the event, put those back instead.

### 5. If something breaks on stage

| Symptom | First move (steps above) | Who |
|---|---|---|
| Site down / 502 from Caddy | Status line; `docker compose logs --tail=60 solmap`; roll back (1) | B: _TBD_ |
| A bad merge got deployed | Roll back to the pinned known-good tag (1) | B: _TBD_ |
| Roof lookups fail / slow / `daily limit reached` | `SOLAR_SOURCE=fixtures` (2) | B: _TBD_ |
| A demo roof shows "we can't see this roof yet" | Check the cache (3); present a different demo roof meanwhile | B: _TBD_, D: _TBD_ |
| Judges get a login page or 403 | Step 4 checks (Access app vs. origin env vars) | B: _TBD_ |
| "Too many lookups in a minute" (429) | Step 4 → Rate limits: check the values; a cached roof never 429s on a #58 image | B: _TBD_ |
| Map doesn't load (Maps key / referrer) | Google Cloud → browser key restrictions | A: _TBD_ |
| Numbers look wrong | Note the inputs; don't hot-fix on stage | C: _TBD_ |
| Venue Wi-Fi dies | Present from a phone hotspot | D: _TBD_ |

Fill in names (and who holds the SSH key, the Cloudflare login and the Google Cloud login) before the event.

### 6. After the event

Google's terms: no Solar content kept past 30 days, and the server key shouldn't stay usable from the box.
If the site stays up, also put the rate limits back (step 4 → Rate limits → After the event).

**a. Stop serving and storing Google content.** Either take the site down:

```bash
gh variable set DEPLOY_ENABLED --body false     # from a laptop, first: otherwise the next merge brings it back up
docker compose down                             # on the box; leaves puckbank's network alone (it's external)
```

Verify: `docker compose ps` lists nothing, and `https://solmap.yardstick.football/` gives an error page (502).

Or put Access back. Recreating the Access app gives it a **new AUD tag**, so copy the new tag from the app's
Overview, restore the env vars from the backup, and set the new AUD:

```bash
grep '^CF_ACCESS_TEAM_DOMAIN=' .env.with-access     # the team domain didn't change
nano .env                                           # CF_ACCESS_TEAM_DOMAIN=<from above>, CF_ACCESS_AUD=<new tag>, SOLAR_SOURCE=fixtures
docker compose up -d --pull never solmap && rm .env.with-access
```

Verify: from a private window the site redirects to the Access login (`302` from the curl above); logged in, it
works; and `docker compose exec solmap printenv SOLAR_SOURCE` prints `fixtures`, so nothing new gets cached.

**b. Wipe the cache** (on the box, and B's laptop):

```bash
docker run --rm -v ~/solmap-ops/solar-cache:/c alpine find /c -mindepth 1 -delete
docker run --rm -v ~/solmap-ops/solar-cache:/c alpine find /c -type f | wc -l     # expect 0
```

If the site stays up, recreate it so the in-memory copies go too: `docker compose up -d --force-recreate --pull never solmap`.
On B's laptop: `rm -rf fixtures/solar/*` (PowerShell: `Remove-Item -Recurse -Force fixtures\solar\*`). Verify:
`git status --ignored fixtures/solar` lists no files.

**c. Lock the server key.** Google Cloud console → APIs & Services → Credentials → the server key →
Application restrictions → IP addresses: remove the VPS's IPv4 and IPv6 and B's IP. If that empties the
list, delete the key instead: an empty list with the restriction set to **None** leaves the key open to
anyone who has it.

Verify on the box, then take the key off it. The call should be refused (`API_KEY_IP_ADDRESS_BLOCKED`, or
`API key not valid` if you deleted it). A refused call isn't billed; if it returns a building instead, the key
still works from the box (and that one call was billed):

```bash
KEY=$(grep '^SOLAR_API_KEY=' .env | cut -d= -f2-)
curl -s "https://solar.googleapis.com/v1/buildingInsights:findClosest?location.latitude=49.25&location.longitude=-123.15&key=$KEY" | head -c 300; echo; unset KEY
sed -i 's/^SOLAR_API_KEY=.*/SOLAR_API_KEY=/' .env
```

Restriction changes can take a few minutes to apply; re-run the curl if the first try still works.

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
- Per-IP token buckets on `/api/solar/*`, charged **only for real work** (#58), so a whole room behind one
  venue IP can load cached roofs. Validation runs first (a `BAD_REQUEST` costs nothing), then the store takes a
  token at the point the work starts (a `Gate` passed into `lookup()`), never for a memory hit, a disk hit, a
  cached 404 or a synthetic roof:
  - `RATE_LIMIT_PER_MINUTE` (30): a building lookup (from `/building`, or the one inside `/layers`) that is
    about to call Google. It's taken before the daily budget, so a limited caller doesn't spend it.
  - `RATE_LIMIT_LAYERS_PER_MINUTE` (3, stricter): a `/layers` lookup or `/heatmap` render that misses memory,
    which means a disk read + render or a Data Layers call (security review C1). Memory hits are free.
  - Empty bucket → 429 `{error:"RATE_LIMITED"}` with `Retry-After`. A refusal isn't remembered as a failure
    for the roof; a request that joined someone else's refused in-flight lookup retries once on its own bucket.
  - Demo-day values: Demo-day runbook → step 4 → Rate limits.

  The client IP is `CF-Connecting-IP` first: Cloudflare is proxied, so the peer Caddy sees (and puts in
  `X-Forwarded-For`) is a Cloudflare edge shared by a whole room. Without that header, the **first**
  `X-Forwarded-For` entry (Caddy replaces untrusted incoming XFF). The origin is still reachable directly,
  so `CF-Connecting-IP` can be spoofed by bypassing Cloudflare; acceptable here (the Google quotas are the
  real cap), and locking the origin to Cloudflare's IPs is a box-wide puckbank decision.
- dataLayers is only called when the user opens the heatmap.
- **Spend caps** (all in memory, per process; defaults are safe, so the env vars are optional):
  - A daily budget of real Google calls per SKU, reset at UTC midnight: `SOLAR_DAILY_MAX_BUILDING` (300) and
    `SOLAR_DAILY_MAX_LAYERS` (50). Past it, `/api/solar/*` answers 503 `{error:"UPSTREAM", message:"daily limit reached"}`
    and logs `solar budget EXHAUSTED`. Cached roofs keep working.
  - The stricter per-IP bucket above for sun maps that miss memory: `RATE_LIMIT_LAYERS_PER_MINUTE` (3).
  - Failed lookups are remembered for 5 minutes (within ~30 m), so retries don't buy the same call again, and a
    lookup waits for any in-flight lookup within 30 m before calling Google.
  - Disk cap for the whole cache dir: `SOLAR_CACHE_MAX_FILES` (5,000) and `SOLAR_CACHE_MAX_MB` (2,048). Past it,
    answers are served but not saved (`solar cache FULL` in the log).
  - Buildings Google places outside BC (`regionCode` / `administrativeArea`) are a 404, with no Data Layers call.
  - Log lines carry lat/lng to 3 decimals (~110 m): the box's log viewer is shared.

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
the files up (the cache dir is owned by uid 1001, so through docker: Demo-day runbook → step 3). Simpler
still: while the VPS runs `SOLAR_SOURCE=cache`, open each demo address on the deployed site once. That warms
the box's own cache.

**Demo-day fallback.** If the API or venue Wi-Fi misbehaves, switch prod to `SOLAR_SOURCE=fixtures`
(Demo-day runbook → step 2; env changes don't need a rebuild). Every roof that was looked up in the last
25 days keeps working; nothing calls Google.

**After the event:** wipe the cache on the box and B's laptop (Demo-day runbook → step 6).

### Test bank

`fixtures/bank.json` holds 19 BC test locations, all public buildings (schools, libraries, rec centres,
city halls) for privacy: Metro Vancouver, Victoria, Okanagan, Kamloops, Prince George and the Kootenays,
plus 3 `"Rural"` points expected to 404. Each entry is `{label, lat, lng, region, why}`. Coordinates come
from OpenStreetMap via Nominatim (© OpenStreetMap contributors, ODbL). They're not Google content, so they're safe to commit.

- `pnpm solar:warm -- --file fixtures/bank.json [--layers]` warms them all (≈ 19 Building Insights calls,
  plus 19 Data Layers calls with `--layers`, once per 25 days).
- `pnpm solar:check` uses the first `"Metro Vancouver"` entry as its known-good point and the `"Rural"` ones
  for the EXPANDED_COVERAGE test (PLAN.md → Pre-event checklist).
- Keep every point ≥ 1 km from 53.9171,-122.7497 (the fixtures no-coverage demo point) and > 250 m from
  every synthetic roof, so fixtures mode never answers a bank point with a fake roof.

## Feature flags (`SOLMAP_FLAGS`)

Every P1 feature ships behind a flag so a half-working one can be switched off on prod without a
code change or a rebuild. The list lives in `lib/flags.ts`: `heatmap`, `charts`, `assumptions`,
`manual`, `battery`, `print`. A new P1 feature adds its name there first.

| `SOLMAP_FLAGS` | Result |
|---|---|
| unset | all **off** when `NODE_ENV=production` (the image, `pnpm start`); all **on** in `pnpm dev` and tests |
| `heatmap,charts` | exactly those on (comma- or space-separated, case-insensitive) |
| `all` | everything on |
| empty or `none` | everything off, even in dev |

Unknown names are ignored with a `SOLMAP_FLAGS: ignoring unknown flag(s) …` warning in the log.

**Why server-read, not `NEXT_PUBLIC_*`:** `NEXT_PUBLIC_*` is inlined by `next build`, so flipping it
means a new image. `getFlags()` (`lib/flags.server.ts`, server-only) calls `await connection()`, which makes
the page render per request, then reads `process.env.SOLMAP_FLAGS` from the running container.

**Using a flag (P1 PRs).** Read it once in the server component that renders the page and pass it down:

```tsx
// app/report/[lat]/[lng]/page.tsx (server component)
import { getFlags } from "@/lib/flags.server";
export default async function ReportPage(/* … */) {
  const flags = await getFlags();
  return <Report /* … */ flags={flags} />;
}

// a client component
import type { Flags } from "@/lib/flags";
{flags.heatmap && <FluxOverlay /* … */ />}
```

Gate server routes the same way (`(await getFlags()).heatmap` or a 404) when the feature has its own route.

**Flipping one on the VPS:**

```bash
cd ~/solmap-ops
nano .env                      # e.g. SOLMAP_FLAGS=charts,assumptions  (remove a name to turn it off)
docker compose up -d solmap    # recreates the container with the new env (~5 s); no pull, no rebuild
docker compose logs --tail 20 solmap   # check for an "unknown flag" warning
```

`docker compose restart` does **not** re-read `.env`; use `up -d`. Reload the page to see the change.
At the demo freeze, list only the features that passed rehearsal.

## Observability (cheap)

- `cd ~/solmap-ops && docker compose logs -f solmap` during the demo, or puckbank's Dozzle UI
  (logs.puckbank.com), which shows every container on the box, solmap included.
- Log one line per Solar lookup: `lat,lng,source=live|cache|fixture,layer=memory|disk|google,quality,status,ms`.
  Count `layer=google` lines to see quota burn: `docker compose logs solmap | grep -c layer=google`.
- Google Cloud console → APIs → Solar API → Metrics, open in a tab.

## Alternatives if the team prefers

- **Vercel** for the app, VPS unused. It's the fastest to set up, but the server-key IP restriction
  won't work (dynamic egress IPs), so you'd rely on API restrictions + quotas only.
