#!/usr/bin/env bash
# 只启动 web + backend（API），不启动自带 mysql 容器。
# 适用于：生产/演示环境使用「外部 MySQL」（已在 .env 配置 DB_HOST / DB_PORT / DB_USER / DB_PASSWORD / DB_NAME）。
#
# 用法：
#   ./start-web-api.sh
#
# 前置：
#   1. .env 中 DB_* 指向你的外部 MySQL（参考 .env.example 的「生产（外部 MySQL）示例」）
#   2. 外部 MySQL 需已存在库（或由 INIT_DB_USER 账号建库）；如已预建库与账号，设 INIT_SKIP_USER=1
#
# 若需连自带 mysql 容器（本地演示），请改用： docker compose --profile local-db up -d

set -e

# 切换到脚本所在目录，保证无论从哪执行都能找到 docker-compose.yml
cd "$(dirname "$0")"

# 确保外部网络存在（1Panel 主机自带；本地演示若没有则创建，空 bridge 无害）
if ! docker network inspect 1panel-network >/dev/null 2>&1; then
  echo "[info] 未检测到 1panel-network，尝试创建（空 bridge）…"
  docker network create 1panel-network || echo "[warn] 创建失败，请确认 Docker 与网络权限"
fi

echo "[info] 启动 backend + web（不含 mysql）…"
docker compose up -d backend web

echo "[done] 已启动。状态："
docker compose ps backend web
