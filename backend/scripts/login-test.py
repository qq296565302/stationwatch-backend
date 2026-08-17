# -*- coding: utf-8 -*-
"""
组织账号登录测试脚本
====================
从 org-accounts.xlsx 中按角色分层随机抽取若干账号，调用后端登录接口，
逐一验证账号/密码/姓名/所属供电所与表格数据是否一致，并输出测试报告。

用法:
    python login-test.py                     # 默认抽 30 个账号
    python login-test.py --count 50          # 抽 50 个账号
    python login-test.py --count 20 --seed 20260817   # 自定义种子
    python login-test.py --count 0           # 测试全部 1484 个账号
    python login-test.py --xlsx 账号表.xlsx  # 指定 Excel 账号表路径

参数:
    --count  测试账号总数（0 表示全部），默认 30
    --seed   随机抽样种子，默认 20260816
    --base   登录接口地址，默认 http://localhost:3000/api/v1/auth/login
    --xlsx   Excel 账号表路径，默认 scripts-output/org-accounts.xlsx
    --sheet  xlsx 工作表名，默认 "组织账号"
    --out    报告输出路径，默认 scripts-output/login-test-report.txt

依赖:
    openpyxl（读取 Excel）。若未安装，运行: pip install openpyxl
"""

import argparse
import json
import random
import sys
import urllib.request
import urllib.error
from collections import defaultdict
from datetime import datetime
from pathlib import Path

SCRIPT_DIR = Path(__file__).resolve().parent
BASE_DIR = SCRIPT_DIR.parent
DEFAULT_XLSX = BASE_DIR / "scripts-output" / "org-accounts.xlsx"

# 各角色在源表中的已知数量（用于比例分配，防止抽取超过源表容量）
ROLE_POOLS = {
    "区县管理员": 11,
    "所长": 77,
    "值班员": 1396,
}


def _ensure_openpyxl():
    """确保 openpyxl 可用，否则给出清晰安装提示。"""
    try:
        import openpyxl  # noqa: F401
    except ImportError:
        sys.stderr.write(
            "\n[错误] 缺少 openpyxl 库，无法读取 Excel 账号表。\n"
            "请在当前 Python 环境安装：\n"
            "    pip install openpyxl\n"
            "然后重新运行本脚本。\n"
        )
        raise SystemExit(2)


def check_xlsx(xlsx_path):
    """前置校验：Excel 文件必须存在。缺失时给出清晰提示。"""
    p = Path(xlsx_path)
    if not p.exists():
        sys.stderr.write(
            f"\n[错误] 找不到账号表文件：{p}\n"
            "请确认该文件存在，或用 --xlsx 指定正确的 Excel 路径，例如：\n"
            f"    python login-test.py --xlsx {DEFAULT_XLSX}\n"
        )
        raise SystemExit(2)
    if not p.is_file():
        sys.stderr.write(f"\n[错误] 指定的路径不是文件：{p}\n")
        raise SystemExit(2)


def load_accounts(sheet_name, xlsx_path):
    """读取 xlsx，返回账号列表（dict），并过滤掉空行。"""
    import openpyxl
    wb = openpyxl.load_workbook(xlsx_path, read_only=True)

    if sheet_name not in wb.sheetnames:
        sys.stderr.write(
            f"\n[错误] 工作表 '{sheet_name}' 不存在。\n"
            f"当前文件包含的工作表：{wb.sheetnames}\n"
            f"可用 --sheet 指定正确的工作表名。\n"
        )
        wb.close()
        raise SystemExit(2)

    ws = wb[sheet_name]
    rows = list(ws.iter_rows(values_only=True))
    wb.close()

    if not rows:
        sys.stderr.write(f"\n[错误] 工作表 '{sheet_name}' 没有数据（表头或内容为空）。\n")
        raise SystemExit(2)

    header = rows[0]
    accounts = []
    for r in rows[1:]:
        if r is None or all(v is None or str(v).strip() == "" for v in r):
            continue
        record = dict(zip(header, r))
        # 兼容列名可能带空格的情况
        record = {str(k).strip(): v for k, v in record.items()}
        # 供电所为空（区县管理员）时补占位符
        station = record.get("供电所") or ""
        if not station:
            station = "(区县)"
        accounts.append({
            "区县": str(record.get("区县") or "").strip(),
            "供电所": str(station).strip(),
            "角色": str(record.get("角色") or "").strip(),
            "姓名": str(record.get("姓名") or "").strip(),
            "用户名": str(record.get("用户名") or "").strip(),
            "密码": str(record.get("默认密码") or "").strip(),
        })
    return accounts


