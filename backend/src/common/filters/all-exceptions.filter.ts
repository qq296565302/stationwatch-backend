import { ExceptionFilter, Catch, ArgumentsHost, HttpException, HttpStatus, Logger } from '@nestjs/common';
import { Response } from 'express';
import { BusinessCode } from '../exceptions/business.exception';

@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger('Exception');

  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();

    let code: number = BusinessCode.SERVER_ERROR;
    let message = '服务器内部错误';
    let status = HttpStatus.INTERNAL_SERVER_ERROR;

    if (exception instanceof HttpException) {
      status = exception.getStatus();
      const res = exception.getResponse() as any;
      if (typeof res === 'object' && res !== null) {
        if (typeof res.code === 'number') code = res.code;
        if (typeof res.message === 'string') message = res.message;
        else if (Array.isArray(res.message)) message = res.message.join('; ');
      } else if (typeof res === 'string') {
        message = res;
        code = this.mapStatusToCode(status);
      }
    } else if (exception instanceof Error) {
      this.logger.error(exception.message, exception.stack);
      message = exception.message || message;
    }

    response.status(status).json({
      code,
      data: null,
      message,
    });
  }

  private mapStatusToCode(status: number): number {
    switch (status) {
      case 400:
        return BusinessCode.PARAM_INVALID;
      case 401:
        return BusinessCode.UNAUTHORIZED;
      case 403:
        return BusinessCode.FORBIDDEN;
      case 404:
        return BusinessCode.NOT_FOUND;
      case 409:
        return BusinessCode.CONFLICT;
      default:
        return BusinessCode.SERVER_ERROR;
    }
  }
}
