import { Injectable, Logger } from '@nestjs/common';
import { StorageService } from '../../storage/storage.service';
import { DutyItem } from '../../storage/types';
import { UserPayload } from '../../common/types/user-payload';
import { BusinessException, BusinessCode } from '../../common/exceptions/business.exception';
import { CreateDutyItemDto, UpdateDutyItemDto } from './dto/duty-items.dto';
import { Role } from '../../common/types/role.enum';
import { ScopeService } from '../../common/scope/scope.service';
import { LogsService } from '../logs/logs.service';

/** 单条记录工单数隐藏上限（安全阀）：日常填报无限制，仅防极端情况 */
const MAX_ITEMS_PER_RECORD = 1000;

@Injectable()
export class DutyItemsService {
  private readonly logger = new Logger(DutyItemsService.name);

  constructor(
    private readonly storage: StorageService,
    private readonly scope: ScopeService,
    private readonly logs: LogsService,
  ) {}

  list(recordId: number, user?: UserPayload): DutyItem[] {
    const r = this.storage.getRecord(recordId);
    if (!r) throw new BusinessException(BusinessCode.RECORD_NOT_FOUND, '记录不存在');
    if (user && !this.scope.canAccessStation(user, r.stationId)) {
      throw new BusinessException(BusinessCode.FORBIDDEN, '无权访问');
    }
    return this.storage.getItemsByRecord(recordId);
  }

  create(recordId: number, dto: CreateDutyItemDto, user: UserPayload): DutyItem {
    const record = this.storage.getRecord(recordId);
    if (!record) throw new BusinessException(BusinessCode.RECORD_NOT_FOUND, '记录不存在');
    if (record.status === 'locked' && user.role !== Role.ADMIN) {
      throw new BusinessException(BusinessCode.RECORD_LOCKED, '记录已锁定');
    }
    this.assertStationScope(record, user);

    const currentCount = this.storage.getItemsByRecord(recordId).length;
    if (currentCount >= MAX_ITEMS_PER_RECORD) {
      throw new BusinessException(BusinessCode.ITEM_LIMIT_EXCEEDED, `单条记录工单数已达上限 ${MAX_ITEMS_PER_RECORD}`);
    }

    const now = this.storage.now();
    const item: DutyItem = {
      id: this.storage.nextIdOf('item'),
      recordId,
      businessType: dto.businessType,
      content: dto.content,
      // 受理时间：优先用前端传值（用户填写的历史/指定时间），缺省才用当前时刻
      acceptTime: dto.acceptTime ?? this.formatNow(),
      endTime: dto.isCompleted ? (dto.endTime ?? this.formatNow()) : (dto.endTime ?? null),
      customerName: dto.customerName || null,
      customerPhone: dto.customerPhone || null,
      customerAddress: dto.customerAddress || null,
      handler: dto.handler || null,
      result: dto.result || null,
      isCompleted: !!dto.isCompleted,
      customerSatisfied: dto.customerSatisfied ?? false,
      sortOrder: currentCount,
      createdAt: now,
      updatedAt: now,
    };
    this.storage.saveItem(item);

    // 更新 record 计数
    this.recomputeRecord(recordId);

    this.logs.record({
      userId: user.id,
      username: this.storage.getUser(user.id)?.realName || user.username,
      action: 'item:create',
      targetType: 'item',
      targetId: item.id,
      stationId: record.stationId,
      details: { recordId, content: item.content || '', businessType: item.businessType || '' },
    });

    return item;
  }

  update(recordId: number, itemId: number, dto: UpdateDutyItemDto, user: UserPayload): DutyItem {
    const record = this.storage.getRecord(recordId);
    if (!record) throw new BusinessException(BusinessCode.RECORD_NOT_FOUND, '记录不存在');
    if (record.status === 'locked' && user.role !== Role.ADMIN) {
      throw new BusinessException(BusinessCode.RECORD_LOCKED, '记录已锁定');
    }
    this.assertStationScope(record, user);
    const item = this.storage.getItem(itemId);
    if (!item || item.recordId !== recordId) {
      throw new BusinessException(BusinessCode.NOT_FOUND, '工单不存在');
    }
    if (dto.businessType !== undefined) item.businessType = dto.businessType;
    if (dto.content !== undefined) item.content = dto.content;
    if (dto.acceptTime !== undefined) item.acceptTime = dto.acceptTime;
    if (dto.endTime !== undefined) item.endTime = dto.endTime;
    if (dto.customerName !== undefined) item.customerName = dto.customerName;
    if (dto.customerPhone !== undefined) item.customerPhone = dto.customerPhone;
    if (dto.customerAddress !== undefined) item.customerAddress = dto.customerAddress;
    if (dto.handler !== undefined) item.handler = dto.handler;
    if (dto.result !== undefined) item.result = dto.result;
    if (dto.isCompleted !== undefined) item.isCompleted = dto.isCompleted;
    if (dto.customerSatisfied !== undefined) item.customerSatisfied = dto.customerSatisfied;
    item.updatedAt = this.storage.now();
    this.storage.saveItem(item);

    this.recomputeRecord(recordId);
    this.logs.record({
      userId: user.id,
      username: this.storage.getUser(user.id)?.realName || user.username,
      action: 'item:update',
      targetType: 'item',
      targetId: item.id,
      stationId: record.stationId,
      details: { recordId, content: item.content || '' },
    });
    return item;
  }

