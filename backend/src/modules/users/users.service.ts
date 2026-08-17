import { Injectable } from '@nestjs/common';
import { StorageService } from '../../storage/storage.service';
import { UserPublic } from '../../storage/types';
import { BusinessException, BusinessCode } from '../../common/exceptions/business.exception';
import { CreateUserDto, ListUsersQuery, UpdateUserDto } from './dto/users.dto';
import { PaginatedResult } from '../../common/types/pagination';
import { Role } from '../../common/types/role.enum';
import { UserPayload } from '../../common/types/user-payload';
import { ScopeService } from '../../common/scope/scope.service';

@Injectable()
export class UsersService {
  constructor(
    private readonly storage: StorageService,
    private readonly scope: ScopeService,
  ) {}

  async list(q: ListUsersQuery, user?: UserPayload): Promise<PaginatedResult<UserPublic>> {
    let users = this.storage.getUsers();
    // 所长只能看本所用户（忽略入参站点）
    if (user && user.role === Role.SUPERVISOR && user.stationId) {
      q.stationId = user.stationId;
    }
    // 区县管理员：只看到本区县供电所的所长/值班员（不可见同级管理员与超管）
    if (user && user.role === Role.DISTRICT_ADMIN) {
      if (q.stationId) {
        if (!this.scope.canAccessStation(user, q.stationId)) {
          throw new BusinessException(BusinessCode.FORBIDDEN, '无权查看其他区县用户');
        }
        users = users.filter(u => u.stationId === q.stationId);
      } else {
        users = users.filter(u => u.districtId === user.districtId);
      }
      users = users.filter(
        u => u.role === Role.DUTY_OFFICER || u.role === Role.SUPERVISOR,
      );
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
    if (user && user.role === Role.DISTRICT_ADMIN) {
      const inScope = target.stationId != null
        ? this.scope.canAccessStation(user, target.stationId)
        : target.districtId === user.districtId;
      if (!inScope) {
        throw new BusinessException(BusinessCode.FORBIDDEN, '无权查看其他区县用户');
      }
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
    const role = dto.role;
    let stationId = dto.stationId ?? null;
    let districtId = dto.districtId ?? null;

    if (actor) {
      if (actor.role === Role.SUPERVISOR) {
        // 所长：只能建本所所长/值班员，不能建管理员
        if (role === Role.ADMIN || role === Role.DISTRICT_ADMIN) {
          throw new BusinessException(BusinessCode.FORBIDDEN, '无权创建管理员账号');
        }
        stationId = actor.stationId ?? null;
        districtId = actor.districtId ?? null;
      } else if (actor.role === Role.DISTRICT_ADMIN) {
        // 区县管理员：只能为本区县供电所建所长/值班员
        if (role === Role.ADMIN || role === Role.DISTRICT_ADMIN) {
          throw new BusinessException(BusinessCode.FORBIDDEN, '无权创建管理员账号');
        }
        if (stationId == null) {
          throw new BusinessException(BusinessCode.PARAM_INVALID, '请选择所属供电所');
        }
        const st = this.storage.getStation(stationId);
        if (!st || st.districtId !== actor.districtId) {
          throw new BusinessException(BusinessCode.FORBIDDEN, '只能为本区县供电所创建账号');
        }
        districtId = actor.districtId;
      } else if (actor.role === Role.ADMIN) {
        // 市级超管：可建任意角色；区县管理员 stationId 置空、districtId 必填
        if (role === Role.DISTRICT_ADMIN) {
          stationId = null;
          if (districtId == null) districtId = 1;
        } else if (stationId != null) {
          const st = this.storage.getStation(stationId);
          if (st) districtId = st.districtId;
        }
      }
    } else if (stationId != null) {
      const st = this.storage.getStation(stationId);
      if (st) districtId = st.districtId;
    }

    if (role === Role.ADMIN && this.adminCount() > 0) {
      throw new BusinessException(BusinessCode.CONFLICT, '系统已存在超级管理员，最多只能有一个');
    }

    const now = this.storage.now();
    const user = {
      id: this.storage.nextIdOf('user'),
      username: dto.username,
      passwordHash: await this.storage.hashPassword(dto.password),
      realName: dto.realName,
      role,
      stationId,
      districtId,
      isActive: true,
      lastLoginAt: null,
      lastLoginIp: null,
      mustChangePassword: true, // 新建账号默认要求首次登录修改密码
      passwordPromptedAt: null,
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
      if (dto.role === Role.ADMIN || dto.role === Role.DISTRICT_ADMIN) {
        throw new BusinessException(BusinessCode.FORBIDDEN, '无权创建管理员账号');
      }
      if (dto.stationId !== undefined && dto.stationId !== actor.stationId) {
        throw new BusinessException(BusinessCode.FORBIDDEN, '不能将用户调整到其他站点');
      }
    }
    // 区县管理员：只能改本区县供电所的所长/值班员，不可提权、不可跨区县
    if (actor && actor.role === Role.DISTRICT_ADMIN) {
      const inScope = user.stationId != null
        ? this.scope.canAccessStation(actor, user.stationId)
        : user.districtId === actor.districtId;
      if (!inScope) {
        throw new BusinessException(BusinessCode.FORBIDDEN, '无权操作其他区县用户');
      }
      if (user.role === Role.ADMIN || user.role === Role.DISTRICT_ADMIN) {
        throw new BusinessException(BusinessCode.FORBIDDEN, '无权操作管理员账号');
      }
      if (dto.role === Role.ADMIN || dto.role === Role.DISTRICT_ADMIN) {
        throw new BusinessException(BusinessCode.FORBIDDEN, '无权提升为管理员');
      }
      if (dto.stationId !== undefined && dto.stationId !== null) {
        const st = this.storage.getStation(dto.stationId);
        if (!st || st.districtId !== actor.districtId) {
          throw new BusinessException(BusinessCode.FORBIDDEN, '只能在本区县供电所内调整');
        }
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
    if (dto.districtId !== undefined) user.districtId = dto.districtId;
    // 值班员/所长区县始终跟随所属站点；区县管理员/市级超管区县由显式字段决定
    if (user.role === Role.DUTY_OFFICER || user.role === Role.SUPERVISOR) {
      const st = user.stationId != null ? this.storage.getStation(user.stationId) : undefined;
      user.districtId = st?.districtId ?? null;
    }
    if (dto.isActive !== undefined) user.isActive = dto.isActive;
    user.updatedAt = this.storage.now();
    this.storage.saveUser(user);
    return this.sanitize(user);
  }

  async remove(id: number, actor?: UserPayload) {
    const user = this.storage.getUser(id);
    if (!user) throw new BusinessException(BusinessCode.NOT_FOUND, '用户不存在');
    // 任何角色都不能删除自己的账号
    if (actor && actor.id === id) {
      throw new BusinessException(BusinessCode.FORBIDDEN, '不能删除当前登录账号');
    }
    // 所长：只能删除本所的非管理员用户
    if (actor && actor.role === Role.SUPERVISOR) {
      if (user.stationId !== actor.stationId) {
        throw new BusinessException(BusinessCode.FORBIDDEN, '无权删除其他站点用户');
      }
      if (user.role === Role.ADMIN || user.role === Role.DISTRICT_ADMIN) {
        throw new BusinessException(BusinessCode.FORBIDDEN, '无权删除管理员账号');
      }
    }
    // 区县管理员：只能删除本区县供电所的非管理员用户
    if (actor && actor.role === Role.DISTRICT_ADMIN) {
      if (user.role === Role.ADMIN || user.role === Role.DISTRICT_ADMIN) {
        throw new BusinessException(BusinessCode.FORBIDDEN, '无权删除管理员账号');
      }
      const inScope = user.stationId != null
        ? this.scope.canAccessStation(actor, user.stationId)
        : false;
      if (!inScope) {
        throw new BusinessException(BusinessCode.FORBIDDEN, '无权删除其他区县用户');
      }
    }
    if (user.role === Role.ADMIN && this.adminCount() <= 1) {
      throw new BusinessException(BusinessCode.FORBIDDEN, '不能删除唯一的超级管理员');
    }
    // 吊销被删用户的登录态
    this.storage.deleteRefreshToken(id);
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
    // 区县管理员：只能重置本区县供电所的所长/值班员
    if (actor && actor.role === Role.DISTRICT_ADMIN) {
      if (user.role === Role.ADMIN || user.role === Role.DISTRICT_ADMIN) {
        throw new BusinessException(BusinessCode.FORBIDDEN, '无权重置管理员密码');
      }
      const inScope = user.stationId != null
        ? this.scope.canAccessStation(actor, user.stationId)
        : false;
      if (!inScope) {
        throw new BusinessException(BusinessCode.FORBIDDEN, '无权操作其他区县用户');
      }
    }
    user.passwordHash = await this.storage.hashPassword(newPassword);
    // 管理员重置密码后，该账号需在下次登录时提示修改（避免长期使用管理员设定的临时密码）
    user.mustChangePassword = true;
    user.passwordPromptedAt = null;
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
