import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ThrottlerModule } from '@nestjs/throttler';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { JwtGuard } from './jwt.guard';
import { UserEntity } from './entities/user.entity';
import { AuditLogger } from './audit-logger.service';
import { requireJwtSecret, LOGIN_THROTTLE_LIMIT } from '../env';

@Module({
  imports: [
    TypeOrmModule.forFeature([UserEntity]),
    JwtModule.register({
      secret: requireJwtSecret(),
      signOptions: { expiresIn: '1h' },
    }),
    // Default bucket; login, register and refresh set their own limits with
    // @Throttle() on AuthController. A plain message, not "ThrottlerException" (B-15).
    ThrottlerModule.forRoot({
      throttlers: [{ ttl: 60000, limit: LOGIN_THROTTLE_LIMIT }],
      errorMessage: 'Too many attempts, try again in a minute.',
    }),
  ],
  controllers: [AuthController],
  providers: [AuthService, JwtGuard, AuditLogger],
})
export class AuthModule {}
