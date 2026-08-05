import { ApiProperty } from '@nestjs/swagger';
import { IsOptional, IsString, IsInt, IsBoolean, Min, Max } from 'class-validator';

export class UpdateStationDto {
  @ApiProperty({ example: '东郊供电所', required: false })
  @IsOptional() @IsString()
  name?: string;

  @ApiProperty({ example: 'EAST', required: false })
  @IsOptional() @IsString()
  code?: string;

  @ApiProperty({ example: '东郊', required: false })
  @IsOptional() @IsString()
  region?: string;

  @ApiProperty({ example: '10kV', required: false })
  @IsOptional() @IsString()
  voltage?: string;

  @ApiProperty({ example: 8, required: false, minimum: 0, maximum: 999 })
  @IsOptional() @IsInt() @Min(0) @Max(999)
  feeders?: number;

  @ApiProperty({ example: 24, required: false, minimum: 0, maximum: 9999 })
  @IsOptional() @IsInt() @Min(0) @Max(9999)
  transformers?: number;

  @ApiProperty({ example: 11, required: false, minimum: 1, maximum: 50 })
  @IsOptional() @IsInt() @Min(1) @Max(50)
  maxDutyItemsPerRecord?: number;

  @ApiProperty({ example: true, required: false })
  @IsOptional() @IsBoolean()
  isActive?: boolean;
}
