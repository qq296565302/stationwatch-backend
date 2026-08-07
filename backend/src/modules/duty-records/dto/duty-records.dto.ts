import { ApiProperty } from '@nestjs/swagger';
import { IsString, IsOptional, IsInt, IsIn, IsDateString, IsArray, ValidateNested, IsBoolean, Matches } from 'class-validator';
import { Type } from 'class-transformer';

export class DutyItemUpsertDto {
  @ApiProperty({ example: 1, description: '工单 ID（更新时必传，新建不传）', required: false })
  @IsOptional() @IsInt()
  id?: number;

  @ApiProperty({ example: '故障报修', description: '业务类型' })
  @IsString()
  businessType: string;

  @ApiProperty({ example: '东郊路 123 号停电', description: '受理内容' })
  @IsString()
  content: string;

  @ApiProperty({ example: '08:30', description: '受理时间 HH:MM', required: false, pattern: '^([01]\\d|2[0-3]):[0-5]\\d$' })
  @IsOptional() @IsString() @Matches(/^([01]\d|2[0-3]):[0-5]\d$/, { message: '受理时间格式应为 HH:MM' })
  acceptTime?: string;

  @ApiProperty({ example: '10:15', description: '完成时间 HH:MM', required: false })
  @IsOptional() @IsString() @Matches(/^([01]\d|2[0-3]):[0-5]\d$/, { message: '完成时间格式应为 HH:MM' })
  endTime?: string;

  @ApiProperty({ example: '张三', required: false })
  @IsOptional() @IsString()
  customerName?: string;

  @ApiProperty({ example: '13800138000', required: false, pattern: '^1[3-9]\\d{9}$' })
  @IsOptional() @IsString() @Matches(/^1[3-9]\d{9}$/, { message: '手机号格式错误' })
  customerPhone?: string;

  @ApiProperty({ example: '东郊路 123 号', required: false })
  @IsOptional() @IsString()
  customerAddress?: string;

  @ApiProperty({ example: '王值班', required: false })
  @IsOptional() @IsString()
  handler?: string;

  @ApiProperty({ example: '已修复', required: false })
  @IsOptional() @IsString()
  result?: string;

  @ApiProperty({ example: false, required: false })
  @IsOptional() @IsBoolean()
  isCompleted?: boolean;
}

export class UpsertDutyRecordDto {
  @ApiProperty({ example: '2026-07-31', description: '业务日期 YYYY-MM-DD' })
  @IsDateString()
  recordDate: string;

  @ApiProperty({ example: 1, description: '站点 ID' })
  @IsInt()
  stationId: number;

  @ApiProperty({ example: 'sunny', enum: ['sunny', 'cloudy', 'rainy', 'windy', 'snowy', 'foggy'] })
  @IsString() @IsIn(['sunny', 'cloudy', 'rainy', 'windy', 'snowy', 'foggy'])
  weather: string;

  @ApiProperty({ example: '晴天', description: '天气显示名' })
  @IsString()
  weatherLabel: string;

  @ApiProperty({ type: [DutyItemUpsertDto], description: '工单列表' })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => DutyItemUpsertDto)
  dutyItems: DutyItemUpsertDto[];

  @ApiProperty({ example: '上午完成例行巡检', required: false, description: '其他事项（追加，不覆盖）' })
  @IsOptional() @IsString()
  otherMatters?: string;

  @ApiProperty({ example: '2 号变压器待维修', required: false, description: '遗留问题' })
  @IsOptional() @IsString()
  pendingIssues?: string;
}

export class UpdateDutyRecordDto {
  @ApiProperty({ example: 'cloudy', required: false, enum: ['sunny', 'cloudy', 'rainy', 'windy', 'snowy', 'foggy'] })
  @IsOptional() @IsString() @IsIn(['sunny', 'cloudy', 'rainy', 'windy', 'snowy', 'foggy'])
  weather?: string;

  @ApiProperty({ example: '多云', required: false })
  @IsOptional() @IsString()
  weatherLabel?: string;

  @ApiProperty({ required: false })
  @IsOptional() @IsString()
  otherMatters?: string;

  @ApiProperty({ required: false })
  @IsOptional() @IsString()
  pendingIssues?: string;
}

export class QueryDutyRecordDto {
  @ApiProperty({ example: '2026-07-01', required: false })
  @IsOptional() @IsDateString()
  startDate?: string;

  @ApiProperty({ example: '2026-07-31', required: false })
  @IsOptional() @IsDateString()
  endDate?: string;

  @ApiProperty({ example: 1, required: false })
  @IsOptional() @IsInt()
  stationId?: number;

  @ApiProperty({ example: 'active', required: false, enum: ['active', 'locked', 'archived'] })
  @IsOptional() @IsIn(['active', 'locked', 'archived'])
  status?: 'active' | 'locked' | 'archived';

  @ApiProperty({ example: 1, required: false, default: 1 })
  @IsOptional() @IsInt()
  page?: number = 1;

  @ApiProperty({ example: 20, required: false, default: 20 })
  @IsOptional() @IsInt()
  pageSize?: number = 20;

  @ApiProperty({ example: 'recordDate', required: false, default: 'recordDate' })
  @IsOptional() @IsString()
  sortBy?: string = 'recordDate';

  @ApiProperty({ example: 'desc', required: false, enum: ['asc', 'desc'], default: 'desc' })
  @IsOptional() @IsIn(['asc', 'desc'])
  sortOrder?: 'asc' | 'desc' = 'desc';
}

export class FindByDateDto {
  @ApiProperty({ example: '2026-07-31', description: '业务日期 YYYY-MM-DD' })
  @IsDateString()
  date: string;

  @ApiProperty({ example: 1, required: false, description: '站点 ID（admin 可用，缺省用当前用户站点）' })
  @IsOptional() @Type(() => Number) @IsInt()
  stationId?: number;
}
