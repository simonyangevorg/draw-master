import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import { Actor } from '../tournaments/access';
import { actorFrom } from './jwt.guard';

export type CurrentUser = Actor & { email?: string; name?: string };

/** The authenticated caller (routes behind JwtGuard). */
export const CurrentUser = createParamDecorator(
  (_: unknown, ctx: ExecutionContext): CurrentUser => ctx.switchToHttp().getRequest()['user'],
);

/** The caller if signed in, else null (public routes). */
export const OptionalUser = createParamDecorator(
  (_: unknown, ctx: ExecutionContext): CurrentUser | null => actorFrom(ctx.switchToHttp().getRequest()),
);