  remove(recordId: number, itemId: number, user: UserPayload) {
    const record = this.storage.getRecord(recordId);
    if (!record) throw new BusinessException(BusinessCode.RECORD_NOT_FOUND, '记录不存在');
    if (record.status === 'locked' && user.role !== Role.ADMIN) {
      throw new BusinessException(BusinessCode.RECORD_LOCKED, '记录已锁定');
    }
    this.assertStationScope(record, user);
    const item = this.storage.getItem(itemId);
    if (!item || item.recordId !== recordId) {
      throw new BusinessException(BusinessCode.NOT_FOUND, '工单不存在');
    }
    this.storage.deleteItem(itemId);
    this.recomputeRecord(recordId);
    this.logs.record({
      userId: user.id,
      username: this.storage.getUser(user.id)?.realName || user.username,
      action: 'item:remove',
      targetType: 'item',
      targetId: itemId,
      stationId: record.stationId,
      details: { recordId, content: item.content || '' },
    });
    return { ok: true };
  }

  complete(recordId: number, itemId: number, user: UserPayload): DutyItem {
    const record = this.storage.getRecord(recordId);
    if (!record) throw new BusinessException(BusinessCode.RECORD_NOT_FOUND, '记录不存在');
    if (record.status === 'locked' && user.role !== Role.ADMIN) {
      throw new BusinessException(BusinessCode.RECORD_LOCKED, '记录已锁定');
    }
    this.assertStationScope(record, user);
    const item = this.storage.getItem(itemId);
    if (!item || item.recordId !== recordId) {
      throw new BusinessException(BusinessCode.NOT_FOUND, '工单不存在');
    }
    item.isCompleted = true;
    item.endTime = this.formatNow(); // 强制覆盖
    item.updatedAt = this.storage.now();
    this.storage.saveItem(item);
    this.recomputeRecord(recordId);
    this.logs.record({
      userId: user.id,
      username: this.storage.getUser(user.id)?.realName || user.username,
      action: 'item:complete',
      targetType: 'item',
      targetId: item.id,
      stationId: record.stationId,
      details: { recordId, content: item.content || '' },
    });
    return item;
  }

  uncomplete(recordId: number, itemId: number, user: UserPayload): DutyItem {
    const record = this.storage.getRecord(recordId);
    if (!record) throw new BusinessException(BusinessCode.RECORD_NOT_FOUND, '记录不存在');
    if (record.status === 'locked' && user.role !== Role.ADMIN) {
      throw new BusinessException(BusinessCode.RECORD_LOCKED, '记录已锁定');
    }
    this.assertStationScope(record, user);
    const item = this.storage.getItem(itemId);
    if (!item || item.recordId !== recordId) {
      throw new BusinessException(BusinessCode.NOT_FOUND, '工单不存在');
    }
    item.isCompleted = false;
    item.updatedAt = this.storage.now();
    this.storage.saveItem(item);
    this.recomputeRecord(recordId);
    this.logs.record({
      userId: user.id,
      username: this.storage.getUser(user.id)?.realName || user.username,
      action: 'item:uncomplete',
      targetType: 'item',
      targetId: item.id,
      stationId: record.stationId,
      details: { recordId, content: item.content || '' },
    });
    return item;
  }

  // ====== 内部 ======
  // 站点归属校验：区县管理员无编辑权限；非管理员只能操作本所记录的工单
  private assertStationScope(record: any, user: UserPayload) {
    if (user.role === Role.DISTRICT_ADMIN) {
      throw new BusinessException(BusinessCode.FORBIDDEN, '区县管理员无值班记录编辑权限');
    }
    if (user.role !== Role.ADMIN && !this.scope.canAccessStation(user, record.stationId)) {
      throw new BusinessException(BusinessCode.FORBIDDEN, '无权操作其他站点记录的工单');
    }
  }

  // 值班员在本所范围内可操作任意记录的工单（站点归属由 assertStationScope 保证，
  // 不再限制"只能操作自己创建的记录"，与前端 canAddItemToRecord 口径一致）
  private recomputeRecord(recordId: number) {
    const record = this.storage.getRecord(recordId);
    if (!record) return;
    const items = this.storage.getItemsByRecord(recordId);
    record.itemCount = items.length;
    record.completedCount = items.filter(i => i.isCompleted).length;
    record.updatedAt = this.storage.now();
    this.storage.saveRecord(record);
  }

  private formatNow(): string {
    const now = new Date();
    return `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
  }
}
