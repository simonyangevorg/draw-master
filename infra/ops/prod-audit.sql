-- Production data audit (dev plan L-16). READ-ONLY: every statement is a SELECT.
-- Before the B-01 fix, anyone could write player records, stats and notifications
-- without logging in. These queries list rows that no real event explains.
-- Run each section against its own database, e.g.
--   docker compose exec -T postgres psql -U $POSTGRES_USER -d notifications -f - < infra/ops/prod-audit.sql
-- (sections for other databases will just error harmlessly; or copy them out one by one).

-- ── notifications DB ────────────────────────────────────────────────────────
-- Real notifications are only ever created by the match.completed consumer,
-- always with subject 'Match Result' and a matchId in metadata.
SELECT id, "recipientId", subject, left(body, 80) AS body, "sentAt"
  FROM notifications
 WHERE subject IS DISTINCT FROM 'Match Result'
    OR metadata IS NULL
    OR NOT (metadata ? 'matchId')
 ORDER BY "sentAt";

-- ── stats DB ────────────────────────────────────────────────────────────────
-- Stats cannot be cross-checked against tournaments here (no cross-DB access).
-- Recommended: don't audit, rebuild. TRUNCATE player_stats, h2h_records,
-- processed_events, then run infra/ops/rebuild-stats.js (see the runbook).
SELECT count(*) AS player_stats_rows FROM player_stats;
SELECT "playerId", "matchesPlayed", wins, losses
  FROM player_stats
 WHERE "playerId" !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
 ORDER BY "matchesPlayed" DESC;  -- non-UUID player ids are certainly forged

-- ── players DB (player-service is unused by the app; retired in L-18) ───────
SELECT count(*) AS player_rows FROM players;
