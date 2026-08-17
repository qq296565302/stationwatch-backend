// ============== 区县（组织层级：市级 → 区县级 → 供电所） ==============
export interface District {
  id: number;
  name: string;      // 如：张店 / 临淄 / 淄川 / 博山 / 周村 / 桓台 / 高青 / 沂源
  code: string;      // 如：ZD / LZ / ZC / BS / ZCN / HT / GQ / YY
  sortOrder: number; // 展示顺序
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

// ============== 站点（供电所，归属某个区县） ==============
export interface Station {
  id: number;
  name: string;
  code: string;
  districtId: number; // 所属区县
  region?: string;
  voltage?: string;
  feeders: number;
  transformers: number;
  orderTimeLimit: number; // 工单时限（分钟），站点级，默认 60
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
  role: 'duty_officer' | 'supervisor' | 'district_admin' | 'admin';
  stationId: number | null;
  districtId: number | null; // 区县归属：district_admin 绑定区县；admin 为 null(市级)；其余随所属站点
  isActive: boolean;
  lastLoginAt: string | null;
  lastLoginIp: string | null;
  /** 是否仍在使用默认密码（org 灌库/管理员重置后为 true，用户主动改密后为 false） */
  mustChangePassword: boolean;
  /** 上次"提示修改默认密码"的时间（ISO 串），用于控制提醒频率（一周内不重复提醒）；null=从未提醒 */
  passwordPromptedAt: string | null;
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
  /** 实际值班人员（逗号分隔 user.id；null=未设置，展示时回退排班名单） */
  dutyOfficerIds: string | null;
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
  customerSatisfied: boolean; // 客户满意标签（仅已完成工单可标记）
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
