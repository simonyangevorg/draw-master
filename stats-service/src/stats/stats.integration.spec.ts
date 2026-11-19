import { Test, TestingModule } from '@nestjs/testing';
import { TypeOrmModule } from '@nestjs/typeorm';
import { INestApplication } from '@nestjs/common';
import { StatsModule } from './stats.module';
import { StatsService } from './stats.service';
import { PlayerStatsEntity } from './entities/player-stats.entity';
import { H2HEntity } from './entities/h2h.entity';
import { ProcessedEventEntity } from './entities/processed-event.entity';

const DATABASE_URL = process.env.TEST_DATABASE_URL
  || 'postgresql://tennis:tennis_secret@localhost:5432/test';

async function buildApp(): Promise<INestApplication> {
  const moduleRef: TestingModule = await Test.createTestingModule({
    imports: [
      TypeOrmModule.forRoot({
        type: 'postgres',
        url: DATABASE_URL,
        entities: [PlayerStatsEntity, H2HEntity, ProcessedEventEntity],
        synchronize: true,
      }),
      StatsModule,
    ],
  }).compile();
  const app = moduleRef.createNestApplication();
  await app.init();
  return app;
}

describe('Stats persistence (integration, real Postgres)', () => {
  let app: INestApplication;

  afterEach(async () => {
    if (app) await app.close();
  });

  it('player stats survive the service being restarted', async () => {
    app = await buildApp();
    await app.get(StatsService).recordResult({
      matchId: 'int-test-match',
      tournamentId: 'int-test-tournament',
      player1Id: 'int-test-winner',
      player2Id: 'int-test-loser',
      winnerId: 'int-test-winner',
      sets: [{ p1: 6, p2: 3 }],
    });

    // Simulate a service restart: tear down this app instance completely
    // and boot a fresh one against the same database.
    await app.close();
    app = await buildApp();

    const stats = await app.get(StatsService).getPlayerStats('int-test-winner');

    expect(stats.wins).toBe(1);
    expect(stats.matchesPlayed).toBe(1);
  });
});

describe('Result correction (integration, real Postgres, B-18)', () => {
  let app: INestApplication;
  afterEach(async () => { if (app) await app.close(); });

  it('score, then correct: wins/losses flip and H2H is fixed', async () => {
    app = await buildApp();
    const svc = app.get(StatsService);
    const tag = `corr-${Date.now()}`;
    const [a, b] = [`${tag}-a`, `${tag}-b`];
    const base = { matchId: `${tag}-m`, tournamentId: `${tag}-t`, player1Id: a, player2Id: b, surface: 'clay' };

    await svc.recordResult({ ...base, winnerId: a, sets: [{ p1: 6, p2: 3 }, { p1: 6, p2: 4 }] });
    await svc.correctResult({ ...base, winnerId: b, sets: [{ p1: 3, p2: 6 }, { p1: 4, p2: 6 }] });

    expect(await svc.getPlayerStats(a)).toMatchObject({ matchesPlayed: 1, wins: 0, losses: 1, setsWon: 0, setsLost: 2 });
    expect(await svc.getPlayerStats(b)).toMatchObject({ matchesPlayed: 1, wins: 1, losses: 0, setsWon: 2, setsLost: 0 });
    expect(await svc.getH2HRecord(a, b)).toMatchObject({ wins: 0, losses: 1 });
    expect(await svc.getH2HRecord(b, a)).toMatchObject({ wins: 1, losses: 0 });
  });
});
