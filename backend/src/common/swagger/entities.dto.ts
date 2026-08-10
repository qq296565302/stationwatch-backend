import { ApiProperty } from '@nestjs/swagger';

export class DistrictDto {
  @ApiProperty({ example: 1 })
  id: number;
  @ApiProperty({ example: '张店' })
  name: string;
  @ApiProperty({ example: 'ZD' })
  code: string;
  @ApiProperty({ example: 1 })
  sortOrder: number;
  @ApiProperty({ example: true })
  isActive: boolean;
  @ApiProperty()
  createdAt: string;
  @ApiProperty()
  updatedAt: string;
}

export class UserPublicDto {
  @ApiProperty({ example: 1 })
  id: number;
  @ApiProperty({ example: 'admin' })
  username: string;
  @ApiProperty({ example: '系统管理员' })
  realName: string;
  @ApiProperty({
    example: 'admin',
    enum: ['duty_officer', 'supervisor', 'district_admin', 'admin'],
  })
  role: string;
  @ApiProperty({ example: 1, nullable: true })
  stationId: number | null;
  @ApiProperty({ example: 1, nullable: true })
  districtId: number | null;
  @ApiProperty({ example: true })
  isActive: boolean;
  @ApiProperty({ example: '2026-07-31T08:00:00.000Z', nullable: true })
  lastLoginAt: string | null;
  @ApiProperty({ example: '127.0.0.1', nullable: true })
  lastLoginIp: string | null;
  @ApiProperty()
  createdAt: string;
  @ApiProperty()
  updatedAt: string;
}

export class StationDto {
  @ApiProperty({ example: 1 })
  id: number;
  @ApiProperty({ example: '东郊供电所' })
  name: string;
  @ApiProperty({ example: 'EAST' })
  code: string;
  @ApiProperty({ example: 1, description: '所属区县' })
  districtId: number;
  @ApiProperty({ example: '东郊', nullable: true })
  region: string | null;
  @ApiProperty({ example: '10kV', nullable: true })
  voltage: string | null;
  @ApiProperty({ example: 8 })
  feeders: number;
  @ApiProperty({ example: 24 })
  transformers: number;
  @ApiProperty({ example: 11 })
  maxDutyItemsPerRecord: number;
  @ApiProperty({ example: 45 })
  orderTimeLimit: number;
  @ApiProperty({ example: true })
  isActive: boolean;
  @ApiProperty()
  createdAt: string;
  @ApiProperty()
  updatedAt: string;
}

export class DutyItemDto {
  @ApiProperty({ example: 1 })
  id: number;
  @ApiProperty({ example: 1 })
  recordId: number;
  @ApiProperty({ example: '故障报修' })
  businessType: string;
  @ApiProperty({ example: '东郊路 123 号停电' })
  content: string;
  @ApiProperty({ example: '08:30', nullable: true })
  acceptTime: string | null;
  @ApiProperty({ example: '10:15', nullable: true })
  endTime: string | null;
  @ApiProperty({ example: '张三', nullable: true })
  customerName: string | null;
  @ApiProperty({ example: '13800138000', nullable: true })
  customerPhone: string | null;
  @ApiProperty({ example: '东郊路 123 号', nullable: true })
  customerAddress: string | null;
  @ApiProperty({ example: '王值班', nullable: true })
  handler: string | null;
  @ApiProperty({ example: '已修复', nullable: true })
  result: string | null;
  @ApiProperty({ example: false })
  isCompleted: boolean;
  @ApiProperty({ example: 0 })
  sortOrder: number;
  @ApiProperty()
  createdAt: string;
  @ApiProperty()
  updatedAt: string;
}

export class PendingIssueDto {
  @ApiProperty({ example: '9b1deb4d-3b7d-4bad-9bdd-2b0d7b3dcb6d', description: '遗留问题 ID（UUID）' })
  id: string;
  @ApiProperty({ example: '2 号变压器待维修', description: '问题内容' })
  content: string;
  @ApiProperty({ example: false, description: '是否已确认解决' })
  isResolved: boolean;
  @ApiProperty({ example: null, nullable: true, description: '解决时间' })
  resolvedAt: string | null;
  @ApiProperty({ example: null, nullable: true, description: '解决人用户 ID' })
  resolvedBy: number | null;
  @ApiProperty({ example: null, nullable: true, description: '解决人姓名' })
  resolvedByName: string | null;
}

export class DutyRecordDto {
  @ApiProperty({ example: 1 })
  id: number;
  @ApiProperty({ example: '2026-07-31' })
  recordDate: string;
  @ApiProperty({ example: 1 })
  stationId: number;
  @ApiProperty({ example: 'sunny' })
  weather: string;
  @ApiProperty({ example: '晴天' })
  weatherLabel: string;
  @ApiProperty({ example: 1 })
  creatorId: number;
  @ApiProperty({ example: 'active', enum: ['active', 'locked', 'archived'] })
  status: string;
  @ApiProperty({ example: 2 })
  itemCount: number;
  @ApiProperty({ example: 1 })
  completedCount: number;
  @ApiProperty({ example: false })
  hasPending: boolean;
  @ApiProperty({ example: '上午完成巡检' })
  otherMatters: string;
  @ApiProperty({ type: [PendingIssueDto], description: '遗留问题（逐条确认解决）' })
  pendingIssues: PendingIssueDto[];
  @ApiProperty({ example: null, nullable: true })
  lockedAt: string | null;
  @ApiProperty({ example: null, nullable: true })
  lockedBy: number | null;
  @ApiProperty()
  createdAt: string;
  @ApiProperty()
  updatedAt: string;
  @ApiProperty({ type: [DutyItemDto] })
  items: DutyItemDto[];
  @ApiProperty({ type: 'object', nullable: true })
  station: { id: number; name: string; code: string } | null;
  @ApiProperty({ type: 'object', nullable: true })
  creator: { id: number; username: string; realName: string } | null;
}

export class LoginResponseDto {
  @ApiProperty({ description: 'JWT 访问令牌（2 小时有效）' })
  accessToken: string;
  @ApiProperty({ description: '刷新令牌（7 天有效）' })
  refreshToken: string;
  @ApiProperty({ type: UserPublicDto })
  user: UserPublicDto;
}
