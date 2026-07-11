import {
  Controller, Post, Patch, Get, Body, Param, UseGuards, Req, Res, HttpCode,
  ForbiddenException,
} from '@nestjs/common';
import { Throttle, ThrottlerGuard } from '@nestjs/throttler';
import { AuthService } from './auth.service';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';
import { UpdateRoleDto } from './dto/update-role.dto';
import { RefreshTokenDto } from './dto/refresh-token.dto';
import { JwtGuard } from './jwt.guard';
import { JwtService } from '@nestjs/jwt';
import { Request, Response } from 'express';

@Controller('auth')
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly jwtService: JwtService,
  ) {}

  @Post('register')
  register(@Body() dto: RegisterDto) {
    return this.authService.register(dto);
  }

  @Post('login')
  @HttpCode(200)
  @UseGuards(ThrottlerGuard)
  @Throttle({ default: { ttl: 60000, limit: 5 } })
  login(@Body() dto: LoginDto) {
    return this.authService.login(dto);
  }

  @Post('refresh')
  @HttpCode(200)
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
  updateRole(@Req() req: Request, @Param('id') id: string, @Body() dto: UpdateRoleDto) {
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
      const payload = this.jwtService.verify<{ sub: string; email: string; name: string; role: string }>(header.slice(7), { algorithms: ['HS256'] });
      res.setHeader('X-User-Sub',   payload.sub);
      res.setHeader('X-User-Email', payload.email);
      res.setHeader('X-User-Name',  payload.name);
      res.setHeader('X-User-Role',  payload.role);
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
