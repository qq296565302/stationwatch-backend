import { ApiProperty } from '@nestjs/swagger';
import { IsString, IsOptional, IsIn, IsInt, MinLength, MaxLength, IsBoolean } from 'class-validator';

export class CreateUserDto {
  @ApiProperty({ example: 'zhangsan', description: '登录账号' })
  @IsString()
  @MinLength(2)
  @MaxLength(50)
  username: string;

  @ApiProperty({ example: 'pass123456', description: '初始密码（至少 6 位）' })
  @IsString()
  @MinLength(6)
  @MaxLength(100)
  password: string;

  @ApiProperty({ example: '张三', description: '真实姓名' })
  @IsString()
  @MinLength(1)
  @MaxLength(50)
  realName: string;

  @ApiProperty({
    example: 'duty_officer',
    enum: ['duty_officer', 'supervisor', 'district_admin', 'admin'],
    description: '角色',
  })
  @IsIn(['duty_officer', 'supervisor', 'district_admin', 'admin'])
  role: 'duty_officer' | 'supervisor' | 'district_admin' | 'admin';

  @ApiProperty({ example: 1, description: '所属站点 ID', required: false })
  @IsOptional()
  @IsInt()
  stationId?: number;

  @ApiProperty({ example: 1, description: '所属区县 ID（创建区县管理员时必填）', required: false })
  @IsOptional()
  @IsInt()
  districtId?: number;
}

export class UpdateUserDto {
  @ApiProperty({ example: '张三', description: '真实姓名', required: false })
  @IsOptional() @IsString() @MaxLength(50)
  realName?: string;

  @ApiProperty({
    example: 'supervisor',
    enum: ['duty_officer', 'supervisor', 'district_admin', 'admin'],
    description: '角色',
    required: false,
  })
  @IsOptional() @IsIn(['duty_officer', 'supervisor', 'district_admin', 'admin'])
  role?: 'duty_officer' | 'supervisor' | 'district_admin' | 'admin';

  @ApiProperty({ example: 1, description: '所属站点 ID', required: false })
  @IsOptional() @IsInt()
  stationId?: number | null;

  @ApiProperty({ example: 1, description: '所属区县 ID', required: false })
  @IsOptional() @IsInt()
  districtId?: number | null;

  @ApiProperty({ example: true, description: '是否启用', required: false })
  @IsOptional()
  isActive?: boolean;
}

export class ResetPasswordDto {
  @ApiProperty({ example: 'newpass123', description: '新密码（至少 6 位）' })
  @IsString()
  @MinLength(6)
  @MaxLength(100)
  newPassword: string;
}

export class ListUsersQuery {
  @ApiProperty({ required: false, enum: ['duty_officer', 'supervisor', 'district_admin', 'admin'] })
  @IsOptional() @IsIn(['duty_officer', 'supervisor', 'district_admin', 'admin'])
  role?: string;

  @ApiProperty({ required: false, description: '按站点过滤' })
  @IsOptional() @IsInt()
  stationId?: number;

  @ApiProperty({ required: false, example: 1, description: '页码' })
  @IsOptional() @IsInt()
  page?: number = 1;

  @ApiProperty({ required: false, example: 20, description: '每页数量' })
  @IsOptional() @IsInt()
  pageSize?: number = 20;
}
