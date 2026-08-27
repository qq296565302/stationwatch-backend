/**
 * 清除指定区县之外的值班记录（records + 关联的 items 工单明细）
 *
 * 默认保留「周村供电中心」，删除其他所有区县的值班记录。
 * 支持 --keep 指定要保留的区县名（默认"周村供电中心"）。
 *
 * 用法（内网任意目录，单文件自包含）：
 *   node clean-records.js --host 10.141.202.89 --port 43306 --user station_watch --password xxxx --db duty_guard --dry-run
 *   node clean-records.js --host 10.141.202.89 --port 43306 --user station_watch --password xxxx --db duty_guard
 *
 * 选项：
 *   --keep <区县名>   保留的区县（默认 周村供电中心）
 *   --dry-run          只预览将删除的数量，不真正删除
 *
 * ⚠️ 危险操作！默认必须确认后才能删除，先跑 --dry-run 看预览。
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

(async () => {
  const dryRun = hasFlag('dry-run');
  const keep = getArg('keep') || '周村供电中心';
  const cfg = loadDbConfig();
  if (!cfg.host) {
    console.error('未指定数据库连接。用法：node clean-records.js --host <主机> --port <端口> --user <用户> --password <密码> --db <库名>');
    process.exit(1);
  }

  console.log('==========================================');
  console.log('连接数据库:', `${cfg.user}@${cfg.host}:${cfg.port}/${cfg.database}`);
  console.log('保留区县:', keep);
  console.log('模式:', dryRun ? 'DRY-RUN（仅预览，不删除）' : 'DELETE（执行删除）');
  console.log('==========================================');

  const c = await mysql.createConnection(cfg);

  // 调大本次会话的 InnoDB 锁等待时间（默认 60 秒，可用 --lock-timeout 覆盖），避免 DELETE 时 Lock wait timeout
  const lockTimeout = Number(getArg('lock-timeout') || 60);
  try {
    await c.query(`SET SESSION innodb_lock_wait_timeout = ${lockTimeout}`);
  } catch (e) {
    console.log('! 设置 innodb_lock_wait_timeout 失败（可能无权限），继续使用默认值');
  }

  // 1) 找到保留区县
  const [keepD] = await c.query('SELECT id, name FROM districts WHERE name = ?', [keep]);
  if (!keepD.length) {
    const [all] = await c.query('SELECT id, name FROM districts ORDER BY id');
    console.error(`✗ 未找到区县「${keep}」。当前库区县列表：`);
    all.forEach((d) => console.error(`   ${d.id}  ${d.name}`));
    process.exit(1);
  }
  const keepDistrictId = keepD[0].id;
  console.log(`✓ 保留区县「${keep}」 id=${keepDistrictId}`);

  // 2) 找到该区县下的所有供电所（这些站的值班记录要保留）
  const [keepStations] = await c.query('SELECT id, name FROM stations WHERE districtId = ?', [keepDistrictId]);
  if (!keepStations.length) {
    console.error(`✗ 区县「${keep}」下没有任何供电所，无法确定保留范围。请检查数据。`);
    process.exit(1);
  }
  const keepStationIds = keepStations.map((s) => s.id);
  console.log(`✓ 保留供电所 ${keepStations.length} 个：${keepStations.map((s) => s.name).join('、')}`);
  const placeholders = keepStationIds.map(() => '?').join(',');

  // 3) 统计要删除的记录（其他区县的 records，即 stationId 不在保留站里）
  const [recStat] = await c.query(
    `SELECT COUNT(*) AS n FROM records WHERE stationId NOT IN (${placeholders})`,
    keepStationIds
  );
  const recCount = Number(recStat[0].n);

  // 4) 统计要删除的工单（这些记录的 items）
  const [itemStat] = await c.query(
    `SELECT COUNT(*) AS n FROM items WHERE recordId IN (SELECT id FROM records WHERE stationId NOT IN (${placeholders}))`,
    keepStationIds
  );
  const itemCount = Number(itemStat[0].n);

  // 5) 统计要删除的操作日志：归属到具体供电所（stationId 非 NULL）且不在保留站
  //    保留 stationId 为 NULL 的全局/管理员日志
  let logCount = 0;
  let logColExists = true;
  try {
    const [logStat] = await c.query(
      `SELECT COUNT(*) AS n FROM operation_logs WHERE stationId IS NOT NULL AND stationId NOT IN (${placeholders})`,
      keepStationIds
    );
    logCount = Number(logStat[0].n);
  } catch (e) {
    if (e.code === 'ER_BAD_FIELD_ERROR') {
      logColExists = false;
      console.log('! operation_logs 表无 stationId 字段，跳过操作日志删除');
    } else {
      throw e;
    }
  }

  console.log('------------------------------------------');
  console.log(`将删除值班记录 ${recCount} 条（records）`);
  console.log(`将删除工单明细 ${itemCount} 条（items）`);
  if (logColExists) console.log(`将删除操作日志 ${logCount} 条（归属其他供电所的 operation_logs）`);
  console.log('------------------------------------------');

  if (dryRun) {
    console.log('DRY-RUN：未执行任何删除。确认无误后去掉 --dry-run 再执行。');
    await c.end();
    return;
  }

  // 5) 危险操作确认（跳过 --force 时需要交互确认）
  if (!hasFlag('force')) {
    console.error('⚠️  这是不可逆的删除操作。');
    console.error('    若确认执行，请加上 --force 参数： node clean-records.js ... --force');
    console.error('    （或用 --dry-run 先预览）');
    await c.end();
    process.exit(1);
  }

  // 6) 执行删除：放在一个事务里，先删 items（子表），再删 records（主表），最后删日志；失败则全部回滚
  console.log('执行删除中...');
  await c.query('START TRANSACTION');
  try {
    const [itemRes] = await c.query(
      `DELETE FROM items WHERE recordId IN (SELECT id FROM records WHERE stationId NOT IN (${placeholders}))`,
      keepStationIds
    );
    const [recRes] = await c.query(
      `DELETE FROM records WHERE stationId NOT IN (${placeholders})`,
      keepStationIds
    );
    let logRes = null;
    if (logColExists) {
      logRes = await c.query(
        `DELETE FROM operation_logs WHERE stationId IS NOT NULL AND stationId NOT IN (${placeholders})`,
        keepStationIds
      );
    }
    await c.query('COMMIT');
    console.log(`✓ 已删除工单明细 ${itemRes.affectedRows} 条`);
    console.log(`✓ 已删除值班记录 ${recRes.affectedRows} 条`);
    if (logRes) console.log(`✓ 已删除操作日志 ${logRes[0].affectedRows} 条`);
    console.log('删除完成。');
  } catch (e) {
    try { await c.query('ROLLBACK'); } catch (_) {}
    console.error('✗ 删除失败，已回滚（未做任何删除）。');
    throw e;
  }
  await c.end();
})().catch((e) => {
  console.error('✗ 执行失败:', e.code || '', e.message);
  if (e.code === 'ER_ACCESS_DENIED_ERROR') console.error('  数据库账号或密码错误');
  if (e.code === 'ECONNREFUSED') console.error('  连不上数据库');
  process.exit(1);
});
