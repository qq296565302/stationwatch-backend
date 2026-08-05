import { Injectable } from '@nestjs/common';
import { StorageService } from '../../storage/storage.service';
import { UserPublic } from '../../storage/types';
import { BusinessException, BusinessCode } from '../../common/exceptions/business.exception';
import { CreateUserDto, ListUsersQuery, UpdateUserDto } from './dto/users.dto';
import { PaginatedResult } from '../../common/types/pagination';
import { Role } from '../../common/types/role.enum';
import { UserPayload } from '../../common/types/user-payload';

@Injectable()
export class UsersService {
  constructor(private readonly storage: StorageService) {}

  async list(q: ListUsersQuery, user?: UserPayload): Promise<PaginatedResult<UserPublic>> {
    let users = this.storage.getUsers();
    // 所长只能看本所用户（忽略入参站点）
    if (user && user.role === Role.SUPERVISOR && user.stationId) {
      q.stationId = user.stationId;
    }
    if (q.role) users = users.filter(u => u.role === q.role);
    if (q.stationId) users = users.filter(u => u.stationId === q.stationId);
    users.sort((a, b) => a.id - b.id);

    const page = q.page || 1;
    const pageSize = q.pageSize || 20;
    const total = users.length;
    const list = users.slice((page - 1) * pageSize, page * pageSize).map(u => this.sanitize(u));

    return { list, total, page, pageSize };
  }

  async findOne(id: number, user?: UserPayload): Promise<UserPublic> {
    const target = this.storage.getUser(id);
    if (!target) throw new BusinessException(BusinessCode.NOT_FOUND, '用户不存在');
    if (user && user.role === Role.SUPERVISOR && target.stationId !== user.stationId) {
      throw new BusinessException(BusinessCode.FORBIDDEN, '无权查看其他站点用户');
    }
    return this.sanitize(target);
  }

  /** 系统中超级管理员（admin 角色）的数量 */
  private adminCount(): number {
    return this.storage.getUsers().filter(u => u.role === Role.ADMIN).length;
  }

  async create(dto: CreateUserDto, actor?: UserPayload): Promise<UserPublic> {
    if (this.storage.getUserByUsername(dto.username)) {
      throw new BusinessException(BusinessCode.CONFLICT, '用户名已存在');
    }
    // 所长：只能建本所用户，不能创建超级管理员
    if (actor && actor.role === Role.SUPERVISOR) {
      if (dto.role === Role.ADMIN) {
        throw new BusinessException(BusinessCode.FORBIDDEN, '无权创建超级管理员');
      }
      dto.stationId = actor.stationId ?? undefined;
    }
    if (dto.role === Role.ADMIN && this.adminCount() > 0) {
      throw new BusinessException(BusinessCode.CONFLICT, '系统已存在超级管理员，最多只能有一个');
    }
    const now = this.storage.now();
    const user = {
      id: this.storage.nextIdOf('user'),
      username: dto.username,
      passwordHash: await this.storage.hashPassword(dto.password),
      realName: dto.realName,
      role: dto.role,
      stationId: dto.stationId ?? null,
      isActive: true,
      lastLoginAt: null,
      lastLoginIp: null,
      createdAt: now,
      updatedAt: now,
    };
    this.storage.saveUser(user);
    return this.sanitize(user);
  }

  async update(id: number, dto: UpdateUserDto, actor?: UserPayload): Promise<UserPublic> {
    const user = this.storage.getUser(id);
    if (!user) throw new BusinessException(BusinessCode.NOT_FOUND, '用户不存在');

    // 所长：只能改本所非管理员用户，不能改到其他站点，不能提升为管理员
    if (actor && actor.role === Role.SUPERVISOR) {
      if (user.stationId !== actor.stationId) {
        throw new BusinessException(BusinessCode.FORBIDDEN, '无权操作其他站点用户');
      }
      if (dto.role === Role.ADMIN) {
        throw new BusinessException(BusinessCode.FORBIDDEN, '无权创建超级管理员');
      }
      if (dto.stationId !== undefined && dto.stationId !== actor.stationId) {
        throw new BusinessException(BusinessCode.FORBIDDEN, '不能将用户调整到其他站点');
      }
    }

    const adminTotal = this.adminCount();
    const isOnlyAdmin = user.role === Role.ADMIN && adminTotal === 1;
    // 把非超级管理员提升为超级管理员：已有 admin 则拒绝（全局仅允许一个）
    if (dto.role === Role.ADMIN && user.role !== Role.ADMIN && adminTotal > 0) {
      throw new BusinessException(BusinessCode.CONFLICT, '系统已存在超级管理员，最多只能有一个');
    }
    // 降级/禁用唯一的超级管理员：拒绝，避免系统失去管理员
    if (isOnlyAdmin) {
      if (dto.role !== undefined && dto.role !== Role.ADMIN) {
        throw new BusinessException(BusinessCode.FORBIDDEN, '不能降级唯一的超级管理员');
      }
      if (dto.isActive === false) {
        throw new BusinessException(BusinessCode.FORBIDDEN, '不能禁用唯一的超级管理员');
      }
    }

    if (dto.realName !== undefined) user.realName = dto.realName;
    if (dto.role !== undefined) user.role = dto.role;
    if (dto.stationId !== undefined) user.stationId = dto.stationId;
    if (dto.isActive !== undefined) user.isActive = dto.isActive;
    user.updatedAt = this.storage.now();
    this.storage.saveUser(user);
    return this.sanitize(user);
  }

  async remove(id: number) {
    const user = this.storage.getUser(id);
    if (!user) throw new BusinessException(BusinessCode.NOT_FOUND, '用户不存在');
    if (user.role === Role.ADMIN && this.adminCount() <= 1) {
      throw new BusinessException(BusinessCode.FORBIDDEN, '不能删除唯一的超级管理员');
    }
    this.storage.deleteUser(id);
    return { ok: true };
  }

  async resetPassword(id: number, newPassword: string, actor?: UserPayload) {
    const user = this.storage.getUser(id);
    if (!user) throw new BusinessException(BusinessCode.NOT_FOUND, '用户不存在');
    // 所长：只能重置本所非管理员用户
    if (actor && actor.role === Role.SUPERVISOR) {
      if (user.stationId !== actor.stationId) {
        throw new BusinessException(BusinessCode.FORBIDDEN, '无权操作其他站点用户');
      }
      if (user.role === Role.ADMIN) {
        throw new BusinessException(BusinessCode.FORBIDDEN, '无权重置超级管理员密码');
      }
    }
    user.passwordHash = await this.storage.hashPassword(newPassword);
    user.updatedAt = this.storage.now();
    this.storage.saveUser(user);
    this.storage.deleteRefreshToken(id);
    return { ok: true };
  }

  private sanitize(user: any): UserPublic {
    const { passwordHash, ...rest } = user;
    const station = rest.stationId ? this.storage.getStation(rest.stationId) : null;
    return { ...rest, stationName: station?.name || null } as UserPublic;
  }
}
