#!/usr/bin/env bash
# Nightly / pre-deploy backup of every DrawMaster database (dev plan L-13).
#
# Run from the repo root on the server:   infra/backup/backup.sh [label]
# Cron (02:30 nightly):
#   30 2 * * * cd /path/to/tennis-project && infra/backup/backup.sh nightly >> /var/log/drawmaster-backup.log 2>&1
#
# Settings (read from the environment or the repo .env):
#   BACKUP_DIR            local folder for dumps        (default: ./backups)
#   BACKUP_RETENTION_DAYS days of local dumps to keep   (default: 14)
#   BACKUP_REMOTE         optional rclone destination, e.g. "b2:drawmaster-backups"
#                         (needs rclone installed and configured on the host)
#   BACKUP_HEARTBEAT_URL  optional URL pinged after a successful run (uptime monitor
#                         heartbeat), so a backup that silently stops raises an alert
set -euo pipefail

cd "$(dirname "$0")/../.."
if [ -f .env ]; then set -a; . ./.env; set +a; fi

: "${POSTGRES_USER:?POSTGRES_USER must be set (in .env)}"
LABEL="${1:-manual}"
BACKUP_DIR="${BACKUP_DIR:-./backups}"
RETENTION="${BACKUP_RETENTION_DAYS:-14}"
STAMP="$(date -u +%Y%m%dT%H%M%SZ)"
FILE="$BACKUP_DIR/drawmaster-$STAMP-$LABEL.sql.gz"

mkdir -p "$BACKUP_DIR"
echo "[$(date -u +%FT%TZ)] dumping all databases to $FILE"

# pg_dumpall covers every service DB plus roles. Write to a temp name first so a
# failed dump never looks like a good backup.
docker compose exec -T postgres pg_dumpall -U "$POSTGRES_USER" --clean --if-exists \
  | gzip -9 > "$FILE.partial"
gzip -t "$FILE.partial"
SIZE=$(wc -c < "$FILE.partial")
if [ "$SIZE" -lt 1024 ]; then
  echo "dump is suspiciously small ($SIZE bytes); keeping it as .partial and failing" >&2
  exit 1
fi
mv "$FILE.partial" "$FILE"
echo "ok: $(du -h "$FILE" | cut -f1)"

if [ -n "${BACKUP_REMOTE:-}" ]; then
  rclone copy "$FILE" "$BACKUP_REMOTE/"
  echo "copied off-server to $BACKUP_REMOTE"
else
  echo "WARNING: BACKUP_REMOTE not set, so this backup exists only on this server" >&2
fi

find "$BACKUP_DIR" -name 'drawmaster-*.sql.gz' -mtime +"$RETENTION" -print -delete

if [ -n "${BACKUP_HEARTBEAT_URL:-}" ]; then
  curl -fsS -m 10 --retry 3 "$BACKUP_HEARTBEAT_URL" > /dev/null && echo "heartbeat sent"
fi
