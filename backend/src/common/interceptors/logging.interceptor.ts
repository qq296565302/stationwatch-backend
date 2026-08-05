import { Injectable, NestInterceptor, ExecutionContext, CallHandler, Logger } from '@nestjs/common';
import { Observable } from 'rxjs';
import { tap } from 'rxjs/operators';
import { LogsService } from '../../modules/logs/logs.service';

@Injectable()
export class LoggingInterceptor implements NestInterceptor {
  private readonly logger = new Logger('HTTP');

  constructor(private readonly logsService: LogsService) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    const req = context.switchToHttp().getRequest();
    const res = context.switchToHttp().getResponse();
    const start = Date.now();
    const { method, originalUrl, user, ip, headers } = req;

    return next.handle().pipe(
      tap(() => {
        const duration = Date.now() - start;
        this.logger.log(`${method} ${originalUrl} ${res.statusCode} - ${duration}ms`);
        this.logsService.record({
          userId: user?.id,
          username: user?.username,
          action: this.mapMethodToAction(method),
          targetType: this.extractTargetType(originalUrl),
          ipAddress: ip,
          userAgent: headers['user-agent'],
          statusCode: res.statusCode,
          durationMs: duration,
        });
      }),
    );
  }

  private mapMethodToAction(method: string): string {
    switch (method) {
      case 'POST': return 'create';
      case 'PUT':
      case 'PATCH': return 'update';
      case 'DELETE': return 'delete';
      case 'GET': return 'read';
      default: return method.toLowerCase();
    }
  }

  private extractTargetType(url: string): string {
    // /api/v1/records/123 -> records
    const m = url.match(/\/api\/v\d+\/([^/?]+)/);
    return m ? m[1] : 'unknown';
  }
}
