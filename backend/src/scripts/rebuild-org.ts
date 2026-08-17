/**
 * 灌库脚本：根据 org-data.json 重建组织架构（区县/供电所）与全部账号
 *
 * 用法（在 backend 目录下）：
 *   npm run rebuild:org -- --dry-run   # 只读分析：打印变更计划 + 生成审计报告 xlsx，不写库
 *   npm run rebuild:org                # 执行灌库（不可逆）
 *
 * 行为：
 *   1. 删除除 admin 外的所有账号
 *   2. 区县按 name 匹配复用旧 id；不在新清单的旧区县删除；新增区县分配新 id
 *   3. 供电所按 (districtId, name) 匹配复用旧 id（保留马尚 id=1 等历史站点，旧值班记录继续挂接）；
 *      不在新清单的旧供电所删除
 *   4. 按 org-data.json 生成 1484 个账号（bcrypt cost 10），密码取自 JSON
 *   5. finally 中 onModuleDestroy → flush() 单事务落库
 *
 * 不触碰：值班记录 / 工单 / 字典 / 系统配置 / 排班配置（duty.schedule.* 保持原样）
 *
 * 环境变量：ORG_DATA_PATH（默认前端根目录 org-data.json）
 * 说明：直连 MysqlStorageService（STORAGE_MODE=mysql，读 .env），不引导整个 AppModule，
 *       避免定时任务/全局守卫等副作用；onModuleInit / onModuleDestroy 由脚本手动调用。
 */
import 'reflect-metadata';
import * as fs from 'fs';
import * as path from 'path';
import * as dotenv from 'dotenv';
import * as bcrypt from 'bcryptjs';
import * as ExcelJS from 'exceljs';
import { ConfigService } from '@nestjs/config';
import { MysqlStorageService } from '../storage/mysql-storage.service';

const ORG_PATH =
  process.env.ORG_DATA_PATH || 'd:/SGCC Root/供电所值守云平台前端/org-data.json';
const OUT_DIR = path.resolve(__dirname, '../../scripts-output');

type Role = 'district_admin' | 'supervisor' | 'duty_officer';

interface OrgStation {
  name: string;
  abbr: string;
  sup: string;
  members: string[];
}
interface OrgDistrict {
  name: string;
  abbr: string;
  admins: string[];
  stations: OrgStation[];
}
interface OrgAccount {
  username: string;
  password: string;
  realName: string;
  role: Role;
  district: string;
  station: string | null;
  stationAbbr: string;
}
interface OrgJson {
  meta: any;
  districts: OrgDistrict[];
  accounts: OrgAccount[];
}

const ROLE_LABEL: Record<Role, string> = {
  district_admin: '区县管理员',
  supervisor: '所长',
  duty_officer: '值班员',
};

async function writeAuditXlsx(org: OrgJson): Promise<string> {
  fs.mkdirSync(OUT_DIR, { recursive: true });
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('组织账号');
  ws.columns = [
    { header: '序号', key: 'no', width: 6 },
    { header: '区县', key: 'district', width: 18 },
    { header: '供电所', key: 'station', width: 22 },
    { header: '角色', key: 'role', width: 10 },
    { header: '姓名', key: 'realName', width: 10 },
    { header: '用户名', key: 'username', width: 30 },
    { header: '默认密码', key: 'password', width: 26 },
  ];
  org.accounts.forEach((a, i) => {
    ws.addRow({
      no: i + 1,
      district: a.district,
      station: a.station ?? '',
      role: ROLE_LABEL[a.role],
      realName: a.realName,
      username: a.username,
      password: a.password,
    });
  });
  const file = path.join(OUT_DIR, 'org-accounts.xlsx');
  await wb.xlsx.writeFile(file);
  return file;
}

