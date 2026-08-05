import { Body, Controller, Delete, Get, Param, ParseIntPipe, Post, Put } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { DutyItemsService } from './duty-items.service';
import { CreateDutyItemDto, UpdateDutyItemDto } from './dto/duty-items.dto';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { UserPayload } from '../../common/types/user-payload';
import { Roles } from '../../common/decorators/roles.decorator';
import { Role } from '../../common/types/role.enum';
import { DutyItemDto } from '../../common/swagger/entities.dto';

@ApiTags('05. 值班工单')
@ApiBearerAuth('JWT')
@Roles(Role.DUTY_OFFICER, Role.SUPERVISOR, Role.ADMIN)
@Controller('records/:recordId/items')
export class DutyItemsController {
  constructor(private readonly service: DutyItemsService) {}

  @Get()
  @ApiOperation({ summary: '工单列表' })
  @ApiResponse({ status: 200, description: '成功', type: [DutyItemDto] })
  list(@Param('recordId', ParseIntPipe) recordId: number, @CurrentUser() user: UserPayload) {
    return this.service.list(recordId, user);
  }

  @Post()
  @ApiOperation({ summary: '添加工单（acceptTime 自动设为当前 HH:MM）' })
  @ApiResponse({ status: 201, description: '成功', type: DutyItemDto })
  @ApiResponse({ status: 20004, description: '工单数超限' })
  @ApiResponse({ status: 20003, description: '记录已锁定' })
  create(
    @Param('recordId', ParseIntPipe) recordId: number,
    @Body() dto: CreateDutyItemDto,
    @CurrentUser() user: UserPayload,
  ) {
    return this.service.create(recordId, dto, user);
  }

  @Put(':itemId')
  @ApiOperation({ summary: '更新工单' })
  @ApiResponse({ status: 200, description: '成功', type: DutyItemDto })
  update(
    @Param('recordId', ParseIntPipe) recordId: number,
    @Param('itemId', ParseIntPipe) itemId: number,
    @Body() dto: UpdateDutyItemDto,
    @CurrentUser() user: UserPayload,
  ) {
    return this.service.update(recordId, itemId, dto, user);
  }

  @Delete(':itemId')
  @ApiOperation({ summary: '删除工单' })
  @ApiResponse({ status: 200, description: '成功' })
  remove(
    @Param('recordId', ParseIntPipe) recordId: number,
    @Param('itemId', ParseIntPipe) itemId: number,
    @CurrentUser() user: UserPayload,
  ) {
    return this.service.remove(recordId, itemId, user);
  }

  @Post(':itemId/complete')
  @ApiOperation({
    summary: '标记完成',
    description: '强制覆盖 endTime 为当前 HH:MM',
  })
  @ApiResponse({ status: 200, description: '成功', type: DutyItemDto })
  complete(
    @Param('recordId', ParseIntPipe) recordId: number,
    @Param('itemId', ParseIntPipe) itemId: number,
    @CurrentUser() user: UserPayload,
  ) {
    return this.service.complete(recordId, itemId, user);
  }

  @Post(':itemId/uncomplete')
  @ApiOperation({ summary: '撤销完成' })
  @ApiResponse({ status: 200, description: '成功', type: DutyItemDto })
  uncomplete(
    @Param('recordId', ParseIntPipe) recordId: number,
    @Param('itemId', ParseIntPipe) itemId: number,
    @CurrentUser() user: UserPayload,
  ) {
    return this.service.uncomplete(recordId, itemId, user);
  }
}
