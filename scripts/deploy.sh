#!/usr/bin/env bash
# Usage (on the VPS): /srv/solmap/src/scripts/deploy.sh <prod|staging> <git-ref>
# Called by .github/workflows/deploy.yml over SSH; also fine to run by hand.
# Rollback (no rebuild): docker tag solmap:<env>-prev solmap:<env> && docker compose up -d --no-deps <env>
set -euo pipefail
ENV="${1:?prod|staging}"; REF="${2:?git ref}"
case "$ENV" in prod|staging) ;; *) echo "env must be prod or staging" >&2; exit 2 ;; esac
ROOT=/srv/solmap

# prod and staging share one checkout, so only one deploy at a time.
exec 9>"$ROOT/.deploy.lock"
flock 9

cd "$ROOT/src"
git fetch --all --tags --prune   # uses the deploy key via core.sshCommand (set at clone time, see docs/INFRA.md)
git checkout --force "$REF"
SHA=$(git rev-parse --short HEAD)

# Keep the current image as <env>-prev for instant rollback.
docker image inspect "solmap:$ENV" >/dev/null 2>&1 && docker tag "solmap:$ENV" "solmap:$ENV-prev"

set -a; source "$ROOT/.env.$ENV"; set +a
docker build \
  --build-arg NEXT_PUBLIC_MAPS_API_KEY \
  --build-arg NEXT_PUBLIC_MAP_ID \
  --label "solmap.sha=$SHA" \
  -t "solmap:$ENV" -f docker/Dockerfile .

cd "$ROOT"
docker compose up -d --no-deps "$ENV"
docker compose up -d --no-deps caddy   # --no-deps: don't try to start (or pull) the other env

# Wait up to 60 s for the app to answer its health route from inside the container.
for _ in $(seq 1 30); do
  if docker compose exec -T "$ENV" wget -qO- http://127.0.0.1:3000/api/health >/dev/null 2>&1; then
    docker image prune -f >/dev/null
    echo "Deployed $SHA to $ENV"
    exit 0
  fi
  sleep 2
done

docker compose logs --tail=50 "$ENV"
echo "❌ $ENV did not become healthy. Roll back with:" >&2
echo "   docker tag solmap:$ENV-prev solmap:$ENV && docker compose up -d --no-deps $ENV" >&2
exit 1
