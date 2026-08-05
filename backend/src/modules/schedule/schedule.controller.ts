import { Body, Controller, Get, Put, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiQuery, ApiResponse, ApiTags } from '@nestjs/swagger';
import { ScheduleService } from './schedule.service';
import { UpdateScheduleDto, ScheduleTableQuery } from './dto/schedule.dto';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { UserPayload } from '../../common/types/user-payload';
import { Role } from '../../common/types/role.enum';

@ApiTags('10. 值班排班')
@ApiBearerAuth('JWT')
@Controller('schedule')
export class ScheduleController {
  constructor(private readonly service: ScheduleService) {}

  @Get('config')
  @ApiOperation({ summary: '获取排班配置（按站点，所有登录用户可见）' })
  @ApiQuery({ name: 'stationId', required: false, example: 1 })
  getConfig(@Query() q: ScheduleTableQuery, @CurrentUser() user: UserPayload) {
    return this.service.getConfig(q.stationId ?? user.stationId ?? 0);
  }

  @Get('table')
  @ApiOperation({ summary: '获取排班表（按站点，所有登录用户可见）' })
  @ApiResponse({ status: 200, description: '排班表数组' })
  getTable(@Query() q: ScheduleTableQuery, @CurrentUser() user: UserPayload) {
    return this.service.getTable(q.from, q.days, q.stationId ?? user.stationId ?? 0);
  }

  @Put('config')
  @Roles(Role.ADMIN, Role.SUPERVISOR)
  @ApiOperation({ summary: '更新排班配置（管理员任意站点，所长仅本所）' })
  @ApiResponse({ status: 200, description: '成功' })
  @ApiResponse({ status: 10004, description: '参数校验失败' })
  updateConfig(@Body() dto: UpdateScheduleDto, @CurrentUser() user: UserPayload) {
    return this.service.updateConfig(dto, user);
  }
}
