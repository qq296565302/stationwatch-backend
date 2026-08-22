/**
 * 增量导入供电所：城区供电服务站（隶属临淄供电中心）—— 纯 JS 版，无需 ts-node
 *
 * 运行环境：内网后端服务器（有 node_modules：mysql2、bcryptjs 均为生产依赖）
 * 数据库配置：自动读取同目录 .env.production（或 .env），也可用环境变量覆盖
 * 用法：
 *   node scripts/import-station.js            # 正式导入
 *   node scripts/import-station.js --dry-run  # 只看计划，不写库
 *
 * 特点：每一步都打印详细日志，出错会打印明确原因（权限/表/数据），摆脱客户端黑盒。
 */
const fs = require('fs');
const path = require('path');
const mysql = require('mysql2/promise');
const bcrypt = require('bcryptjs');

// ============ 数据定义 ============
const DISTRICT_NAME = '临淄供电中心';
const STATION_NAME = '城区供电服务站';
const STATION_ABBR = 'csz';
const PASSWORD = '@csz_95598';
const PEOPLE = [
  { name: '刘同银', pinyin: 'liutongyin', role: 'supervisor' },
  { name: '王明超', pinyin: 'wangmingchao', role: 'duty_officer' },
  { name: '冯占凯', pinyin: 'fengzhankai', role: 'duty_officer' },
  { name: '孙士刚', pinyin: 'sunshigang', role: 'duty_officer' },
  { name: '郎需栋', pinyin: 'langxudong', role: 'duty_officer' },
  { name: '赵云祥', pinyin: 'zhaoyunxiang', role: 'duty_officer' },
  { name: '张珂钦', pinyin: 'zhangkeqin', role: 'duty_officer' },
  { name: '李嘉欣', pinyin: 'lijiaxin', role: 'duty_officer' },
  { name: '陈宜谦', pinyin: 'chenyiqian', role: 'duty_officer' },
  { name: '王鹏', pinyin: 'wangpeng', role: 'duty_officer' },
  { name: '孙振中', pinyin: 'sunzhenzhong', role: 'duty_officer' },
  { name: '杨健', pinyin: 'yangjian', role: 'duty_officer' },
  { name: '路海南', pinyin: 'luhainan', role: 'duty_officer' },
  { name: '李文燕', pinyin: 'liwenyan', role: 'duty_officer' },
  { name: '王汉祥', pinyin: 'wanghanxiang', role: 'duty_officer' },
  { name: '王建力', pinyin: 'wangjianli', role: 'duty_officer' },
  { name: '王效峰', pinyin: 'wangxiaofeng', role: 'duty_officer' },
  { name: '周晓涵', pinyin: 'zhouxiaohan', role: 'duty_officer' },
  { name: '王浩港', pinyin: 'wanghaogang', role: 'duty_officer' },
  { name: '吕绪成', pinyin: 'lvxucheng', role: 'duty_officer' },
  { name: '韩迎祥', pinyin: 'hanyingxiang', role: 'duty_officer' },
  { name: '袁文杰', pinyin: 'yuanwenjie', role: 'duty_officer' },
  { name: '王景磊', pinyin: 'wangjinglei', role: 'duty_officer' },
];

// ============ 读取数据库配置 ============
// 手动解析 .env / .env.production（避免依赖 dotenv 包，生产 node_modules 只需 mysql2 + bcryptjs）
function parseEnvFile(text) {
  const env = {};
  for (const line of text.split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/);
    if (m && !line.trim().startsWith('#')) {
      let v = m[2].trim();
      if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
      env[m[1]] = v;
    }
  }
  return env;
}
function loadDbConfig() {
  let env = {};
  for (const f of ['.env.production', '.env']) {
    const p = path.join(process.cwd(), f);
    if (fs.existsSync(p)) env = Object.assign(env, parseEnvFile(fs.readFileSync(p, 'utf8')));
  }
  const cfg = {
    host: process.env.MYSQL_HOST || env.MYSQL_HOST,
    port: Number(process.env.MYSQL_PORT || env.MYSQL_PORT || 3306),
    user: process.env.MYSQL_USER || env.MYSQL_USER || 'root',
    password: process.env.MYSQL_PASSWORD || env.MYSQL_PASSWORD || '',
    database: process.env.MYSQL_DATABASE || env.MYSQL_DATABASE || 'duty_guard',
  };
  if (!cfg.host) {
    console.error('未找到 MYSQL_HOST 配置：请把本脚本放在 backend 目录下运行（会自动读 .env / .env.production），或设置环境变量 MYSQL_HOST 等。');
    process.exit(1);
  }
  return cfg;
}

