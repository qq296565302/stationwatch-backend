import { Injectable } from '@nestjs/common';
import { StorageService } from '../../storage/storage.service';
import { BusinessException, BusinessCode } from '../../common/exceptions/business.exception';
import { Role } from '../../common/types/role.enum';
import { UserPayload } from '../../common/types/user-payload';
import { UpdateScheduleDto } from './dto/schedule.dto';

/**
 * 值班排班：固定轮询（每组一天，周期循环）
 * 配置存 system_configs（configKey=duty.schedule，JSON 字符串），复用现有持久化
 */
const DEFAULT_CYCLE_DAYS = 5;
/** 排班配置按站点隔离：configKey = duty.schedule.{stationId} */
const scheduleKey = (stationId: number) => `duty.schedule.${stationId}`;
const MS_DAY = 86400000;
const WEEKDAYS = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];

interface ScheduleGroup {
  name: string;
  sortOrder: number;
  memberIds: number[];
}
interface ScheduleConfig {
  startDate: string;
  cycleDays: number;
  groups: ScheduleGroup[];
}

const pad = (n: number) => String(n).padStart(2, '0');
const todayLocal = () => {
  const d = new Date();
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
};
// YYYY-MM-DD -> UTC 毫秒（避免时区/DST 偏移）
const parseUTC = (iso: string) => {
  const [y, m, d] = iso.split('-').map(Number);
  return Date.UTC(y, m - 1, d);
};
const toISO = (ms: number) => {
  const d = new Date(ms);
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
};

@Injectable()
export class ScheduleService {
  constructor(private readonly storage: StorageService) {}

  /** 排班配置视图（memberIds -> members 实时解析，忽略已删除/非值班员） */
  getConfig(stationId: number) {
    const raw = this.storage.getSystemConfig(scheduleKey(stationId));
    const base = { configured: false, startDate: null, cycleDays: DEFAULT_CYCLE_DAYS, groups: [], updatedAt: null };
    if (!raw) return base;
    let cfg: ScheduleConfig;
    try {
      cfg = JSON.parse(raw.configValue);
    } catch {
      return base;
    }
    const groups = (cfg.groups || [])
      .sort((a, b) => a.sortOrder - b.sortOrder)
      .map(g => ({
        name: g.name,
        sortOrder: g.sortOrder,
        members: (g.memberIds || [])
          .map(id => this.storage.getUser(id))
          .filter((u): u is NonNullable<typeof u> => !!u && (u.role === Role.DUTY_OFFICER || u.role === Role.SUPERVISOR))
          .map(u => ({ id: u.id, realName: u.realName, username: u.username })),
      }));
    return {
      configured: true,
      startDate: cfg.startDate,
      cycleDays: cfg.cycleDays,
      groups,
      updatedAt: raw.updatedAt,
    };
  }

