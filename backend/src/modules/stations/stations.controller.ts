import { Body, Controller, Delete, Get, Param, ParseIntPipe, Post, Put } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { StationsService } from './stations.service';
import { CreateStationDto, UpdateStationDto } from './dto/stations.dto';
import { Roles } from '../../common/decorators/roles.decorator';
import { Role } from '../../common/types/role.enum';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { UserPayload } from '../../common/types/user-payload';
import { StationDto } from '../../common/swagger/entities.dto';

@ApiTags('03. 站点管理')
@ApiBearerAuth('JWT')
@Controller('stations')
export class StationsController {
  constructor(private readonly service: StationsService) {}

  @Get()
  @ApiOperation({ summary: '站点列表（按角色可见范围：admin 全部、区县管理员本区县、其余本所）' })
  @ApiResponse({ status: 200, description: '成功', type: [StationDto] })
  list(@CurrentUser() user: UserPayload) {
    return this.service.list(user);
  }

  @Get(':id')
  @ApiOperation({ summary: '站点详情' })
  @ApiResponse({ status: 200, description: '成功', type: StationDto })
  @ApiResponse({ status: 10005, description: '站点不存在' })
  findOne(@Param('id', ParseIntPipe) id: number, @CurrentUser() user: UserPayload) {
    return this.service.findOne(id, user);
  }

  @Post()
  @Roles(Role.ADMIN, Role.DISTRICT_ADMIN)
  @ApiOperation({ summary: '新增站点（市级超管/区县管理员，区县管理员仅本区县）' })
  @ApiResponse({ status: 201, description: '创建成功', type: StationDto })
  create(@Body() dto: CreateStationDto, @CurrentUser() user: UserPayload) {
    return this.service.create(dto, user);
  }

  @Put(':id')
  @Roles(Role.ADMIN, Role.DISTRICT_ADMIN, Role.SUPERVISOR)
  @ApiOperation({ summary: '更新站点（市级任意、区县本区县、所长仅本所）' })
  @ApiResponse({ status: 200, description: '成功', type: StationDto })
  @ApiResponse({ status: 10003, description: '权限不足' })
  update(@Param('id', ParseIntPipe) id: number, @Body() dto: UpdateStationDto, @CurrentUser() user: UserPayload) {
    return this.service.update(id, dto, user);
  }

  @Delete(':id')
  @Roles(Role.ADMIN, Role.DISTRICT_ADMIN)
  @ApiOperation({ summary: '删除站点（市级超管/区县管理员；被用户/记录/导出引用时禁止删除）' })
  @ApiResponse({ status: 200, description: '成功' })
  @ApiResponse({ status: 10006, description: '站点仍被使用' })
  remove(@Param('id', ParseIntPipe) id: number, @CurrentUser() user: UserPayload) {
    return this.service.remove(id, user);
  }
}
