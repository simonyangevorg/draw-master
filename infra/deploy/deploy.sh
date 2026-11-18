#!/usr/bin/env bash
# One-click production deploy (run on the server, normally by the GitHub
# "Deploy" workflow through deploy-gate.sh). Implements docs/ops/runbook.md §2:
#   backup -> move to the requested commit -> rebuild -> restart gateway ->
#   smoke test -> on failure, roll the CODE back to the previous commit.
# Data is never rolled back automatically; the pre-deploy dump is there for that.
#
#   infra/deploy/deploy.sh <full-commit-sha>
set -euo pipefail

SHA="${1:?usage: deploy.sh <commit-sha>}"
REPO="$(cd "$(dirname "$0")/../.." && pwd)"
cd "$REPO"

# One deploy at a time.
exec 9> /tmp/drawmaster-deploy.lock
flock -n 9 || { echo "another deploy is running" >&2; exit 1; }

log() { echo "[$(date -u +%FT%TZ)] $*"; }

if [ -n "$(git status --porcelain --untracked-files=no)" ]; then
  echo "server checkout has local changes; refusing to deploy over them:" >&2
  git status --short >&2
  exit 1
fi

PREV="$(git rev-parse HEAD)"
log "current: $PREV  target: $SHA"

git fetch --quiet origin
git cat-file -e "$SHA^{commit}" 2>/dev/null || { echo "commit $SHA not found on origin" >&2; exit 1; }
if ! git merge-base --is-ancestor "$SHA" origin/main; then
  echo "$SHA is not on origin/main; only main can be deployed" >&2
  exit 1
fi

log "backing up databases"
bash infra/backup/backup.sh "pre-deploy-${SHA:0:7}"

build_and_start() {
  docker compose up -d --build
  # nginx caches upstream IPs; recreated containers get new ones.
  docker compose restart api-gateway
}

smoke_test() {
  local url="http://127.0.0.1:8080" i code
  for i in $(seq 1 24); do
    if [ "$(curl -s -o /dev/null -w '%{http_code}' "$url/")" = 200 ] &&
       [ "$(curl -s -o /dev/null -w '%{http_code}' "$url/api/tournaments/")" = 200 ]; then
      break
    fi
    [ "$i" = 24 ] && { echo "site did not come up within 2 minutes" >&2; return 1; }
    sleep 5
  done
  code="$(curl -s -o /dev/null -w '%{http_code}' -X POST "$url/api/stats/results")"
  [ "$code" = 403 ] || { echo "stats write protection missing (got $code)" >&2; return 1; }
  # Give crash-looping services a moment to show themselves.
  sleep 10
  if docker compose ps --format '{{.Service}} {{.Status}}' | grep -E 'Restarting|Exited'; then
    echo "a service is not running" >&2; return 1
  fi
  return 0
}

log "deploying $SHA"
git checkout --quiet -B main "$SHA"
if build_and_start && smoke_test; then
  log "DEPLOY OK: $(git log --oneline -1)"
  exit 0
fi

log "DEPLOY FAILED, rolling code back to $PREV"
docker compose logs --since 5m --tail 60 || true
git checkout --quiet -B main "$PREV"
if build_and_start && smoke_test; then
  log "ROLLBACK OK: site is back on $(git log --oneline -1)"
else
  log "ROLLBACK ALSO FAILED. Needs a human: see docs/ops/runbook.md section 2.2 / 4"
fi
exit 1
