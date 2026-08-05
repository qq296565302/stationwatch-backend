import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { MongoClient, Db } from 'mongodb';
import * as bcrypt from 'bcryptjs';
import {
  Station,
  User,
  DutyRecord,
  DutyItem,
  DictionaryItem,
  Officer,
  SystemConfig,
  ExportHistory,
  OperationLog,
  RefreshTokenEntry,
} from './types';
import { seedInitialData } from './seed';

/**
 * MongoDB 持久化的存储服务
 * 接口与 StorageService 完全一致，运行时按需替换（STORAGE_MODE=mongo）
 *
 * 策略：内存缓存 + 异步落库
 * - 启动时从 MongoDB 全量加载到内存 Map，读操作走内存（保持同步接口）
 * - 写操作同步更新内存 Map，标记 dirty，由定时器（默认 2s）或退出时 flush 到 Mongo
 * - flush 用 bulkWrite 幂等同步：deleteMany($nin) 清理已删除 + replaceOne(upsert) 覆盖已有
 * - 写入序列化：通过 promise chain 避免并发写
 *
 * 字典采用单集合多类型：dictionary 集合内用 type 字段区分业务类型/受理内容/处理结果/值班员
 */
const DEFAULT_FLUSH_INTERVAL_MS = 2000;
const OPERATION_LOG_LIMIT = 10000;

const DICT_TYPE = {
  BUSINESS_TYPE: 'business_type',
  ACCEPT_CONTENT: 'accept_content',
  RESULT_OPTION: 'result_option',
  OFFICER: 'officer',
} as const;
type DictType = (typeof DICT_TYPE)[keyof typeof DICT_TYPE];

