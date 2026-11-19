import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { dataSourceOptions } from './data-source';
import { NotificationsModule } from './notifications/notifications.module';

@Module({
  imports: [
    TypeOrmModule.forRoot({ ...dataSourceOptions, migrationsRun: true }),
    NotificationsModule,
  ],
})
export class AppModule {}
