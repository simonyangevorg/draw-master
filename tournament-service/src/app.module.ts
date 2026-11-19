import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { dataSourceOptions } from './data-source';
import { TournamentsModule } from './tournaments/tournaments.module';

@Module({
  imports: [
    TypeOrmModule.forRoot({ ...dataSourceOptions, migrationsRun: true }),
    TournamentsModule,
  ],
})
export class AppModule {}
