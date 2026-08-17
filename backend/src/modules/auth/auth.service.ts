import { Injectable, UnauthorizedException, Logger } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { StorageService } from '../../storage/storage.service';
import { UserPublic } from '../../storage/types';
import { BusinessException, BusinessCode } from '../../common/exceptions/business.exception';

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private readonly storage: StorageService,
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
  ) {}

  async login(username: string, password: string, ip?: string) {
    const user = this.storage.getUserByUsername(username);
    if (!user) {
      throw new BusinessException(BusinessCode.UNAUTHORIZED, '账号或密码错误');
    }
    const ok = await this.storage.comparePassword(password, user.passwordHash);
    if (!ok) {
      throw new BusinessException(BusinessCode.UNAUTHORIZED, '账号或密码错误');
    }
    if (!user.isActive) {
      throw new BusinessException(BusinessCode.FORBIDDEN, '账号已停用');
    }

    const tokens = this.generateTokens(user);
    // 存储 refresh token
    const refreshTtl = this.parseExpire(this.config.get('JWT_REFRESH_TOKEN_EXPIRE', '7d'));
    this.storage.saveRefreshToken(user.id, tokens.refreshToken, refreshTtl);

    // 更新登录时间
    user.lastLoginAt = this.storage.now();
    user.lastLoginIp = ip ?? null;
    this.storage.saveUser(user);

    // 判断是否该提示修改默认密码（温和提醒，一周内不重复；admin 不提示）
    const shouldPromptPasswordChange = this.markPasswordPrompt(user);

    return {
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken,
      user: this.sanitizeUser(user),
      shouldPromptPasswordChange,
    };
  }

  /**
   * 判断并记录"是否该提示修改默认密码"：
   * - admin 永不提示；
   * - 仅当用户仍在使用默认密码（mustChangePassword=true）时考虑；
   * - 首次提醒（passwordPromptedAt 为空）或距上次提醒超过 7 天 → 返回 true 并更新提醒时间；
   * - 7 天内的再次登录 → 返回 false，不重复打扰。
   */
  private markPasswordPrompt(user: any): boolean {
    // admin 不参与默认密码提醒
    if (user.role === 'admin') return false;
    if (!user.mustChangePassword) return false;

    const now = Date.now();
    const last = user.passwordPromptedAt ? Date.parse(user.passwordPromptedAt) : NaN;
    // 从未提醒，或距上次提醒已超过 7 天 → 该提醒
    if (isNaN(last) || now - last >= 7 * 24 * 3600 * 1000) {
      user.passwordPromptedAt = this.storage.now();
      this.storage.saveUser(user);
      return true;
    }
    return false;
  }

  async refresh(refreshToken: string) {
    let payload: any;
    try {
      payload = await this.jwt.verifyAsync(refreshToken, {
        secret: this.config.get('JWT_SECRET'),
      });
    } catch (e: any) {
      if (e?.name === 'TokenExpiredError') {
        throw new BusinessException(BusinessCode.TOKEN_EXPIRED, 'refresh token 已过期');
      }
      throw new BusinessException(BusinessCode.UNAUTHORIZED, 'refresh token 无效');
    }

    if (payload.type !== 'refresh') {
      throw new BusinessException(BusinessCode.UNAUTHORIZED, 'token 类型错误');
    }

    const stored = this.storage.getRefreshToken(Number(payload.sub));
    if (!stored || stored.token !== refreshToken) {
      throw new BusinessException(BusinessCode.UNAUTHORIZED, 'refresh token 已失效');
    }

    const user = this.storage.getUser(Number(payload.sub));
    if (!user || !user.isActive) {
      throw new BusinessException(BusinessCode.UNAUTHORIZED, '用户不存在或已停用');
    }

    const accessToken = await this.jwt.signAsync(
      {
        sub: user.id,
        username: user.username,
        role: user.role,
        stationId: user.stationId,
        districtId: user.districtId ?? null,
      },
      { expiresIn: this.config.get('JWT_ACCESS_TOKEN_EXPIRE', '2h') },
    );
    return { accessToken };
  }

  async logout(userId: number) {
    this.storage.deleteRefreshToken(userId);
    return { ok: true };
  }

  async changePassword(userId: number, oldPassword: string, newPassword: string) {
    const user = this.storage.getUser(userId);
    if (!user) throw new BusinessException(BusinessCode.UNAUTHORIZED, '用户不存在');

    const ok = await this.storage.comparePassword(oldPassword, user.passwordHash);
    if (!ok) throw new BusinessException(BusinessCode.PARAM_INVALID, '原密码错误');

    user.passwordHash = await this.storage.hashPassword(newPassword);
    // 用户已主动修改密码：清除"需改默认密码"标记及上次提醒时间
    user.mustChangePassword = false;
    user.passwordPromptedAt = null;
    user.updatedAt = this.storage.now();
    this.storage.saveUser(user);

    // 修改密码后吊销 refresh token
    this.storage.deleteRefreshToken(userId);

    return { ok: true };
  }

  getMe(userId: number): UserPublic {
    const user = this.storage.getUser(userId);
    if (!user) throw new BusinessException(BusinessCode.UNAUTHORIZED, '用户不存在');
    return this.sanitizeUser(user);
  }

  // ====== 内部工具 ======
  private generateTokens(user: {
    id: number;
    username: string;
    role: string;
    stationId: number | null;
    districtId: number | null;
  }) {
    const accessToken = this.jwt.sign(
      {
        sub: user.id,
        username: user.username,
        role: user.role,
        stationId: user.stationId,
        districtId: user.districtId ?? null,
      },
      { expiresIn: this.config.get('JWT_ACCESS_TOKEN_EXPIRE', '2h') },
    );
    const refreshToken = this.jwt.sign(
      { sub: user.id, type: 'refresh' },
      { expiresIn: this.config.get('JWT_REFRESH_TOKEN_EXPIRE', '7d') },
    );
    return { accessToken, refreshToken };
  }

  private parseExpire(s: string): number {
    // 简单解析 '7d' / '2h' / '30m'
    const m = /^(\d+)([smhd])$/.exec(s);
    if (!m) return 7 * 24 * 3600;
    const n = parseInt(m[1], 10);
    const unit = m[2];
    if (unit === 's') return n;
    if (unit === 'm') return n * 60;
    if (unit === 'h') return n * 3600;
    if (unit === 'd') return n * 24 * 3600;
    return 7 * 24 * 3600;
  }

  private sanitizeUser(user: any): UserPublic {
    const { passwordHash, ...rest } = user;
    const station = rest.stationId ? this.storage.getStation(rest.stationId) : null;
    return { ...rest, stationName: station?.name || null } as UserPublic;
  }
}
