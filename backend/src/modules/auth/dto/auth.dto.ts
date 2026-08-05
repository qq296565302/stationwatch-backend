import { ApiProperty } from '@nestjs/swagger';
import { IsString, MinLength, MaxLength } from 'class-validator';

export class LoginDto {
  @ApiProperty({ example: 'admin', description: '登录账号', minLength: 2, maxLength: 50 })
  @IsString()
  @MinLength(2)
  @MaxLength(50)
  username: string;

  @ApiProperty({ example: 'admin123', description: '密码', minLength: 4, maxLength: 100 })
  @IsString()
  @MinLength(4)
  @MaxLength(100)
  password: string;
}

export class RefreshDto {
  @ApiProperty({ description: '刷新令牌（由登录接口返回）' })
  @IsString()
  refreshToken: string;
}

export class ChangePasswordDto {
  @ApiProperty({ example: 'admin123', description: '原密码' })
  @IsString()
  @MinLength(4)
  oldPassword: string;

  @ApiProperty({ example: 'newpass123', description: '新密码（至少 6 位）', minLength: 6, maxLength: 100 })
  @IsString()
  @MinLength(6)
  @MaxLength(100)
  newPassword: string;
}
