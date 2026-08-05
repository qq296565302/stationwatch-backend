// ============== 站点 ==============
export interface Station {
  id: number;
  name: string;
  code: string;
  region?: string;
  voltage?: string;
  feeders: number;
  transformers: number;
  maxDutyItemsPerRecord: number;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

// ============== 用户 ==============
export interface User {
  id: number;
  username: string;
  passwordHash: string;
  realName: string;
  role: 'duty_officer' | 'supervisor' | 'admin';
  stationId: number | null;
  isActive: boolean;
  lastLoginAt: string | null;
  lastLoginIp: string | null;
  createdAt: string;
  updatedAt: string;
}

// 用户公开信息（不含 passwordHash，附带 stationName 供前端使用）
export type UserPublic = Omit<User, 'passwordHash'> & { stationName?: string | null };

// ============== 值班记录 ==============
export type RecordStatus = 'active' | 'locked' | 'archived';

export interface DutyRecord {
  id: number;
  recordDate: string; // YYYY-MM-DD
  stationId: number;
  weather: string;
  weatherLabel: string;
  creatorId: number;
  status: RecordStatus;
  itemCount: number;
  completedCount: number;
  hasPending: boolean;
  otherMatters: string;
  pendingIssues: string;
  lockedAt: string | null;
  lockedBy: number | null;
  createdAt: string;
  updatedAt: string;
}

// ============== 值班工单 ==============
export interface DutyItem {
  id: number;
  recordId: number;
  businessType: string;
  content: string;
  acceptTime: string | null; // HH:MM
  endTime: string | null;
  customerName: string | null;
  customerPhone: string | null;
  customerAddress: string | null;
  handler: string | null;
  result: string | null;
  isCompleted: boolean;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
}

// ============== 字典项 ==============
export interface DictionaryItem {
  id: number;
  label: string;
  sortOrder: number;
  isActive: boolean;
  createdAt: string;
}

// 值班员字典（额外字段）
export interface Officer extends DictionaryItem {
  stationId: number | null;
  phone: string | null;
}

// ============== 系统配置 ==============
export interface SystemConfig {
  configKey: string;
  configValue: string;
  description: string | null;
  updatedBy: number | null;
  updatedAt: string;
}

// ============== 导出历史 ==============
export type ExportStatus = 'pending' | 'done' | 'failed';

export interface ExportHistory {
  id: number;
  fileName: string;
  fileSize: number;
  filePath: string;
  year: number;
  month: number;
  stationId: number | null;
  operatorId: number;
  status: ExportStatus;
  errorMessage: string | null;
  createdAt: string;
}

// ============== 操作日志 ==============
export interface OperationLog {
  id: number;
  userId: number | null;
  username: string | null;
  action: string;
  targetType: string | null;
  targetId: number | null;
  ipAddress: string | null;
  userAgent: string | null;
  details: any;
  statusCode: number | null;
  durationMs: number | null;
  createdAt: string;
}

// ============== Refresh Token 存储（替代 Redis） ==============
export interface RefreshTokenEntry {
  token: string;
  userId: number;
  expiresAt: number;
}
