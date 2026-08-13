import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import dayjs = require('dayjs');
import { StorageService } from '../../storage/storage.service';
import { DutyRecord, DutyItem } from '../../storage/types';
import { UserPayload } from '../../common/types/user-payload';
import { BusinessException, BusinessCode } from '../../common/exceptions/business.exception';
import {
  FindByDateDto,
  QueryDutyRecordDto,
  UpdateDutyRecordDto,
  UpsertDutyRecordDto,
} from './dto/duty-records.dto';
import { PaginatedResult } from '../../common/types/pagination';
import { Role } from '../../common/types/role.enum';
import { ScheduleService } from '../schedule/schedule.service';
import { ScopeService } from '../../common/scope/scope.service';
import {
  PendingIssue,
  parsePendingIssues,
  serializePendingIssues,
  hasUnresolved,
  textToIssues,
  mergePendingIssues,
} from '../../common/pending-issues';

/** 单条记录工单数隐藏上限（安全阀）：日常填报无限制，仅防极端情况 */
const MAX_ITEMS_PER_RECORD = 1000;

@Injectable()
export class DutyRecordsService {
  private readonly logger = new Logger(DutyRecordsService.name);
  /** 上次自动锁定扫描时间戳（1 分钟内不重复全量扫描） */
  private lastAutoLockAt = 0;

  constructor(
    private readonly storage: StorageService,
    private readonly schedule: ScheduleService,
    private readonly scope: ScopeService,
  ) {}

  /**
   * 自动锁定过期记录（惰性 + 定时任务共同调用，带 1 分钟闸）
   * 规则：班次为当日 08:30 ~ 次日 08:30，值班结束再 24h（即 recordDate 后第 2 天 08:30）后锁定。
   * 例：8/3 记录 → 8/5 08:30 起 status=locked，不可再编辑。
   */
  autoLockExpired(): number {
    const now = Date.now();
    if (now - this.lastAutoLockAt < 60_000) return 0;
    this.lastAutoLockAt = now;

    const current = dayjs();
    let locked = 0;
    this.storage.getRecords().forEach(r => {
      if (r.status !== 'active') return;
      const lockAt = dayjs(r.recordDate).add(2, 'day').hour(8).minute(30).second(0).millisecond(0);
      if (current.isAfter(lockAt)) {
        r.status = 'locked';
        r.lockedAt = this.storage.now();
        r.lockedBy = null; // null = 系统自动锁定
        r.updatedAt = r.lockedAt;
        this.storage.saveRecord(r);
        locked++;
      }
    });
    return locked;
  }

  @Cron(CronExpression.EVERY_5_MINUTES)
  handleAutoLockCron() {
    const n = this.autoLockExpired();
    if (n > 0) this.logger.log(`[自动锁定] 已锁定 ${n} 条过期值班记录`);
  }

