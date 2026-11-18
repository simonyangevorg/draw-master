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
    // Login attempts per IP per 60s (default 5, env LOGIN_THROTTLE_LIMIT); see @Throttle() on AuthController#login
    ThrottlerModule.forRoot([{ ttl: 60000, limit: LOGIN_THROTTLE_LIMIT }]),
  ],
  controllers: [AuthController],
  providers: [AuthService, JwtGuard, AuditLogger],
})
export class AuthModule {}
