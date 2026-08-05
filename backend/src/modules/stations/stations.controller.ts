import { Body, Controller, Get, Param, ParseIntPipe, Put } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { StationsService } from './stations.service';
import { UpdateStationDto } from './dto/stations.dto';
import { Roles } from '../../common/decorators/roles.decorator';
import { Role } from '../../common/types/role.enum';
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

  @Put(':id')
  @ApiOperation({ summary: '更新站点（仅管理员）' })
  @Roles(Role.ADMIN)
  @ApiResponse({ status: 200, description: '成功', type: StationDto })
  @ApiResponse({ status: 10003, description: '权限不足' })
  update(@Param('id', ParseIntPipe) id: number, @Body() dto: UpdateStationDto) {
    return this.service.update(id, dto);
  }
}
