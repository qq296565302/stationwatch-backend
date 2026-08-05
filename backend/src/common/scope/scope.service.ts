import { Injectable } from '@nestjs/common';
import { StorageService } from '../../storage/storage.service';
import { DutyRecord } from '../../storage/types';
import { Role } from '../types/role.enum';
import { UserPayload } from '../types/user-payload';

/**
 * 组织层级作用域服务：统一「用户可见站点集合」的判断口径
 * 替代散落在各业务 service 中「admin 看全部 vs 其他角色看本所」的二元判断
 *
 * 三级组织：市级 admin → 区县 district_admin → 供电所 supervisor/duty_officer
 * - admin（市级超管）：可见全部供电所
 * - district_admin（区县管理员）：可见本区县下所有供电所
 * - supervisor / duty_officer：仅本所
 */
@Injectable()
export class ScopeService {
  constructor(private readonly storage: StorageService) {}

  /** 用户可见站点 id 集合：admin→全部站；district_admin→本区县站；其余→本所(可空) */
  visibleStationIds(user: UserPayload | null | undefined): number[] {
    if (!user) return [];
    if (user.role === Role.ADMIN) {
      return this.storage.getStations().map((s) => s.id);
    }
    if (user.role === Role.DISTRICT_ADMIN) {
      return this.storage
        .getStations()
        .filter((s) => s.districtId === user.districtId)
        .map((s) => s.id);
    }
    return user.stationId != null ? [user.stationId] : [];
  }

  /** 是否可访问某站点 */
  canAccessStation(user: UserPayload | null | undefined, stationId: number | null): boolean {
    if (!user || stationId == null) return false;
    return this.visibleStationIds(user).includes(stationId);
  }

  /**
   * 解析单站上下文（用于必须落到单一供电所的场景，如当日记录、单站导出）：
   * - admin/district_admin：传了站则校验后使用；未传则回退到首个可见站
   * - supervisor/duty_officer：强制本所
   * 返回 null 表示无可用站点（越权或数据为空）
   */
  resolveStationId(user: UserPayload | null | undefined, stationId?: number): number | null {
    if (!user) return null;
    const ids = this.visibleStationIds(user);
    if (stationId != null) {
      return ids.includes(stationId) ? stationId : null;
    }
    if (user.role === Role.ADMIN || user.role === Role.DISTRICT_ADMIN) {
      return ids.length > 0 ? ids[0] : null;
    }
    return user.stationId != null ? user.stationId : null;
  }

  /**
   * 记录集合按可见站点过滤：
   * - 不传 stationId：admin/district_admin 返回全部可见站记录（聚合），其余角色返回本所记录
   * - 传了 stationId：进一步收敛到单站（超出可见范围则自然为空）
   */
  filterRecordsByStation(
    records: DutyRecord[],
    user: UserPayload | null | undefined,
    stationId?: number,
  ): DutyRecord[] {
    if (!user) return [];
    const ids = new Set(this.visibleStationIds(user));
    return records.filter((r) => {
      if (!ids.has(r.stationId)) return false;
      if (stationId != null && r.stationId !== stationId) return false;
      return true;
    });
  }
}
