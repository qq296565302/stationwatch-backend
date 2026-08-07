// ============================================================
// 数据导出脚本：把源库（当前开发库）全量导出为一个 SQL 文件
// 生成的 SQL 可在内网/正式库执行（建库建表 + 全量数据）
//
// 用法：
//   node scripts/export-sql.mjs                # 生成 scripts/duty_guard_backup.sql
//   node scripts/export-sql.mjs 输出路径.sql    # 指定输出路径
//
// 内网导入（在正式库所在机器执行）：
//   mysql -h10.141.202.89 -P43306 -ustation_watch -p'Zbdl--123456' < duty_guard_backup.sql
// ============================================================
import mysql from 'mysql2/promise'
import * as fs from 'fs/promises'
import * as path from 'path'

// ---- 源库（当前开发环境）----
const SRC = {
  host: '124.223.43.171',
  port: 3306,
  user: 'root',
  password: 'caO19961026.',
  database: 'duty_guard',
}

const BATCH = 200 // 每个 INSERT 语句的行数

/** 手动转义：SQL 标准 '' 转义单引号、\\ 转义反斜杠 */
function esc(v) {
  if (v === null || v === undefined) return 'NULL'
  if (typeof v === 'number') return Number.isFinite(v) ? String(v) : 'NULL'
  if (typeof v === 'boolean') return v ? '1' : '0'
  return "'" + String(v)
    .replace(/\\/g, '\\\\')
    .replace(/'/g, "''")
    .replace(/\n/g, '\\n')
    .replace(/\r/g, '\\r')
    .replace(/\0/g, '\\0') + "'"
}

async function main() {
  const outPath = path.resolve(process.argv[2] || 'scripts/duty_guard_backup.sql')

  const c = await mysql.createConnection({ ...SRC, connectTimeout: 10000 })
  console.log(`✓ 已连接源库 ${SRC.host}:${SRC.port}/${SRC.database}`)

  const [tables] = await c.query('SHOW TABLES')
  const names = tables.map((r) => Object.values(r)[0])
  console.log(`待导出 ${names.length} 张表：${names.join(', ')}`)

  const now = new Date().toISOString()
  let sql = ''
  sql += '-- ============================================\n'
  sql += '-- duty_guard 数据备份导出\n'
  sql += `-- 导出时间: ${now}\n`
  sql += '-- 执行环境: 正式数据库（建库建表 + 全量数据）\n'
  sql += '-- ============================================\n\n'
  sql += `CREATE DATABASE IF NOT EXISTS \`${SRC.database}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;\n`
  sql += `USE \`${SRC.database}\`;\n\n`
  sql += 'SET NAMES utf8mb4;\n'
  sql += 'SET FOREIGN_KEY_CHECKS = 0;\n\n'

  let totalRows = 0
  for (const t of names) {
    // 1. 建表（沿用源表结构，先 DROP 保证全量覆盖）
    const [ddlRows] = await c.query(`SHOW CREATE TABLE \`${t}\``)
    sql += `DROP TABLE IF EXISTS \`${t}\`;\n`
    sql += ddlRows[0]['Create Table'] + ';\n\n'

    // 2. 数据
    const [rows] = await c.query(`SELECT * FROM \`${t}\``)
    if (rows.length === 0) {
      console.log(`  ${t}: 0 行`)
      continue
    }
    const cols = Object.keys(rows[0])
    const colStr = cols.map((x) => `\`${x}\``).join(',')
    for (let i = 0; i < rows.length; i += BATCH) {
      const batch = rows.slice(i, i + BATCH)
      const valueStrs = batch.map((r) => `(${cols.map((col) => esc(r[col])).join(',')})`)
      sql += `INSERT INTO \`${t}\` (${colStr}) VALUES\n${valueStrs.join(',\n')};\n`
    }
    sql += '\n'
    totalRows += rows.length
    console.log(`  ${t}: ${rows.length} 行 ✓`)
  }

  sql += 'SET FOREIGN_KEY_CHECKS = 1;\n'
  await c.end()

  await fs.mkdir(path.dirname(outPath), { recursive: true })
  await fs.writeFile(outPath, sql, 'utf-8')
  console.log(`\n===== 导出完成：${totalRows} 行 → ${outPath} =====`)
}

main().catch((e) => {
  console.error('\n导出失败:', e.message)
  process.exit(1)
})
