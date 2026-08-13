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
  @Roles(Role.ADMIN, Role.SUPERVISOR, Role.DISTRICT_ADMIN)
  @ApiOperation({ summary: '用户列表（分页，所长仅本所，区县管理员仅本区县）' })
  @ApiResponse({ status: 200, description: '成功' })
  list(@Query() q: ListUsersQuery, @CurrentUser() user: UserPayload) {
    return this.service.list(q, user);
  }

  @Post()
  @Roles(Role.ADMIN, Role.SUPERVISOR, Role.DISTRICT_ADMIN)
  @ApiOperation({ summary: '创建用户（所长仅本所，区县管理员仅本区县供电所，均不能建管理员）' })
  @ApiResponse({ status: 201, description: '创建成功', type: UserPublicDto })
  @ApiResponse({ status: 10006, description: '用户名已存在' })
  create(@Body() dto: CreateUserDto, @CurrentUser() user: UserPayload) {
    return this.service.create(dto, user);
  }

  @Get(':id')
  @Roles(Role.ADMIN, Role.SUPERVISOR, Role.DISTRICT_ADMIN)
  @ApiOperation({ summary: '用户详情' })
  @ApiResponse({ status: 200, description: '成功', type: UserPublicDto })
  @ApiResponse({ status: 10005, description: '用户不存在' })
  findOne(@Param('id', ParseIntPipe) id: number, @CurrentUser() user: UserPayload) {
    return this.service.findOne(id, user);
  }

  @Put(':id')
  @Roles(Role.ADMIN, Role.SUPERVISOR, Role.DISTRICT_ADMIN)
  @ApiOperation({ summary: '更新用户（所长仅本所，区县管理员仅本区县且不可提权）' })
  @ApiResponse({ status: 200, description: '成功', type: UserPublicDto })
  update(@Param('id', ParseIntPipe) id: number, @Body() dto: UpdateUserDto, @CurrentUser() user: UserPayload) {
    return this.service.update(id, dto, user);
  }

  @Delete(':id')
  @Roles(Role.ADMIN, Role.SUPERVISOR, Role.DISTRICT_ADMIN)
  @ApiOperation({ summary: '删除用户（市级超管/区县管理员/所长，均不可删自己；所长仅本所、区县管理员仅本区县）' })
  @ApiResponse({ status: 200, description: '成功' })
  remove(@Param('id', ParseIntPipe) id: number, @CurrentUser() user: UserPayload) {
    return this.service.remove(id, user);
  }

  @Post(':id/reset-password')
  @Roles(Role.ADMIN, Role.SUPERVISOR, Role.DISTRICT_ADMIN)
  @ApiOperation({ summary: '重置密码', description: '管理员/所长/区县管理员为指定用户重置密码（非管理员仅本所/本区县非管理员）' })
  @ApiResponse({ status: 200, description: '成功' })
  resetPassword(@Param('id', ParseIntPipe) id: number, @Body() dto: ResetPasswordDto, @CurrentUser() user: UserPayload) {
    return this.service.resetPassword(id, dto.newPassword, user);
  }
}
