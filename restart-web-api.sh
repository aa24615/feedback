#!/usr/bin/env bash
# 重启 web + api（不含自带 mysql，适用于生产/演示接外部 MySQL 的场景）
# 用法：./restart-web-api.sh
set -euo pipefail

cd "$(dirname "$0")"

# 确保 1Panel 网络存在（缺失则创建空 bridge，无害）
docker network inspect 1panel-network >/dev/null 2>&1 || docker network create 1panel-network

# 重新拉起并确保 web + backend 处于最新状态：
#   - 若镜像已重建（build 后），会自动按新镜像 recreate；
#   - 若 .env 改了环境变量，会按新 env recreate；
#   - 若都无变化，则原地重启容器。
docker compose up -d backend web

# 真正「无变化也要硬重启」的话，可改用：
#   docker compose restart backend web
# 但 restart 不会应用新镜像 / 新 env，故默认用上面 up -d。

docker compose ps backend web
