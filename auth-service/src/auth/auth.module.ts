import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ThrottlerModule } from '@nestjs/throttler';
import { ClientsModule, Transport } from '@nestjs/microservices';
import { AuthController } from './auth.controller';
import { ClubsController } from './clubs.controller';
import { AuthService } from './auth.service';
import { ClubsService } from './clubs.service';
import { JwtGuard } from './jwt.guard';
import { UserEntity } from './entities/user.entity';
import { ClubEntity } from './entities/club.entity';
import { ClubMembershipEntity } from './entities/club-membership.entity';
import { RefreshTokenEntity } from './entities/refresh-token.entity';
import { AuditLogger } from './audit-logger.service';
import { requireJwtSecret, requireEnv, LOGIN_THROTTLE_LIMIT, ACCESS_TOKEN_TTL } from '../env';

@Module({
  imports: [
    TypeOrmModule.forFeature([UserEntity, ClubEntity, ClubMembershipEntity, RefreshTokenEntity]),
    JwtModule.register({
      secret: requireJwtSecret(),
      signOptions: { expiresIn: ACCESS_TOKEN_TTL },
    }),
    // Default bucket; login, register and refresh set their own limits with
    // @Throttle() on AuthController. A plain message, not "ThrottlerException" (B-15).
    ThrottlerModule.forRoot({
      throttlers: [{ ttl: 60000, limit: LOGIN_THROTTLE_LIMIT }],
      errorMessage: 'Too many attempts, try again in a minute.',
    }),
    // Club changes go to tournament-service (club.upserted).
    ClientsModule.register([
      {
        name: 'TOURNAMENTS_CLIENT',
        transport: Transport.RMQ,
        options: {
          urls: [requireEnv('RABBITMQ_URL')],
          queue: 'tournaments_queue',
          queueOptions: { durable: true },
        },
      },
    ]),
  ],
  controllers: [AuthController, ClubsController],
  providers: [AuthService, ClubsService, JwtGuard, AuditLogger],
})
export class AuthModule {}
