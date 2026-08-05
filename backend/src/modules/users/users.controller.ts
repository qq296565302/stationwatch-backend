import { Body, Controller, Delete, Get, Param, ParseIntPipe, Post, Put, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { UsersService } from './users.service';
import { CreateUserDto, ListUsersQuery, ResetPasswordDto, UpdateUserDto } from './dto/users.dto';
import { Roles } from '../../common/decorators/roles.decorator';
import { Role } from '../../common/types/role.enum';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { UserPayload } from '../../common/types/user-payload';
import { UserPublicDto } from '../../common/swagger/entities.dto';

@ApiTags('02. 用户管理')
@ApiBearerAuth('JWT')
@Controller('users')
export class UsersController {
  constructor(private readonly service: UsersService) {}

  @Get()
  @Roles(Role.ADMIN, Role.SUPERVISOR)
  @ApiOperation({ summary: '用户列表（分页，所长仅本所）' })
  @ApiResponse({ status: 200, description: '成功' })
  list(@Query() q: ListUsersQuery, @CurrentUser() user: UserPayload) {
    return this.service.list(q, user);
  }

  @Post()
  @Roles(Role.ADMIN, Role.SUPERVISOR)
  @ApiOperation({ summary: '创建用户（所长仅本所，不能建管理员）' })
  @ApiResponse({ status: 201, description: '创建成功', type: UserPublicDto })
  @ApiResponse({ status: 10006, description: '用户名已存在' })
  create(@Body() dto: CreateUserDto, @CurrentUser() user: UserPayload) {
    return this.service.create(dto, user);
  }

  @Get(':id')
  @Roles(Role.ADMIN, Role.SUPERVISOR)
  @ApiOperation({ summary: '用户详情' })
  @ApiResponse({ status: 200, description: '成功', type: UserPublicDto })
  @ApiResponse({ status: 10005, description: '用户不存在' })
  findOne(@Param('id', ParseIntPipe) id: number, @CurrentUser() user: UserPayload) {
    return this.service.findOne(id, user);
  }

  @Put(':id')
  @Roles(Role.ADMIN, Role.SUPERVISOR)
  @ApiOperation({ summary: '更新用户（所长仅本所）' })
  @ApiResponse({ status: 200, description: '成功', type: UserPublicDto })
  update(@Param('id', ParseIntPipe) id: number, @Body() dto: UpdateUserDto, @CurrentUser() user: UserPayload) {
    return this.service.update(id, dto, user);
  }

  @Delete(':id')
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: '删除用户（仅管理员）' })
  @ApiResponse({ status: 200, description: '成功' })
  remove(@Param('id', ParseIntPipe) id: number) {
    return this.service.remove(id);
  }

  @Post(':id/reset-password')
  @Roles(Role.ADMIN, Role.SUPERVISOR)
  @ApiOperation({ summary: '重置密码', description: '管理员/所长为指定用户重置密码（所长仅本所非管理员）' })
  @ApiResponse({ status: 200, description: '成功' })
  resetPassword(@Param('id', ParseIntPipe) id: number, @Body() dto: ResetPasswordDto, @CurrentUser() user: UserPayload) {
    return this.service.resetPassword(id, dto.newPassword, user);
  }
}
