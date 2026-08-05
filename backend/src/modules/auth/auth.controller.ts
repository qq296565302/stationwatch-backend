import { Body, Controller, Get, Post, Put, Req } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { Request } from 'express';
import { AuthService } from './auth.service';
import { ChangePasswordDto, LoginDto, RefreshDto } from './dto/auth.dto';
import { Public } from '../../common/decorators/public.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { UserPayload } from '../../common/types/user-payload';
import { LoginResponseDto, UserPublicDto } from '../../common/swagger/entities.dto';

@ApiTags('01. 认证')
@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Public()
  @Post('login')
  @ApiOperation({ summary: '登录', description: '返回 access token（2h）+ refresh token（7d）' })
  @ApiResponse({ status: 200, description: '登录成功', type: LoginResponseDto })
  @ApiResponse({ status: 10001, description: '账号或密码错误' })
  login(@Body() dto: LoginDto, @Req() req: Request) {
    return this.authService.login(dto.username, dto.password, req.ip);
  }

  @Public()
  @Post('refresh')
  @ApiOperation({ summary: '刷新访问令牌', description: '使用 refresh token 换取新的 access token' })
  @ApiResponse({ status: 200, description: '成功返回新 accessToken' })
  @ApiResponse({ status: 10002, description: 'refresh token 过期或无效' })
  refresh(@Body() dto: RefreshDto) {
    return this.authService.refresh(dto.refreshToken);
  }

  @ApiBearerAuth('JWT')
  @Post('logout')
  @ApiOperation({ summary: '登出', description: '撤销当前用户的 refresh token' })
  @ApiResponse({ status: 200, description: '登出成功' })
  logout(@CurrentUser() user: UserPayload) {
    return this.authService.logout(user.id);
  }

  @ApiBearerAuth('JWT')
  @Get('me')
  @ApiOperation({ summary: '当前用户信息' })
  @ApiResponse({ status: 200, description: '成功', type: UserPublicDto })
  me(@CurrentUser() user: UserPayload) {
    return this.authService.getMe(user.id);
  }

  @ApiBearerAuth('JWT')
  @Put('password')
  @ApiOperation({ summary: '修改密码', description: '修改后会自动吊销 refresh token' })
  @ApiResponse({ status: 200, description: '修改成功' })
  @ApiResponse({ status: 10004, description: '原密码错误' })
  changePassword(
    @CurrentUser() user: UserPayload,
    @Body() dto: ChangePasswordDto,
  ) {
    return this.authService.changePassword(user.id, dto.oldPassword, dto.newPassword);
  }
}