  /**
   * 智能 upsert：同站同一天存在则合并工单，不存在则新建
   * 核心接口
   */
  async upsert(dto: UpsertDutyRecordDto, user: UserPayload): Promise<DutyRecordDetail> {
    this.autoLockExpired();
    // 验证站点存在
    const station = this.storage.getStation(dto.stationId);
    if (!station) throw new BusinessException(BusinessCode.NOT_FOUND, '站点不存在');
    // 区县管理员无值班记录编辑权限
    if (user.role === Role.DISTRICT_ADMIN) {
      throw new BusinessException(BusinessCode.FORBIDDEN, '区县管理员无值班记录编辑权限');
    }
    // 站点归属校验：非管理员只能写自己站点
    if (user.role !== Role.ADMIN && !this.scope.canAccessStation(user, dto.stationId)) {
      throw new BusinessException(BusinessCode.FORBIDDEN, '无权操作其他站点的记录');
    }

    const now = this.storage.now();

    // 查找现有记录（同站同一天）
    let record = this.storage.getRecords().find(
      r => r.stationId === dto.stationId && r.recordDate === dto.recordDate,
    );

    if (record) {
      // 已存在：合并
      if (user.role === Role.DUTY_OFFICER && record.creatorId !== user.id) {
        throw new BusinessException(BusinessCode.FORBIDDEN, '只能编辑自己创建的记录');
      }
      if (record.status === 'locked' && user.role !== Role.ADMIN) {
        throw new BusinessException(BusinessCode.RECORD_LOCKED, '记录已锁定，无法编辑');
      }
      record.weather = dto.weather;
      record.weatherLabel = dto.weatherLabel;
      // 覆盖而非追加：前端每次提交的是完整表单，追加会造成遗留问题/其他事项重复
      if (dto.otherMatters !== undefined) record.otherMatters = dto.otherMatters;
      // 遗留问题走合并：保留已解决条目，未解决按 content 逐行匹配消费，防止已解决记录丢失
      if (dto.pendingIssues !== undefined) {
        record.pendingIssues = serializePendingIssues(
          mergePendingIssues(record.pendingIssues, dto.pendingIssues),
        );
      }
    } else {
      // 新建
      const newId = this.storage.nextIdOf('record');
      record = {
        id: newId,
        recordDate: dto.recordDate,
        stationId: dto.stationId,
        weather: dto.weather,
        weatherLabel: dto.weatherLabel,
        creatorId: user.id,
        status: 'active',
        itemCount: 0,
        completedCount: 0,
        hasPending: false,
        otherMatters: dto.otherMatters || '',
        pendingIssues: serializePendingIssues(textToIssues(dto.pendingIssues || '')),
        lockedAt: null,
        lockedBy: null,
        createdAt: now,
        updatedAt: now,
      };
    }

    // 合并工单
    const existingItems = this.storage.getItemsByRecord(record.id);
    const byId = new Map(existingItems.map(i => [i.id, i]));

    for (const itemDto of dto.dutyItems) {
      if (itemDto.id && byId.has(itemDto.id)) {
        // 更新
        const existing = byId.get(itemDto.id)!;
        existing.businessType = itemDto.businessType;
        existing.content = itemDto.content;
        if (itemDto.acceptTime !== undefined) existing.acceptTime = itemDto.acceptTime;
        if (itemDto.endTime !== undefined) existing.endTime = itemDto.endTime;
        existing.customerName = itemDto.customerName ?? null;
        existing.customerPhone = itemDto.customerPhone ?? null;
        existing.customerAddress = itemDto.customerAddress ?? null;
        existing.handler = itemDto.handler ?? null;
        existing.result = itemDto.result ?? null;
        if (itemDto.isCompleted !== undefined) existing.isCompleted = itemDto.isCompleted;
        existing.updatedAt = now;
        this.storage.saveItem(existing);
      } else {
        // 追加
        if (record.itemCount >= MAX_ITEMS_PER_RECORD) {
          throw new BusinessException(BusinessCode.ITEM_LIMIT_EXCEEDED, `单条记录工单数已达上限 ${MAX_ITEMS_PER_RECORD}`);
        }
        const newItem: DutyItem = {
          id: this.storage.nextIdOf('item'),
          recordId: record.id,
          businessType: itemDto.businessType,
          content: itemDto.content,
          acceptTime: itemDto.acceptTime || this.formatNow(),
          endTime: itemDto.endTime || null,
          customerName: itemDto.customerName || null,
          customerPhone: itemDto.customerPhone || null,
          customerAddress: itemDto.customerAddress || null,
          handler: itemDto.handler || null,
          result: itemDto.result || null,
          isCompleted: itemDto.isCompleted ?? false,
          sortOrder: existingItems.length,
          createdAt: now,
          updatedAt: now,
        };
        this.storage.saveItem(newItem);
        existingItems.push(newItem);
      }
    }

    // 重算冗余字段
    const allItems = this.storage.getItemsByRecord(record.id);
    record.itemCount = allItems.length;
    record.completedCount = allItems.filter(i => i.isCompleted).length;
    record.hasPending = hasUnresolved(parsePendingIssues(record.pendingIssues));
    record.updatedAt = now;
    this.storage.saveRecord(record);

    return this.toDetail(record);
  }

  async list(q: QueryDutyRecordDto, user: UserPayload): Promise<PaginatedResult<DutyRecordDetail>> {
    this.autoLockExpired();
    let records = this.storage.getRecords();

    // 权限过滤：admin/district_admin 看可见站（可再按 q.stationId 收敛单站），其余角色强制本所
    records = this.scope.filterRecordsByStation(records, user, q.stationId);

    if (q.startDate) records = records.filter(r => r.recordDate >= q.startDate!);
    if (q.endDate) records = records.filter(r => r.recordDate <= q.endDate!);
    if (q.stationId) records = records.filter(r => r.stationId === q.stationId);
    if (q.status) records = records.filter(r => r.status === q.status);

    // 排序
    const order = q.sortOrder === 'asc' ? 1 : -1;
    records.sort((a, b) => {
      const av = (a as any)[q.sortBy || 'recordDate'];
      const bv = (b as any)[q.sortBy || 'recordDate'];
      if (av === bv) return 0;
      return av > bv ? order : -order;
    });

    const page = q.page || 1;
    const pageSize = q.pageSize || 20;
    const total = records.length;
    const list = records.slice((page - 1) * pageSize, page * pageSize).map(r => this.toDetail(r));

    return { list, total, page, pageSize };
  }

