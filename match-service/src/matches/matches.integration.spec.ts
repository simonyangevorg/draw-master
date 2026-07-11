import { Test, TestingModule } from '@nestjs/testing';
import { TypeOrmModule } from '@nestjs/typeorm';
import { INestApplication } from '@nestjs/common';
import { MatchesModule } from './matches.module';
import { MatchesService } from './matches.service';
import { MatchEntity } from './entities/match.entity';

const DATABASE_URL = process.env.TEST_DATABASE_URL
  || 'postgresql://tennis:tennis_secret@localhost:5432/test';

async function buildApp(): Promise<INestApplication> {
  const moduleRef: TestingModule = await Test.createTestingModule({
    imports: [
      TypeOrmModule.forRoot({
        type: 'postgres',
        url: DATABASE_URL,
        entities: [MatchEntity],
        synchronize: true,
      }),
      MatchesModule,
    ],
  }).compile();
  const app = moduleRef.createNestApplication();
  await app.init();
  return app;
}

describe('Match persistence (integration, real Postgres)', () => {
  let app: INestApplication;

  afterEach(async () => {
    if (app) await app.close();
  });

  it('match data survives the service being restarted', async () => {
    app = await buildApp();
    const created = await app.get(MatchesService).create({
      tournamentId: 'int-test-tournament',
      player1Id: 'int-test-p1',
      player2Id: 'int-test-p2',
    });

    // Simulate a service restart: tear down this app instance completely
    // and boot a fresh one against the same database.
    await app.close();
    app = await buildApp();

    const found = await app.get(MatchesService).findOne(created.id);

    expect(found.player1Id).toBe('int-test-p1');
    expect(found.player2Id).toBe('int-test-p2');
    expect(found.status).toBe('scheduled');
  });
});