async function main() {
  dotenv.config({ path: path.join(process.cwd(), '.env') });
  const dryRun = process.argv.includes('--dry-run');

  const storage = new MysqlStorageService(new ConfigService(process.env));
  try {
    await storage.onModuleInit();
    if (dryRun) {
      // 抑制 onModuleInit 可能触发的幂等迁移 flush：dry-run 严格不写库
      const s = storage as any;
      if (s.flushTimer) {
        clearTimeout(s.flushTimer);
        s.flushTimer = null;
      }
      s.dirty = false;
    }

    const org = JSON.parse(fs.readFileSync(ORG_PATH, 'utf8')) as OrgJson;
    const now = storage.now();

    // ============ 现状 ============
    const existingDistricts = storage.getDistricts();
    const existingStations = storage.getStations();
    const existingUsers = storage.getUsers();
    const admin = existingUsers.find((u) => u.username === 'admin');
    if (!admin) throw new Error('未找到 admin 账号，拒绝执行（必须保留超级管理员）');

    // ============ 规划区县 ============
    const districtPlan: Array<{
      id: number;
      name: string;
      code: string;
      sortOrder: number;
      existing: boolean;
    }> = org.districts.map((d, i) => {
      const existing = existingDistricts.find((x) => x.name === d.name);
      return {
        id: existing ? existing.id : storage.nextIdOf('district'),
        name: d.name,
        code: d.abbr,
        sortOrder: i + 1,
        existing: !!existing,
      };
    });
    const districtIdByName = new Map(districtPlan.map((d) => [d.name, d.id]));
    const removeDistricts = existingDistricts.filter((x) => !districtIdByName.has(x.name));

    // ============ 规划站点 ============
    const stationPlan: Array<{
      id: number;
      districtId: number;
      districtName: string;
      name: string;
      code: string;
      existing: boolean;
    }> = [];
    for (const d of org.districts) {
      const did = districtIdByName.get(d.name)!;
      for (const s of d.stations) {
        const existing = existingStations.find((x) => x.districtId === did && x.name === s.name);
        stationPlan.push({
          id: existing ? existing.id : storage.nextIdOf('station'),
          districtId: did,
          districtName: d.name,
          name: s.name,
          code: s.abbr,
          existing: !!existing,
        });
      }
    }
    const stationIdByKey = new Map(stationPlan.map((s) => [`${s.districtId}:${s.name}`, s.id]));
    const removeStations = existingStations.filter(
      (x) => !stationIdByKey.has(`${x.districtId}:${x.name}`),
    );

    // ============ 规划用户 ============
    const removeUsers = existingUsers.filter((u) => u.username !== 'admin');

    // ============ 目标账号（解析归属） ============
    const accounts = org.accounts.map((a) => {
      const districtId = districtIdByName.get(a.district) ?? null;
      const stationId = a.station ? stationIdByKey.get(`${districtId}:${a.station}`) ?? null : null;
      return {
        username: a.username,
        passwordHash: bcrypt.hashSync(a.password, 10),
        realName: a.realName,
        role: a.role,
        stationId,
        districtId,
      };
    });

    // ============ 校验 ============
    const seen = new Set<string>();
    const dup = new Set<string>();
    for (const u of accounts) {
      if (seen.has(u.username)) dup.add(u.username);
      seen.add(u.username);
    }
    if (dup.size) throw new Error(`username 重复: ${[...dup].join(', ')}`);
    const badRef = accounts.filter(
      (u) =>
        u.districtId == null ||
        (u.role === 'district_admin' && u.stationId != null) ||
        ((u.role === 'supervisor' || u.role === 'duty_officer') && u.stationId == null),
    );
    if (badRef.length)
      throw new Error(
        `账号归属解析失败 ${badRef.length} 个，前几个: ${badRef.slice(0, 5).map((u) => u.username).join(', ')}`,
      );

    // ============ 审计报告 ============
    const reportPath = await writeAuditXlsx(org);

    // ============ 摘要 ============
    const dNew = districtPlan.filter((d) => !d.existing);
    const sNew = stationPlan.filter((s) => !s.existing);
    const roleCount: Record<string, number> = {};
    accounts.forEach((u) => {
      roleCount[u.role] = (roleCount[u.role] || 0) + 1;
    });

    console.log('============================================');
    console.log(`灌库计划   模式: ${dryRun ? 'DRY-RUN（只读，不写库）' : 'APPLY（写入 MySQL）'}`);
    console.log(`数据源     ${ORG_PATH}`);
    console.log(
      `区县      现 ${existingDistricts.length} → 保留 ${districtPlan.length - dNew.length} / 新增 ${dNew.length} / 删除 ${removeDistricts.length}`,
    );
    console.log(
      `供电所    现 ${existingStations.length} → 保留 ${stationPlan.length - sNew.length} / 新增 ${sNew.length} / 删除 ${removeStations.length}`,
    );
    console.log(
      `账号      现 ${existingUsers.length} → 保留 admin ×1 / 删除 ${removeUsers.length} / 新建 ${accounts.length}`,
    );
    console.log(
      `          新建：区县管理员 ${roleCount['district_admin'] || 0} / 所长 ${roleCount['supervisor'] || 0} / 值班员 ${roleCount['duty_officer'] || 0}`,
    );
    if (removeDistricts.length)
      console.log(`  删除区县: ${removeDistricts.map((x) => `${x.name}(id=${x.id})`).join(', ')}`);
    if (removeStations.length)
      console.log(
        `  删除供电所: ${removeStations.map((x) => `${x.name}(id=${x.id},区县id=${x.districtId})`).join(', ')}`,
      );
    console.log(`审计报告  ${reportPath}`);
    console.log('============================================');

    if (dryRun) return;

    // ============ 执行（apply） ============
    // 1) 删除非 admin 账号
    for (const u of removeUsers) storage.deleteUser(u.id);
    // 2) 删除旧供电所（先站后区县，避免孤儿）
    for (const s of removeStations) storage.deleteStation(s.id);
    // 3) 删除旧区县
    for (const d of removeDistricts) storage.deleteDistrict(d.id);
    // 4) 更新/新建区县
    for (const d of districtPlan) {
      const existing = storage.getDistrict(d.id);
      if (!existing) {
        storage.saveDistrict({
          id: d.id,
          name: d.name,
          code: d.code,
          sortOrder: d.sortOrder,
          isActive: true,
          createdAt: now,
          updatedAt: now,
        });
      } else if (existing.name !== d.name || existing.code !== d.code || existing.sortOrder !== d.sortOrder) {
        storage.saveDistrict({ ...existing, name: d.name, code: d.code, sortOrder: d.sortOrder, updatedAt: now });
      }
    }
    // 5) 更新/新建供电所（复用时保留 feeders/transformers/orderTimeLimit 等原值）
    for (const s of stationPlan) {
      const existing = storage.getStation(s.id);
      if (!existing) {
        storage.saveStation({
          id: s.id,
          name: s.name,
          code: s.code,
          districtId: s.districtId,
          isActive: true,
          feeders: 0,
          transformers: 0,
          orderTimeLimit: 60,
          createdAt: now,
          updatedAt: now,
        });
      } else {
        storage.saveStation({
          ...existing,
          name: s.name,
          code: s.code,
          districtId: s.districtId,
          isActive: true,
          updatedAt: now,
        });
      }
    }
    // 6) 新建账号（默认密码，标记需首次改密）
    for (const u of accounts) {
      storage.saveUser({
        id: storage.nextIdOf('user'),
        username: u.username,
        passwordHash: u.passwordHash,
        realName: u.realName,
        role: u.role,
        stationId: u.stationId,
        districtId: u.districtId,
        isActive: true,
        lastLoginAt: null,
        lastLoginIp: null,
        mustChangePassword: true,
        passwordPromptedAt: null,
        createdAt: now,
        updatedAt: now,
      });
    }
    // 7) admin 保险：districtId 恒为 null（市级）
    const adminNow = storage.getUser(admin.id);
    if (adminNow && adminNow.districtId !== null) {
      storage.saveUser({ ...adminNow, districtId: null, updatedAt: now });
    }

    console.log(
      `\n[APPLY] 内存更新完成：区县 ${storage.getDistricts().length} / 供电所 ${storage.getStations().length} / 用户 ${storage.getUsers().length}`,
    );
    console.log('[APPLY] 调用 onModuleDestroy → flush() 单事务落库...');
  } catch (e: any) {
    console.error('[rebuild-org] 执行失败:', e?.stack || e?.message || e);
    process.exitCode = 1;
  } finally {
    try {
      await storage.onModuleDestroy();
    } catch (e: any) {
      console.error('[rebuild-org] 落库失败:', e?.stack || e?.message || e);
      process.exitCode = 1;
    }
  }
}

main();
