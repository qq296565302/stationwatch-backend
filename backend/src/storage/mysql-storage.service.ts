import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as mysql from 'mysql2/promise';
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
import { seedInitialData, seedDistricts, ensureDemoUsers } from './seed';
import { Role } from '../common/types/role.enum';
import {
  parsePendingIssues,
  serializePendingIssues,
  hasUnresolved,
  textToIssues,
} from '../common/pending-issues';

/**
 * MySQL 持久化的存储服务
 * 接口与 StorageService 完全一致，运行时按需替换（STORAGE_MODE=mysql）
 *
 * 策略：内存缓存 + 异步落库（与 MongoStorageService 完全对称）
 * - 启动时连接 MySQL：自动建库建表 → 全量加载到内存 Map，读操作走内存（保持同步接口）
 * - 写操作同步更新内存 Map，标记 dirty，由定时器（默认 2s）或退出时 flush 到 MySQL
 * - flush 用单事务「DELETE 全量 + 分批 INSERT」幂等同步，失败整体回滚重试
 * - 内存 Map 是唯一真相源，禁止绕过 Map 直写 SQL
 */

const DEFAULT_FLUSH_INTERVAL_MS = 2000;
const OPERATION_LOG_LIMIT = 10000;
const BATCH_INSERT_ROWS = 200;

const DICT_TYPE = {
  BUSINESS_TYPE: 'business_type',
  ACCEPT_CONTENT: 'accept_content',
  RESULT_OPTION: 'result_option',
  OFFICER: 'officer',
} as const;
type DictType = (typeof DICT_TYPE)[keyof typeof DICT_TYPE];

// 表列（camelCase 与 types.ts 实体字段一一对应，无映射层）
const DISTRICT_COLS = ['id', 'name', 'code', 'sortOrder', 'isActive', 'createdAt', 'updatedAt'];
const STATION_COLS = [
  'id', 'name', 'code', 'districtId', 'region', 'voltage', 'feeders', 'transformers',
  'orderTimeLimit', 'isActive', 'createdAt', 'updatedAt',
];
const USER_COLS = [
  'id', 'username', 'passwordHash', 'realName', 'role', 'stationId', 'districtId',
  'isActive', 'lastLoginAt', 'lastLoginIp', 'mustChangePassword', 'passwordPromptedAt',
  'createdAt', 'updatedAt',
];
const RECORD_COLS = [
  'id', 'recordDate', 'stationId', 'weather', 'weatherLabel', 'creatorId', 'status',
  'itemCount', 'completedCount', 'hasPending', 'otherMatters', 'pendingIssues',
  'dutyOfficerIds', 'lockedAt', 'lockedBy', 'createdAt', 'updatedAt',
];
const ITEM_COLS = [
  'id', 'recordId', 'businessType', 'content', 'acceptTime', 'endTime', 'customerName',
  'customerPhone', 'customerAddress', 'handler', 'result', 'isCompleted', 'customerSatisfied',
  'sortOrder', 'createdAt', 'updatedAt',
];
const DICT_COLS = ['id', 'type', 'label', 'sortOrder', 'isActive', 'createdAt', 'stationId', 'phone'];
const CONFIG_COLS = ['configKey', 'configValue', 'description', 'updatedBy', 'updatedAt'];
const EXPORT_COLS = [
  'id', 'fileName', 'fileSize', 'filePath', 'year', 'month', 'stationId', 'operatorId',
  'status', 'errorMessage', 'createdAt',
];
const LOG_COLS = [
  'id', 'userId', 'username', 'action', 'targetType', 'targetId', 'stationId', 'ipAddress',
  'userAgent', 'details', 'statusCode', 'durationMs', 'createdAt',
];
const TOKEN_COLS = ['userId', 'token', 'expiresAt'];

