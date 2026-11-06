#!/bin/bash
# 反馈墙（开源版）· 宝塔面板第三方应用插件安装/运维脚本
# 由宝塔面板调用：install.sh install（导入插件时）/ install.sh uninstall（卸载插件时）
# 也可手动调用：install.sh deploy|status|logs|stop|restart|uninstall_app|credentials
#
# 设计原则：
#   - 导入插件时只做「环境检查 + 准备源码与配置」，不拉镜像（避免面板超时）；
#     真正部署由插件界面点「一键部署」触发（后台执行，日志写 install.log）。
#   - 卸载只停容器，绝不删除数据目录（./data/mysql、./data/uploads、.env 全部保留）。

set -u
PATH=/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin:$PATH

PLUGIN_DIR="/www/server/panel/plugin/feedback"
APP_DIR="${FEEDBACK_APP_DIR:-/www/wwwroot/feedback}"
REPO="https://github.com/aa24615/feedback.git"
BRANCH="open-source"
COMPOSE_NAME="docker-compose.bt.yml"
ENV_FILE="$APP_DIR/.env"
LOG_FILE="$PLUGIN_DIR/install.log"
CRED_FILE="$PLUGIN_DIR/credentials.txt"

log() { echo "[$(date '+%Y-%m-%d %H:%M:%S')] $*"; }

# ---------- 工具 ----------
rand() {
  if command -v openssl >/dev/null 2>&1; then
    openssl rand -hex 24
  else
    head -c 64 /dev/urandom | md5sum | cut -d' ' -f1
  fi
}

dc() {
  if docker compose version >/dev/null 2>&1; then
    echo "docker compose"
  elif command -v docker-compose >/dev/null 2>&1; then
    echo "docker-compose"
  else
    echo ""
  fi
}

check_docker() {
  if ! command -v docker >/dev/null 2>&1; then
    log "错误：未安装 Docker，请先在宝塔「软件商店」安装 Docker / Docker Compose。"
    return 1
  fi
  if [ -z "$(dc)" ]; then
    log "错误：未检测到 Docker Compose v2（docker compose）或 docker-compose 命令。"
    return 1
  fi
  if ! docker info >/dev/null 2>&1; then
    log "错误：Docker 守护进程未运行，请先启动 Docker 服务。"
    return 1
  fi
  return 0
}

# ---------- 准备：源码 + 配置 ----------
prepare() {
  mkdir -p "$APP_DIR"
  if [ ! -f "$APP_DIR/server/package.json" ]; then
    if [ -n "$(ls -A "$APP_DIR" 2>/dev/null)" ]; then
      log "错误：$APP_DIR 已存在但不是反馈墙源码目录，请先清空该目录或设置环境变量 FEEDBACK_APP_DIR 指定其它路径。"
      return 1
    fi
    if ! command -v git >/dev/null 2>&1; then
      log "错误：未安装 git，无法拉取源码。请先安装 git，或手动把仓库源码解压到 $APP_DIR。"
      return 1
    fi
    log "拉取源码（$BRANCH 分支）..."
    git clone -b "$BRANCH" --depth 1 "$REPO" "$APP_DIR" || { log "错误：源码拉取失败，请检查服务器能否访问 GitHub。"; return 1; }
  else
    log "源码已存在，跳过拉取：$APP_DIR"
  fi

  if [ ! -f "$PLUGIN_DIR/$COMPOSE_NAME" ]; then
    log "错误：插件目录缺少 $COMPOSE_NAME，请重新导入插件包。"
    return 1
  fi
  cp -f "$PLUGIN_DIR/$COMPOSE_NAME" "$APP_DIR/$COMPOSE_NAME"

  if [ ! -f "$ENV_FILE" ]; then
    local WEB_PORT="${FEEDBACK_PORT:-8081}"
    local ADMIN_EMAIL="${FEEDBACK_ADMIN_EMAIL:-admin@feedback.local}"
    local BASE_URL="${FEEDBACK_BASE_URL:-http://127.0.0.1:$WEB_PORT}"
    local ROOT_PASS ADMIN_PASS JWT EMBED DB_PASS
    ROOT_PASS="$(rand)"; ADMIN_PASS="$(rand)"; JWT="$(rand)"; EMBED="$(rand)"; DB_PASS="$(rand)"
    cat > "$ENV_FILE" <<EOF
# 由宝塔插件自动生成，请勿提交到公开仓库
WEB_PORT=$WEB_PORT
DB_NAME=feedback
DB_USER=feedback
DB_PASSWORD=$DB_PASS
MYSQL_ROOT_PASSWORD=$ROOT_PASS
JWT_SECRET=$JWT
EMBED_SECRET=$EMBED
ADMIN_EMAIL=$ADMIN_EMAIL
ADMIN_PASSWORD=$ADMIN_PASS
PUBLIC_BASE_URL=$BASE_URL
WEB_BASE_URL=$BASE_URL
VITE_API_BASE_URL=
STORAGE_DRIVER=local
EOF
    chmod 600 "$ENV_FILE"
    cat > "$CRED_FILE" <<EOF
反馈墙（开源版）初始凭据
访问地址 : http://127.0.0.1:$WEB_PORT/#/login
管理员邮箱: $ADMIN_EMAIL
管理员密码: $ADMIN_PASS
配置文件 : $ENV_FILE
生成时间 : $(date '+%Y-%m-%d %H:%M:%S')
EOF
    chmod 600 "$CRED_FILE"
    log "已生成 .env 与初始凭据（$CRED_FILE）"
  else
    log "已存在 .env，沿用原配置（不覆盖密码）"
  fi
  return 0
}

