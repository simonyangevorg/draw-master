import { createParamDecorator, ExecutionContext } from '@nestjs/common';

export interface CurrentUser {
  sub: string;
  email: string;
  name: string;
  role: string;
}

export const CurrentUser = createParamDecorator(
  (_: unknown, ctx: ExecutionContext): CurrentUser => {
    const req = ctx.switchToHttp().getRequest();
    return req['user'];
  },
);