  /** 保存排班配置（admin 可写任意站点，supervisor 只能写本所，controller 把关角色） */
  updateConfig(dto: UpdateScheduleDto, user: UserPayload) {
    if (dto.groups.length !== dto.cycleDays) {
      throw new BusinessException(BusinessCode.PARAM_INVALID, '轮换周期必须与班组数量一致');
    }
    // 非管理员只能维护本所排班
    if (user.role !== Role.ADMIN && dto.stationId !== user.stationId) {
      throw new BusinessException(BusinessCode.FORBIDDEN, '无权操作其他站点的排班');
    }
    const seen = new Set<number>();
    for (const g of dto.groups) {
      for (const id of g.memberIds) {
        const u = this.storage.getUser(id);
        if (!u) throw new BusinessException(BusinessCode.PARAM_INVALID, `成员 ID ${id} 不存在`);
        if (u.role !== Role.DUTY_OFFICER && u.role !== Role.SUPERVISOR) {
          throw new BusinessException(BusinessCode.PARAM_INVALID, `${u.realName} 既不是值班员也不是所长`);
        }
        // 排班成员必须属于该站点，防止跨站引用
        if (u.stationId !== dto.stationId) {
          throw new BusinessException(BusinessCode.PARAM_INVALID, `${u.realName} 不属于该站点`);
        }
        if (seen.has(id)) {
          throw new BusinessException(BusinessCode.PARAM_INVALID, `${u.realName} 被分配到多个组`);
        }
        seen.add(id);
      }
    }
    // 固化历史记录值班员快照：保存新排班前，先按「旧排班」把该站各历史记录的实际值班员落库，
    // 仅对未填写实际人员（dutyOfficerIds 为空）的记录生效，已人工填写的不覆盖。
    // 否则历史记录展示时会用最新排班回算当天人员，导致改排班后历史值班员漂移。
    const oldView = this.getConfig(dto.stationId);
    const oldStart = oldView.configured ? oldView.startDate : null;
    if (oldStart && oldView.groups.length) {
      const oldStartUTC = parseUTC(oldStart);
      const oldCycle = oldView.cycleDays;
      const oldGroups = oldView.groups;
      this.storage
        .getRecords()
        .filter(r => r.stationId === dto.stationId && !r.dutyOfficerIds)
        .forEach(r => {
          const diffDays = Math.round((parseUTC(r.recordDate) - oldStartUTC) / MS_DAY);
          const idx = ((diffDays % oldCycle) + oldCycle) % oldCycle; // 负数安全（排班起始日之前）
          const g = oldGroups[idx % oldGroups.length];
          if (g && g.members.length) {
            r.dutyOfficerIds = g.members.map(m => m.id).join(',');
            r.updatedAt = this.storage.now();
            this.storage.saveRecord(r);
          }
        });
    }

    this.storage.saveSystemConfig({
      configKey: scheduleKey(dto.stationId),
      configValue: JSON.stringify({ startDate: dto.startDate, cycleDays: dto.cycleDays, groups: dto.groups }),
      description: `值班排班配置（站点${dto.stationId}）`,
      updatedBy: user.id,
      updatedAt: this.storage.now(),
    });
    return this.getConfig(dto.stationId);
  }

  /** 生成排班表：from（默认今天）起 days 天，按周期循环（按站点） */
  getTable(from?: string, days?: number, stationId?: number) {
    const cfg = this.getConfig(stationId ?? 0);
    if (!cfg.configured || cfg.groups.length === 0) return [];
    const startUTC = parseUTC(cfg.startDate as string);
    const fromUTC = parseUTC(from || todayLocal());
    const n = Math.min(Math.max(days ?? 7, 1), 90);
    const groups = [...cfg.groups].sort((a, b) => a.sortOrder - b.sortOrder);
    const rows: {
      date: string;
      weekday: string;
      groupIndex: number;
      groupName: string;
      members: { id: number; realName: string; username: string }[];
    }[] = [];
    for (let i = 0; i < n; i++) {
      const dateUTC = fromUTC + i * MS_DAY;
      const diffDays = Math.round((dateUTC - startUTC) / MS_DAY);
      const idx = ((diffDays % cfg.cycleDays) + cfg.cycleDays) % cfg.cycleDays; // 负数安全
      const g = groups[idx % groups.length];
      rows.push({
        date: toISO(dateUTC),
        weekday: WEEKDAYS[new Date(dateUTC).getUTCDay()],
        groupIndex: idx,
        groupName: g?.name ?? `第${idx + 1}组`,
        members: g?.members ?? [],
      });
    }
    return rows;
  }

  /** 获取指定日期指定站点的值班人员名单（按排班周期计算），未配置排班时返回空数组 */
  getDutyOfficersOn(date?: string, stationId?: number): Array<{ id: number; realName: string; username: string }> {
    const row = this.getTable(date || todayLocal(), 1, stationId);
    return row.length ? row[0].members : [];
  }
}
