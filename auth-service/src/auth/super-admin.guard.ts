import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';

/** Platform-level actions (L-02). Runs after JwtGuard, which fills req.user. */
@Injectable()
export class SuperAdminGuard implements CanActivate {
  canActivate(ctx: ExecutionContext): boolean {
    if (ctx.switchToHttp().getRequest()['user']?.role !== 'SUPER_ADMIN') {
      throw new ForbiddenException('Only the platform super-admin can do this');
    }
    return true;
  }
}
