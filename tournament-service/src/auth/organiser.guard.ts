import {
  CanActivate, ExecutionContext, ForbiddenException, Injectable,
} from '@nestjs/common';

/**
 * Only ORGANISER accounts may create tournaments. Runs after JwtGuard, which
 * fills req.user from the gateway headers. (Dev plan L-06 replaces this with
 * a "club admin of the target club" check.)
 */
@Injectable()
export class OrganiserGuard implements CanActivate {
  canActivate(ctx: ExecutionContext): boolean {
    const user = ctx.switchToHttp().getRequest()['user'];
    if (user?.role !== 'ORGANISER') {
      throw new ForbiddenException('Only organisers can create tournaments');
    }
    return true;
  }
}
