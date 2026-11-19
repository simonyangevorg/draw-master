# DrawMaster operations runbook

How to deploy, back up, restore and recover the production stack on the Hostinger server. Follow it step by step; every command runs from the repo root on the server unless it says otherwise.

Dev plan tasks this covers: L-13 (backups), L-14 (runbook), L-15 (logs and uptime), L-16 (prod data clean-up).

---

## 1. One-time server setup

### 1.1 Check the production `.env`
The services now **refuse to start** if a secret is missing or unsafe, so check this before the first deploy of Sprint 0.

| Variable | Requirement |
|---|---|
| `JWT_SECRET` | At least 32 characters, random, and **not** `fptc_super_secret_change_in_prod` or `change_me_64_char_random_hex_string`. Generate one with `openssl rand -hex 64`. Changing it logs every user out once. |
| `POSTGRES_USER`, `POSTGRES_PASSWORD` | Set, and the password isn't a dev value such as `tennis_secret`. |
| `RABBITMQ_DEFAULT_USER`, `RABBITMQ_DEFAULT_PASS` | Set, and the password isn't a dev value. |
| `ALLOWED_ORIGINS` | The public site origin, for example `https://drawmaster.example`. |
| `BACKUP_REMOTE` | rclone destination for off-server copies (see 1.2). |
| `BACKUP_HEARTBEAT_URL` | The backup monitor's ping URL (see 1.3). |

Coming in Sprint 2 (L-02): `SUPER_ADMIN_EMAIL` creates the first platform super-admin at deploy. It goes in this `.env` only; never commit it.

Check without printing secret values:
```bash
awk -F= '/^JWT_SECRET=/{print "JWT_SECRET length:", length(substr($0,12))}' .env
grep -E '^(POSTGRES_PASSWORD|RABBITMQ_DEFAULT_PASS)=(tennis_secret|guest|password)$' .env && echo "WEAK PASSWORD FOUND" || echo "passwords not obviously weak"
```

### 1.2 Off-server backup storage
A backup on the same server dies with the server. Pick any rclone-supported storage (Backblaze B2, S3, Google Drive, a second VPS over SFTP):
```bash
curl https://rclone.org/install.sh | sudo bash     # install rclone
rclone config                                      # create a remote, e.g. "b2"
rclone mkdir b2:drawmaster-backups
```
Then set `BACKUP_REMOTE=b2:drawmaster-backups` in `.env`.

### 1.3 Backup schedule
```bash
crontab -e
# add:
30 2 * * * cd /path/to/tennis-project && infra/backup/backup.sh nightly >> /var/log/drawmaster-backup.log 2>&1
```
Local dumps are kept for 14 days (`BACKUP_RETENTION_DAYS`). Off-server retention is set in the storage provider (14+ days recommended).

### 1.4 Uptime monitoring
With any uptime service (UptimeRobot, Better Stack, Healthchecks.io, ...), create:
1. **HTTP check** on `https://<site>/`, which should return 200.
2. **HTTP check** on `https://<site>/api/tournaments/`, which should return 200 (proves gateway, auth and tournament-service are up).
3. **Heartbeat / cron monitor** that expects a ping every 24 h. Put its URL in `BACKUP_HEARTBEAT_URL`, so a backup job that silently stops raises an alert.

Send alerts to your email or phone.

### 1.5 First restore drill (do once, then every few months)
```bash
infra/backup/backup.sh drill
infra/backup/restore-drill.sh backups/drawmaster-<stamp>-drill.sql.gz
```
The drill loads the dump into a throwaway Postgres container and compares row counts with live. It never touches live data. Two `ERROR: ... role "<user>"` lines during restore are expected and harmless. Record the date you did it.

---

## 2. Deploying a release

```bash
cd /path/to/tennis-project

# 1. Back up FIRST. Services run their pending database migrations on boot
#    (L-01), so a release can change the schema; the dump is your undo.
infra/backup/backup.sh pre-deploy

# 2. Note the current version so you can roll back.
git rev-parse --short HEAD > .last-deployed

# 3. Get the release.
git fetch --tags && git checkout <tag-or-main> && git pull --ff-only

# 4. Build and start. Migrations run as each service boots; a failing one
#    stops that service (it restarts and logs the error) without half-applying.
docker compose up -d --build --remove-orphans

# 5. ALWAYS restart the gateway after recreating services: nginx caches the
#    containers' internal IPs, and stale ones produce confusing 404s.
docker compose restart api-gateway

# 6. Smoke test (see 2.1).
```