  async today(user: UserPayload, stationId?: number): Promise<DutyRecordDetail | null> {
    this.autoLockExpired();
    const today = dayjs().format('YYYY-MM-DD');
    // admin 切站时用传入 stationId，其余角色固定本所；区县管理员缺省回退本区县首站
    const sid = this.scope.resolveStationId(user, stationId);
    if (!sid) return null;
    const record = this.storage.getRecords().find(
      r => r.stationId === sid && r.recordDate === today,
    );
    return record ? this.toDetail(record) : null;
  }

  async findByDate(dto: FindByDateDto, user: UserPayload, stationId?: number): Promise<DutyRecordDetail | null> {
    this.autoLockExpired();
    let records = this.storage.getRecords().filter(r => r.recordDate === dto.date);
    records = this.scope.filterRecordsByStation(records, user, stationId);
    return records[0] ? this.toDetail(records[0]) : null;
  }

  async findOne(id: number, user?: UserPayload): Promise<DutyRecordDetail> {
    this.autoLockExpired();
    const r = this.storage.getRecord(id);
    if (!r) throw new BusinessException(BusinessCode.RECORD_NOT_FOUND, '记录不存在');
    if (user && !this.scope.canAccessStation(user, r.stationId)) {
      throw new BusinessException(BusinessCode.FORBIDDEN, '无权查看其他站点记录');
    }
    return this.toDetail(r);
  }

  async update(id: number, dto: UpdateDutyRecordDto, user: UserPayload): Promise<DutyRecordDetail> {
    this.autoLockExpired();
    const r = this.storage.getRecord(id);
    if (!r) throw new BusinessException(BusinessCode.RECORD_NOT_FOUND, '记录不存在');
    // 区县管理员无值班记录编辑权限
    if (user.role === Role.DISTRICT_ADMIN) {
      throw new BusinessException(BusinessCode.FORBIDDEN, '区县管理员无值班记录编辑权限');
    }
    // 站点归属校验：非管理员只能操作本所记录
    if (user.role !== Role.ADMIN && !this.scope.canAccessStation(user, r.stationId)) {
      throw new BusinessException(BusinessCode.FORBIDDEN, '无权操作其他站点的记录');
    }
    if (r.status === 'locked' && user.role !== Role.ADMIN) {
      throw new BusinessException(BusinessCode.RECORD_LOCKED, '记录已锁定');
    }
    if (user.role === Role.DUTY_OFFICER && r.creatorId !== user.id) {
      throw new BusinessException(BusinessCode.FORBIDDEN, '只能编辑自己创建的记录');
    }

    if (dto.weather !== undefined) r.weather = dto.weather;
    if (dto.weatherLabel !== undefined) r.weatherLabel = dto.weatherLabel;
    if (dto.otherMatters !== undefined) r.otherMatters = dto.otherMatters;
    if (dto.pendingIssues !== undefined) {
      r.pendingIssues = serializePendingIssues(
        mergePendingIssues(r.pendingIssues, dto.pendingIssues),
      );
    }
    r.hasPending = hasUnresolved(parsePendingIssues(r.pendingIssues));
    r.updatedAt = this.storage.now();
    this.storage.saveRecord(r);
    return this.toDetail(r);
  }

