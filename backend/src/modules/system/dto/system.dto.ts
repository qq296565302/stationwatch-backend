import { ApiProperty } from '@nestjs/swagger';
import { IsObject, IsOptional, IsString } from 'class-validator';

export class UpdateSystemConfigDto {
  @ApiProperty({
    example: { 'app.title': '供电所值守云平台', 'duty.max_items_per_record': 11 },
    description: '配置项 key-value 集合（value 可为 string/number/boolean）',
  })
  @IsObject()
  configs: Record<string, string | number | boolean>;

  @ApiProperty({ required: false })
  @IsOptional() @IsString()
  description?: string;
}
