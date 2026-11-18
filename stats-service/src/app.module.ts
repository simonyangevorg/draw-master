import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { StatsModule } from './stats/stats.module';
import { PlayerStatsEntity } from './stats/entities/player-stats.entity';
import { H2HEntity } from './stats/entities/h2h.entity';
import { ProcessedEventEntity } from './stats/entities/processed-event.entity';

@Module({
  imports: [
    TypeOrmModule.forRoot({
      type: 'postgres',
      url: process.env.DATABASE_URL,
      entities: [PlayerStatsEntity, H2HEntity, ProcessedEventEntity],
      synchronize: true,
    }),
    StatsModule,
  ],
})
export class AppModule {}
