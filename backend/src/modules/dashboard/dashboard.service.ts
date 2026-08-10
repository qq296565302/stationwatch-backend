import { Injectable } from '@nestjs/common';
import dayjs = require('dayjs');
import { StorageService } from '../../storage/storage.service';
import { UserPayload } from '../../common/types/user-payload';
import { ScopeService } from '../../common/scope/scope.service';

@Injectable()
export class DashboardService {
  constructor(
    private readonly storage: StorageService,
    private readonly scope: ScopeService,
  ) {}

  /**
   * 顶部统计
   */
  stats(date: string | undefined, user: UserPayload, stationId?: number) {
    const target = date || dayjs().format('YYYY-MM-DD');

    const records = this.scopeRecords(user, stationId);

    // 当天记录
    const todayRecord = records.find(r => r.recordDate === target) || null;
    const todayItemCount = todayRecord?.itemCount ?? 0;
    const todayCompleted = todayRecord?.completedCount ?? 0;

    // 月度记录数
    const monthStart = dayjs(target).startOf('month').format('YYYY-MM-DD');
    const monthEnd = dayjs(target).endOf('month').format('YYYY-MM-DD');
    const monthRecordCount = records.filter(
      r => r.recordDate >= monthStart && r.recordDate <= monthEnd,
    ).length;

    // 锁定数
    const lockedCount = records.filter(r => r.status === 'locked').length;

    // 待办（hasPending）
    const pendingCount = records.filter(
      r => r.hasPending && r.status !== 'archived',
    ).length;

    return {
      todayRecord: todayRecord
        ? {
            id: todayRecord.id,
            recordDate: todayRecord.recordDate,
            stationId: todayRecord.stationId,
            stationName: this.storage.getStation(todayRecord.stationId)?.name,
            itemCount: todayRecord.itemCount,
            completedCount: todayRecord.completedCount,
            status: todayRecord.status,
          }
        : null,
      todayItemCount,
      todayCompleted,
      monthRecordCount,
      lockedCount,
      pendingCount,
    };
  }

  /** 最近活动（按记录最近更新时间倒序，字段结构与前端卡片对齐） */
  activities(limit: number, user: UserPayload, stationId?: number) {
    const records = this.scopeRecords(user, stationId);
    records.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));

    return records.slice(0, limit).map(r => {
      const creator = r.creatorId ? this.storage.getUser(r.creatorId) : null;
      const station = this.storage.getStation(r.stationId);
      let type: string;
      let action: string;
      if (r.status === 'locked') {
        type = 'locked';
        action = '锁定了值班记录';
      } else if (r.hasPending) {
        type = 'warning';
        action = '记录了遗留问题';
      } else if (r.itemCount === 0) {
        type = 'record';
        action = '创建了值班记录';
      } else if (r.completedCount === r.itemCount) {
        type = 'record';
        action = '完成了全部值班事项';
      } else {
        type = 'record';
        action = '更新了值班记录';
      }
      return {
        id: r.id,
        type,
        user: creator?.realName || '未知用户',
        action,
        target: `${r.recordDate}${station ? ' · ' + station.name : ''}`,
        time: dayjs(r.updatedAt).format('MM-DD HH:mm'),
      };
    });
  }

  /** 告警 */
  alerts(user: UserPayload, stationId?: number) {
    const records = this.scopeRecords(user, stationId);

    const alerts: any[] = [];
    // 1. 有遗留问题（归档记录不计入，避免归档后仍持续提醒）
    records.filter(r => r.hasPending && r.status !== 'archived').forEach(r => {
      const station = this.storage.getStation(r.stationId);
      alerts.push({
        type: 'pending',
        level: 'warning',
        recordId: r.id,
        recordDate: r.recordDate,
        stationName: station?.name,
        message: `${r.recordDate} 存在遗留问题`,
      });
    });
    // 2. 已锁定记录
    records.filter(r => r.status === 'locked').forEach(r => {
      const station = this.storage.getStation(r.stationId);
      alerts.push({
        type: 'locked',
        level: 'info',
        recordId: r.id,
        recordDate: r.recordDate,
        stationName: station?.name,
        message: `${r.recordDate} 记录已锁定`,
      });
    });
    // 3. 工单超额
    records.filter(r => r.itemCount > 10).forEach(r => {
      const station = this.storage.getStation(r.stationId);
      alerts.push({
        type: 'overload',
        level: 'warning',
        recordId: r.id,
        recordDate: r.recordDate,
        stationName: station?.name,
        message: `${r.recordDate} 工单数 ${r.itemCount} 接近上限`,
      });
    });

    return alerts;
  }

  /** 月度统计 */
  monthlyStats(year: number, month: number, user: UserPayload, stationId?: number) {
    const records = this.scopeRecords(user, stationId);
    const monthStart = dayjs(`${year}-${String(month).padStart(2, '0')}-01`).startOf('month').format('YYYY-MM-DD');
    const monthEnd = dayjs(monthStart).endOf('month').format('YYYY-MM-DD');
    const monthRecords = records.filter(
      r => r.recordDate >= monthStart && r.recordDate <= monthEnd,
    );

    const totalRecords = monthRecords.length;
    const totalItems = monthRecords.reduce((s, r) => s + r.itemCount, 0);
    const totalCompleted = monthRecords.reduce((s, r) => s + r.completedCount, 0);
    const completionRate = totalItems > 0 ? Math.round((totalCompleted / totalItems) * 100) : 0;
    const pendingCount = monthRecords.filter(r => r.hasPending).length;
    const lockedCount = monthRecords.filter(r => r.status === 'locked').length;

    // 按业务类型分组
    const byBusinessType: Record<string, number> = {};
    monthRecords.forEach(r => {
      this.storage.getItemsByRecord(r.id).forEach(item => {
        byBusinessType[item.businessType] = (byBusinessType[item.businessType] || 0) + 1;
      });
    });

    return {
      year,
      month,
      totalRecords,
      totalItems,
      totalCompleted,
      completionRate,
      pendingCount,
      lockedCount,
      byBusinessType,
    };
  }

  /** 设备状态（从 station 聚合，按可见范围过滤） */
  equipmentStatus(user: UserPayload, stationId?: number) {
    const ids = new Set(this.scope.visibleStationIds(user));
    let stations = this.storage.getStations().filter(s => s.isActive && ids.has(s.id));
    if (stationId) stations = stations.filter(s => s.id === stationId);
    return stations.map(s => ({
      stationId: s.id,
      stationName: s.name,
      voltage: s.voltage,
      feeders: s.feeders,
      transformers: s.transformers,
    }));
  }

  /** 统一记录范围：admin/district_admin 按可见站（可传 stationId 收敛单站），其余角色强制本所 */
  private scopeRecords(user: UserPayload, stationId?: number) {
    return this.scope.filterRecordsByStation(this.storage.getRecords(), user, stationId);
  }
}
