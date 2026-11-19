import { requireEnv } from '../env';
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ClientsModule, Transport } from '@nestjs/microservices';
import { TournamentsController } from './tournaments.controller';
import { TournamentsService } from './tournaments.service';
import { TournamentEntity } from './entities/tournament.entity';
import { ParticipantEntity } from './entities/participant.entity';
import { TournamentMatchEntity } from './entities/match.entity';
import { TournamentGroupEntity } from './entities/group.entity';
import { ClubRefEntity } from './entities/club-ref.entity';
import { EventEntity } from './entities/event.entity';
import { JwtGuard } from '../auth/jwt.guard';
import { AuditLogger } from '../audit/audit-logger.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      TournamentEntity,
      ParticipantEntity,
      TournamentMatchEntity,
      TournamentGroupEntity,
      ClubRefEntity,
      EventEntity,
    ]),
    ClientsModule.register([
      {
        name: 'STATS_CLIENT',
        transport: Transport.RMQ,
        options: {
          urls: [requireEnv('RABBITMQ_URL')],
          queue: 'stats_queue',
          queueOptions: { durable: true },
        },
      },
      {
        name: 'NOTIFICATIONS_CLIENT',
        transport: Transport.RMQ,
        options: {
          urls: [requireEnv('RABBITMQ_URL')],
          queue: 'notifications_queue',
          queueOptions: { durable: true },
        },
      },
    ]),
  ],
  controllers: [TournamentsController],
  providers: [TournamentsService, JwtGuard, AuditLogger],
})
export class TournamentsModule {}
