import { Injectable } from '@nestjs/common';
import * as bcrypt from 'bcryptjs';
import {
  District,
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

/**
 * 内存数据存储（替代 TypeORM + MySQL + Redis）
 * 保留可切换到真实数据库的接口设计
 */
@Injectable()
export class StorageService {
  // 主存储
  private districts = new Map<number, District>();
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
  private nextId = {
    district: 1,
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

  now() {
    return new Date().toISOString();
  }

  nextIdOf(key: keyof typeof this.nextId): number {
    return this.nextId[key]++;
  }

  /** 用实际数据回算 nextId，避免种子 ID 与计数器冲突（seed 后调用） */
  recomputeNextId() {
    const max = <T extends { id: number }>(arr: T[]): number =>
      arr.length > 0 ? Math.max(...arr.map((x) => x.id)) : 0;
    this.nextId.district = max(Array.from(this.districts.values())) + 1;
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

  // ============ District ============
  getDistricts(): District[] {
    return Array.from(this.districts.values());
  }
  getDistrict(id: number): District | undefined {
    return this.districts.get(id);
  }
  saveDistrict(d: District): District {
    this.districts.set(d.id, d);
    return d;
  }
  deleteDistrict(id: number): boolean {
    return this.districts.delete(id);
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
    return s;
  }
  deleteStation(id: number): boolean {
    return this.stations.delete(id);
  }

  // ============ User ============
  getUsers(): User[] {
    return Array.from(this.users.values());
  }
  getUser(id: number): User | undefined {
    return this.users.get(id);
  }
  getUserByUsername(username: string): User | undefined {
    return Array.from(this.users.values()).find(u => u.username === username);
  }
  saveUser(u: User): User {
    this.users.set(u.id, u);
    return u;
  }
  deleteUser(id: number): boolean {
    return this.users.delete(id);
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
    return r;
  }
  deleteRecord(id: number): boolean {
    const items = this.getItemsByRecord(id);
    items.forEach(i => this.items.delete(i.id));
    return this.records.delete(id);
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
      .filter(i => i.recordId === recordId)
      .sort((a, b) => a.sortOrder - b.sortOrder);
  }
  saveItem(i: DutyItem): DutyItem {
    this.items.set(i.id, i);
    return i;
  }
  deleteItem(id: number): boolean {
    return this.items.delete(id);
  }

  // ============ Dictionary ============
  getBusinessTypes(): DictionaryItem[] {
    return Array.from(this.businessTypes.values())
      .filter(d => d.isActive)
      .sort((a, b) => a.sortOrder - b.sortOrder);
  }
  saveBusinessType(d: DictionaryItem) {
    this.businessTypes.set(d.id, d);
  }
  getAcceptContents(): DictionaryItem[] {
    return Array.from(this.acceptContents.values())
      .filter(d => d.isActive)
      .sort((a, b) => a.sortOrder - b.sortOrder);
  }
  saveAcceptContent(d: DictionaryItem) {
    this.acceptContents.set(d.id, d);
  }
  getResultOptions(): DictionaryItem[] {
    return Array.from(this.resultOptions.values())
      .filter(d => d.isActive)
      .sort((a, b) => a.sortOrder - b.sortOrder);
  }
  saveResultOption(d: DictionaryItem) {
    this.resultOptions.set(d.id, d);
  }
  getOfficers(stationId?: number | null): Officer[] {
    let list = Array.from(this.officers.values()).filter(o => o.isActive);
    if (stationId) list = list.filter(o => !o.stationId || o.stationId === stationId);
    return list.sort((a, b) => a.sortOrder - b.sortOrder);
  }
  saveOfficer(o: Officer) {
    this.officers.set(o.id, o);
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
    return e;
  }

  // ============ OperationLog ============
  getOperationLogs(): OperationLog[] {
    return [...this.operationLogs].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }
  saveOperationLog(l: OperationLog) {
    this.operationLogs.push(l);
    // 仅保留最近 10000 条
    if (this.operationLogs.length > 10000) {
      this.operationLogs = this.operationLogs.slice(-10000);
    }
  }

  // ============ RefreshToken ============
  saveRefreshToken(userId: number, token: string, expiresInSec: number) {
    this.refreshTokens.set(userId, {
      token,
      userId,
      expiresAt: Date.now() + expiresInSec * 1000,
    });
  }
  getRefreshToken(userId: number): RefreshTokenEntry | undefined {
    const entry = this.refreshTokens.get(userId);
    if (entry && entry.expiresAt < Date.now()) {
      this.refreshTokens.delete(userId);
      return undefined;
    }
    return entry;
  }
  deleteRefreshToken(userId: number) {
    this.refreshTokens.delete(userId);
  }

  // ============ 工具方法 ============
  async hashPassword(plain: string): Promise<string> {
    return bcrypt.hash(plain, 10);
  }
  async comparePassword(plain: string, hash: string): Promise<boolean> {
    return bcrypt.compare(plain, hash);
  }
}
