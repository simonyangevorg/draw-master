/*
 * Rebuild stats from the source of truth (dev plan L-16).
 *
 * Re-publishes match.completed to stats_queue for every COMPLETED match that
 * has two participants and a winner. stats-service skips matchIds it has
 * already processed, so this is safe to run more than once.
 *
 * To fully rebuild (e.g. after forged rows), FIRST truncate the stats tables:
 *   docker compose exec -T postgres psql -U $POSTGRES_USER -d stats \
 *     -c 'TRUNCATE player_stats, h2h_records, processed_events;'
 * then run, from the repo root:
 *   docker compose exec -T tournament-service node - < infra/ops/rebuild-stats.js
 *
 * Add DRY_RUN=1 to only count:  docker compose exec -T -e DRY_RUN=1 tournament-service node - < infra/ops/rebuild-stats.js
 */
const { Client } = require('pg');
const amqp = require('amqplib');

(async () => {
  const db = new Client({ connectionString: process.env.DATABASE_URL });
  await db.connect();
  const { rows } = await db.query(`
    SELECT m.id, m."tournamentId", m.stage, m.round, m.sets,
           m."participant1Id", m."participant2Id", m."winnerId",
           t.name AS "tournamentName", t.surface,
           p1."playerId" AS "player1Id", p2."playerId" AS "player2Id"
      FROM tournament_matches m
      JOIN tournaments  t  ON t.id::text  = m."tournamentId"::text
      JOIN participants p1 ON p1.id::text = m."participant1Id"::text
      JOIN participants p2 ON p2.id::text = m."participant2Id"::text
     WHERE m.status = 'COMPLETED' AND m."winnerId" IS NOT NULL
     ORDER BY m."completedAt" NULLS FIRST`);
  await db.end();

  console.log(`${rows.length} completed matches found`);
  if (process.env.DRY_RUN) return;

  const conn = await amqp.connect(process.env.RABBITMQ_URL);
  const ch = await conn.createConfirmChannel();
  await ch.assertQueue('stats_queue', { durable: true });
  for (const m of rows) {
    const p1Won = m.winnerId === m.participant1Id;
    const data = {
      matchId: m.id, tournamentId: m.tournamentId, tournamentName: m.tournamentName,
      surface: m.surface, stage: m.stage, round: m.round,
      participant1Id: m.participant1Id, participant2Id: m.participant2Id,
      player1Id: m.player1Id, player2Id: m.player2Id, winnerId: m.winnerId,
      winnerPlayerId: p1Won ? m.player1Id : m.player2Id,
      loserPlayerId: p1Won ? m.player2Id : m.player1Id,
      sets: m.sets ?? [],
    };
    // Same envelope the NestJS RMQ client uses for emit().
    ch.sendToQueue('stats_queue', Buffer.from(JSON.stringify({ pattern: 'match.completed', data })), { persistent: true });
  }
  await ch.waitForConfirms();
  await conn.close();
  console.log(`published ${rows.length} events to stats_queue (notifications are NOT re-sent)`);
})().catch((err) => { console.error(err); process.exit(1); });
