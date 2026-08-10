import { Body, Controller, Delete, Get, Param, ParseIntPipe, Post, Put, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiQuery, ApiResponse, ApiTags } from '@nestjs/swagger';
import { DutyRecordsService } from './duty-records.service';
import {
  FindByDateDto,
  QueryDutyRecordDto,
  UpdateDutyRecordDto,
  UpsertDutyRecordDto,
} from './dto/duty-records.dto';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { UserPayload } from '../../common/types/user-payload';
import { Roles } from '../../common/decorators/roles.decorator';
import { Role } from '../../common/types/role.enum';
import { DutyRecordDto } from '../../common/swagger/entities.dto';

@ApiTags('04. 值班记录')
@ApiBearerAuth('JWT')
@Controller('records')
export class DutyRecordsController {
  constructor(private readonly service: DutyRecordsService) {}

  @Get()
  @ApiOperation({ summary: '分页查询值班记录' })
  @ApiResponse({ status: 200, description: '成功' })
  list(@Query() q: QueryDutyRecordDto, @CurrentUser() user: UserPayload) {
    return this.service.list(q, user);
  }

  @Get('today')
  @ApiOperation({ summary: '查询当天的值班记录（按当前用户站点，admin 可传 stationId 切站）' })
  @ApiQuery({ name: 'stationId', required: false, example: 1 })
  @ApiResponse({ status: 200, description: '成功', type: DutyRecordDto })
  today(@Query('stationId') stationId: string | undefined, @CurrentUser() user: UserPayload) {
    return this.service.today(user, stationId ? Number(stationId) : undefined);
  }

  @Get('find-by-date')
  @ApiOperation({ summary: '按业务日期查找记录（按当前用户站点，admin 可传 stationId）' })
  @ApiQuery({ name: 'date', example: '2026-07-31' })
  @ApiQuery({ name: 'stationId', required: false, example: 1 })
  @ApiResponse({ status: 200, description: '成功', type: DutyRecordDto })
  findByDate(@Query() dto: FindByDateDto, @CurrentUser() user: UserPayload) {
    return this.service.findByDate(dto, user, dto.stationId);
  }

  @Get(':id')
  @ApiOperation({ summary: '值班记录详情' })
  @ApiResponse({ status: 200, description: '成功', type: DutyRecordDto })
  @ApiResponse({ status: 20001, description: '记录不存在' })
  findOne(@Param('id', ParseIntPipe) id: number, @CurrentUser() user: UserPayload) {
    return this.service.findOne(id, user);
  }

  @Post()
  @Roles(Role.DUTY_OFFICER, Role.SUPERVISOR, Role.ADMIN)
  @ApiOperation({
    summary: '智能 upsert（核心接口）',
    description: '同站同一天存在则合并工单，不存在则新建；otherMatters 为整体覆盖；pendingIssues 多行文本与已有遗留问题合并（已解决条目保留，未解决按行匹配），提交完整表单即可。',
  })
  @ApiResponse({ status: 200, description: '成功', type: DutyRecordDto })
  @ApiResponse({ status: 20004, description: '工单数超限' })
  @ApiResponse({ status: 20003, description: '记录已锁定' })
  upsert(@Body() dto: UpsertDutyRecordDto, @CurrentUser() user: UserPayload) {
    return this.service.upsert(dto, user);
  }

  @Put(':id')
  @ApiOperation({ summary: '更新值班记录' })
  @ApiResponse({ status: 200, description: '成功', type: DutyRecordDto })
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateDutyRecordDto,
    @CurrentUser() user: UserPayload,
  ) {
    return this.service.update(id, dto, user);
  }

  @Delete(':id')
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: '删除记录（级联删除工单，仅管理员）' })
  @ApiResponse({ status: 200, description: '成功' })
  remove(@Param('id', ParseIntPipe) id: number) {
    return this.service.remove(id);
  }

  @Post(':id/lock')
  @Roles(Role.SUPERVISOR, Role.ADMIN)
  @ApiOperation({ summary: '锁定记录' })
  @ApiResponse({ status: 200, description: '成功', type: DutyRecordDto })
  lock(@Param('id', ParseIntPipe) id: number, @CurrentUser() user: UserPayload) {
    return this.service.lock(id, user);
  }

  @Post(':id/unlock')
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: '解锁记录（仅管理员）' })
  @ApiResponse({ status: 200, description: '成功', type: DutyRecordDto })
  unlock(@Param('id', ParseIntPipe) id: number) {
    return this.service.unlock(id);
  }

  @Post(':id/pending/:issueId/resolve')
  @Roles(Role.DUTY_OFFICER, Role.SUPERVISOR, Role.ADMIN)
  @ApiOperation({ summary: '确认解决一条遗留问题（记录解决人与解决时间）' })
  @ApiResponse({ status: 200, description: '成功', type: DutyRecordDto })
  @ApiResponse({ status: 20001, description: '记录不存在' })
  @ApiResponse({ status: 20003, description: '记录已锁定' })
  resolvePending(
    @Param('id', ParseIntPipe) id: number,
    @Param('issueId') issueId: string,
    @CurrentUser() user: UserPayload,
  ) {
    return this.service.resolvePending(id, issueId, user);
  }
}
