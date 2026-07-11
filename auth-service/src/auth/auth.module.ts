import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ThrottlerModule } from '@nestjs/throttler';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { JwtGuard } from './jwt.guard';
import { UserEntity } from './entities/user.entity';
import { AuditLogger } from './audit-logger.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([UserEntity]),
    JwtModule.register({
      secret: process.env.JWT_SECRET || 'fptc_super_secret_change_in_prod',
      signOptions: { expiresIn: '1h' },
    }),
    // 5 login attempts per IP per 60s — see @Throttle() on AuthController#login
    ThrottlerModule.forRoot([{ ttl: 60000, limit: 5 }]),
  ],
  controllers: [AuthController],
  providers: [AuthService, JwtGuard, AuditLogger],
})
export class AuthModule {}
