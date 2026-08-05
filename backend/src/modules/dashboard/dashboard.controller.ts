import { Controller, Get, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import { DashboardService } from './dashboard.service';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { UserPayload } from '../../common/types/user-payload';

@ApiTags('07. 仪表板')
@ApiBearerAuth('JWT')
@Controller('dashboard')
export class DashboardController {
  constructor(private readonly service: DashboardService) {}

  @Get('stats')
  @ApiOperation({ summary: '顶部统计' })
  @ApiQuery({ name: 'date', required: false, example: '2026-07-31' })
  @ApiQuery({ name: 'stationId', required: false, example: 1 })
  stats(@Query('date') date: string | undefined, @Query('stationId') stationId: string | undefined, @CurrentUser() user: UserPayload) {
    return this.service.stats(date, user, stationId ? Number(stationId) : undefined);
  }

  @Get('activities')
  @ApiOperation({ summary: '最近活动' })
  @ApiQuery({ name: 'limit', required: false, example: 20 })
  @ApiQuery({ name: 'stationId', required: false, example: 1 })
  activities(@Query('limit') limit: string | undefined, @Query('stationId') stationId: string | undefined, @CurrentUser() user: UserPayload) {
    return this.service.activities(limit ? Number(limit) : 20, user, stationId ? Number(stationId) : undefined);
  }

  @Get('alerts')
  @ApiOperation({ summary: '告警列表' })
  @ApiQuery({ name: 'stationId', required: false, example: 1 })
  alerts(@Query('stationId') stationId: string | undefined, @CurrentUser() user: UserPayload) {
    return this.service.alerts(user, stationId ? Number(stationId) : undefined);
  }

  @Get('monthly-stats')
  @ApiOperation({ summary: '月度统计（按业务类型分组）' })
  @ApiQuery({ name: 'year', example: 2026 })
  @ApiQuery({ name: 'month', example: 7 })
  @ApiQuery({ name: 'stationId', required: false, example: 1 })
  monthly(
    @Query('year') year: string,
    @Query('month') month: string,
    @Query('stationId') stationId: string | undefined,
    @CurrentUser() user: UserPayload,
  ) {
    return this.service.monthlyStats(Number(year), Number(month), user, stationId ? Number(stationId) : undefined);
  }

  @Get('equipment-status')
  @ApiOperation({ summary: '设备状态' })
  @ApiQuery({ name: 'stationId', required: false, example: 1 })
  equipment(@Query('stationId') stationId: string | undefined, @CurrentUser() user: UserPayload) {
    return this.service.equipmentStatus(user, stationId ? Number(stationId) : undefined);
  }
}
