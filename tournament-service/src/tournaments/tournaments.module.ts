import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ClientsModule, Transport } from '@nestjs/microservices';
import { TournamentsController } from './tournaments.controller';
import { TournamentsService } from './tournaments.service';
import { TournamentEntity } from './entities/tournament.entity';
import { ParticipantEntity } from './entities/participant.entity';
import { TournamentMatchEntity } from './entities/match.entity';
import { TournamentGroupEntity } from './entities/group.entity';
import { JwtGuard } from '../auth/jwt.guard';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      TournamentEntity,
      ParticipantEntity,
      TournamentMatchEntity,
      TournamentGroupEntity,
    ]),
    ClientsModule.register([
      {
        name: 'STATS_CLIENT',
        transport: Transport.RMQ,
        options: {
          urls: [process.env.RABBITMQ_URL || 'amqp://tennis:tennis_secret@rabbitmq:5672'],
          queue: 'stats_queue',
          queueOptions: { durable: true },
        },
      },
      {
        name: 'NOTIFICATIONS_CLIENT',
        transport: Transport.RMQ,
        options: {
          urls: [process.env.RABBITMQ_URL || 'amqp://tennis:tennis_secret@rabbitmq:5672'],
          queue: 'notifications_queue',
          queueOptions: { durable: true },
        },
      },
    ]),
  ],
  controllers: [TournamentsController],
  providers: [TournamentsService, JwtGuard],
})
export class TournamentsModule {}
