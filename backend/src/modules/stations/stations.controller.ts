import { Body, Controller, Get, Param, ParseIntPipe, Post, Put } from '@nestjs/common';
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
  @ApiOperation({ summary: '站点列表' })
  @ApiResponse({ status: 200, description: '成功', type: [StationDto] })
  list() {
    return this.service.list();
  }

  @Get(':id')
  @ApiOperation({ summary: '站点详情' })
  @ApiResponse({ status: 200, description: '成功', type: StationDto })
  @ApiResponse({ status: 10005, description: '站点不存在' })
  findOne(@Param('id', ParseIntPipe) id: number) {
    return this.service.findOne(id);
  }

  @Post()
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: '新增站点（仅管理员）' })
  @ApiResponse({ status: 201, description: '创建成功', type: StationDto })
  create(@Body() dto: CreateStationDto) {
    return this.service.create(dto);
  }

  @Put(':id')
  @Roles(Role.ADMIN, Role.SUPERVISOR)
  @ApiOperation({ summary: '更新站点（管理员任意站点，所长仅本所）' })
  @ApiResponse({ status: 200, description: '成功', type: StationDto })
  @ApiResponse({ status: 10003, description: '权限不足' })
  update(@Param('id', ParseIntPipe) id: number, @Body() dto: UpdateStationDto, @CurrentUser() user: UserPayload) {
    return this.service.update(id, dto, user);
  }
}
