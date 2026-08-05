import { Controller, Get } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { DistrictsService } from './districts.service';
import { DistrictDto } from '../../common/swagger/entities.dto';

@ApiTags('01. 区县管理')
@ApiBearerAuth('JWT')
@Controller('districts')
export class DistrictsController {
  constructor(private readonly service: DistrictsService) {}

  @Get()
  @ApiOperation({ summary: '区县列表（登录即可，返回全部启用区县，按 sortOrder）' })
  @ApiResponse({ status: 200, description: '成功', type: [DistrictDto] })
  list() {
    return this.service.list();
  }
}
