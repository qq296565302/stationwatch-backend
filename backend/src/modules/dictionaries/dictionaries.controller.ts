import { Controller, Get, Query } from '@nestjs/common';
import { ApiOperation, ApiTags, ApiQuery } from '@nestjs/swagger';
import { DictionariesService } from './dictionaries.service';
import { Public } from '../../common/decorators/public.decorator';

/**
 * 字典接口
 * 全部标记 @Public() —— 字典为只读参考数据，前端可在登录前/后任意时刻拉取
 */
@ApiTags('06. 字典')
@Controller('dictionaries')
export class DictionariesController {
  constructor(private readonly service: DictionariesService) {}

  @Public()
  @Get('business-types')
  @ApiOperation({ summary: '业务类型' })
  businessTypes() {
    return this.service.businessTypes();
  }

  @Public()
  @Get('accept-contents')
  @ApiOperation({ summary: '受理内容' })
  acceptContents() {
    return this.service.acceptContents();
  }

  @Public()
  @Get('results')
  @ApiOperation({ summary: '处理结果' })
  results() {
    return this.service.resultOptions();
  }

  // 值班员名单需要登录（避免未登录即可拉取用户信息），其余字典保持公开
  @Get('officers')
  @ApiOperation({ summary: '值班员（从 users 表按 stationId 过滤）' })
  @ApiQuery({ name: 'stationId', required: false })
  officers(@Query('stationId') stationId?: string) {
    return this.service.officers(stationId ? Number(stationId) : undefined);
  }

  @Public()
  @Get('weather-options')
  @ApiOperation({ summary: '天气选项（来自 system_configs.weather.options）' })
  weatherOptions() {
    return this.service.weatherOptions();
  }
}
