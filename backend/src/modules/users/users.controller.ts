import { Body, Controller, Delete, Get, Param, ParseIntPipe, Post, Put, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { UsersService } from './users.service';
import { CreateUserDto, ListUsersQuery, ResetPasswordDto, UpdateUserDto } from './dto/users.dto';
import { Roles } from '../../common/decorators/roles.decorator';
import { Role } from '../../common/types/role.enum';
import { UserPublicDto } from '../../common/swagger/entities.dto';

@ApiTags('02. 用户管理')
@ApiBearerAuth('JWT')
@Roles(Role.ADMIN)
@Controller('users')
export class UsersController {
  constructor(private readonly service: UsersService) {}

  @Get()
  @ApiOperation({ summary: '用户列表（分页）' })
  @ApiResponse({ status: 200, description: '成功' })
  list(@Query() q: ListUsersQuery) {
    return this.service.list(q);
  }

  @Post()
  @ApiOperation({ summary: '创建用户' })
  @ApiResponse({ status: 201, description: '创建成功', type: UserPublicDto })
  @ApiResponse({ status: 10006, description: '用户名已存在' })
  create(@Body() dto: CreateUserDto) {
    return this.service.create(dto);
  }

  @Get(':id')
  @ApiOperation({ summary: '用户详情' })
  @ApiResponse({ status: 200, description: '成功', type: UserPublicDto })
  @ApiResponse({ status: 10005, description: '用户不存在' })
  findOne(@Param('id', ParseIntPipe) id: number) {
    return this.service.findOne(id);
  }

  @Put(':id')
  @ApiOperation({ summary: '更新用户' })
  @ApiResponse({ status: 200, description: '成功', type: UserPublicDto })
  update(@Param('id', ParseIntPipe) id: number, @Body() dto: UpdateUserDto) {
    return this.service.update(id, dto);
  }

  @Delete(':id')
  @ApiOperation({ summary: '删除用户' })
  @ApiResponse({ status: 200, description: '成功' })
  remove(@Param('id', ParseIntPipe) id: number) {
    return this.service.remove(id);
  }

  @Post(':id/reset-password')
  @ApiOperation({ summary: '重置密码', description: '管理员为指定用户重置密码' })
  @ApiResponse({ status: 200, description: '成功' })
  resetPassword(@Param('id', ParseIntPipe) id: number, @Body() dto: ResetPasswordDto) {
    return this.service.resetPassword(id, dto.newPassword);
  }
}
