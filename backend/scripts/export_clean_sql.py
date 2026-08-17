# -*- coding: utf-8 -*-
"""
从当前 duty_guard MySQL 库导出"干净数据库" SQL，供导入内网数据库使用。

策略（黑名单）：
  - 业务表（记录日常生成的业务数据）：仅保留建表结构，清空数据
  - 其余所有表（组织结构、账号、字典、系统配置等）：自动保留完整数据
  - 以后数据库若新增非业务表，本脚本会自动同步，无需维护保留清单

业务表（仅建表、清空数据）：
    records, items, operation_logs, export_history, refresh_tokens

用法:
    python export_clean_sql.py
"""
import sys
import datetime

import pymysql

sys.stdout.reconfigure(encoding="utf-8")

# ================= 可配置项 =================
HOST = "124.223.43.171"
PORT = 3306
USER = "root"
PASSWORD = "caO19961026."
DB = "duty_guard"
DST = r"d:/SGCC Root/供电所值守云平台后端/backend/scripts/duty_guard_clean.sql"

# 业务表黑名单：这些表只导出建表结构，清空数据。
# 除此之外的库中其他表，一律保留完整数据。
EMPTY_TABLES = ["records", "items", "operation_logs", "export_history", "refresh_tokens"]

# 需要排除的行（按字段值过滤）：剔除早期遗留的 zd_admin 测试账号，
# 使 users 恰好为 1484 个 org 账号 + admin 超级管理员 = 1485 个。
# 键为表名，值为 (字段名, 需排除的值集合)
EXCLUDE_ROWS = {
    "users": ("username", {"zd_admin"}),
}
# ============================================


def escape(value):
    """转义 SQL 字符串字面量中的特殊字符。"""
    if value is None:
        return "NULL"
    if isinstance(value, bool):
        return "1" if value else "0"
    if isinstance(value, (int, float)):
        return str(value)
    s = str(value)
    s = s.replace("\\", "\\\\")
    s = s.replace("'", "\\'")
    s = s.replace("\n", "\\n")
    s = s.replace("\r", "\\r")
    s = s.replace("\0", "\\0")
    s = s.replace("\x1a", "\\Z")
    return "'" + s + "'"


def get_create_table(cur, table):
    cur.execute(f"SHOW CREATE TABLE `{table}`")
    row = cur.fetchone()
    return list(row.values())[1]


def get_columns(cur, table):
    cur.execute(f"SHOW COLUMNS FROM `{table}`")
    return [r["Field"] for r in cur.fetchall()]


def count_rows(cur, table):
    """统计实际导出行数（考虑 EXCLUDE_ROWS 排除）。"""
    exclude_field, exclude_vals = EXCLUDE_ROWS.get(table, (None, None))
    if exclude_field is None:
        cur.execute(f"SELECT COUNT(*) AS c FROM `{table}`")
        return cur.fetchone()["c"]
    placeholders = ",".join(["%s"] * len(exclude_vals))
    cur.execute(
        f"SELECT COUNT(*) AS c FROM `{table}` WHERE `{exclude_field}` NOT IN ({placeholders})",
        list(exclude_vals),
    )
    return cur.fetchone()["c"]


def dump_inserts(cur, table, cols, chunk=500):
    """返回多条 INSERT 语句文本列表（按 EXCLUDE_ROWS 排除指定行）。"""
    col_sql = ",".join(f"`{c}`" for c in cols)
    stmts = []
    cur.execute(f"SELECT * FROM `{table}`")
    rows = cur.fetchall()

    # 按 EXCLUDE_ROWS 过滤
    exclude_field, exclude_vals = EXCLUDE_ROWS.get(table, (None, None))
    if exclude_field is not None:
        rows = [r for r in rows if r.get(exclude_field) not in exclude_vals]
        print(f"  表 {table}: 排除 {exclude_field} 属于 {exclude_vals} 的行，剩余 {len(rows)} 行")

    if not rows:
        return stmts
    for i in range(0, len(rows), chunk):
        part = rows[i:i + chunk]
        values_sql = ",\n".join(
            "(" + ",".join(escape(r[c]) for c in cols) + ")" for r in part
        )
        stmts.append(
            f"INSERT INTO `{table}` ({col_sql}) VALUES\n{values_sql};"
        )
    return stmts


def main():
    conn = pymysql.connect(
        host=HOST, port=PORT, user=USER, password=PASSWORD, database=DB,
        charset="utf8mb4", cursorclass=pymysql.cursors.DictCursor,
    )
    cur = conn.cursor()

    # 自动发现所有表
    cur.execute("SHOW TABLES")
    all_tables = [list(r.values())[0] for r in cur.fetchall()]

    # 拆分：业务表（清空数据）与普通表（保留数据）。
    # 普通表 = 除业务表外的所有表（自动同步新增的非业务表）
    empty_list = [t for t in EMPTY_TABLES if t in all_tables]
    keep_list = [t for t in all_tables if t not in EMPTY_TABLES]

    # 输出顺序：保留数据表在前（依赖先建），业务表在后
    ordered = keep_list + empty_list

    now = datetime.datetime.now().strftime("%Y-%m-%dT%H:%M:%S")
    out = []
    out.append("-- ============================================")
    out.append("-- duty_guard 干净数据库（除业务表外，其余数据完整保留）")
    out.append("-- 导出时间: " + now)
    out.append("-- 来源库: 开发环境 MySQL")
    out.append("-- 保留数据表: " + " / ".join(keep_list))
    out.append("-- 仅结构(数据已清空): " + " / ".join(empty_list) if empty_list else "-- 仅结构: (无)")
    out.append("-- ============================================")
    out.append("")
    out.append("CREATE DATABASE IF NOT EXISTS `duty_guard` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;")
    out.append("USE `duty_guard`;")
    out.append("")
    out.append("SET NAMES utf8mb4;")
    out.append("SET FOREIGN_KEY_CHECKS = 0;")
    out.append("")

    stats = {}
    for table in ordered:
        ddl = get_create_table(cur, table)
        out.append(f"DROP TABLE IF EXISTS `{table}`;")
        out.append(ddl + ";")
        out.append("")
        if table in keep_list:
            cols = get_columns(cur, table)
            stmts = dump_inserts(cur, table, cols)
            for s in stmts:
                out.append(s)
                out.append("")
            stats[table] = count_rows(cur, table)
        else:
            stats[table] = 0

    out.append("SET FOREIGN_KEY_CHECKS = 1;")
    out.append("")

    content = "\n".join(out)
    with open(DST, "w", encoding="utf-8", newline="") as f:
        f.write(content)

    print("已生成:", DST)
    print("数据统计:", stats)
    cur.close()
    conn.close()


if __name__ == "__main__":
    main()
