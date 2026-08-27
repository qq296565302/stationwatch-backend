/**
 * 一次性工具：解析《补充值班记录网页版信息统计.xlsx》→ 生成账号 + 幂等导入 SQL + Excel 分表
 *
 * 背景：本机连不上内网生产库（10.141.203.47），故产物为 SQL 文件，在 Navicat 执行即完成导入。
 * 账号规则沿用 scripts-gen-org.js：
 *   用户名 = 站缩写(小写) + 姓名全拼；密码 = @站缩写_95598；班长=supervisor(所长权限)，成员=duty_officer
 * 站点 code 已对照 2026-08-23 全量备份校验唯一（现有 78 站 + 用户新前缀零冲突）：
 *   张店6个服务点 + 淄川城区供电服务站(cq3，cq/cq2 已被桓台/高青城区占用) + 高新保税服务班(zbbswlyq2)
 * ID 分配（基于备份 max：站点 80、用户 1611）：站点 81-88，用户 1612 起
 *
 * 用法：node scripts/import-supplement.js
 * 产物：
 *   scripts-output/补充账号导入.sql          ← Navicat 执行（幂等 INSERT IGNORE）
 *   scripts-output/补充账号汇总.xlsx          ← 全部 56 个账号
 *   scripts-output/split/<区县>/<站名>账号.xlsx ← 8 个分站文件
 */
const fs = require('fs');
const path = require('path');
const ExcelJS = require('exceljs');
const bcrypt = require('bcryptjs');
const { pinyin } = require('pinyin-pro');

const SRC = path.resolve(__dirname, '../scripts-output/补充值班记录网页版信息统计.xlsx');
const OUT_DIR = path.resolve(__dirname, '../scripts-output');
const SPLIT_DIR = path.join(OUT_DIR, 'split');

// 站缩写手工确定（与既有命名规则一致，已校验全局唯一）
// key=服务点名称
const STATION_ABBR = {
  '东城化纤服务点': 'dchx',
  '东城体坛服务点': 'dctt',
  '东城河滨服务点': 'dchb',
  '西城世纪花园服务点': 'xsjhy',
  '西城马尚服务点': 'xcms',
  '西城齐润服务点': 'xcqr',
  '城区供电服务站': 'cq3',        // 淄川（cq/cq2 已被桓台/高青城区供电中心占用）
  '淄博保税物流园区供电所供电服务班': 'zbbswlyq2', // 高新（zbbswlyq 已被保税物流园区供电所占用）
};

const fullPinyin = (name) => pinyin(name, { toneType: 'none', type: 'array' }).join('');
const splitNames = (s) => (s || '').replace(/[，,、;；。.：:]/g, ' ').split(/\s+/).map(x => x.trim()).filter(Boolean);

