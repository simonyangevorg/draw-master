import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { NotificationsModule } from './notifications/notifications.module';
import { NotificationEntity } from './notifications/entities/notification.entity';

@Module({
  imports: [
    TypeOrmModule.forRoot({
      type: 'postgres',
      url: process.env.DATABASE_URL,
      entities: [NotificationEntity],
      synchronize: true,
    }),
    NotificationsModule,
  ],
})
export class AppModule {}
