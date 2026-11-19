import {
  Controller, Post, Patch, Get, Body, Param, ParseUUIDPipe, UseGuards, Req, Res, HttpCode,
  ForbiddenException,
} from '@nestjs/common';
import { Throttle, ThrottlerGuard } from '@nestjs/throttler';
import { AuthService } from './auth.service';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';
import { UpdateRoleDto } from './dto/update-role.dto';
import { RefreshTokenDto } from './dto/refresh-token.dto';
import { JwtGuard } from './jwt.guard';
import { LOGIN_THROTTLE_LIMIT, REGISTER_THROTTLE_LIMIT, REFRESH_THROTTLE_LIMIT } from '../env';
import { JwtService } from '@nestjs/jwt';
import { Request, Response } from 'express';

@Controller('auth')
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly jwtService: JwtService,
  ) {}

  // Every unauthenticated auth endpoint is rate-limited per client IP (B-15).
  // The IP is the real client's: the gateway resolves it (real_ip) and
  // overwrites X-Forwarded-For with just that address; main.ts trusts one hop.
  @Post('register')
  @UseGuards(ThrottlerGuard)
  @Throttle({ default: { ttl: 600000, limit: REGISTER_THROTTLE_LIMIT } })
  register(@Body() dto: RegisterDto) {
    return this.authService.register(dto);
  }

  @Post('login')
  @HttpCode(200)
  @UseGuards(ThrottlerGuard)
  @Throttle({ default: { ttl: 60000, limit: LOGIN_THROTTLE_LIMIT } })
  login(@Body() dto: LoginDto) {
    return this.authService.login(dto);
  }

  @Post('refresh')
  @HttpCode(200)
  @UseGuards(ThrottlerGuard)
  @Throttle({ default: { ttl: 60000, limit: REFRESH_THROTTLE_LIMIT } })
  refresh(@Body() dto: RefreshTokenDto) {
    return this.authService.refresh(dto);
  }

  @Get('me')
  @UseGuards(JwtGuard)
  me(@Req() req: Request) {
    return this.authService.getMe(req['user'].sub);
  }

  @Patch('users/:id/role')
  @UseGuards(JwtGuard)
  updateRole(@Req() req: Request, @Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateRoleDto) {
    if (req['user'].role !== 'ORGANISER') {
      throw new ForbiddenException('Only an ORGANISER can change user roles');
    }
    return this.authService.updateRole(id, dto, req['user'].sub);
  }

  /**
   * Called internally by nginx auth_request.
   * - No token   → 200, no user headers   (public request, let service decide)
   * - Valid token → 200, X-User-* headers set
   * - Bad token   → 401, nginx blocks the request before it reaches any service
   */
  @Get('validate')
  validate(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
    const header = req.headers['authorization'];
    if (!header?.startsWith('Bearer ')) {
      return {};
    }
    try {
      const payload = this.jwtService.verify<{ sub?: string; email?: string; name?: string; role?: string; type?: string }>(header.slice(7), { algorithms: ['HS256'] });
      // Only access tokens identify a caller. A refresh token (type: 'refresh',
      // no profile claims) must never be accepted in place of one.
      if (payload.type === 'refresh' || !payload.sub) {
        res.status(401);
        return { message: 'Invalid or expired token' };
      }
      res.setHeader('X-User-Sub', payload.sub);
      if (payload.email) res.setHeader('X-User-Email', payload.email);
      if (payload.name)  res.setHeader('X-User-Name',  payload.name);
      if (payload.role)  res.setHeader('X-User-Role',  payload.role);
      return {};
    } catch {
      res.status(401);
      return { message: 'Invalid or expired token' };
    }
  }

  @Get('health')
  health() {
    return { status: 'ok', service: 'auth-service' };
  }
}
