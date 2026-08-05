import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as fs from 'fs/promises';
import * as path from 'path';
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
 * JSON 文件持久化的存储服务
 * 接口与 StorageService 完全一致，运行时按需替换
 *
 * 特性：
 * - 启动时从 JSON 文件加载（若不存在则触发 seed 写入）
 * - 任何写操作标记 dirty，由定时器（默认 2s）或退出时落盘
 * - 原子写：先写 .tmp，再 rename（POSIX/Windows 同一卷下原子）
 * - 写入序列化：通过 promise chain 避免并发写
 * - 损坏文件：自动备份为 .corrupted.<ts> 并重建
 */

const STORAGE_VERSION = 2;
const DEFAULT_FLUSH_INTERVAL_MS = 2000;
const OPERATION_LOG_LIMIT = 10000;

interface PersistShape {
  version: number;
  savedAt: string;
  data: {
    stations: Station[];
    users: User[];
    records: DutyRecord[];
    items: DutyItem[];
    businessTypes: DictionaryItem[];
    acceptContents: DictionaryItem[];
    resultOptions: DictionaryItem[];
    officers: Officer[];
    systemConfigs: SystemConfig[];
    exportHistory: ExportHistory[];
    operationLogs: OperationLog[];
    refreshTokens: RefreshTokenEntry[];
    nextId: Record<string, number>;
  };
}

