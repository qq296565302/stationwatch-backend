import { ApiProperty } from '@nestjs/swagger';

export class ApiResponseDto<T> {
  @ApiProperty({ example: 0, description: '0 表示成功，其他为错误码' })
  code: number;

  @ApiProperty({ description: '业务数据（成功时为结果，失败为 null）' })
  data: T | null;

  @ApiProperty({ example: 'ok' })
  message: string;
}

export class PaginationDto {
  @ApiProperty({ example: 1 })
  page: number;

  @ApiProperty({ example: 20 })
  pageSize: number;

  @ApiProperty({ example: 100 })
  total: number;
}

export class PaginatedResponseDto<T> {
  @ApiProperty({ example: 0 })
  code: number;

  @ApiProperty({
    description: '分页结果',
    type: 'object',
    properties: {
      list: { type: 'array', items: { type: 'object' } },
      total: { type: 'number', example: 100 },
      page: { type: 'number', example: 1 },
      pageSize: { type: 'number', example: 20 },
    },
  })
  data: {
    list: T[];
    total: number;
    page: number;
    pageSize: number;
  };

  @ApiProperty({ example: 'ok' })
  message: string;
}
