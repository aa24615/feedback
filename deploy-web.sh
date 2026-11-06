#!/usr/bin/env bash
# 只重新构建并部署 web（前端）服务，不含 backend 与自带 mysql。
# 适用于：仅前端代码改动后，单独更新前端（重新打包前端静态资源）。
#   注意：若改动了 VITE_API_BASE_URL（前端 API 域名），本脚本会从 .env 读取并注入构建，
#         因此生产 .env 中需正确设置 VITE_API_BASE_URL（如 https://api.example.com）后再跑本脚本。
# 用法：./deploy-web.sh
set -euo pipefail

cd "$(dirname "$0")"

# 确保 1Panel 网络存在（缺失则创建空 bridge，无害）
docker network inspect 1panel-network >/dev/null 2>&1 || docker network create 1panel-network

# 重新构建 web 镜像（VITE_API_BASE_URL 等构建参数会从 .env 透传进 compose build.args）
docker compose build web

# 按新镜像 recreate 并拉起 web；其余服务（backend 等）不受影响、保持运行
docker compose up -d web

docker compose ps web
