/**
 * MySQL 数据库全量备份脚本（单文件、自包含，纯 CommonJS，无需 ts-node）
 *
 * 功能：导出所有业务表的表结构 + 数据，生成标准 SQL 文件（可恢复）
 *
 * 用法（内网任意目录，只需本文件 + 该目录能找到 node_modules 的 mysql2）：
 *   node backup-mysql.js --host 10.141.202.89 --port 43306 --user station_watch --password xxxx --db duty_guard
 *
 * 也可省略连接参数，自动读取当前目录的 .env.production / .env / 环境变量：
 *   node backup-mysql.js
 *
 * 其它选项：
 *   --out <目录>      指定输出目录（默认 ./backup）
 *   --only-data       只导数据
 *   --only-struct     只导表结构
 *   --dry-run         只列出表清单，不生成文件
 *
 * 恢复：
 *   mysql -h<host> -P<port> -u<用户> -p<密码> < 备份文件.sql
 *   （备份文件内含 CREATE DATABASE / USE，-p 后可不指定库名）
 */
const fs = require('fs');
const path = require('path');
const mysql = require('mysql2/promise');

// ============ 解析命令行参数 ============
function getArg(name) {
  const i = process.argv.indexOf('--' + name);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : undefined;
}
function hasFlag(name) {
  return process.argv.includes('--' + name);
}

// ============ 读取 .env（若存在） ============
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
  // 优先级：命令行参数 > 环境变量 > .env.production > .env
  let env = {};
  for (const f of ['.env.production', '.env']) {
    const p = path.join(process.cwd(), f);
    if (fs.existsSync(p)) env = Object.assign(env, parseEnvFile(fs.readFileSync(p, 'utf8')));
  }
  return {
    host: getArg('host') || process.env.MYSQL_HOST || env.MYSQL_HOST,
    port: Number(getArg('port') || process.env.MYSQL_PORT || env.MYSQL_PORT || 3306),
    user: getArg('user') || process.env.MYSQL_USER || env.MYSQL_USER || 'root',
    password: getArg('password') || process.env.MYSQL_PASSWORD || env.MYSQL_PASSWORD || '',
    database: getArg('db') || process.env.MYSQL_DATABASE || env.MYSQL_DATABASE || 'duty_guard',
  };
}

