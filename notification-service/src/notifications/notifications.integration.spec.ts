import { Test, TestingModule } from '@nestjs/testing';
import { TypeOrmModule } from '@nestjs/typeorm';
import { INestApplication } from '@nestjs/common';
import { NotificationsModule } from './notifications.module';
import { NotificationsService } from './notifications.service';
import { NotificationEntity } from './entities/notification.entity';

const DATABASE_URL = process.env.TEST_DATABASE_URL
  || 'postgresql://tennis:tennis_secret@localhost:5432/test';

async function buildApp(): Promise<INestApplication> {
  const moduleRef: TestingModule = await Test.createTestingModule({
    imports: [
      TypeOrmModule.forRoot({
        type: 'postgres',
        url: DATABASE_URL,
        entities: [NotificationEntity],
        synchronize: true,
      }),
      NotificationsModule,
    ],
  }).compile();
  const app = moduleRef.createNestApplication();
  await app.init();
  return app;
}

describe('Notification persistence (integration, real Postgres)', () => {
  let app: INestApplication;

  afterEach(async () => {
    if (app) await app.close();
  });

  it('notification data survives the service being restarted', async () => {
    app = await buildApp();
    const sent = await app.get(NotificationsService).send({
      recipientId: 'int-test-recipient',
      channel: 'in-app',
      subject: 'Integration Test',
      body: 'This should still be here after a restart',
    });

    // Simulate a service restart: tear down this app instance completely
    // and boot a fresh one against the same database.
    await app.close();
    app = await buildApp();

    const found = await app.get(NotificationsService).findByRecipient('int-test-recipient');

    expect(found.some((n) => n.id === sent.id)).toBe(true);
  });
});
