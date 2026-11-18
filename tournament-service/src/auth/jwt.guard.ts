import {
  CanActivate, ExecutionContext, Injectable, UnauthorizedException,
} from '@nestjs/common';
import { Request } from 'express';

/**
 * Authenticated-route guard. Identity comes ONLY from the X-User-* headers the
 * gateway sets after validating the JWT (it overwrites any client-supplied
 * value, and this service is not reachable except through the gateway).
 * The service never sees or verifies the raw token, per the project convention,
 * so it needs no JWT secret at all.
 *
 * Kept under the JwtGuard name so the controller decorators stay unchanged.
 */
@Injectable()
export class JwtGuard implements CanActivate {
  canActivate(ctx: ExecutionContext): boolean {
    const req = ctx.switchToHttp().getRequest<Request>();
    const header = (name: string) => {
      const v = req.headers[name];
      return (Array.isArray(v) ? v[0] : v) || undefined;
    };
    const sub = header('x-user-sub');
    if (!sub) throw new UnauthorizedException('Not authenticated');
    req['user'] = {
      sub,
      email: header('x-user-email'),
      name: header('x-user-name'),
      role: header('x-user-role'),
    };
    return true;
  }
}
