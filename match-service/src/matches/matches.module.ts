import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { MatchesController } from './matches.controller';
import { MatchesService } from './matches.service';
import { MatchEntity } from './entities/match.entity';

@Module({
  imports: [TypeOrmModule.forFeature([MatchEntity])],
  controllers: [MatchesController],
  providers: [MatchesService],
})
export class MatchesModule {}
