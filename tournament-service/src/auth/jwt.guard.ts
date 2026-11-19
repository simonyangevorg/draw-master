import {
  CanActivate, ExecutionContext, Injectable, UnauthorizedException,
} from '@nestjs/common';
import { Request } from 'express';
import { Actor, parseClubs } from '../tournaments/access';

const header = (req: Request, name: string) => {
  const v = req.headers[name];
  return (Array.isArray(v) ? v[0] : v) || undefined;
};

/**
 * The caller, from the X-User-* headers the gateway sets after validating the
 * JWT (it overwrites any client-supplied value, and this service is reachable
 * only through the gateway). Null for an anonymous request. The service never
 * sees or verifies the raw token, per the project convention.
 */
export function actorFrom(req: Request): (Actor & { email?: string; name?: string }) | null {
  const sub = header(req, 'x-user-sub');
  if (!sub) return null;
  return {
    sub,
    email: header(req, 'x-user-email'),
    name: header(req, 'x-user-name'),
    role: header(req, 'x-user-role'),
    clubs: parseClubs(header(req, 'x-user-clubs')),
  };
}

/** Authenticated-route guard: puts the caller on req.user, or 401s. */
@Injectable()
export class JwtGuard implements CanActivate {
  canActivate(ctx: ExecutionContext): boolean {
    const req = ctx.switchToHttp().getRequest<Request>();
    const actor = actorFrom(req);
    if (!actor) throw new UnauthorizedException('Not authenticated');
    req['user'] = actor;
    return true;
  }
}