### 2.1 Smoke test (2 minutes)
```bash
docker compose ps                                        # every service "Up"; none restarting
curl -s -o /dev/null -w "%{http_code}\n" http://127.0.0.1:8080/                 # 200
curl -s -o /dev/null -w "%{http_code}\n" http://127.0.0.1:8080/api/tournaments/ # 200
curl -s -o /dev/null -w "%{http_code}\n" -X POST http://127.0.0.1:8080/api/stats/results  # 403
docker compose exec -T rabbitmq rabbitmqctl list_queues name messages_ready messages_unacknowledged
# stats_queue and notifications_queue should be 0 / 0 within a minute
docker compose logs --since 5m | grep -iE "error|missing required|JWT_SECRET" | head
```
Then log in on the site from a phone and a laptop, open a tournament, and check that the page looks right.

**If a service keeps restarting**, run `docker compose logs <service> | tail -30`. `Missing required environment variable` or `JWT_SECRET ...` means the `.env` needs fixing (section 1.1).

### 2.2 Rollback
Code only (no data damage):
```bash
git checkout $(cat .last-deployed)
docker compose up -d --build && docker compose restart api-gateway
```
Data damaged by the release: restore the pre-deploy dump (section 4).

**Migrations and rollback.** Migrations only move forward; older code does not undo them. Rolling back to a release that already uses migrations is safe while newer schema changes are only additions (all of them are, so far). **Never roll back to a release from before Sprint 1** (before commit `6eb7223`, L-01): that code runs TypeORM `synchronize`, which drops columns it doesn't know (`nextSlot`, `payload`) and the case-insensitive email index, while the `migrations` tables still say they exist, so the next forward deploy breaks. If it happens anyway, restore the pre-deploy dump (section 4), or run `DELETE FROM migrations WHERE name <> 'Baseline1763600000000';` in the `auth`, `tournaments` and `stats` databases and deploy forward again.

### 2.3 Tag releases
After a successful deploy, on your dev machine:
```bash
git tag -a sprint0-$(date +%Y%m%d) -m "Sprint 0 deployed" && git push --tags
```

---

## 3. Sprint 0 rollout: one-off steps

Sprint 0 closes holes that were open on the live site, so after deploying it:

1. **Check the `.env` first** (section 1.1). The new secret checks stop services that use a placeholder secret.
2. **Deploy** (section 2).
3. **Audit the data** written while the holes were open (read-only):
   ```bash
   U=$(grep ^POSTGRES_USER= .env | cut -d= -f2)
   docker compose exec -T postgres psql -U $U -d notifications -f - < infra/ops/prod-audit.sql
   docker compose exec -T postgres psql -U $U -d stats         -f - < infra/ops/prod-audit.sql
   docker compose exec -T postgres psql -U $U -d players       -f - < infra/ops/prod-audit.sql
   ```
   (Each run shows errors for the sections that belong to the other databases. Ignore those.)
   The notifications query lists rows not created by a real match result: phishing or test rows. Review them, then delete by id:
   ```bash
   docker compose exec -T postgres psql -U $U -d notifications -c "DELETE FROM notifications WHERE id IN ('<id1>','<id2>');"
   ```
4. **Rebuild the stats** from real match results. Stats were both forgeable and wrongly counted (games as sets), so rebuild them rather than patching:
   ```bash
   infra/backup/backup.sh before-stats-rebuild
   docker compose exec -T postgres psql -U $U -d stats -c 'TRUNCATE player_stats, h2h_records, processed_events;'
   docker compose exec -T tournament-service node - < infra/ops/rebuild-stats.js
   ```
   It re-publishes one event per completed match; stats-service ignores duplicates, so re-running is safe. It does not re-send notifications.
5. **Test and QA accounts and tournaments**: make a list and decide what to delete before the FPTC data migration (L-07).

---

## 3a. Sprint 1 rollout: one-off steps

1. **Before deploying, check for accounts that differ only by email case.** The B-12 migration refuses to run if there are any: auth-service would not start and the deploy would roll back to pre-Sprint-1 code, which is the case section 2.2 warns about.
   ```bash
   U=$(grep ^POSTGRES_USER= .env | cut -d= -f2)
   docker compose exec -T postgres psql -U $U -d auth -c "SELECT lower(trim(email)), count(*) FROM users GROUP BY 1 HAVING count(*) > 1;"
   ```
   No rows: go ahead. Any rows: decide which account to keep and rename or delete the other by hand first.
2. **Deploy** (section 2). On first boot each service records its Baseline migration against the existing schema (nothing is recreated), then applies the Sprint 1 migrations: `tournament_matches.nextSlot`, `processed_events.payload`, and lower-cased emails with a unique index.
3. **Check** that each service ran them:
   ```bash
   for db in auth tournaments stats notifications; do docker compose exec -T postgres psql -U $U -d $db -tc 'SELECT name FROM migrations ORDER BY id'; done
   ```
