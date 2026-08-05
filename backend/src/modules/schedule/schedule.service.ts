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
const SCHEDULE_KEY = 'duty.schedule';
const DEFAULT_CYCLE_DAYS = 5;
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
  getConfig() {
    const raw = this.storage.getSystemConfig(SCHEDULE_KEY);
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

  /** 保存排班配置（仅 admin，controller 把关） */
  updateConfig(dto: UpdateScheduleDto, user: UserPayload) {
    if (dto.groups.length !== dto.cycleDays) {
      throw new BusinessException(BusinessCode.PARAM_INVALID, '轮换周期必须与班组数量一致');
    }
    const seen = new Set<number>();
    for (const g of dto.groups) {
      for (const id of g.memberIds) {
        const u = this.storage.getUser(id);
        if (!u) throw new BusinessException(BusinessCode.PARAM_INVALID, `成员 ID ${id} 不存在`);
        if (u.role !== Role.DUTY_OFFICER && u.role !== Role.SUPERVISOR) {
          throw new BusinessException(BusinessCode.PARAM_INVALID, `${u.realName} 既不是值班员也不是所长`);
        }
        if (seen.has(id)) {
          throw new BusinessException(BusinessCode.PARAM_INVALID, `${u.realName} 被分配到多个组`);
        }
        seen.add(id);
      }
    }
    this.storage.saveSystemConfig({
      configKey: SCHEDULE_KEY,
      configValue: JSON.stringify({ startDate: dto.startDate, cycleDays: dto.cycleDays, groups: dto.groups }),
      description: '值班排班配置',
      updatedBy: user.id,
      updatedAt: this.storage.now(),
    });
    return this.getConfig();
  }

  /** 生成排班表：from（默认今天）起 days 天，按周期循环 */
  getTable(from?: string, days?: number) {
    const cfg = this.getConfig();
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

  /** 获取指定日期的值班人员名单（按排班周期计算），未配置排班时返回空数组 */
  getDutyOfficersOn(date?: string): Array<{ id: number; realName: string; username: string }> {
    const row = this.getTable(date || todayLocal(), 1);
    return row.length ? row[0].members : [];
  }
}
