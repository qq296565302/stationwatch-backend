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

  update(dto: UpdateSystemConfigDto, user: UserPayload) {
    if (user.role !== Role.ADMIN) {
      throw new BusinessException(BusinessCode.FORBIDDEN, '仅管理员可修改');
    }
    const now = this.storage.now();
    Object.entries(dto.configs).forEach(([key, value]) => {
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
