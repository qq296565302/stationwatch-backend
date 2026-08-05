// 业务异常，统一抛出后由 AllExceptionsFilter 转换
import { HttpException, HttpStatus } from '@nestjs/common';

export enum BusinessCode {
  SUCCESS = 0,
  // 1xxx 通用
  UNAUTHORIZED = 10001,
  TOKEN_EXPIRED = 10002,
  FORBIDDEN = 10003,
  PARAM_INVALID = 10004,
  NOT_FOUND = 10005,
  CONFLICT = 10006,
  // 2xxx 业务
  RECORD_NOT_FOUND = 20001,
  RECORD_EXISTS = 20002,
  RECORD_LOCKED = 20003,
  ITEM_LIMIT_EXCEEDED = 20004,
  PHONE_INVALID = 20005,
  TIME_INVALID = 20006,
  // 5xxx
  SERVER_ERROR = 50000,
}

export class BusinessException extends HttpException {
  constructor(code: BusinessCode, message: string, status?: HttpStatus) {
    super({ code, message, data: null }, status ?? mapCodeToHttpStatus(code));
  }
}

export function mapCodeToHttpStatus(code: BusinessCode): HttpStatus {
  switch (code) {
    case BusinessCode.UNAUTHORIZED:
    case BusinessCode.TOKEN_EXPIRED:
      return HttpStatus.UNAUTHORIZED;
    case BusinessCode.FORBIDDEN:
    case BusinessCode.RECORD_LOCKED:
      return HttpStatus.FORBIDDEN;
    case BusinessCode.PARAM_INVALID:
    case BusinessCode.PHONE_INVALID:
    case BusinessCode.TIME_INVALID:
    case BusinessCode.ITEM_LIMIT_EXCEEDED:
      return HttpStatus.BAD_REQUEST;
    case BusinessCode.NOT_FOUND:
    case BusinessCode.RECORD_NOT_FOUND:
      return HttpStatus.NOT_FOUND;
    case BusinessCode.RECORD_EXISTS:
    case BusinessCode.CONFLICT:
      return HttpStatus.CONFLICT;
    default:
      return HttpStatus.INTERNAL_SERVER_ERROR;
  }
}