(async () => {
  const dryRun = process.argv.includes('--dry-run');
  const cfg = loadDbConfig();
  console.log('==========================================');
  console.log('连接数据库:', `${cfg.user}@${cfg.host}:${cfg.port}/${cfg.database}`);
  console.log('模式:', dryRun ? 'DRY-RUN（不写库）' : 'APPLY（写入）');
  console.log('==========================================');

  const c = await mysql.createConnection(cfg);

  // 1) 定位区县
  const [districts] = await c.query('SELECT id, name FROM districts WHERE name = ?', [DISTRICT_NAME]);
  if (!districts.length) {
    const [all] = await c.query('SELECT id, name FROM districts ORDER BY id');
    console.error(`✗ 未找到区县「${DISTRICT_NAME}」。当前库的区县列表：`);
    all.forEach(d => console.error(`   ${d.id}  ${d.name}`));
    process.exit(1);
  }
  const districtId = districts[0].id;
  console.log(`✓ 区县「${DISTRICT_NAME}」 id=${districtId}`);

  // 2) 供电所：不存在则新建
  const [stations] = await c.query('SELECT id, name, districtId FROM stations WHERE name = ?', [STATION_NAME]);
  let stationId;
  if (stations.length) {
    stationId = stations[0].id;
    console.log(`✓ 供电所「${STATION_NAME}」已存在 id=${stationId}（districtId=${stations[0].districtId}），复用`);
    if (Number(stations[0].districtId) !== Number(districtId)) {
      console.log(`  ! 归属区县不符（当前 ${stations[0].districtId}，应为 ${districtId}），自动修正归属`);
      if (!dryRun) await c.query('UPDATE stations SET districtId = ? WHERE id = ?', [districtId, stationId]);
    }
  } else {
    const [max] = await c.query('SELECT IFNULL(MAX(id),0) AS m FROM stations');
    stationId = max[0].m + 1;
    console.log(`+ 新建供电所「${STATION_NAME}」 id=${stationId}（districtId=${districtId}）`);
    if (!dryRun) {
      await c.query(
        'INSERT INTO stations (id,name,code,districtId,region,voltage,feeders,transformers,orderTimeLimit,isActive,createdAt,updatedAt) VALUES (?,?,?,?,NULL,NULL,0,0,60,1,?,?)',
        [stationId, STATION_NAME, STATION_ABBR, districtId, new Date().toISOString(), new Date().toISOString()]
      );
      console.log('  ✓ 供电所已写入');
    }
  }

  // 3) 账号：逐个检查并创建（幂等）
  const hash = bcrypt.hashSync(PASSWORD, 10);
  const [maxUser] = await c.query('SELECT IFNULL(MAX(id),0) AS m FROM users');
  let nextId = maxUser[0].m + 1;
  let created = 0, skipped = 0, failed = 0;
  for (const p of PEOPLE) {
    const username = STATION_ABBR + p.pinyin;
    const [exist] = await c.query('SELECT id, realName FROM users WHERE username = ?', [username]);
    if (exist.length) {
      skipped++;
      console.log(`= 跳过 ${username}（${p.name}，已存在 id=${exist[0].id}）`);
      continue;
    }
    if (dryRun) { created++; console.log(`+ 计划创建 ${username}（${p.name}，${p.role}）`); continue; }
    try {
      await c.query(
        'INSERT INTO users (id,username,passwordHash,realName,role,stationId,districtId,isActive,lastLoginAt,lastLoginIp,mustChangePassword,passwordPromptedAt,createdAt,updatedAt) VALUES (?,?,?,?,?,?,?,1,NULL,NULL,1,NULL,?,?)',
        [nextId++, username, hash, p.name, p.role, stationId, districtId, new Date().toISOString(), new Date().toISOString()]
      );
      created++;
      console.log(`+ 创建 ${username}（${p.name}，${p.role}）`);
    } catch (e) {
      failed++;
      console.error(`✗ 创建失败 ${username}（${p.name}）：${e.code} ${e.message}`);
    }
  }

  // 4) 汇总 + 校验
  const [chk] = await c.query('SELECT COUNT(*) AS n FROM users WHERE stationId = ?', [stationId]);
  console.log('==========================================');
  console.log(`结果：新建账号 ${created} 个，跳过（已存在）${skipped} 个，失败 ${failed} 个`);
  console.log(`当前「${STATION_NAME}」名下账号总数：${chk[0].n}（应为 ${PEOPLE.length}）`);
  console.log(`默认密码：${PASSWORD}（首次登录需修改）`);
  if (failed > 0) {
    console.error('\n有失败项！常见原因：');
    console.error('  - INSERT command denied：数据库账号没有写权限（station_watch 用户需 INSERT/UPDATE 权限）');
    console.error('  - 字段不存在：库表结构与预期不符，请把上方具体报错发回');
    process.exitCode = 1;
  } else {
    console.log('\n全部完成。记得重启后端服务（node dist/main.js）让内存重新加载新供电所。');
  }
  await c.end();
})().catch(e => {
  console.error('✗ 执行失败：', e.code || '', e.message);
  if (e.code === 'ER_ACCESS_DENIED_ERROR') console.error('  数据库账号或密码错误，请检查 .env.production 的 MYSQL_USER/MYSQL_PASSWORD');
  if (e.code === 'ECONNREFUSED') console.error('  连不上数据库，请检查 MYSQL_HOST/MYSQL_PORT');
  process.exit(1);
});
