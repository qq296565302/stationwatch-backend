import { Injectable } from '@nestjs/common';
import { StorageService } from '../../storage/storage.service';
import { DictionaryItem } from '../../storage/types';

export interface OfficerFromUser {
  id: number;
  label: string;
  username: string;
  role: string;
  stationId: number | null;
  isActive: boolean;
}

@Injectable()
export class DictionariesService {
  constructor(private readonly storage: StorageService) {}

  businessTypes(): DictionaryItem[] {
    return this.storage.getBusinessTypes();
  }

  acceptContents(): DictionaryItem[] {
    return this.storage.getAcceptContents();
  }

  resultOptions(): DictionaryItem[] {
    return this.storage.getResultOptions();
  }

  /**
   * 值班员列表：从 users 表读取，按 stationId 过滤
   * - stationId 缺省：返回所有启用的值班员
   * - stationId 有值：返回该站点的值班员（不含跨站点的）
   * 只返回 role=duty_officer / supervisor 的用户（所长也参与值班）
   */
  officers(stationId?: number): OfficerFromUser[] {
    return this.storage
      .getUsers()
      .filter((u) => u.isActive && ['duty_officer', 'supervisor'].includes(u.role))
      .filter((u) => (stationId == null ? true : u.stationId === stationId))
      .map<OfficerFromUser>((u) => ({
        id: u.id,
        label: u.realName,
        username: u.username,
        role: u.role,
        stationId: u.stationId,
        isActive: u.isActive,
      }))
      .sort((a, b) => a.id - b.id);
  }

  /** 天气选项（从 system_configs 中读取） */
  weatherOptions(): { value: string; label: string }[] {
    const cfg = this.storage.getSystemConfig('weather.options');
    if (cfg) {
      try {
        return JSON.parse(cfg.configValue);
      } catch {
        // fall through
      }
    }
    // 默认
    return [
      { value: 'sunny', label: '晴天' },
      { value: 'cloudy', label: '阴天' },
      { value: 'rainy', label: '雨天' },
      { value: 'windy', label: '大风' },
      { value: 'snowy', label: '雪天' },
      { value: 'foggy', label: '雾天' },
    ];
  }
}