4. **player-service is gone** (L-18). `--remove-orphans` stops its container. The `players` database stays on the volume, unused; once you're sure nothing needs it, drop it: `docker compose exec -T postgres psql -U $U -d postgres -c 'DROP DATABASE players;'` (and `matches` the same way, if it exists).
5. **Login throttling now keys on the real client IP** (B-15), which the gateway reads from the host proxy's `X-Forwarded-For`. After deploying, sign in once from a phone on mobile data and once from Wi-Fi, then check the gateway saw two different public IPs: `docker compose logs api-gateway --since 10m | grep 'POST /api/auth/login'`. If every line starts with the same private 172.x/10.x address, the host proxy isn't sending `X-Forwarded-For`; add `proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;` to its site config and reload it.

## 3b. Sprint 2 rollout: roles and clubs (one-off)

From Sprint 2 nobody "is an organiser" any more: the super-admin opens clubs and appoints club admins, and club admins run the tournaments. The deploy turns every existing account into a plain player.

1. **Before deploying, add the super-admin to the server `.env`** (never commit these):
   ```bash
   SUPERADMIN_EMAIL=<your email>
   SUPERADMIN_INITIAL_PASSWORD=<12+ characters, used once>
   ```
   On boot, auth-service makes that account the super-admin: it promotes it if it already exists, or creates it with the initial password. Once a super-admin exists, this does nothing, so the lines can stay.
2. **Deploy** (section 2).
3. **Sign in** as the super-admin. If the account was just created, the site asks you to choose a new password first.
4. **Open the clubs.** Go to *Manage clubs* → *Open a club* (FPTC first), then on the club's page search for each admin by name or email and choose *Make admin*. An admin sees *New Tournament* the next time their session refreshes (at most 15 minutes, or straight away when they reload the page).
5. **Everyone signs in once more** after this deploy: sessions now use stored, single-use refresh tokens (L-17), and the old ones are no longer accepted. Expected, not a fault.
6. Tournaments that existed before clubs have no club yet. Whoever created them still manages them; L-07 (Sprint 5) moves them into FPTC.

---

## 4. Restoring from a backup (disaster recovery)

This overwrites live data with the dump. Stop writes first.
```bash
docker compose stop api-gateway frontend auth-service tournament-service stats-service notification-service
# fetch the dump from off-server storage if the local one is gone:
#   rclone copy b2:drawmaster-backups/drawmaster-<stamp>.sql.gz backups/
U=$(grep ^POSTGRES_USER= .env | cut -d= -f2)
gunzip -c backups/drawmaster-<stamp>.sql.gz | docker compose exec -T postgres psql -U $U -d postgres
docker compose up -d && docker compose restart api-gateway
```
Then run the smoke test (2.1). Writes made after the dump was taken are lost; tell affected users.

---

## 5. Incident checklist

1. **Is it down for everyone?** Check the uptime monitor and the site from mobile data.
2. Run `docker compose ps`. Look for anything restarting or exited.
3. Run `docker compose logs --since 30m <service> | tail -100`.
4. **API calls fail with odd 404s after any container change?** Run `docker compose restart api-gateway`.
5. **Disk full?** Run `df -h`. Container logs are capped (3 × 10 MB each), so check `backups/` and `docker system df`.
6. **Events piling up?** Run `rabbitmqctl list_queues ...` (as in 2.1). A growing `messages_ready` means a consumer is down; check its logs. A failed event is logged by the consumer as `match.completed failed, dropping: ... payload=...`. Fix the cause, then replay stats with `infra/ops/rebuild-stats.js`.
7. **Suspected breach:**
   - Rotate `JWT_SECRET`, which logs everyone out.
   - Rotate the database and RabbitMQ passwords.
   - Redeploy.
   - Audit as in section 3.
   - Keep the logs.
8. Write down what happened and what fixed it, here or in an issue.

---

## 6. Known operational gaps (tracked in the dev plan)

- **stats-service and notification-service run in dev mode (`npm run start:dev`, a file watcher) in their containers.** This uses more memory and starts slowly. Switching them to production builds is fixed in Sprint 1.
- **Schema changes go through migrations** (L-01). After changing an entity, run `npm run migration:generate src/migrations/<Name>` in that service against a database at the current schema, review the SQL, and add the class to `src/migrations/index.ts`. CI's `migrations-check` job fails if this is forgotten.
- **No error tracking or analytics yet** (L-15, Sprint 5).
- **Dead-letter queue:** failed events are logged and dropped rather than parked in a dead-letter queue, because adding queue arguments to the existing durable queues would need a coordinated queue re-declare. Replay is via `rebuild-stats.js`.
