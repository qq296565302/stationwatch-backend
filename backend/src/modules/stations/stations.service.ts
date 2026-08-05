import { Injectable } from '@nestjs/common';
import { StorageService } from '../../storage/storage.service';
import { Station } from '../../storage/types';
import { BusinessException, BusinessCode } from '../../common/exceptions/business.exception';
import { Role } from '../../common/types/role.enum';
import { UserPayload } from '../../common/types/user-payload';
import { CreateStationDto, UpdateStationDto } from './dto/stations.dto';
import { ScopeService } from '../../common/scope/scope.service';

@Injectable()
export class StationsService {
  constructor(
    private readonly storage: StorageService,
    private readonly scope: ScopeService,
  ) {}

  /** 站点列表：按角色可见范围过滤（admin 全部、district_admin 本区县、其余本所） */
  list(user: UserPayload): Station[] {
    const ids = new Set(this.scope.visibleStationIds(user));
    return this.storage.getStations().filter((s) => ids.has(s.id));
  }

  findOne(id: number, user?: UserPayload): Station {
    const s = this.storage.getStation(id);
    if (!s) throw new BusinessException(BusinessCode.NOT_FOUND, '站点不存在');
    if (user && !this.scope.canAccessStation(user, id)) {
      throw new BusinessException(BusinessCode.FORBIDDEN, '无权查看其他站点信息');
    }
    return s;
  }

  create(dto: CreateStationDto, user: UserPayload): Station {
    const now = this.storage.now();
    // 区县管理员只能在本区县下建站；市级超管未指定时默认归张店区(1)
    let districtId: number | undefined = dto.districtId;
    if (user.role === Role.DISTRICT_ADMIN) {
      districtId = user.districtId ?? undefined;
    }
    if (districtId == null) districtId = 1;
    const station: Station = {
      id: this.storage.nextIdOf('station'),
      name: dto.name,
      code: dto.code,
      districtId,
      region: dto.region,
      voltage: dto.voltage,
      feeders: dto.feeders ?? 0,
      transformers: dto.transformers ?? 0,
      maxDutyItemsPerRecord: dto.maxDutyItemsPerRecord ?? 11,
      orderTimeLimit: dto.orderTimeLimit ?? 45,
      isActive: dto.isActive ?? true,
      createdAt: now,
      updatedAt: now,
    };
    return this.storage.saveStation(station);
  }

  update(id: number, dto: UpdateStationDto, user: UserPayload): Station {
    const s = this.storage.getStation(id);
    if (!s) throw new BusinessException(BusinessCode.NOT_FOUND, '站点不存在');
    // 站点归属校验：非 admin 只能编辑可见范围内的站点（所长仅本所、区县管理员仅本区县）
    if (user.role !== Role.ADMIN && !this.scope.canAccessStation(user, id)) {
      throw new BusinessException(BusinessCode.FORBIDDEN, '无权编辑其他站点信息');
    }
    // 区县管理员不可将站点移到本区县之外
    if (dto.districtId !== undefined && user.role === Role.DISTRICT_ADMIN) {
      throw new BusinessException(BusinessCode.FORBIDDEN, '区县管理员不可修改站点所属区县');
    }
    if (dto.name !== undefined) s.name = dto.name;
    if (dto.code !== undefined) s.code = dto.code;
    if (dto.districtId !== undefined) s.districtId = dto.districtId;
    if (dto.region !== undefined) s.region = dto.region;
    if (dto.voltage !== undefined) s.voltage = dto.voltage;
    if (dto.feeders !== undefined) s.feeders = dto.feeders;
    if (dto.transformers !== undefined) s.transformers = dto.transformers;
    if (dto.maxDutyItemsPerRecord !== undefined) s.maxDutyItemsPerRecord = dto.maxDutyItemsPerRecord;
    if (dto.orderTimeLimit !== undefined) s.orderTimeLimit = dto.orderTimeLimit;
    if (dto.isActive !== undefined) s.isActive = dto.isActive;
    s.updatedAt = this.storage.now();
    return this.storage.saveStation(s);
  }

  /** 删除站点：存在用户/值班记录/导出历史引用则拒绝，保证历史数据不悬空 */
  remove(id: number, user: UserPayload) {
    const s = this.storage.getStation(id);
    if (!s) throw new BusinessException(BusinessCode.NOT_FOUND, '站点不存在');
    if (user.role !== Role.ADMIN && !this.scope.canAccessStation(user, id)) {
      throw new BusinessException(BusinessCode.FORBIDDEN, '无权删除该站点');
    }
    const usedByUsers = this.storage.getUsers().some((u) => u.stationId === id);
    const usedByRecords = this.storage.getRecords().some((r) => r.stationId === id);
    const usedByExports = this.storage.getExportHistory().some((h) => h.stationId === id);
    if (usedByUsers || usedByRecords || usedByExports) {
      throw new BusinessException(BusinessCode.CONFLICT, '站点仍被用户/值班记录/导出记录使用，无法删除');
    }
    this.storage.deleteStation(id);
    return { ok: true };
  }
}