  /**
   * 确认解决一条遗留问题（权限链对齐 update）
   */
  async resolvePending(id: number, issueId: string, user: UserPayload): Promise<DutyRecordDetail> {
    this.autoLockExpired();
    const r = this.storage.getRecord(id);
    if (!r) throw new BusinessException(BusinessCode.RECORD_NOT_FOUND, '记录不存在');
    // 区县管理员无值班记录编辑权限
    if (user.role === Role.DISTRICT_ADMIN) {
      throw new BusinessException(BusinessCode.FORBIDDEN, '区县管理员无值班记录编辑权限');
    }
    // 站点归属校验：非管理员只能操作本所记录
    if (user.role !== Role.ADMIN && !this.scope.canAccessStation(user, r.stationId)) {
      throw new BusinessException(BusinessCode.FORBIDDEN, '无权操作其他站点的记录');
    }
    if (r.status === 'locked' && user.role !== Role.ADMIN) {
      throw new BusinessException(BusinessCode.RECORD_LOCKED, '记录已锁定');
    }
    if (user.role === Role.DUTY_OFFICER && r.creatorId !== user.id) {
      throw new BusinessException(BusinessCode.FORBIDDEN, '只能操作自己创建的记录');
    }

    const list = parsePendingIssues(r.pendingIssues);
    const target = list.find(p => p.id === issueId);
    if (!target) {
      throw new BusinessException(BusinessCode.NOT_FOUND, '遗留问题不存在');
    }
    if (target.isResolved) {
      throw new BusinessException(BusinessCode.PARAM_INVALID, '该遗留问题已确认解决');
    }

    target.isResolved = true;
    target.resolvedAt = this.storage.now();
    target.resolvedBy = user.id;
    // UserPayload 无 realName，必须查库
    target.resolvedByName = this.storage.getUser(user.id)?.realName || user.username;
    r.pendingIssues = serializePendingIssues(list);
    r.hasPending = hasUnresolved(list);
    r.updatedAt = this.storage.now();
    this.storage.saveRecord(r);
    return this.toDetail(r);
  }

  async remove(id: number) {
    if (!this.storage.getRecord(id)) {
      throw new BusinessException(BusinessCode.RECORD_NOT_FOUND, '记录不存在');
    }
    this.storage.deleteRecord(id);
    return { ok: true };
  }

  async lock(id: number, user: UserPayload): Promise<DutyRecordDetail> {
    const r = this.storage.getRecord(id);
    if (!r) throw new BusinessException(BusinessCode.RECORD_NOT_FOUND, '记录不存在');
    // 区县管理员无值班记录编辑权限
    if (user.role === Role.DISTRICT_ADMIN) {
      throw new BusinessException(BusinessCode.FORBIDDEN, '区县管理员无值班记录编辑权限');
    }
    // 站点归属校验：非管理员只能锁定本所记录
    if (user.role !== Role.ADMIN && !this.scope.canAccessStation(user, r.stationId)) {
      throw new BusinessException(BusinessCode.FORBIDDEN, '无权操作其他站点的记录');
    }
    if (r.status === 'locked') {
      throw new BusinessException(BusinessCode.RECORD_LOCKED, '记录已经是锁定状态');
    }
    r.status = 'locked';
    r.lockedAt = this.storage.now();
    r.lockedBy = user.id;
    r.updatedAt = r.lockedAt;
    this.storage.saveRecord(r);
    return this.toDetail(r);
  }

  async unlock(id: number): Promise<DutyRecordDetail> {
    const r = this.storage.getRecord(id);
    if (!r) throw new BusinessException(BusinessCode.RECORD_NOT_FOUND, '记录不存在');
    r.status = 'active';
    r.lockedAt = null;
    r.lockedBy = null;
    r.updatedAt = this.storage.now();
    this.storage.saveRecord(r);
    return this.toDetail(r);
  }

  // ====== 内部工具 ======
  private toDetail(r: DutyRecord): DutyRecordDetail {
    const items = this.storage.getItemsByRecord(r.id);
    const station = this.storage.getStation(r.stationId);
    const creator = this.storage.getUser(r.creatorId);
    // 值班员 = 当天该站点排班名单（按 recordDate + stationId 从值班表取，未配置排班时为空）
    const dutyOfficers = this.schedule.getDutyOfficersOn(r.recordDate, r.stationId).map(o => o.realName);
    // 遗留问题统一出口：解析为数组并权威重算 hasPending（存储层原样透传字符串）
    const pending = parsePendingIssues(r.pendingIssues);
    return {
      ...r,
      pendingIssues: pending,
      hasPending: hasUnresolved(pending),
      items,
      station: station ? { id: station.id, name: station.name, code: station.code } : null,
      creator: creator
        ? { id: creator.id, username: creator.username, realName: creator.realName }
        : null,
      dutyOfficers,
    };
  }

  private formatNow(): string {
    const now = new Date();
    return `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
  }
}

export interface DutyRecordDetail extends Omit<DutyRecord, 'pendingIssues'> {
  pendingIssues: PendingIssue[];
  items: DutyItem[];
  station: { id: number; name: string; code: string } | null;
  creator: { id: number; username: string; realName: string } | null;
  dutyOfficers: string[];
}
