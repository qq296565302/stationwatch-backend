import { createParamDecorator, ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { UserPayload } from '../types/user-payload';

export const CurrentUser = createParamDecorator(
  (data: keyof UserPayload | undefined, ctx: ExecutionContext): any => {
    const request = ctx.switchToHttp().getRequest();
    const user = request.user as UserPayload;
    if (!user) throw new UnauthorizedException('未认证');
    return data ? user[data] : user;
  },
);