# ---------- 动作 ----------
do_install() {
  log "=== 插件初始化 ==="
  check_docker || return 1
  prepare || return 1
  log "准备完成。请在插件界面点击「一键部署」，或执行：bash $PLUGIN_DIR/install.sh deploy"
  return 0
}

do_deploy() {
  log "=== 开始部署 ==="
  check_docker || return 1
  prepare || return 1
  cd "$APP_DIR" || return 1
  log "构建并启动容器（首次构建约需数分钟，取决于 npm 下载速度）..."
  $(dc) -f "$COMPOSE_NAME" up -d --build || { log "错误：容器启动失败，请查看日志。"; return 1; }
  log "容器已启动，状态："
  $(dc) -f "$COMPOSE_NAME" ps
  local PORT
  PORT="$(grep -E '^WEB_PORT=' "$ENV_FILE" | cut -d= -f2)"
  PORT="${PORT:-8081}"
  log "部署完成。访问：http://服务器IP:$PORT/#/login"
  log "初始账号见：$CRED_FILE"
  return 0
}

do_status() {
  if [ ! -f "$ENV_FILE" ]; then echo "NOT_INSTALLED"; return 0; fi
  local PORT CODE
  PORT="$(grep -E '^WEB_PORT=' "$ENV_FILE" | cut -d= -f2)"; PORT="${PORT:-8081}"
  cd "$APP_DIR" || { echo "NO_SOURCE"; return 0; }
  echo "PORT=$PORT"
  $(dc) -f "$COMPOSE_NAME" ps 2>/dev/null
  CODE="$(curl -s -o /dev/null -w '%{http_code}' --max-time 5 "http://127.0.0.1:$PORT/" 2>/dev/null || echo 000)"
  echo "HTTP_CODE=$CODE"
}

do_logs() {
  cd "$APP_DIR" || return 1
  $(dc) -f "$COMPOSE_NAME" logs --tail=120 2>&1
}

do_stop() {
  cd "$APP_DIR" || return 1
  $(dc) -f "$COMPOSE_NAME" down 2>&1
  log "已停止容器，数据保留在 $APP_DIR/data"
}

do_restart() {
  cd "$APP_DIR" || return 1
  $(dc) -f "$COMPOSE_NAME" restart 2>&1
}

# 卸载插件：只停容器，保留源码与全部数据
do_uninstall() {
  log "=== 卸载插件 ==="
  if [ -f "$APP_DIR/$COMPOSE_NAME" ]; then
    cd "$APP_DIR" && $(dc) -f "$COMPOSE_NAME" down --remove-orphans 2>&1
  fi
  log "容器已停止。数据、源码与配置均保留在：$APP_DIR"
  log "如需彻底清除，请手动删除该目录（内含 ./data/mysql 与 ./data/uploads，删除前请备份）。"
  return 0
}

do_credentials() {
  if [ -f "$CRED_FILE" ]; then cat "$CRED_FILE"; else echo "尚未生成凭据，请先执行 deploy。"; fi
}

case "${1:-}" in
  install)        do_install ;;
  deploy)         do_deploy ;;
  status)         do_status ;;
  logs)           do_logs ;;
  stop)           do_stop ;;
  restart)        do_restart ;;
  uninstall)      do_uninstall ;;
  uninstall_app)  do_uninstall ;;
  credentials)    do_credentials ;;
  *)
    echo "用法: $0 {install|deploy|status|logs|stop|restart|uninstall|credentials}"
    exit 1
    ;;
esac
