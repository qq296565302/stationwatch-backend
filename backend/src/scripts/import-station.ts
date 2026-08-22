/**
 * 增量导入单个供电所及其人员账号（不触碰其他数据）
 *
 * 作用：在内网/生产库中新增一个供电所 + 所长 + 值班员账号，无需全量 rebuild。
 *   - 按「区县名」定位上级供电中心
 *   - 供电所按 (districtId, name) 判断是否已存在，不存在则新建
 *   - 账号按 username 判断是否已存在，不存在则新建（幂等，可重复执行）
 *   - 不触碰：值班记录 / 工单 / 字典 / 系统配置 / 排班配置 / 其他区县与供电所
 *
 * 用法（在 backend 目录下）：
 *   npm run import:station              # 执行（写库）
 *   npm run import:station -- --dry-run # 只打印计划，不写库
 *
 * 账号规则（与 org-data.json 保持一致）：
 *   username = <供电所abbr> + 姓名全拼（小写）
 *   password = @<abbr>_95598
 *   所长 role=supervisor，值班员 role=duty_officer；首次登录需修改默认密码
 *
 * 新增站点时：修改下方 STATION 定义（名称/abbr/所长/成员名单），并在 P 拼音映射里补全姓名即可。
 */
import 'reflect-metadata';
import * as path from 'path';
import * as dotenv from 'dotenv';
import * as bcrypt from 'bcryptjs';
import { ConfigService } from '@nestjs/config';
import { MysqlStorageService } from '../storage/mysql-storage.service';

// ================= 目标供电所（按需修改） =================
const DISTRICT_NAME = '临淄供电中心'; // 上级区县/供电中心名称
const STATION = {
  name: '城区供电服务站',
  abbr: 'csz', // 用于账号前缀，全系统唯一
  sup: '刘同银', // 所长
  members: [
    '王明超', '冯占凯', '孙士刚', '郎需栋', '赵云祥', '张珂钦', '李嘉欣',
    '陈宜谦', '王鹏', '孙振中', '杨健', '路海南', '李文燕', '王汉祥',
    '王建力', '王效峰', '周晓涵', '王浩港', '吕绪成', '韩迎祥', '袁文杰', '王景磊',
  ],
};
const PASSWORD = `@${STATION.abbr}_95598`;

// 姓名 → 全拼（小写）。多音字/生僻字请在此显式指定以保证账号正确。
const P: Record<string, string> = {
  刘同银: 'liutongyin',
  王明超: 'wangmingchao',
  冯占凯: 'fengzhankai',
  孙士刚: 'sunshigang',
  郎需栋: 'langxudong',
  赵云祥: 'zhaoyunxiang',
  张珂钦: 'zhangkeqin',
  李嘉欣: 'lijiaxin',
  陈宜谦: 'chenyiqian',
  王鹏: 'wangpeng',
  孙振中: 'sunzhenzhong',
  杨健: 'yangjian',
  路海南: 'luhainan',
  李文燕: 'liwenyan',
  王汉祥: 'wanghanxiang',
  王建力: 'wangjianli',
  王效峰: 'wangxiaofeng',
  周晓涵: 'zhouxiaohan',
  王浩港: 'wanghaogang',
  吕绪成: 'lvxucheng',
  韩迎祥: 'hanyingxiang',
  袁文杰: 'yuanwenjie',
  王景磊: 'wangjinglei',
};

function pinyinOf(name: string): string {
  if (P[name]) return P[name];
  throw new Error(`缺少「${name}」的拼音映射，请补充到脚本 P 表中`);
}

async function main() {
  dotenv.config({ path: path.join(process.cwd(), '.env') });
  const dryRun = process.argv.includes('--dry-run');
  const storage = new MysqlStorageService(new ConfigService(process.env));
  try {
    await storage.onModuleInit();
    if (dryRun) {
      const s = storage as any;
      if (s.flushTimer) { clearTimeout(s.flushTimer); s.flushTimer = null; }
      s.dirty = false;
    }
    const now = storage.now();

    // 1) 定位区县
    const district = storage.getDistricts().find((d) => d.name === DISTRICT_NAME);
    if (!district) throw new Error(`未找到区县/供电中心「${DISTRICT_NAME}」`);

    // 2) 供电所（按区县+名称匹配，复用旧 id）
    let station = storage.getStations().find(
      (s) => s.districtId === district.id && s.name === STATION.name,
    );
    const stationIsNew = !station;
    if (stationIsNew) {
      station = {
        id: storage.nextIdOf('station'),
        name: STATION.name,
        code: STATION.abbr,
        districtId: district.id,
        feeders: 0,
        transformers: 0,
        orderTimeLimit: 60,
        isActive: true,
        createdAt: now,
        updatedAt: now,
      };
    }

    // 3) 账号计划
    type Role = 'duty_officer' | 'supervisor' | 'district_admin' | 'admin';
    interface Acc { username: string; realName: string; role: Role }
    const accs: Acc[] = [
      { username: `${STATION.abbr}${pinyinOf(STATION.sup)}`, realName: STATION.sup, role: 'supervisor' },
      ...STATION.members.map((n) => ({
        username: `${STATION.abbr}${pinyinOf(n)}`, realName: n, role: 'duty_officer' as Role,
      })),
    ];
    const existingUsernames = new Set(storage.getUsers().map((u) => u.username));
    const toCreate = accs.filter((a) => !existingUsernames.has(a.username));

    // 4) 摘要
    console.log('============================================');
    console.log(`导入供电所   ${DISTRICT_NAME} / ${STATION.name} (abbr=${STATION.abbr})`);
    console.log(`模式        ${dryRun ? 'DRY-RUN（不写库）' : 'APPLY（写入 MySQL）'}`);
    console.log(`供电所       ${stationIsNew ? `新建 id=${station!.id}` : '已存在，复用'}`);
    console.log(`账号         计划 ${accs.length}（所长 ${accs.filter(a=>a.role==='supervisor').length} / 值班员 ${accs.filter(a=>a.role==='duty_officer').length}）`);
    console.log(`           新增 ${toCreate.length} / 已存在跳过 ${accs.length - toCreate.length}`);
    console.log(`默认密码    ${PASSWORD}（首次登录需修改）`);
    if (toCreate.length) {
      console.log('新增账号:');
      toCreate.forEach((a) => console.log(`  ${a.username}  ${a.realName}  (${a.role})`));
    }
    console.log('============================================');
    if (dryRun) return;

    // 5) 写库
    if (stationIsNew) storage.saveStation(station!);
    for (const a of toCreate) {
      storage.saveUser({
        id: storage.nextIdOf('user'),
        username: a.username,
        passwordHash: bcrypt.hashSync(PASSWORD, 10),
        realName: a.realName,
        role: a.role,
        stationId: station!.id,
        districtId: district.id,
        isActive: true,
        lastLoginAt: null,
        lastLoginIp: null,
        mustChangePassword: true,
        passwordPromptedAt: null,
        createdAt: now,
        updatedAt: now,
      });
    }
    console.log(`[APPLY] 内存更新完成，onModuleDestroy → flush() 落库...`);
  } catch (e: any) {
    console.error('[import-station] 执行失败:', e?.stack || e?.message || e);
    process.exitCode = 1;
  } finally {
    try {
      await storage.onModuleDestroy();
    } catch (e: any) {
      console.error('[import-station] 落库失败:', e?.stack || e?.message || e);
      process.exitCode = 1;
    }
  }
}

main();
