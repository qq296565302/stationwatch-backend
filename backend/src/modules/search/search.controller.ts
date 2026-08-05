import { Controller, Get, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import { SearchService } from './search.service';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { UserPayload } from '../../common/types/user-payload';

@ApiTags('10. 搜索')
@ApiBearerAuth('JWT')
@Controller('search')
export class SearchController {
  constructor(private readonly service: SearchService) {}

  @Get()
  @ApiOperation({
    summary: '全局搜索',
    description: '搜索记录级字段（otherMatters/pendingIssues/weatherLabel）和工单级字段（content/businessType/customerName/phone/address/handler/result），最多返回 20 条。',
  })
  @ApiQuery({ name: 'q', example: '东郊' })
  @ApiQuery({ name: 'limit', required: false, example: 20 })
  search(
    @Query('q') q: string,
    @Query('limit') limit: string | undefined,
    @CurrentUser() user: UserPayload,
  ) {
    return this.service.search(q, user, limit ? Number(limit) : 20);
  }
}
