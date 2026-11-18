import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { TournamentsModule } from './tournaments/tournaments.module';
import { TournamentEntity } from './tournaments/entities/tournament.entity';
import { ParticipantEntity } from './tournaments/entities/participant.entity';
import { TournamentMatchEntity } from './tournaments/entities/match.entity';
import { TournamentGroupEntity } from './tournaments/entities/group.entity';

@Module({
  imports: [
    TypeOrmModule.forRoot({
      type: 'postgres',
      url: process.env.DATABASE_URL,
      entities: [TournamentEntity, ParticipantEntity, TournamentMatchEntity, TournamentGroupEntity],
      synchronize: true,
    }),
    TournamentsModule,
  ],
})
export class AppModule {}