def stratified_sample(accounts, count, seed):
    """按角色分层抽样。count=0 表示全部。

    分配策略：
    1. 保证每个角色至少抽 1 个（只要 count 允许且该角色有账号），
       避免小数量下人数较少的角色（如区县管理员）被完全忽略；
    2. 剩余名额按各角色在源表中的占比分配，再用最大可用量封顶。
    """
    by_role = defaultdict(list)
    for acc in accounts:
        by_role[acc["角色"]].append(acc)

    if count <= 0 or count >= len(accounts):
        return accounts

    available = {role: len(items) for role, items in by_role.items()}
    total = sum(available.values())

    rng = random.Random(seed)
    roles = list(by_role.keys())

    quotas = {}
    remaining = count
    # 第一轮：每个有账号的角色先分配 1 个
    for role in roles:
        if available[role] > 0 and remaining > 0:
            quotas[role] = 1
            remaining -= 1
        else:
            quotas[role] = 0
    # 第二轮：剩余名额按占比分配
    if remaining > 0:
        role_weights = {r: available[r] for r in roles}
        total_w = sum(role_weights.values())
        for i, role in enumerate(roles):
            if remaining <= 0:
                break
            if i == len(roles) - 1:
                q = remaining
            else:
                q = int(round(remaining * role_weights[role] / total_w))
            q = min(q, available[role] - quotas[role])
            q = max(0, q)
            quotas[role] += q
            remaining -= q
    # 兜底修正：任何配额不能超过可用量
    for role in roles:
        quotas[role] = max(0, min(quotas[role], available[role]))

    sample = []
    for role in roles:
        items = by_role[role][:]
        rng.shuffle(items)
        sample.extend(items[:quotas[role]])
    rng.shuffle(sample)
    return sample


def login(base_url, username, password, timeout=10):
    """调用登录接口，返回 (成功与否, 实际姓名, 实际供电所, 错误信息)。"""
    payload = json.dumps({"username": username, "password": password}).encode("utf-8")
    req = urllib.request.Request(
        base_url,
        data=payload,
        headers={"Content-Type": "application/json"},
        method="POST",
    )
    try:
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            body = json.loads(resp.read().decode("utf-8"))
    except urllib.error.HTTPError as e:
        return False, "", "", f"HTTP {e.code}: {e.read().decode('utf-8', 'ignore')}"
    except Exception as e:  # noqa: BLE001
        return False, "", "", f"请求异常: {e}"

    if body.get("code") != 0:
        msg = body.get("message") or body.get("msg") or "登录失败"
        return False, "", "", msg

    user = (body.get("data") or {}).get("user") or {}
    real_name = user.get("realName") or ""
    station_name = user.get("stationName") or ""
    # 区县管理员的 stationName 为 null/空，与源表中"供电所列为空"对应，统一归一化为 (区县)
    if not station_name:
        station_name = "(区县)"
    return True, real_name, station_name, "通过"


