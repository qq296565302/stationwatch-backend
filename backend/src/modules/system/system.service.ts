import { Injectable } from '@nestjs/common';
import { StorageService } from '../../storage/storage.service';
import { SystemConfig } from '../../storage/types';
import { UserPayload } from '../../common/types/user-payload';
import { BusinessException, BusinessCode } from '../../common/exceptions/business.exception';
import { Role } from '../../common/types/role.enum';
import { UpdateSystemConfigDto } from './dto/system.dto';

@Injectable()
export class SystemService {
  constructor(private readonly storage: StorageService) {}

  getAll(): SystemConfig[] {
    return this.storage.getSystemConfigs();
  }

  getAsMap(): Record<string, any> {
    const result: Record<string, any> = {};
    this.storage.getSystemConfigs().forEach(c => {
      // 尝试解析 JSON
      try {
        result[c.configKey] = JSON.parse(c.configValue);
      } catch {
        result[c.configKey] = c.configValue;
      }
    });
    return result;
  }

  /** 所长可修改的全局配置白名单（值班规则）；其余 key 仅 admin 可写 */
  private readonly SUPERVISOR_WHITELIST = new Set([
    'duty.allow_edit_history',
    'duty.auto_start_time',
    'duty.pending_notify',
    'duty.pending_notify_interval',
  ]);

  update(dto: UpdateSystemConfigDto, user: UserPayload) {
    if (user.role !== Role.ADMIN && user.role !== Role.SUPERVISOR) {
      throw new BusinessException(BusinessCode.FORBIDDEN, '无权修改系统配置');
    }
    const now = this.storage.now();
    Object.entries(dto.configs).forEach(([key, value]) => {
      // 所长只能改白名单内的值班规则，避免改 app.title/weather.options 等全局项
      if (user.role !== Role.ADMIN && !this.SUPERVISOR_WHITELIST.has(key)) {
        throw new BusinessException(BusinessCode.FORBIDDEN, `无权修改配置项 ${key}`);
      }
      const v = typeof value === 'string' ? value : JSON.stringify(value);
      const existing = this.storage.getSystemConfig(key);
      this.storage.saveSystemConfig({
        configKey: key,
        configValue: v,
        description: existing?.description ?? dto.description ?? null,
        updatedBy: user.id,
        updatedAt: now,
      });
    });
    return this.getAll();
  }
}