(async () => {
  // ===== 1. 解析 xlsx =====
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(SRC);
  const ws = wb.worksheets[0];
  const rows = [];
  for (let rn = 3; rn <= ws.actualRowCount; rn++) {
    const row = ws.getRow(rn);
    const g = (c) => (row.getCell(c).text || '').trim();
    const district = g(2), station = g(3), sup = g(4).replace(/\s+/g, ''), membersRaw = g(5);
    if (!station) continue;
    rows.push({ district, station, sup, members: splitNames(membersRaw) });
  }
  console.log(`解析到 ${rows.length} 个服务点`);

  // ===== 2. 生成账号 =====
  const now = new Date().toISOString();
  let stationId = 81;   // 备份 max=80
  let userId = 1612;    // 备份 max=1611
  const stations = [], accounts = [];
  for (const r of rows) {
    const abbr = STATION_ABBR[r.station];
    if (!abbr) { console.error(`✗ 未定义站缩写: ${r.station}`); process.exit(1); }
    const sid = stationId++;
    const hash = bcrypt.hashSync(`@${abbr}_95598`, 10);
    stations.push({ id: sid, name: r.station, code: abbr, district: r.district, hash });
    const push = (name, role) => {
      const username = abbr + fullPinyin(name);
      if (accounts.some(a => a.username === username)) { console.error(`✗ 用户名重复: ${username}`); process.exit(1); }
      accounts.push({ username, realName: name, role, district: r.district, station: r.station, stationId: sid, abbr, hash });
    };
    if (r.sup) push(r.sup, 'supervisor');
    const seen = new Set([r.sup]);
    r.members.filter(m => !seen.has(m) && (seen.add(m), true)).forEach(m => push(m, 'duty_officer'));
  }
  const sup = accounts.filter(a => a.role === 'supervisor').length;
  console.log(`站点 ${stations.length} 个 | 账号 ${accounts.length} 个（所长 ${sup} / 值班员 ${accounts.length - sup}）`);

  // ===== 3. 生成幂等 SQL =====
  const q = (v) => v === null ? 'NULL' : (typeof v === 'number' ? v : `'${String(v).replace(/\\/g, '\\\\').replace(/'/g, "\\'")}'`);
  const esc = q; // 别名，与字段语义一致
  let sql = `-- ============================================================\n`;
  sql += `-- 补充服务点账号导入（源：补充值班记录网页版信息统计.xlsx）\n`;
  sql += `-- 生成时间: ${now} | 站点 ${stations.length} 个 | 账号 ${accounts.length} 个\n`;
  sql += `-- 幂等：INSERT IGNORE，重复执行安全；已存在的用户名/主键自动跳过\n`;
  sql += `-- 默认密码：@站缩写_95598，首次登录强制修改（mustChangePassword=1）\n`;
  sql += `-- 导入后需重启后端服务（内存缓存重新加载站点/用户）\n`;
  sql += `-- ============================================================\n\n`;
  sql += `USE \`duty_guard\`;\n\n`;
  // 区县 id 映射（districts 表既有数据）
  const DISTRICT_ID = { '张店供电中心': 1, '临淄供电中心': 2, '淄川供电中心': 3, '博山供电中心': 4, '周村供电中心': 5, '桓台县供电公司': 6, '高青县供电公司': 7, '沂源县供电公司': 8, '高新供电中心': 9 };
  sql += `-- 新增供电所（id 81 起）\n`;
  sql += `INSERT IGNORE INTO \`stations\` (\`id\`,\`name\`,\`code\`,\`districtId\`,\`region\`,\`voltage\`,\`feeders\`,\`transformers\`,\`maxDutyItemsPerRecord\`,\`orderTimeLimit\`,\`isActive\`,\`createdAt\`,\`updatedAt\`) VALUES\n`;
  sql += stations.map(s =>
    `(${s.id}, ${esc(s.name)}, ${esc(s.code)}, ${DISTRICT_ID[s.district]}, NULL, NULL, 0, 0, 11, 60, 1, ${q(now)}, ${q(now)})`
  ).join(',\n') + ';\n\n';
  sql += `-- 新增账号（id 1612 起，班长=supervisor 所长权限，成员=duty_officer）\n`;
  sql += `INSERT IGNORE INTO \`users\` (\`id\`,\`username\`,\`passwordHash\`,\`realName\`,\`role\`,\`stationId\`,\`districtId\`,\`isActive\`,\`lastLoginAt\`,\`lastLoginIp\`,\`mustChangePassword\`,\`passwordPromptedAt\`,\`createdAt\`,\`updatedAt\`) VALUES\n`;
  sql += accounts.map(a =>
    `(${userId++}, ${esc(a.username)}, ${esc(a.hash)}, ${esc(a.realName)}, ${esc(a.role)}, ${a.stationId}, ${DISTRICT_ID[a.district]}, 1, NULL, NULL, 1, NULL, ${q(now)}, ${q(now)})`
  ).join(',\n') + ';\n\n';
  sql += `-- 导入校验（应分别返回 ${stations.length} / ${accounts.length}）\n`;
  sql += `SELECT COUNT(*) AS new_stations FROM stations WHERE id BETWEEN 81 AND ${stationId - 1};\n`;
  sql += `SELECT COUNT(*) AS new_users FROM users WHERE username IN (${accounts.map(a => q(a.username)).join(',')});\n`;
  fs.writeFileSync(path.join(OUT_DIR, '补充账号导入.sql'), sql, 'utf8');
  console.log('✓ SQL → scripts-output/补充账号导入.sql');

  // ===== 4. 生成 Excel（汇总 + 分站） =====
  const ROLE_CN = { supervisor: '所长', duty_officer: '值班员', district_admin: '区县管理员' };
  const HEADERS = ['序号', '区县', '供电所', '角色', '姓名', '用户名', '默认密码'];
  const buildSheet = (sheet, name, list) => {
    sheet.columns = HEADERS.map(h => ({ header: h, width: h === '供电所' ? 34 : h === '用户名' || h === '默认密码' ? 22 : 10 }));
    list.forEach((a, i) => sheet.addRow([i + 1, a.district, a.station, ROLE_CN[a.role], a.realName, a.username, `@${a.abbr}_95598`]));
    sheet.getRow(1).font = { bold: true };
  };

  const wbOut = new ExcelJS.Workbook();
  buildSheet(wbOut.addWorksheet('组织账号'), '组织账号', accounts);
  await wbOut.xlsx.writeFile(path.join(OUT_DIR, '补充账号汇总.xlsx'));
  console.log('✓ 汇总表 → scripts-output/补充账号汇总.xlsx');

  for (const s of stations) {
    const list = accounts.filter(a => a.stationId === s.id);
    const wbs = new ExcelJS.Workbook();
    buildSheet(wbs.addWorksheet(s.name), s.name, list);
    const dir = path.join(SPLIT_DIR, s.district);
    fs.mkdirSync(dir, { recursive: true });
    await wbs.xlsx.writeFile(path.join(dir, `${s.name}账号.xlsx`));
    console.log(`✓ 分表 → split/${s.district}/${s.name}账号.xlsx（${list.length} 人）`);
  }

  // ===== 5. 打印全部账号供人工核对拼音 =====
  accounts.forEach(a => console.log(`  ${a.station} | ${ROLE_CN[a.role]} | ${a.realName} | ${a.username} | @${a.abbr}_95598`));
})().catch(e => { console.error('✗', e.message); process.exit(1); });
