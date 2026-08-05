import {
  Injectable,
  CanActivate,
  ExecutionContext,
  UnauthorizedException,
  Inject,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { Request } from 'express';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator';
import { UserPayload } from '../types/user-payload';

@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly jwtService: JwtService,
    private readonly config: ConfigService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;

    const request = context.switchToHttp().getRequest<Request>();
    const token = this.extractToken(request);
    if (!token) {
      throw new UnauthorizedException('未提供访问令牌');
    }

    try {
      const payload = await this.jwtService.verifyAsync(token, {
        secret: this.config.get('JWT_SECRET'),
      });
      (request as any).user = {
        id: Number(payload.sub),
        username: payload.username,
        role: payload.role,
        stationId: payload.stationId ?? null,
      } as UserPayload;
      return true;
    } catch (e: any) {
      if (e?.name === 'TokenExpiredError') {
        throw new UnauthorizedException('访问令牌已过期');
      }
      throw new UnauthorizedException('访问令牌无效');
    }
  }

  private extractToken(req: Request): string | undefined {
    const auth = req.headers['authorization'];
    if (!auth) return undefined;
    const [type, token] = (auth as string).split(' ');
    return type === 'Bearer' ? token : undefined;
  }
}
