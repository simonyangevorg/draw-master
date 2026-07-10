import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { JwtModule } from '@nestjs/jwt';
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
    JwtModule.register({
      global: true,
      secret: process.env.JWT_SECRET || 'fptc_super_secret_change_in_prod',
    }),
    TournamentsModule,
  ],
})
export class AppModule {}