@Injectable()
export class MongoStorageService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(MongoStorageService.name);

  // 主存储
  private stations = new Map<number, Station>();
  private users = new Map<number, User>();
  private records = new Map<number, DutyRecord>();
  private items = new Map<number, DutyItem>();

  // 字典（内存中按类型分离，持久化为 dictionary 集合按 type 字段区分）
  private businessTypes = new Map<number, DictionaryItem>();
  private acceptContents = new Map<number, DictionaryItem>();
  private resultOptions = new Map<number, DictionaryItem>();
  private officers = new Map<number, Officer>();

  // 配置与历史
  private systemConfigs = new Map<string, SystemConfig>();
  private exportHistory = new Map<number, ExportHistory>();
  private operationLogs: OperationLog[] = [];

  // Refresh token（替代 Redis）
  private refreshTokens = new Map<number, RefreshTokenEntry>();

  // ID 自增
  private nextId: Record<string, number> = {
    station: 1,
    user: 1,
    record: 1,
    item: 1,
    businessType: 1,
    acceptContent: 1,
    resultOption: 1,
    officer: 1,
    export: 1,
    operationLog: 1,
  };

  // MongoDB 专属
  private uri: string;
  private client: MongoClient | null = null;
  private db: Db | null = null;

  // 落库控制
  private flushIntervalMs: number;
  private dirty = false;
  private flushTimer: NodeJS.Timeout | null = null;
  private writeChain: Promise<void> = Promise.resolve();
  private initialized = false;

  constructor(config: ConfigService) {
    this.uri = config.get<string>('MONGODB_URI') || '';
    if (!this.uri) {
      throw new Error('MONGODB_URI 未配置，无法启用 mongo 存储模式');
    }
    const interval = Number(
      config.get('MONGODB_FLUSH_INTERVAL_MS') ?? config.get('STORAGE_FLUSH_INTERVAL_MS'),
    );
    this.flushIntervalMs = Number.isFinite(interval) && interval > 0 ? interval : DEFAULT_FLUSH_INTERVAL_MS;
  }

  // ============ 生命周期 ============
  async onModuleInit() {
    if (this.initialized) return; // 防止双重初始化
    this.initialized = true;
    try {
      await this.connectAndLoad();
      this.migrateLegacySchedule();
      // 首次启动或库为空时写入种子数据
      if (this.stations.size === 0) {
        this.logger.log('[MongoStorage] 库中无数据，写入种子数据...');
        seedInitialData(this as any);
        await this.flush(); // seed 立即落库，不等定时器
      }
      await this.ensureIndexes();
      this.logger.log(
        `[MongoStorage] 已连接 ${this.db?.databaseName}，stations=${this.stations.size}, users=${this.users.size}, records=${this.records.size}, items=${this.items.size}`,
      );
    } catch (e: any) {
      this.logger.error(`[MongoStorage] 初始化失败: ${e.message}`);
      throw e; // fail-fast：连接失败则拒绝启动，避免静默降级丢数据
    }
  }

  /**
   * 排班配置迁移：旧版全局 key `duty.schedule` → 按站点 key `duty.schedule.1`
   * 幂等：已有新 key 或不存在旧 key 时跳过
   */
  private migrateLegacySchedule() {
    const legacy = this.getSystemConfig('duty.schedule');
    if (legacy && !this.getSystemConfig('duty.schedule.1')) {
      this.saveSystemConfig({
        ...legacy,
        configKey: 'duty.schedule.1',
        description: '值班排班配置（站点1）',
        updatedAt: this.now(),
      });
      this.logger.log('[MongoStorage] 已迁移排班配置 duty.schedule → duty.schedule.1');
    }
  }

  async onModuleDestroy() {
    if (this.flushTimer) {
      clearTimeout(this.flushTimer);
      this.flushTimer = null;
    }
    if (this.dirty) {
      this.logger.log('[MongoStorage] 退出前最后一次落库...');
      try {
        await this.flush();
      } catch (e: any) {
        this.logger.error(`退出落库失败: ${e.message}`);
      }
    }
    await this.writeChain;
    if (this.client) {
      await this.client.close();
      this.client = null;
      this.db = null;
    }
  }

  private async connectAndLoad() {
    this.client = new MongoClient(this.uri, {
      connectTimeoutMS: 10000,
      serverSelectionTimeoutMS: 5000,
    });
    await this.client.connect();
    this.db = this.client.db(); // 库名取自 URI path 段（DutyRecord）
    await this.db.command({ ping: 1 });

    // 并行全量拉取，投影剔除 _id 保证对象与实体类型一致
    const [stations, users, records, items, dictionary, configs, exportsArr, logs, tokens] =
      await Promise.all([
        this.db.collection('stations').find({}, { projection: { _id: 0 } }).toArray(),
        this.db.collection('users').find({}, { projection: { _id: 0 } }).toArray(),
        this.db.collection('records').find({}, { projection: { _id: 0 } }).toArray(),
        this.db.collection('items').find({}, { projection: { _id: 0 } }).toArray(),
        this.db.collection('dictionary').find({}, { projection: { _id: 0 } }).toArray(),
        this.db.collection('systemConfigs').find({}, { projection: { _id: 0 } }).toArray(),
        this.db.collection('exportHistory').find({}, { projection: { _id: 0 } }).toArray(),
        this.db.collection('operationLogs').find({}, { projection: { _id: 0 } }).toArray(),
        this.db.collection('refreshTokens').find({}, { projection: { _id: 0 } }).toArray(),
      ]);

    this.stations = toMap<number, Station>(stations as unknown as Station[], (x) => x.id);
    this.users = toMap<number, User>(users as unknown as User[], (x) => x.id);
    this.records = toMap<number, DutyRecord>(records as unknown as DutyRecord[], (x) => x.id);
    this.items = toMap<number, DutyItem>(items as unknown as DutyItem[], (x) => x.id);
    this.systemConfigs = toMap<string, SystemConfig>(
      configs as unknown as SystemConfig[],
      (x) => x.configKey,
    );
    this.exportHistory = toMap<number, ExportHistory>(
      exportsArr as unknown as ExportHistory[],
      (x) => x.id,
    );
    this.operationLogs = Array.isArray(logs)
      ? (logs as unknown as OperationLog[]).slice(-OPERATION_LOG_LIMIT)
      : [];
    this.refreshTokens = new Map<number, RefreshTokenEntry>(
      ((tokens as unknown as RefreshTokenEntry[]) || [])
        .filter((t) => t.expiresAt > Date.now())
        .map((t) => [t.userId, t]),
    );

    // dictionary 按 type 拆分进 4 个 Map（剥离 type 字段，保持实体结构与 DictionaryItem 一致）
    this.businessTypes = new Map();
    this.acceptContents = new Map();
    this.resultOptions = new Map();
    this.officers = new Map();
    for (const d of dictionary as unknown as (DictionaryItem & { type?: string })[]) {
      const { type, ...item } = d;
      if (type === DICT_TYPE.BUSINESS_TYPE) this.businessTypes.set(item.id, item);
      else if (type === DICT_TYPE.ACCEPT_CONTENT) this.acceptContents.set(item.id, item);
      else if (type === DICT_TYPE.RESULT_OPTION) this.resultOptions.set(item.id, item);
      else if (type === DICT_TYPE.OFFICER) this.officers.set(item.id, item as Officer);
    }

    this.recomputeNextId();
  }

  private recomputeNextId() {
    const max = <T extends { id: number }>(arr: T[]): number =>
      arr.length > 0 ? Math.max(...arr.map((x) => x.id)) : 0;
    this.nextId.station = max(Array.from(this.stations.values())) + 1;
    this.nextId.user = max(Array.from(this.users.values())) + 1;
    this.nextId.record = max(Array.from(this.records.values())) + 1;
    this.nextId.item = max(Array.from(this.items.values())) + 1;
    this.nextId.businessType = max(Array.from(this.businessTypes.values())) + 1;
    this.nextId.acceptContent = max(Array.from(this.acceptContents.values())) + 1;
    this.nextId.resultOption = max(Array.from(this.resultOptions.values())) + 1;
    this.nextId.officer = max(Array.from(this.officers.values())) + 1;
    this.nextId.export = max(Array.from(this.exportHistory.values())) + 1;
    this.nextId.operationLog =
      this.operationLogs.length > 0 ? Math.max(...this.operationLogs.map((l) => l.id)) + 1 : 1;
  }

  private async ensureIndexes() {
    const db = this.db!;
    await Promise.all([
      db.collection('dictionary').createIndexes([
        { key: { type: 1, id: 1 }, name: 'uniq_type_id', unique: true },
        { key: { type: 1, isActive: 1, sortOrder: 1 }, name: 'dict_query' },
      ]),
      db.collection('stations').createIndexes([{ key: { id: 1 }, unique: true }]),
      db.collection('users').createIndexes([
        { key: { id: 1 }, unique: true },
        { key: { username: 1 }, unique: true },
      ]),
      db.collection('records').createIndexes([
        { key: { id: 1 }, unique: true },
        { key: { stationId: 1, recordDate: 1 } },
      ]),
      db.collection('items').createIndexes([
        { key: { id: 1 }, unique: true },
        { key: { recordId: 1, sortOrder: 1 } },
      ]),
      db.collection('systemConfigs').createIndexes([{ key: { configKey: 1 }, unique: true }]),
      db.collection('exportHistory').createIndexes([
        { key: { id: 1 }, unique: true },
        { key: { createdAt: 1 } },
      ]),
      db.collection('operationLogs').createIndexes([
        { key: { id: 1 }, unique: true },
        { key: { createdAt: 1 } },
      ]),
      db.collection('refreshTokens').createIndexes([
        { key: { userId: 1 }, unique: true },
        { key: { expiresAt: 1 } },
      ]),
    ]);
  }

  // ============ 落库 ============
  private markDirty() {
    this.dirty = true;
    this.scheduleFlush();
  }

  private scheduleFlush() {
    if (this.flushTimer) return;
    this.flushTimer = setTimeout(() => {
      this.flushTimer = null;
      if (this.dirty) {
        this.flush().catch((err) => this.logger.error('Mongo flush failed', err?.stack));
      }
    }, this.flushIntervalMs);
    if (typeof this.flushTimer.unref === 'function') this.flushTimer.unref();
  }

  /**
   * 将内存全量状态幂等同步到 Mongo：
   * deleteMany($nin) 清理内存中已不存在的记录 + replaceOne(upsert) 覆盖/新增每条记录
   * 保证与 file 落盘一致的"全量状态"语义，删除（含级联删除）在下次 flush 生效
   */
  private async flush() {
    this.dirty = false;
    const task = this.writeChain.then(async () => {
      const db = this.db;
      if (!db) throw new Error('MongoDB 未连接');
      try {
        await this.syncCollection('stations', Array.from(this.stations.values()), 'id', (d: any) => d.id);
        await this.syncCollection('users', Array.from(this.users.values()), 'id', (d: any) => d.id);
        await this.syncCollection('records', Array.from(this.records.values()), 'id', (d: any) => d.id);
        await this.syncCollection('items', Array.from(this.items.values()), 'id', (d: any) => d.id);
        await this.syncCollection('systemConfigs', Array.from(this.systemConfigs.values()), 'configKey', (d: any) => d.configKey);
        await this.syncCollection('exportHistory', Array.from(this.exportHistory.values()), 'id', (d: any) => d.id);

        // dictionary 单集合多类型，按 type 分组分别同步
        await this.syncCollection(
          'dictionary',
          Array.from(this.businessTypes.values()).map((d) => ({ ...d, type: DICT_TYPE.BUSINESS_TYPE })),
          'id', (d: any) => d.id,
          { type: DICT_TYPE.BUSINESS_TYPE },
        );
        await this.syncCollection(
          'dictionary',
          Array.from(this.acceptContents.values()).map((d) => ({ ...d, type: DICT_TYPE.ACCEPT_CONTENT })),
          'id', (d: any) => d.id,
          { type: DICT_TYPE.ACCEPT_CONTENT },
        );
        await this.syncCollection(
          'dictionary',
          Array.from(this.resultOptions.values()).map((d) => ({ ...d, type: DICT_TYPE.RESULT_OPTION })),
          'id', (d: any) => d.id,
          { type: DICT_TYPE.RESULT_OPTION },
        );
        await this.syncCollection(
          'dictionary',
          Array.from(this.officers.values()).map((d) => ({ ...d, type: DICT_TYPE.OFFICER })),
          'id', (d: any) => d.id,
          { type: DICT_TYPE.OFFICER },
        );

        // operationLogs 内存只留最近 10000 条，落库裁剪一致
        await this.syncCollection(
          'operationLogs',
          this.operationLogs.slice(-OPERATION_LOG_LIMIT),
          'id', (d: any) => d.id,
        );

        // refreshTokens 落库时过滤过期
        await this.syncCollection(
          'refreshTokens',
          Array.from(this.refreshTokens.values()).filter((t) => t.expiresAt > Date.now()),
          'userId', (d: any) => d.userId,
        );
      } catch (err: any) {
        this.logger.error(`Mongo 写入失败: ${err.message}`);
        this.dirty = true; // 失败重新标记，等下次定时器重试
        throw err;
      }
    });
    this.writeChain = task.catch(() => undefined);
    await task;
  }

  private async syncCollection(
    name: string,
    docs: any[],
    keyField: string,
    keyFn: (d: any) => any,
    extraFilter: Record<string, any> = {},
  ) {
    const col = this.db!.collection(name);
    const ids = docs.map(keyFn);
    const ops: any[] = [];
    if (ids.length === 0) {
      ops.push({ deleteMany: { filter: { ...extraFilter } } });
    } else {
      ops.push({ deleteMany: { filter: { ...extraFilter, [keyField]: { $nin: ids } } } });
      for (const d of docs) {
        const { _id, ...doc } = d; // 防御性剔除 _id
        ops.push({
          replaceOne: {
            filter: { ...extraFilter, [keyField]: keyFn(d) },
            replacement: doc,
            upsert: true,
          },
        });
      }
    }
    if (ops.length > 0) {
      await col.bulkWrite(ops as any, { ordered: false });
    }
  }

  // ============ 工具 ============
  now() {
    return new Date().toISOString();
  }

  nextIdOf(key: keyof typeof this.nextId): number {
    return this.nextId[key]++;
  }

  // ============ Station ============
  getStations(): Station[] {
    return Array.from(this.stations.values());
  }
  getStation(id: number): Station | undefined {
    return this.stations.get(id);
  }
  saveStation(s: Station): Station {
    this.stations.set(s.id, s);
    this.markDirty();
    return s;
  }
  deleteStation(id: number): boolean {
    const ok = this.stations.delete(id);
    if (ok) this.markDirty();
    return ok;
  }

  // ============ User ============
  getUsers(): User[] {
    return Array.from(this.users.values());
  }
  getUser(id: number): User | undefined {
    return this.users.get(id);
  }
  getUserByUsername(username: string): User | undefined {
    return Array.from(this.users.values()).find((u) => u.username === username);
  }
  saveUser(u: User): User {
    this.users.set(u.id, u);
    this.markDirty();
    return u;
  }
  deleteUser(id: number): boolean {
    const ok = this.users.delete(id);
    if (ok) this.markDirty();
    return ok;
  }

  // ============ DutyRecord ============
  getRecords(): DutyRecord[] {
    return Array.from(this.records.values());
  }
  getRecord(id: number): DutyRecord | undefined {
    return this.records.get(id);
  }
  saveRecord(r: DutyRecord): DutyRecord {
    this.records.set(r.id, r);
    this.markDirty();
    return r;
  }
  deleteRecord(id: number): boolean {
    const items = this.getItemsByRecord(id);
    items.forEach((i) => this.items.delete(i.id));
    const ok = this.records.delete(id);
    if (ok) this.markDirty();
    return ok;
  }

  // ============ DutyItem ============
  getItems(): DutyItem[] {
    return Array.from(this.items.values());
  }
  getItem(id: number): DutyItem | undefined {
    return this.items.get(id);
  }
  getItemsByRecord(recordId: number): DutyItem[] {
    return Array.from(this.items.values())
      .filter((i) => i.recordId === recordId)
      .sort((a, b) => a.sortOrder - b.sortOrder);
  }
  saveItem(i: DutyItem): DutyItem {
    this.items.set(i.id, i);
    this.markDirty();
    return i;
  }
  deleteItem(id: number): boolean {
    const ok = this.items.delete(id);
    if (ok) this.markDirty();
    return ok;
  }

  // ============ Dictionary（单集合多类型） ============
  getBusinessTypes(): DictionaryItem[] {
    return Array.from(this.businessTypes.values())
      .filter((d) => d.isActive)
      .sort((a, b) => a.sortOrder - b.sortOrder);
  }
  saveBusinessType(d: DictionaryItem) {
    this.businessTypes.set(d.id, d);
    this.markDirty();
  }
  getAcceptContents(): DictionaryItem[] {
    return Array.from(this.acceptContents.values())
      .filter((d) => d.isActive)
      .sort((a, b) => a.sortOrder - b.sortOrder);
  }
  saveAcceptContent(d: DictionaryItem) {
    this.acceptContents.set(d.id, d);
    this.markDirty();
  }
  getResultOptions(): DictionaryItem[] {
    return Array.from(this.resultOptions.values())
      .filter((d) => d.isActive)
      .sort((a, b) => a.sortOrder - b.sortOrder);
  }
  saveResultOption(d: DictionaryItem) {
    this.resultOptions.set(d.id, d);
    this.markDirty();
  }
  getOfficers(stationId?: number | null): Officer[] {
    let list = Array.from(this.officers.values()).filter((o) => o.isActive);
    if (stationId) list = list.filter((o) => !o.stationId || o.stationId === stationId);
    return list.sort((a, b) => a.sortOrder - b.sortOrder);
  }
  saveOfficer(o: Officer) {
    this.officers.set(o.id, o);
    this.markDirty();
  }

  // ============ SystemConfig ============
  getSystemConfigs(): SystemConfig[] {
    return Array.from(this.systemConfigs.values());
  }
  getSystemConfig(key: string): SystemConfig | undefined {
    return this.systemConfigs.get(key);
  }
  saveSystemConfig(c: SystemConfig) {
    this.systemConfigs.set(c.configKey, c);
    this.markDirty();
  }

  // ============ ExportHistory ============
  getExportHistory(): ExportHistory[] {
    return Array.from(this.exportHistory.values());
  }
  getExport(id: number): ExportHistory | undefined {
    return this.exportHistory.get(id);
  }
  saveExport(e: ExportHistory): ExportHistory {
    this.exportHistory.set(e.id, e);
    this.markDirty();
    return e;
  }

  // ============ OperationLog ============
  getOperationLogs(): OperationLog[] {
    return [...this.operationLogs].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }
  saveOperationLog(l: OperationLog) {
    this.operationLogs.push(l);
    // 仅保留最近 10000 条
    if (this.operationLogs.length > OPERATION_LOG_LIMIT) {
      this.operationLogs = this.operationLogs.slice(-OPERATION_LOG_LIMIT);
    }
    this.markDirty();
  }

  // ============ RefreshToken ============
  saveRefreshToken(userId: number, token: string, expiresInSec: number) {
    this.refreshTokens.set(userId, {
      token,
      userId,
      expiresAt: Date.now() + expiresInSec * 1000,
    });
    this.markDirty();
  }
  getRefreshToken(userId: number): RefreshTokenEntry | undefined {
    const entry = this.refreshTokens.get(userId);
    if (entry && entry.expiresAt < Date.now()) {
      this.refreshTokens.delete(userId);
      this.markDirty();
      return undefined;
    }
    return entry;
  }
  deleteRefreshToken(userId: number) {
    const ok = this.refreshTokens.delete(userId);
    if (ok) this.markDirty();
  }

  // ============ 密码工具 ============
  async hashPassword(plain: string): Promise<string> {
    return bcrypt.hash(plain, 10);
  }
  async comparePassword(plain: string, hash: string): Promise<boolean> {
    return bcrypt.compare(plain, hash);
  }
}

function toMap<K, T>(arr: T[] | undefined, keyFn: (item: T) => K): Map<K, T> {
  if (!Array.isArray(arr)) return new Map();
  return new Map(arr.map((item) => [keyFn(item), item]));
}
