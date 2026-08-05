import { Body, Controller, Get, Put } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { SystemService } from './system.service';
import { UpdateSystemConfigDto } from './dto/system.dto';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { UserPayload } from '../../common/types/user-payload';
import { Roles } from '../../common/decorators/roles.decorator';
import { Role } from '../../common/types/role.enum';

@ApiTags('09. 系统配置')
@ApiBearerAuth('JWT')
@Controller('system')
export class SystemController {
  constructor(private readonly service: SystemService) {}

  @Get('config')
  @ApiOperation({ summary: '获取所有配置（key-value 列表）' })
  getAll() {
    return this.service.getAll();
  }

  @Put('config')
  @Roles(Role.ADMIN, Role.SUPERVISOR)
  @ApiOperation({ summary: '更新配置（管理员任意，所长仅限值班规则白名单）' })
  @ApiResponse({ status: 200, description: '成功' })
  @ApiResponse({ status: 10003, description: '权限不足' })
  update(@Body() dto: UpdateSystemConfigDto, @CurrentUser() user: UserPayload) {
    return this.service.update(dto, user);
  }
}
