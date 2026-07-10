import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { StatsController } from './stats.controller';
import { StatsService } from './stats.service';
import { PlayerStatsEntity } from './entities/player-stats.entity';
import { H2HEntity } from './entities/h2h.entity';

@Module({
  imports: [TypeOrmModule.forFeature([PlayerStatsEntity, H2HEntity])],
  controllers: [StatsController],
  providers: [StatsService],
})
export class StatsModule {}