@Injectable()
export class FileStorageService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(FileStorageService.name);

  // 主存储
  private stations = new Map<number, Station>();
  private users = new Map<number, User>();
  private records = new Map<number, DutyRecord>();
  private items = new Map<number, DutyItem>();

  // 字典
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

  private filePath: string;
  private flushIntervalMs: number;
  private dirty = false;
  private flushTimer: NodeJS.Timeout | null = null;
  private writeChain: Promise<void> = Promise.resolve();
  private initialized = false;

  constructor(config: ConfigService) {
    const rawPath = config.get<string>('STORAGE_FILE_PATH') || './data/duty-guard.json';
    this.filePath = path.isAbsolute(rawPath) ? rawPath : path.resolve(process.cwd(), rawPath);
    const interval = Number(config.get('STORAGE_FLUSH_INTERVAL_MS'));
    this.flushIntervalMs = Number.isFinite(interval) && interval > 0 ? interval : DEFAULT_FLUSH_INTERVAL_MS;
  }

  // ============ 生命周期 ============
  async onModuleInit() {
    if (this.initialized) return; // 防止双重初始化
    this.initialized = true;
    const existed = await this.fileExists();
    await this.load();
    // 加载后判断是否需要 seed：首次启动 OR 版本不匹配被备份后 OR 文件被损坏
    const needsSeed = !existed || this.stations.size === 0;
    if (needsSeed) {
      this.logger.log(`[FileStorage] 首次启动或版本重建，写入种子数据 → ${this.filePath}`);
      seedInitialData(this as any);
    }
    this.logger.log(`[FileStorage] 文件路径: ${this.filePath}，刷新间隔: ${this.flushIntervalMs}ms`);
    this.markDirty(); // 启动即触发一次落盘，确保新 seed 数据写入
  }

  async onModuleDestroy() {
    if (this.flushTimer) {
      clearTimeout(this.flushTimer);
      this.flushTimer = null;
    }
    if (this.dirty) {
      this.logger.log('[FileStorage] 退出前最后一次落盘...');
      try {
        await this.flush();
      } catch (e: any) {
        this.logger.error(`退出落盘失败: ${e.message}`);
      }
    }
    await this.writeChain;
  }

  // ============ 工具 ============
  now() {
    return new Date().toISOString();
  }

  nextIdOf(key: keyof typeof this.nextId): number {
    return this.nextId[key]++;
  }

  private async fileExists(): Promise<boolean> {
    try {
      await fs.access(this.filePath);
      return true;
    } catch {
      return false;
    }
  }

  private async load() {
    let text: string;
    try {
      text = await fs.readFile(this.filePath, 'utf-8');
    } catch (err: any) {
      if (err.code === 'ENOENT') return; // 首次启动
      this.logger.error(`读取存储文件失败: ${err.message}`);
      await this.backupCorrupted();
      return;
    }

    if (!text.trim()) {
      this.logger.warn('存储文件为空，将作为首次启动处理');
      return;
    }

    let parsed: PersistShape;
    try {
      parsed = JSON.parse(text) as PersistShape;
    } catch (err: any) {
      this.logger.error(`存储文件 JSON 解析失败: ${err.message}`);
      await this.backupCorrupted();
      return;
    }

    if (!parsed || parsed.version !== STORAGE_VERSION) {
      this.logger.warn(
        `存储文件版本不匹配 (file=${parsed?.version}, expected=${STORAGE_VERSION})，备份后重建`,
      );
      await this.backupCorrupted();
      return;
    }

    const d = (parsed.data || {}) as PersistShape['data'];
    this.stations = toMap<number, Station>(d.stations, (x) => x.id);
    this.users = toMap<number, User>(d.users, (x) => x.id);
    this.records = toMap<number, DutyRecord>(d.records, (x) => x.id);
    this.items = toMap<number, DutyItem>(d.items, (x) => x.id);
    this.businessTypes = toMap<number, DictionaryItem>(d.businessTypes, (x) => x.id);
    this.acceptContents = toMap<number, DictionaryItem>(d.acceptContents, (x) => x.id);
    this.resultOptions = toMap<number, DictionaryItem>(d.resultOptions, (x) => x.id);
    this.officers = toMap<number, Officer>(d.officers, (x) => x.id);
    this.systemConfigs = toMap<string, SystemConfig>(d.systemConfigs, (x) => x.configKey);
    this.exportHistory = toMap<number, ExportHistory>(d.exportHistory, (x) => x.id);
    this.operationLogs = Array.isArray(d.operationLogs) ? d.operationLogs : [];
    this.refreshTokens = new Map<number, RefreshTokenEntry>(
      (d.refreshTokens || [])
        .filter((t) => t.expiresAt > Date.now())
        .map((t) => [t.userId, t]),
    );
    this.nextId = { ...this.nextId, ...(d.nextId || {}) };

    // 用实际数据回算 nextId，避免种子 ID 与计数器冲突
    this.recomputeNextId();

    this.logger.log(
      `[FileStorage] 已加载: stations=${this.stations.size}, users=${this.users.size}, records=${this.records.size}, items=${this.items.size}, systemConfigs=${this.systemConfigs.size}`,
    );
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

  private async backupCorrupted() {
    try {
      const backupPath = `${this.filePath}.corrupted.${Date.now()}`;
      await fs.rename(this.filePath, backupPath);
      this.logger.warn(`损坏文件已备份: ${backupPath}`);
    } catch {
      // 文件可能不存在，忽略
    }
  }

  private markDirty() {
    this.dirty = true;
    this.scheduleFlush();
  }

  private scheduleFlush() {
    if (this.flushTimer) return;
    this.flushTimer = setTimeout(() => {
      this.flushTimer = null;
      if (this.dirty) {
        this.flush().catch((err) => this.logger.error('Flush failed', err?.stack));
      }
    }, this.flushIntervalMs);
    // 不阻止进程退出
    if (typeof this.flushTimer.unref === 'function') this.flushTimer.unref();
  }

  private async flush() {
    this.dirty = false;
    const snapshot: PersistShape = {
      version: STORAGE_VERSION,
      savedAt: this.now(),
      data: {
        stations: Array.from(this.stations.values()),
        users: Array.from(this.users.values()),
        records: Array.from(this.records.values()),
        items: Array.from(this.items.values()),
        businessTypes: Array.from(this.businessTypes.values()),
        acceptContents: Array.from(this.acceptContents.values()),
        resultOptions: Array.from(this.resultOptions.values()),
        officers: Array.from(this.officers.values()),
        systemConfigs: Array.from(this.systemConfigs.values()),
        exportHistory: Array.from(this.exportHistory.values()),
        operationLogs: this.operationLogs.slice(-OPERATION_LOG_LIMIT),
        refreshTokens: Array.from(this.refreshTokens.values()).filter(
          (t) => t.expiresAt > Date.now(),
        ),
        nextId: { ...this.nextId },
      },
    };

    const task = this.writeChain.then(async () => {
      try {
        await fs.mkdir(path.dirname(this.filePath), { recursive: true });
        const tmpPath = `${this.filePath}.tmp`;
        const json = JSON.stringify(snapshot, null, 2);
        await fs.writeFile(tmpPath, json, 'utf-8');
        await fs.rename(tmpPath, this.filePath);
      } catch (err: any) {
        this.logger.error(`写入失败: ${err.message}`);
        // 失败时重新标记 dirty，等下次再写
        this.dirty = true;
        throw err;
      }
    });

    this.writeChain = task.catch(() => undefined);
    await task;
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

  // ============ Dictionary ============
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

  // ============ 工具方法 ============
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