// 建表 DDL（InnoDB + utf8mb4，时间存 ISO 串，boolean 用 TINYINT(1)，无外键）
const DDL_STATEMENTS: string[] = [
  `CREATE TABLE IF NOT EXISTS \`districts\` (
    \`id\` INT NOT NULL, \`name\` VARCHAR(100) NOT NULL, \`code\` VARCHAR(20) NOT NULL,
    \`sortOrder\` INT NOT NULL DEFAULT 0, \`isActive\` TINYINT(1) NOT NULL DEFAULT 1,
    \`createdAt\` VARCHAR(40) NOT NULL, \`updatedAt\` VARCHAR(40) NOT NULL,
    PRIMARY KEY (\`id\`)) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
  `CREATE TABLE IF NOT EXISTS \`stations\` (
    \`id\` INT NOT NULL, \`name\` VARCHAR(100) NOT NULL, \`code\` VARCHAR(20) NOT NULL,
    \`districtId\` INT NOT NULL DEFAULT 1, \`region\` VARCHAR(100) NULL, \`voltage\` VARCHAR(20) NULL,
    \`feeders\` INT NOT NULL DEFAULT 0, \`transformers\` INT NOT NULL DEFAULT 0,
    \`orderTimeLimit\` INT NOT NULL DEFAULT 60,
    \`isActive\` TINYINT(1) NOT NULL DEFAULT 1,
    \`createdAt\` VARCHAR(40) NOT NULL, \`updatedAt\` VARCHAR(40) NOT NULL,
    PRIMARY KEY (\`id\`), KEY \`idx_stations_district\` (\`districtId\`)) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
  `CREATE TABLE IF NOT EXISTS \`users\` (
    \`id\` INT NOT NULL, \`username\` VARCHAR(64) NOT NULL, \`passwordHash\` VARCHAR(100) NOT NULL,
    \`realName\` VARCHAR(100) NOT NULL, \`role\` VARCHAR(20) NOT NULL,
    \`stationId\` INT NULL, \`districtId\` INT NULL, \`isActive\` TINYINT(1) NOT NULL DEFAULT 1,
    \`lastLoginAt\` VARCHAR(40) NULL, \`lastLoginIp\` VARCHAR(45) NULL,
    \`mustChangePassword\` TINYINT(1) NOT NULL DEFAULT 0,
    \`passwordPromptedAt\` VARCHAR(40) NULL,
    \`createdAt\` VARCHAR(40) NOT NULL, \`updatedAt\` VARCHAR(40) NOT NULL,
    PRIMARY KEY (\`id\`), UNIQUE KEY \`uk_users_username\` (\`username\`),
    KEY \`idx_users_station\` (\`stationId\`), KEY \`idx_users_district\` (\`districtId\`)) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
  `CREATE TABLE IF NOT EXISTS \`records\` (
    \`id\` INT NOT NULL, \`recordDate\` VARCHAR(10) NOT NULL, \`stationId\` INT NOT NULL,
    \`weather\` VARCHAR(50) NOT NULL DEFAULT '', \`weatherLabel\` VARCHAR(50) NOT NULL DEFAULT '',
    \`creatorId\` INT NOT NULL, \`status\` VARCHAR(20) NOT NULL DEFAULT 'active',
    \`itemCount\` INT NOT NULL DEFAULT 0, \`completedCount\` INT NOT NULL DEFAULT 0,
    \`hasPending\` TINYINT(1) NOT NULL DEFAULT 0,
    \`otherMatters\` TEXT NULL, \`pendingIssues\` TEXT NULL,
    \`dutyOfficerIds\` VARCHAR(100) NULL DEFAULT NULL,
    \`lockedAt\` VARCHAR(40) NULL, \`lockedBy\` INT NULL,
    \`createdAt\` VARCHAR(40) NOT NULL, \`updatedAt\` VARCHAR(40) NOT NULL,
    PRIMARY KEY (\`id\`), KEY \`idx_records_station_date\` (\`stationId\`,\`recordDate\`)) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
  `CREATE TABLE IF NOT EXISTS \`items\` (
    \`id\` INT NOT NULL, \`recordId\` INT NOT NULL,
    \`businessType\` VARCHAR(100) NOT NULL DEFAULT '', \`content\` TEXT NULL,
    \`acceptTime\` VARCHAR(5) NULL, \`endTime\` VARCHAR(5) NULL,
    \`customerName\` VARCHAR(100) NULL, \`customerPhone\` VARCHAR(30) NULL, \`customerAddress\` VARCHAR(200) NULL,
    \`handler\` VARCHAR(100) NULL, \`result\` VARCHAR(200) NULL,
    \`isCompleted\` TINYINT(1) NOT NULL DEFAULT 0,
    \`customerSatisfied\` TINYINT(1) NOT NULL DEFAULT 0,
    \`sortOrder\` INT NOT NULL DEFAULT 0,
    \`createdAt\` VARCHAR(40) NOT NULL, \`updatedAt\` VARCHAR(40) NOT NULL,
    PRIMARY KEY (\`id\`), KEY \`idx_items_record\` (\`recordId\`,\`sortOrder\`)) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
  `CREATE TABLE IF NOT EXISTS \`dictionary\` (
    \`id\` INT NOT NULL, \`type\` VARCHAR(30) NOT NULL, \`label\` VARCHAR(200) NOT NULL,
    \`sortOrder\` INT NOT NULL DEFAULT 0, \`isActive\` TINYINT(1) NOT NULL DEFAULT 1,
    \`createdAt\` VARCHAR(40) NOT NULL, \`stationId\` INT NULL, \`phone\` VARCHAR(30) NULL,
    PRIMARY KEY (\`id\`,\`type\`), KEY \`idx_dict_type_active\` (\`type\`,\`isActive\`,\`sortOrder\`)) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
  `CREATE TABLE IF NOT EXISTS \`system_configs\` (
    \`configKey\` VARCHAR(100) NOT NULL, \`configValue\` TEXT NOT NULL,
    \`description\` VARCHAR(200) NULL, \`updatedBy\` INT NULL, \`updatedAt\` VARCHAR(40) NOT NULL,
    PRIMARY KEY (\`configKey\`)) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
  `CREATE TABLE IF NOT EXISTS \`export_history\` (
    \`id\` INT NOT NULL, \`fileName\` VARCHAR(200) NOT NULL, \`fileSize\` BIGINT NOT NULL,
    \`filePath\` VARCHAR(500) NOT NULL, \`year\` INT NOT NULL, \`month\` INT NOT NULL,
    \`stationId\` INT NULL, \`operatorId\` INT NOT NULL,
    \`status\` VARCHAR(20) NOT NULL DEFAULT 'pending', \`errorMessage\` VARCHAR(500) NULL,
    \`createdAt\` VARCHAR(40) NOT NULL,
    PRIMARY KEY (\`id\`), KEY \`idx_export_created\` (\`createdAt\`)) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
  `CREATE TABLE IF NOT EXISTS \`operation_logs\` (
    \`id\` INT NOT NULL, \`userId\` INT NULL, \`username\` VARCHAR(64) NULL,
    \`action\` VARCHAR(100) NOT NULL, \`targetType\` VARCHAR(50) NULL, \`targetId\` INT NULL,
    \`stationId\` INT NULL, \`ipAddress\` VARCHAR(45) NULL, \`userAgent\` VARCHAR(300) NULL, \`details\` TEXT NULL,
    \`statusCode\` INT NULL, \`durationMs\` INT NULL, \`createdAt\` VARCHAR(40) NOT NULL,
    PRIMARY KEY (\`id\`), KEY \`idx_logs_created\` (\`createdAt\`), KEY \`idx_logs_station\` (\`stationId\`)) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
  `CREATE TABLE IF NOT EXISTS \`refresh_tokens\` (
    \`userId\` INT NOT NULL, \`token\` VARCHAR(1024) NOT NULL, \`expiresAt\` BIGINT NOT NULL,
    PRIMARY KEY (\`userId\`), KEY \`idx_tokens_expires\` (\`expiresAt\`)) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
];

@Injectable()
export class MysqlStorageService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(MysqlStorageService.name);

  // 主存储
  private districts = new Map<number, District>();
  private stations = new Map<number, Station>();
  private users = new Map<number, User>();
  private records = new Map<number, DutyRecord>();
  private items = new Map<number, DutyItem>();

  // 字典（内存中按类型分离，持久化为 dictionary 表按 type 字段区分）
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

  // MySQL 专属
  private host: string;
  private port: number;
  private user: string;
  private password: string;
  private database: string;
  private pool: mysql.Pool | null = null;

  // 落库控制
  private flushIntervalMs: number;
  private dirty = false;
  private flushTimer: NodeJS.Timeout | null = null;
  private writeChain: Promise<void> = Promise.resolve();
  private initialized = false;

  constructor(config: ConfigService) {
    this.host = config.get<string>('MYSQL_HOST') || 'localhost';
    this.port = Number(config.get('MYSQL_PORT')) || 3306;
    this.user = config.get<string>('MYSQL_USER') || 'root';
    this.password = config.get<string>('MYSQL_PASSWORD') || '';
    this.database = config.get<string>('MYSQL_DATABASE') || 'duty_guard';
    if (!config.get<string>('MYSQL_HOST')) {
      throw new Error('MYSQL_HOST 未配置，无法启用 mysql 存储模式');
    }
    const interval = Number(
      config.get('MYSQL_FLUSH_INTERVAL_MS') ?? config.get('STORAGE_FLUSH_INTERVAL_MS'),
    );
    this.flushIntervalMs =
      Number.isFinite(interval) && interval > 0 ? interval : DEFAULT_FLUSH_INTERVAL_MS;
  }

  // ============ 生命周期 ============
  async onModuleInit() {
    if (this.initialized) return; // 防止双重初始化
    this.initialized = true;
    try {
      await this.connect(); // 自动建库 + 连接池 + 连通探测
      await this.ensureTables();
      await this.loadAll();
      // 空库 → 全新 seed；已有数据 → 幂等回填（不重复 seed）
      if (this.stations.size === 0) {
        this.logger.log('[MysqlStorage] 库中无数据，写入种子数据...');
        seedInitialData(this as any);
        this.recomputeNextId(); // 种子硬编码 id，回算自增计数器避免冲突
        await this.flush();
      } else {
        this.migrateLegacySchedule();
        if (this.backfillOrderTimeLimit()) {
          this.logger.log('[MysqlStorage] 已为旧站点数据回填工单时限 orderTimeLimit=60');
          await this.flush();
        }
        if (this.backfillOrgHierarchy()) {
          this.logger.log('[MysqlStorage] 已执行 v3 组织层级迁移（区县 + districtId + 演示账号回填）');
          await this.flush();
        }
        if (this.migrateLegacyPendingIssues()) {
          this.logger.log('[MysqlStorage] 已迁移遗留问题为逐条 JSON 格式（保留已解决条目）');
          await this.flush();
        }
        // 一次性回填"需改默认密码"标记：旧库的非 admin 账号视为仍用默认密码（功能首次引入时执行一次）
        if (this.backfillPasswordChangeFlag()) {
          this.logger.log('[MysqlStorage] 已为旧账号回填"需改默认密码"标记 mustChangePassword');
          await this.flush();
        }
      }
      this.logger.log(
        `[MysqlStorage] 已连接 ${this.database}，stations=${this.stations.size}, users=${this.users.size}, records=${this.records.size}, items=${this.items.size}`,
      );
    } catch (e: any) {
      this.logger.error(`[MysqlStorage] 初始化失败: ${e.message}`);
      throw e; // fail-fast：连接失败则拒绝启动，避免静默降级丢数据
    }
  }

  async onModuleDestroy() {
    if (this.flushTimer) {
      clearTimeout(this.flushTimer);
      this.flushTimer = null;
    }
    if (this.dirty) {
      this.logger.log('[MysqlStorage] 退出前最后一次落库...');
      try {
        await this.flush();
      } catch (e: any) {
        this.logger.error(`退出落库失败: ${e.message}`);
      }
    }
    await this.writeChain;
    if (this.pool) {
      await this.pool.end();
      this.pool = null;
    }
  }

  // ============ 连接 / 建表 / 加载 ============
  private async connect() {
    // 优先直接连接目标库：库已存在时无需 CREATE DATABASE 权限（权限最小化，便于生产账号只授 duty_guard.*）
    try {
      this.pool = this.createPool();
      await this.pool.query('SELECT 1');
      return;
    } catch (e: any) {
      // 仅当"数据库不存在"(ER_BAD_DB_ERROR, errno 1049) 时才尝试建库；其它错误（如权限/网络）原样抛出
      if (e?.code !== 'ER_BAD_DB_ERROR' && e?.errno !== 1049) {
        throw e;
      }
    }
    // 库不存在：用不带 database 的连接建库后再连
    const adminConn = await mysql.createConnection({
      host: this.host,
      port: this.port,
      user: this.user,
      password: this.password,
      connectTimeout: 10000,
    });
    try {
      await adminConn.query(
        `CREATE DATABASE IF NOT EXISTS \`${this.database}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`,
      );
    } finally {
      await adminConn.end();
    }
    this.pool = this.createPool();
    await this.pool.query('SELECT 1');
  }

  private createPool(): mysql.Pool {
    return mysql.createPool({
      host: this.host,
      port: this.port,
      user: this.user,
      password: this.password,
      database: this.database,
      charset: 'utf8mb4',
      connectionLimit: 10,
      connectTimeout: 10000,
      waitForConnections: true,
    });
  }

  private async ensureTables() {
    for (const ddl of DDL_STATEMENTS) {
      await this.pool!.query(ddl);
    }
    // 列迁移：为已存在的 items 表补充 customerSatisfied 列（DDL 的 CREATE IF NOT EXISTS 不会改旧表）
    await this.ensureItemColumn('customerSatisfied', 'TINYINT(1) NOT NULL DEFAULT 0');
    // 为已存在的 records 表补充 dutyOfficerIds 列（实际值班人员）
    await this.ensureRecordColumn('dutyOfficerIds', 'VARCHAR(100) NULL DEFAULT NULL');
    // 为已存在的 users 表补充"是否需改默认密码"及"上次提醒时间"列
    await this.ensureUserColumn('mustChangePassword', 'TINYINT(1) NOT NULL DEFAULT 0');
    await this.ensureUserColumn('passwordPromptedAt', 'VARCHAR(40) NULL');
    // 为已存在的 operation_logs 表补充 stationId 列（操作日志按站点过滤）
    await this.ensureLogColumn('stationId', 'INT NULL');
  }

  /**
   * 幂等列迁移：检查 users 表是否含指定列，缺失则 ALTER TABLE ADD COLUMN
   */
  private async ensureUserColumn(col: string, ddl: string) {
    try {
      const [cols] = await this.pool!.query(
        'SELECT COLUMN_NAME FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ?',
        [this.database, 'users'],
      );
      const names = new Set((cols as any[]).map((c) => c.COLUMN_NAME));
      if (!names.has(col)) {
        await this.pool!.query(`ALTER TABLE \`users\` ADD COLUMN \`${col}\` ${ddl}`);
        this.logger.log(`[MysqlStorage] 已为 users 表补充列 ${col}`);
      }
    } catch (e: any) {
      this.logger.warn(`[MysqlStorage] 检查/补充 users 列 ${col} 失败: ${e.message}`);
    }
  }

  /**
   * 幂等列迁移：检查 items 表是否含指定列，缺失则 ALTER TABLE ADD COLUMN
   */
  private async ensureItemColumn(col: string, ddl: string) {
    try {
      const [cols] = await this.pool!.query(
        'SELECT COLUMN_NAME FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ?',
        [this.database, 'items'],
      );
      const names = new Set((cols as any[]).map((c) => c.COLUMN_NAME));
      if (!names.has(col)) {
        await this.pool!.query(`ALTER TABLE \`items\` ADD COLUMN \`${col}\` ${ddl}`);
        this.logger.log(`[MysqlStorage] 已为 items 表补充列 ${col}`);
      }
    } catch (e: any) {
      this.logger.warn(`[MysqlStorage] 检查/补充 items 列 ${col} 失败: ${e.message}`);
    }
  }

  /**
   * 幂等列迁移：检查 records 表是否含指定列，缺失则 ALTER TABLE ADD COLUMN
   */
  private async ensureRecordColumn(col: string, ddl: string) {
    try {
      const [cols] = await this.pool!.query(
        'SELECT COLUMN_NAME FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ?',
        [this.database, 'records'],
      );
      const names = new Set((cols as any[]).map((c) => c.COLUMN_NAME));
      if (!names.has(col)) {
        await this.pool!.query(`ALTER TABLE \`records\` ADD COLUMN \`${col}\` ${ddl}`);
        this.logger.log(`[MysqlStorage] 已为 records 表补充列 ${col}`);
      }
    } catch (e: any) {
      this.logger.warn(`[MysqlStorage] 检查/补充 records 列 ${col} 失败: ${e.message}`);
    }
  }

  /**
   * 幂等列迁移：检查 operation_logs 表是否含指定列，缺失则 ALTER TABLE ADD COLUMN
   */
  private async ensureLogColumn(col: string, ddl: string) {
    try {
      const [cols] = await this.pool!.query(
        'SELECT COLUMN_NAME FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ?',
        [this.database, 'operation_logs'],
      );
      const names = new Set((cols as any[]).map((c) => c.COLUMN_NAME));
      if (!names.has(col)) {
        await this.pool!.query(`ALTER TABLE \`operation_logs\` ADD COLUMN \`${col}\` ${ddl}`);
        this.logger.log(`[MysqlStorage] 已为 operation_logs 表补充列 ${col}`);
      }
    } catch (e: any) {
      this.logger.warn(`[MysqlStorage] 检查/补充 operation_logs 列 ${col} 失败: ${e.message}`);
    }
  }

  private async loadAll() {
    const pool = this.pool!;
    const [districts] = await pool.query('SELECT * FROM `districts`');
    const [stations] = await pool.query('SELECT * FROM `stations`');
    const [users] = await pool.query('SELECT * FROM `users`');
    const [records] = await pool.query('SELECT * FROM `records`');
    const [items] = await pool.query('SELECT * FROM `items`');
    const [dictionary] = await pool.query('SELECT * FROM `dictionary`');
    const [configs] = await pool.query('SELECT * FROM `system_configs`');
    const [exportsArr] = await pool.query('SELECT * FROM `export_history`');
    const [logs] = await pool.query('SELECT * FROM `operation_logs`');
    const [tokens] = await pool.query('SELECT * FROM `refresh_tokens`');

    this.districts = toMap<number, District>((districts as any[]).map(rowToDistrict), (x) => x.id);
    this.stations = toMap<number, Station>((stations as any[]).map(rowToStation), (x) => x.id);
    this.users = toMap<number, User>((users as any[]).map(rowToUser), (x) => x.id);
    this.records = toMap<number, DutyRecord>((records as any[]).map(rowToRecord), (x) => x.id);
    this.items = toMap<number, DutyItem>((items as any[]).map(rowToItem), (x) => x.id);
    this.systemConfigs = toMap<string, SystemConfig>(
      (configs as any[]).map(rowToConfig),
      (x) => x.configKey,
    );
    this.exportHistory = toMap<number, ExportHistory>(
      (exportsArr as any[]).map(rowToExport),
      (x) => x.id,
    );
    this.operationLogs = (logs as any[])
      .map(rowToLog)
      .sort((a, b) => a.id - b.id)
      .slice(-OPERATION_LOG_LIMIT);
    this.refreshTokens = new Map<number, RefreshTokenEntry>(
      (tokens as any[])
        .map(rowToToken)
        .filter((t) => t.expiresAt > Date.now())
        .map((t) => [t.userId, t]),
    );

    // dictionary 按 type 拆分进 4 个 Map
    this.businessTypes = new Map();
    this.acceptContents = new Map();
    this.resultOptions = new Map();
    this.officers = new Map();
    for (const d of dictionary as any[]) {
      const item = rowToDict(d);
      if (d.type === DICT_TYPE.BUSINESS_TYPE) this.businessTypes.set(item.id, item);
      else if (d.type === DICT_TYPE.ACCEPT_CONTENT) this.acceptContents.set(item.id, item);
      else if (d.type === DICT_TYPE.RESULT_OPTION) this.resultOptions.set(item.id, item);
      else if (d.type === DICT_TYPE.OFFICER) this.officers.set(item.id, item as Officer);
    }

    this.recomputeNextId();
  }

  private recomputeNextId() {
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

  // ============ 迁移 / 回填（幂等） ============
  private migrateLegacySchedule() {
    const legacy = this.getSystemConfig('duty.schedule');
    if (legacy && !this.getSystemConfig('duty.schedule.1')) {
      this.saveSystemConfig({
        ...legacy,
        configKey: 'duty.schedule.1',
        description: '值班排班配置（站点1）',
        updatedAt: this.now(),
      });
      this.logger.log('[MysqlStorage] 已迁移排班配置 duty.schedule → duty.schedule.1');
    }
  }

  private backfillOrderTimeLimit(): boolean {
    let changed = false;
    this.stations.forEach((s) => {
      if (!s.orderTimeLimit) {
        s.orderTimeLimit = 60;
        changed = true;
      }
    });
    return changed;
  }

  private backfillOrgHierarchy(): boolean {
    let changed = false;
    if (this.districts.size === 0) {
      seedDistricts(this as any);
      changed = true;
    }
    this.stations.forEach((s) => {
      if (typeof s.districtId !== 'number') {
        s.districtId = 1;
        changed = true;
      }
    });
    this.users.forEach((u) => {
      // admin 期望 districtId=null（市级）；其余角色期望按所属站点派生，不一致才回填（幂等）
      if (u.role === Role.ADMIN) {
        if (u.districtId !== null) {
          u.districtId = null;
          changed = true;
        }
        return;
      }
      // 区县管理员：districtId 即其管理的区县，stationId 恒为 null，不可按站点派生
      if (u.role === Role.DISTRICT_ADMIN) {
        return;
      }
      const derived = u.stationId != null ? (this.stations.get(u.stationId)?.districtId ?? null) : null;
      if (u.districtId !== derived) {
        u.districtId = derived;
        changed = true;
      }
    });
    if (ensureDemoUsers(this as any)) changed = true;
    return changed;
  }

  /**
   * 一次性回填"需改默认密码"标记（幂等，仅功能首次引入时执行一次）：
   * 旧库的非 admin 账号均视为仍在使用默认密码，置 mustChangePassword=true；
   * 完成一次后通过 system_configs 写入标记，之后不再重复回填（避免覆盖用户已改的密码标记）。
   */
  private backfillPasswordChangeFlag(): boolean {
    // 已有标记说明此前已回填过，直接跳过
    if (this.systemConfigs.has('migration.password_change_flag')) {
      return false;
    }
    let changed = false;
    const now = this.now();
    this.users.forEach((u) => {
      if (u.role !== Role.ADMIN && !u.mustChangePassword) {
        u.mustChangePassword = true;
        changed = true;
      }
    });
    // 无论是否有用户被标记，都写入迁移完成标记（避免每次启动重复检查）
    this.systemConfigs.set('migration.password_change_flag', {
      configKey: 'migration.password_change_flag',
      configValue: '1',
      description: '是否已回填"需改默认密码"标记（1=已回填）',
      updatedBy: 1,
      updatedAt: now,
    });
    return changed || true;
  }

  /**
   * 遗留问题逐条 JSON 迁移（幂等）：非空且不以 `[` 开头的纯文本 → 按行拆成未解决条目 JSON 串，并重算 hasPending
   */
  private migrateLegacyPendingIssues(): boolean {
    let changed = false;
    this.records.forEach((r) => {
      const trimmed = (r.pendingIssues || '').trim();
      if (trimmed && !trimmed.startsWith('[')) {
        r.pendingIssues = serializePendingIssues(textToIssues(trimmed));
        r.hasPending = hasUnresolved(parsePendingIssues(r.pendingIssues));
        changed = true;
      }
    });
    return changed;
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
        this.flush().catch((err) => this.logger.error('Mysql flush failed', err?.stack));
      }
    }, this.flushIntervalMs);
    if (typeof this.flushTimer.unref === 'function') this.flushTimer.unref();
  }

  private async flush() {
    this.dirty = false;
    const task = this.writeChain.then(async () => {
      await this.runInTransaction(async (conn) => {
        await this.syncTable(conn, 'districts', DISTRICT_COLS, Array.from(this.districts.values()));
        await this.syncTable(conn, 'stations', STATION_COLS, Array.from(this.stations.values()));
        await this.syncTable(conn, 'users', USER_COLS, Array.from(this.users.values()));
        await this.syncTable(conn, 'records', RECORD_COLS, Array.from(this.records.values()));
        await this.syncTable(conn, 'items', ITEM_COLS, Array.from(this.items.values()));
        await this.syncTable(conn, 'system_configs', CONFIG_COLS, Array.from(this.systemConfigs.values()));
        await this.syncTable(conn, 'export_history', EXPORT_COLS, Array.from(this.exportHistory.values()));

        // dictionary 单表多类型，按 type 分组分别同步
        await this.syncTable(
          conn, 'dictionary', DICT_COLS,
          Array.from(this.businessTypes.values()).map((d) => ({ ...d, type: DICT_TYPE.BUSINESS_TYPE })),
          { sql: 'type = ?', params: [DICT_TYPE.BUSINESS_TYPE] },
        );
        await this.syncTable(
          conn, 'dictionary', DICT_COLS,
          Array.from(this.acceptContents.values()).map((d) => ({ ...d, type: DICT_TYPE.ACCEPT_CONTENT })),
          { sql: 'type = ?', params: [DICT_TYPE.ACCEPT_CONTENT] },
        );
        await this.syncTable(
          conn, 'dictionary', DICT_COLS,
          Array.from(this.resultOptions.values()).map((d) => ({ ...d, type: DICT_TYPE.RESULT_OPTION })),
          { sql: 'type = ?', params: [DICT_TYPE.RESULT_OPTION] },
        );
        await this.syncTable(
          conn, 'dictionary', DICT_COLS,
          Array.from(this.officers.values()).map((d) => ({ ...d, type: DICT_TYPE.OFFICER })),
          { sql: 'type = ?', params: [DICT_TYPE.OFFICER] },
        );

        // operation_logs 只写最近 10000 条（与内存裁剪一致）
        await this.syncTable(
          conn, 'operation_logs', LOG_COLS,
          this.operationLogs.slice(-OPERATION_LOG_LIMIT),
        );
        // refresh_tokens 只写未过期（过期即清理）
        await this.syncTable(
          conn, 'refresh_tokens', TOKEN_COLS,
          Array.from(this.refreshTokens.values()).filter((t) => t.expiresAt > Date.now()),
        );
      });
    });
    this.writeChain = task.catch(() => undefined);
    await task;
  }

  private async runInTransaction(fn: (conn: mysql.PoolConnection) => Promise<void>) {
    const conn = await this.pool!.getConnection();
    try {
      await conn.beginTransaction();
      await fn(conn);
      await conn.commit();
    } catch (e) {
      await conn.rollback();
      throw e;
    } finally {
      conn.release();
    }
  }

  /**
   * 幂等同步单表：DELETE 全量（可带 type 过滤）→ 按 200 行分批 INSERT
   * 内存是唯一真相源，全量重写结果与 upsert 等价
   */
  private async syncTable(
    conn: mysql.PoolConnection,
    table: string,
    cols: string[],
    rows: any[],
    where?: { sql: string; params: any[] },
  ) {
    const delSql = where
      ? `DELETE FROM \`${table}\` WHERE ${where.sql}`
      : `DELETE FROM \`${table}\``;
    await conn.query(delSql, where?.params ?? []);

    if (rows.length === 0) return;
    const colStr = cols.map((c) => `\`${c}\``).join(',');
    const placeholder = cols.map(() => '?').join(',');
    for (let i = 0; i < rows.length; i += BATCH_INSERT_ROWS) {
      const batch = rows.slice(i, i + BATCH_INSERT_ROWS);
      const rowValues = batch.map((r) => cols.map((c) => serializeValue(r[c])));
      const valuesSql = rowValues.map(() => `(${placeholder})`).join(',');
      await conn.query(
        `INSERT INTO \`${table}\` (${colStr}) VALUES ${valuesSql}`,
        rowValues.flat(),
      );
    }
  }

  // ============ 工具 ============
  now() {
    return new Date().toISOString();
  }

  nextIdOf(key: keyof typeof this.nextId): number {
    return this.nextId[key]++;
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
    this.markDirty();
    return d;
  }
  deleteDistrict(id: number): boolean {
    const ok = this.districts.delete(id);
    if (ok) this.markDirty();
    return ok;
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

  // ============ Dictionary（单表多类型） ============
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

// ===== 行转换（关键：TINYINT → boolean、BIGINT → number、JSON 串 → 对象） =====
function rowToDistrict(r: any): District {
  return {
    id: Number(r.id), name: r.name, code: r.code, sortOrder: Number(r.sortOrder),
    isActive: !!r.isActive, createdAt: r.createdAt, updatedAt: r.updatedAt,
  };
}
function rowToStation(r: any): Station {
  return {
    id: Number(r.id), name: r.name, code: r.code, districtId: Number(r.districtId),
    region: r.region ?? null, voltage: r.voltage ?? null,
    feeders: Number(r.feeders), transformers: Number(r.transformers),
    orderTimeLimit: Number(r.orderTimeLimit),
    isActive: !!r.isActive, createdAt: r.createdAt, updatedAt: r.updatedAt,
  };
}
function rowToUser(r: any): User {
  return {
    id: Number(r.id), username: r.username, passwordHash: r.passwordHash,
    realName: r.realName, role: r.role,
    stationId: r.stationId != null ? Number(r.stationId) : null,
    districtId: r.districtId != null ? Number(r.districtId) : null,
    isActive: !!r.isActive,
    lastLoginAt: r.lastLoginAt ?? null, lastLoginIp: r.lastLoginIp ?? null,
    mustChangePassword: r.mustChangePassword != null ? !!r.mustChangePassword : false,
    passwordPromptedAt: r.passwordPromptedAt ?? null,
    createdAt: r.createdAt, updatedAt: r.updatedAt,
  };
}
function rowToRecord(r: any): DutyRecord {
  return {
    id: Number(r.id), recordDate: r.recordDate, stationId: Number(r.stationId),
    weather: r.weather, weatherLabel: r.weatherLabel, creatorId: Number(r.creatorId),
    status: r.status, itemCount: Number(r.itemCount), completedCount: Number(r.completedCount),
    hasPending: !!r.hasPending, otherMatters: r.otherMatters ?? '',
    pendingIssues: r.pendingIssues ?? '',
    dutyOfficerIds: r.dutyOfficerIds ?? null,
    lockedAt: r.lockedAt ?? null, lockedBy: r.lockedBy != null ? Number(r.lockedBy) : null,
    createdAt: r.createdAt, updatedAt: r.updatedAt,
  };
}
function rowToItem(r: any): DutyItem {
  return {
    id: Number(r.id), recordId: Number(r.recordId), businessType: r.businessType,
    content: r.content ?? '', acceptTime: r.acceptTime ?? null, endTime: r.endTime ?? null,
    customerName: r.customerName ?? null, customerPhone: r.customerPhone ?? null,
    customerAddress: r.customerAddress ?? null, handler: r.handler ?? null, result: r.result ?? null,
    isCompleted: !!r.isCompleted,
    customerSatisfied: !!r.customerSatisfied,
    sortOrder: Number(r.sortOrder),
    createdAt: r.createdAt, updatedAt: r.updatedAt,
  };
}
function rowToDict(r: any): DictionaryItem {
  const base: DictionaryItem = {
    id: Number(r.id), label: r.label, sortOrder: Number(r.sortOrder),
    isActive: !!r.isActive, createdAt: r.createdAt,
  };
  if (r.type === DICT_TYPE.OFFICER) {
    return {
      ...base,
      stationId: r.stationId != null ? Number(r.stationId) : null,
      phone: r.phone ?? null,
    } as Officer;
  }
  return base;
}
function rowToConfig(r: any): SystemConfig {
  return {
    configKey: r.configKey, configValue: r.configValue,
    description: r.description ?? null,
    updatedBy: r.updatedBy != null ? Number(r.updatedBy) : null,
    updatedAt: r.updatedAt,
  };
}
function rowToExport(r: any): ExportHistory {
  return {
    id: Number(r.id), fileName: r.fileName, fileSize: Number(r.fileSize), filePath: r.filePath,
    year: Number(r.year), month: Number(r.month),
    stationId: r.stationId != null ? Number(r.stationId) : null,
    operatorId: Number(r.operatorId), status: r.status,
    errorMessage: r.errorMessage ?? null, createdAt: r.createdAt,
  };
}
function rowToLog(r: any): OperationLog {
  let details: any = r.details;
  if (typeof details === 'string' && details) {
    try { details = JSON.parse(details); } catch { /* 保持字符串 */ }
  }
  return {
    id: Number(r.id),
    userId: r.userId != null ? Number(r.userId) : null,
    username: r.username ?? null, action: r.action,
    targetType: r.targetType ?? null,
    targetId: r.targetId != null ? Number(r.targetId) : null,
    stationId: r.stationId != null ? Number(r.stationId) : null,
    ipAddress: r.ipAddress ?? null, userAgent: r.userAgent ?? null,
    details,
    statusCode: r.statusCode != null ? Number(r.statusCode) : null,
    durationMs: r.durationMs != null ? Number(r.durationMs) : null,
    createdAt: r.createdAt,
  };
}
function rowToToken(r: any): RefreshTokenEntry {
  return { token: r.token, userId: Number(r.userId), expiresAt: Number(r.expiresAt) };
}

/** 写库序列化：boolean → 1/0；null 保持 null；其余原样 */
function serializeValue(v: any): any {
  if (v === undefined) return null;
  if (typeof v === 'boolean') return v ? 1 : 0;
  if (typeof v === 'object' && v !== null) {
    try { return JSON.stringify(v); } catch { return String(v); }
  }
  return v;
}
