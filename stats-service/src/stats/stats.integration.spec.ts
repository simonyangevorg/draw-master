import { Test, TestingModule } from '@nestjs/testing';
import { TypeOrmModule } from '@nestjs/typeorm';
import { INestApplication } from '@nestjs/common';
import { StatsModule } from './stats.module';
import { StatsService } from './stats.service';
import { PlayerStatsEntity } from './entities/player-stats.entity';
import { H2HEntity } from './entities/h2h.entity';

const DATABASE_URL = process.env.TEST_DATABASE_URL
  || 'postgresql://tennis:tennis_secret@localhost:5432/test';

async function buildApp(): Promise<INestApplication> {
  const moduleRef: TestingModule = await Test.createTestingModule({
    imports: [
      TypeOrmModule.forRoot({
        type: 'postgres',
        url: DATABASE_URL,
        entities: [PlayerStatsEntity, H2HEntity],
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