// MySQL 字符串转义
function esc(v) {
  if (v === null || v === undefined) return 'NULL';
  if (typeof v === 'bigint') return v.toString();
  if (typeof v === 'number') return Number.isInteger(v) ? String(v) : String(v);
  if (v instanceof Date) return "'" + v.toISOString().slice(0, 19).replace('T', ' ') + "'";
  const s = String(v)
    .replace(/\\/g, '\\\\')
    .replace(/'/g, "\\'")
    .replace(/\n/g, '\\n')
    .replace(/\r/g, '\\r')
    .replace(/\0/g, '\\0')
    .replace(/\x1a/g, '\\Z');
  return "'" + s + "'";
}

(async () => {
  const onlyData = hasFlag('only-data');
  const onlyStruct = hasFlag('only-struct');
  const dryRun = hasFlag('dry-run');
  const outDir = getArg('out') || path.join(process.cwd(), 'backup');

  const cfg = loadDbConfig();
  if (!cfg.host) {
    console.error('未指定数据库连接。用法：node backup-mysql.js --host <主机> --port <端口> --user <用户> --password <密码> --db <库名>');
    process.exit(1);
  }

  console.log('==========================================');
  console.log('连接数据库:', `${cfg.user}@${cfg.host}:${cfg.port}/${cfg.database}`);
  console.log('模式:', onlyData ? '仅数据' : onlyStruct ? '仅结构' : '全量（结构+数据）');
  console.log('==========================================');

  const c = await mysql.createConnection(cfg);

  // 取库名（若未指定则用连接默认）
  const [dbRow] = await c.query('SELECT DATABASE() AS db');
  const dbName = dbRow[0].db;

  // 获取所有表
  const [tables] = await c.query(
    "SELECT TABLE_NAME AS t, TABLE_ROWS AS `rows` FROM information_schema.TABLES WHERE TABLE_SCHEMA = ? ORDER BY TABLE_NAME",
    [dbName]
  );

  // dry-run：只列出表清单，不生成文件
  if (dryRun) {
    console.log('数据库:', dbName, '| 共', tables.length, '张表：');
    tables.forEach(({ t, rows }) => console.log(`  - ${t}（约 ${rows} 行）`));
    await c.end();
    return;
  }

  const ts = new Date().toISOString().replace(/[:T]/g, '-').slice(0, 19);
  fs.mkdirSync(outDir, { recursive: true });
  const outFile = path.join(outDir, `${dbName}-backup-${ts}.sql`);
  const stream = fs.createWriteStream(outFile, { encoding: 'utf8' });

  stream.write(`-- ============================================================\n`);
  stream.write(`-- ${dbName} 数据库备份\n`);
  stream.write(`-- 生成时间: ${new Date().toISOString()}\n`);
  stream.write(`-- 服务器: ${cfg.host}:${cfg.port}\n`);
  stream.write(`-- 表数量: ${tables.length}\n`);
  stream.write(`-- ============================================================\n\n`);
  stream.write(`CREATE DATABASE IF NOT EXISTS \`${dbName}\` DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;\n`);
  stream.write(`USE \`${dbName}\`;\n\n`);
  stream.write(`SET NAMES utf8mb4;\nSET FOREIGN_KEY_CHECKS = 0;\n\n`);

  const writeLine = (s) => stream.write(s + '\n');

  for (const { t, rows } of tables) {
    try {
      // 1) 表结构
      if (!onlyData) {
        const [ddlRows] = await c.query('SHOW CREATE TABLE `' + t + '`');
        if (ddlRows.length) {
          writeLine('-- ------------------------------------------------------------');
          writeLine(`-- 表: \`${t}\`（当前约 ${rows} 行）`);
          writeLine('-- ------------------------------------------------------------');
          writeLine(`DROP TABLE IF EXISTS \`${t}\`;`);
          writeLine(ddlRows[0]['Create Table'] + ';');
          writeLine('');
        }
      }

      // 2) 数据
      if (!onlyStruct) {
        const [cols] = await c.query(
          "SELECT COLUMN_NAME FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ? ORDER BY ORDINAL_POSITION",
          [dbName, t]
        );
        const colNames = cols.map((x) => '`' + x.COLUMN_NAME + '`').join(', ');
        const countRow = await c.query('SELECT COUNT(*) AS n FROM `' + t + '`');
        const total = countRow[0][0].n;

        // 分批读取，避免一次加载过大（每次 1000 行）
        const BATCH = 1000;
        let offset = 0;
        let inserted = 0;
        while (offset < total) {
          const [rowsData] = await c.query('SELECT * FROM `' + t + '` LIMIT ' + BATCH + ' OFFSET ' + offset);
          if (!rowsData.length) break;
          // 每张表用一条多值 INSERT 更紧凑；超长则按行分多条
          const valueList = rowsData.map((row) => {
            const vals = colNames.split(', ').map((cn) => {
              const key = cn.replace(/`/g, '');
              return esc(row[key]);
            });
            return '(' + vals.join(', ') + ')';
          });
          stream.write(`INSERT INTO \`${t}\` (${colNames}) VALUES\n`);
          stream.write(valueList.join(',\n') + ';\n');
          inserted += rowsData.length;
          offset += rowsData.length;
        }
        if (total === 0) writeLine(`-- 表 \`${t}\` 无数据`);
        else writeLine(`-- 表 \`${t}\` 已导出 ${inserted} 行`);
        writeLine('');
      }
      console.log(`✓ 表 ${t}（${rows} 行）`);
    } catch (e) {
      console.error(`✗ 表 ${t} 导出失败: ${e.code || ''} ${e.message}`);
      stream.write(`-- 表 \`${t}\` 导出失败: ${e.message}\n\n`);
    }
  }

  stream.write('SET FOREIGN_KEY_CHECKS = 1;\n');
  stream.write('-- ============ 备份完成 ============\n');
  stream.end();

  stream.on('finish', () => {
    const size = (fs.statSync(outFile).size / 1024 / 1024).toFixed(2);
    console.log('==========================================');
    console.log('备份完成 →', outFile);
    console.log('文件大小:', size, 'MB');
    console.log('恢复命令: mysql -u' + cfg.user + ' -p < ' + outFile);
    console.log('==========================================');
  });
  stream.on('error', (e) => { console.error('写入失败:', e.message); process.exit(1); });

  await c.end();
})().catch((e) => {
  console.error('✗ 备份失败:', e.code || '', e.message);
  if (e.code === 'ER_ACCESS_DENIED_ERROR') console.error('  数据库账号或密码错误，请检查 .env.production 的 MYSQL_USER/MYSQL_PASSWORD');
  if (e.code === 'ECONNREFUSED') console.error('  连不上数据库，请检查 MYSQL_HOST/MYSQL_PORT');
  process.exit(1);
});
