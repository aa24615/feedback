#!/usr/bin/env bash
# 只重新构建并部署 backend（API）服务，不含自带 mysql 与 web。
# 适用于：仅后端代码改动后，单独更新 API（前端/静态资源不变）。
# 前置：生产/演示接外部 MySQL（已在 .env 配置 DB_*），或本地用 --profile local-db 起的库正在运行。
# 用法：./deploy-api.sh
set -euo pipefail

cd "$(dirname "$0")"

# 确保 1Panel 网络存在（缺失则创建空 bridge，无害）
docker network inspect 1panel-network >/dev/null 2>&1 || docker network create 1panel-network

# 重新构建 backend 镜像（利用 docker layer 缓存，无代码变化则基本秒过）
docker compose build backend

# 按新镜像 recreate 并拉起 backend；其余服务（web 等）不受影响、保持运行
docker compose up -d backend

docker compose ps backend
