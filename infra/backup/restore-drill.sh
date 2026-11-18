#!/usr/bin/env bash
# Restore drill (dev plan L-13): load a backup into a THROWAWAY Postgres
# container and compare row counts with the live database. Never touches live data.
#
#   infra/backup/restore-drill.sh backups/drawmaster-<stamp>.sql.gz
set -euo pipefail

cd "$(dirname "$0")/../.."
if [ -f .env ]; then set -a; . ./.env; set +a; fi
DUMP="${1:?usage: restore-drill.sh <dump.sql.gz>}"
: "${POSTGRES_USER:?POSTGRES_USER must be set (in .env)}"
NAME="drawmaster-restore-drill-$$"

cleanup() { docker rm -f "$NAME" > /dev/null 2>&1 || true; }
trap cleanup EXIT

docker run -d --name "$NAME" -e POSTGRES_USER="$POSTGRES_USER" \
  -e POSTGRES_PASSWORD=drill -e POSTGRES_DB=postgres postgres:16-alpine > /dev/null
for _ in $(seq 1 30); do
  docker exec "$NAME" pg_isready -U "$POSTGRES_USER" > /dev/null 2>&1 && break
  sleep 2
done

echo "restoring $DUMP into scratch container $NAME ..."
gunzip -c "$DUMP" | docker exec -i "$NAME" psql -q -v ON_ERROR_STOP=0 -U "$POSTGRES_USER" -d postgres > /dev/null

COUNTS="
auth:users
tournaments:tournaments
tournaments:participants
tournaments:tournament_matches
stats:player_stats
notifications:notifications"

printf '%-34s %10s %10s\n' "table" "live" "restored"
status=0
for entry in $COUNTS; do
  db="${entry%%:*}"; table="${entry#*:}"
  live=$(docker compose exec -T postgres psql -U "$POSTGRES_USER" -d "$db" -tAc "select count(*) from \"$table\"" 2>/dev/null || echo "?")
  restored=$(docker exec "$NAME" psql -U "$POSTGRES_USER" -d "$db" -tAc "select count(*) from \"$table\"" 2>/dev/null || echo "?")
  mark=""; [ "$live" != "$restored" ] && mark="  <-- differs (rows written since the dump?)" && status=1
  printf '%-34s %10s %10s%s\n' "$db.$table" "$live" "$restored" "$mark"
done
[ $status -eq 0 ] && echo "restore drill OK" || echo "restore drill finished with differences; check whether they are newer writes"
exit $status
