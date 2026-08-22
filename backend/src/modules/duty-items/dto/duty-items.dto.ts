import { ApiProperty } from '@nestjs/swagger';
import { IsString, IsOptional, IsBoolean, Matches } from 'class-validator';

export class CreateDutyItemDto {
  @ApiProperty({ example: '故障报修' })
  @IsString()
  businessType: string;

  @ApiProperty({ example: '东郊路 123 号停电' })
  @IsString()
  content: string;

  @ApiProperty({ example: '08:30', required: false, description: '受理时间，缺省用当前时刻' })
  @IsOptional() @IsString() @Matches(/^([01]\d|2[0-3]):[0-5]\d$/, { message: '受理时间格式应为 HH:MM' })
  acceptTime?: string;

  @ApiProperty({ example: '10:15', required: false, description: '完成时间' })
  @IsOptional() @IsString() @Matches(/^([01]\d|2[0-3]):[0-5]\d$/, { message: '完成时间格式应为 HH:MM' })
  endTime?: string;

  @ApiProperty({ example: true, required: false })
  @IsOptional() @IsBoolean()
  isCompleted?: boolean;

  @ApiProperty({ example: '张三', required: false })
  @IsOptional() @IsString()
  customerName?: string;

  @ApiProperty({ example: '13800138000', required: false })
  @IsOptional() @IsString() @Matches(/^(|1[3-9]\d{9})$/, { message: '手机号格式错误' })
  customerPhone?: string;

  @ApiProperty({ example: '东郊路 123 号', required: false })
  @IsOptional() @IsString()
  customerAddress?: string;

  @ApiProperty({ example: '王值班', required: false })
  @IsOptional() @IsString()
  handler?: string;

  @ApiProperty({ example: '已派单', required: false })
  @IsOptional() @IsString()
  result?: string;

  @ApiProperty({ example: false, required: false, description: '客户满意标签（仅已完成的工单可选）' })
  @IsOptional() @IsBoolean()
  customerSatisfied?: boolean;
}

export class UpdateDutyItemDto {
  @ApiProperty({ example: '业务咨询', required: false })
  @IsOptional() @IsString()
  businessType?: string;

  @ApiProperty({ example: '更新后的内容', required: false })
  @IsOptional() @IsString()
  content?: string;

  @ApiProperty({ example: '08:30', required: false })
  @IsOptional() @IsString() @Matches(/^([01]\d|2[0-3]):[0-5]\d$/, { message: '受理时间格式应为 HH:MM' })
  acceptTime?: string;

  @ApiProperty({ example: '10:15', required: false })
  @IsOptional() @IsString() @Matches(/^([01]\d|2[0-3]):[0-5]\d$/, { message: '完成时间格式应为 HH:MM' })
  endTime?: string;

  @ApiProperty({ example: '张三', required: false })
  @IsOptional() @IsString()
  customerName?: string;

  @ApiProperty({ example: '13800138000', required: false })
  @IsOptional() @IsString() @Matches(/^(|1[3-9]\d{9})$/, { message: '手机号格式错误' })
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

  @ApiProperty({ example: true, required: false })
  @IsOptional() @IsBoolean()
  isCompleted?: boolean;

  @ApiProperty({ example: false, required: false, description: '客户满意标签（仅已完成的工单可选）' })
  @IsOptional() @IsBoolean()
  customerSatisfied?: boolean;
}
