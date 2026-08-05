import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayNotEmpty,
  IsArray,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';

export class ScheduleGroupDto {
  @ApiProperty({ example: '第一组' })
  @IsString() @IsNotEmpty() @MaxLength(50)
  name: string;

  @ApiProperty({ example: 1 })
  @IsInt() @Min(1)
  sortOrder: number;

  @ApiProperty({ example: [4, 5, 6], description: '值班员用户 ID 列表' })
  @IsArray() @ArrayNotEmpty() @IsInt({ each: true })
  memberIds: number[];
}

export class UpdateScheduleDto {
  @ApiProperty({ example: 1, description: '站点 ID' })
  @IsInt()
  stationId: number;

  @ApiProperty({ example: '2026-08-03' })
  @IsString() @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: 'startDate 须为 YYYY-MM-DD' })
  startDate: string;

  @ApiProperty({ example: 5, description: '轮换周期天数（须与组数一致）' })
  @IsInt() @Min(1) @Max(60)
  cycleDays: number;

  @ApiProperty({ type: [ScheduleGroupDto] })
  @IsArray() @ArrayNotEmpty()
  @ValidateNested({ each: true })
  @Type(() => ScheduleGroupDto)
  groups: ScheduleGroupDto[];
}

export class ScheduleTableQuery {
  @ApiProperty({ required: false, example: 1, description: '站点 ID（缺省用当前用户站点）' })
  @IsOptional() @Type(() => Number) @IsInt()
  stationId?: number;

  @ApiProperty({ required: false, example: '2026-08-03' })
  @IsOptional() @IsString() @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: 'from 须为 YYYY-MM-DD' })
  from?: string;

  @ApiProperty({ required: false, example: 7, description: '天数 1-90，默认 7' })
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(90)
  days?: number;
}