def run_test(count, seed, base_url, xlsx_path, sheet_name, out_path):
    _ensure_openpyxl()
    check_xlsx(xlsx_path)
    accounts = load_accounts(sheet_name, xlsx_path)
    print(f"账号表: {Path(xlsx_path)}")
    print(f"源表账号总数: {len(accounts)}")

    sample = stratified_sample(accounts, count, seed)
    print(f"本次抽样: {len(sample)} 个账号")

    results = []
    ok = 0
    fail = 0
    for i, acc in enumerate(sample, 1):
        success, actual_name, actual_station, note = login(base_url, acc["用户名"], acc["密码"])

        # 断言姓名一致性
        name_match = actual_name == acc["姓名"]
        station_match = actual_station == acc["供电所"]

        if success and name_match and station_match:
            result = "通过"
            ok += 1
            detail = "通过"
        else:
            result = "失败"
            fail += 1
            detail = f"name_match={name_match}({actual_name!r} vs {acc['姓名']!r}), " \
                     f"station_match={station_match}({actual_station!r} vs {acc['供电所']!r}), " \
                     f"note={note}"
            if not success:
                detail = f"登录失败: {note}"

        results.append((i, acc, actual_name, actual_station, result, detail))

    # 汇总计数（按角色）
    role_stats = defaultdict(lambda: {"总": 0, "通过": 0, "失败": 0})
    for _, acc, _, _, result, _ in results:
        rs = role_stats[acc["角色"]]
        rs["总"] += 1
        if result == "通过":
            rs["通过"] += 1
        else:
            rs["失败"] += 1

    # 生成报告
    lines = []
    lines.append("组织账号登录测试报告")
    lines.append(f"生成时间: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
    lines.append(f"登录接口: {base_url}")
    lines.append(f"抽样种子: {seed}")
    lines.append(f"源表账号总数: {len(accounts)}")
    lines.append(f"本次抽样数: {len(sample)}")
    lines.append("")
    lines.append("序号 | 角色 | 用户名 | 姓名(预期) | 供电所(预期) | 姓名(实际) | 供电所(实际) | 结果 | 说明")
    for i, acc, actual_name, actual_station, result, detail in results:
        lines.append(
            f"{i} | {acc['角色']} | {acc['用户名']} | {acc['姓名']} | {acc['供电所']} "
            f"| {actual_name} | {actual_station} | {result} | {detail}"
        )
    lines.append("")
    lines.append("===== 测试汇总 =====")
    lines.append(f"抽样总数: {len(sample)}")
    lines.append(f"通过: {ok}")
    lines.append(f"失败: {fail}")
    lines.append(f"通过率: {100.0 * ok / len(sample) if sample else 0:.1f}%")
    lines.append("")
    for role in sorted(role_stats.keys()):
        rs = role_stats[role]
        lines.append(f"  角色[{role}]: 总{rs['总']} / 通过{rs['通过']} / 失败{rs['失败']}")

    report_text = "\n".join(lines)
    with open(out_path, "w", encoding="utf-8") as f:
        f.write(report_text)

    print(report_text)
    print(f"\n报告已写入: {out_path}")
    return fail == 0


def main():
    parser = argparse.ArgumentParser(description="组织账号登录测试")
    parser.add_argument("--count", type=int, default=30, help="测试账号总数（0 表示全部），默认 30")
    parser.add_argument("--seed", type=int, default=20260816, help="随机抽样种子，默认 20260816")
    parser.add_argument("--base", default="http://localhost:3000/api/v1/auth/login", help="登录接口地址")
    parser.add_argument("--xlsx", default=str(DEFAULT_XLSX), help="Excel 账号表路径，默认 scripts-output/org-accounts.xlsx")
    parser.add_argument("--sheet", default="组织账号", help="xlsx 工作表名")
    parser.add_argument("--out", default=str(BASE_DIR / "scripts-output" / "login-test-report.txt"), help="报告输出路径")
    args = parser.parse_args()

    all_ok = run_test(args.count, args.seed, args.base, args.xlsx, args.sheet, args.out)
    if not all_ok:
        raise SystemExit(1)


if __name__ == "__main__":
    main()
