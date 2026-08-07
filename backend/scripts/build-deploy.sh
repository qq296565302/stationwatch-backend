#!/usr/bin/env bash
# ============================================================
# 后端生产部署包打包脚本（Windows Git Bash / Linux 均可执行）
# 产物：../duty-guard-backend.tar.gz
# 内容：dist（构建产物）+ 生产依赖 node_modules + 生产配置
# 服务器解压后直接运行：NODE_ENV=production node dist/main.js
# ============================================================
set -e
cd "$(dirname "$0")/.."   # 进入 backend 目录

echo "[1/3] 精简 node_modules（仅保留生产依赖）..."
npm prune --omit=dev

echo "[2/3] 打包部署包..."
tar czf ../duty-guard-backend.tar.gz \
  dist node_modules package.json package-lock.json .env.production

echo "[3/3] 恢复本地开发依赖..."
npm install

echo ""
echo "✅ 部署包已生成：../duty-guard-backend.tar.gz"
echo "   服务器解压后启动：NODE_ENV=production node dist/main.js"
