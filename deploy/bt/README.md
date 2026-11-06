# 宝塔面板应用入驻包

把「反馈墙开源版」做成宝塔面板里可一键安装的应用。提供两种方式：
**第三方应用插件**（可提交宝塔软件商店 / 可本地导入）与 **Docker 编排模板**（零插件依赖，直接粘贴使用）。

## 目录结构

```
deploy/bt/
├── README.md                       # 本文档
└── feedback/                       # 插件目录名必须与 info.json 的 name 一致
    ├── info.json                   # 插件元数据（标题/名称/版本/作者/主页）
    ├── install.sh                  # 安装 / 部署 / 运维 / 卸载脚本
    ├── icon.png                    # 插件图标 128x128
    ├── index.html                  # 插件设置面板（部署、重启、日志、凭据）
    ├── feedback_main.py            # 插件后端（按钮调用的方法）
    └── docker-compose.bt.yml       # 宝塔专用编排模板
```

打包产物：`packs/feedback-bt.zip`，zip 内保持一层 `feedback/` 目录（官方要求目录名 = 插件名）。
图标由仓库的 `deploy/tools/make-icons.js` 生成。

## 方式 A：导入第三方应用插件（推荐）

1. 宝塔面板 →「软件商店」→「第三方应用」→「导入插件」→ 上传 `packs/feedback-bt.zip`。
2. 导入时宝塔调用 `install.sh install`：只做环境检查、拉取源码到 `/www/wwwroot/feedback`、
   生成 `.env` 与随机凭据，**不启动容器**（避免面板请求超时）。
3. 在插件列表点「设置」打开管理面板 → 点**一键部署 / 更新**（后台执行 `install.sh deploy`，
   日志写入 `/www/server/panel/plugin/feedback/install.log`）。
4. 部署完成后点「刷新状态」，看到「运行中 ✓」后访问 `http://服务器IP:8081/#/login`，
   初始账号点「查看初始账号」获取。

### 提交宝塔官方软件商店

按宝塔《Linux 面板插件开发文档》提交本插件包即可（info.json + install.sh + icon.png + index.html +
`feedback_main.py` 是标准五件套）。提交时附上：应用介绍、GitHub 仓库地址、镜像/源码来源说明、
依赖（Docker + Docker Compose）、默认端口 8081、数据目录说明。
官方审核通过后会出现在「软件商店 → 第三方应用」中。

> 插件前端调用的面板接口为 `/plugin?action=a&s=<方法>&name=feedback`。不同宝塔版本路径可能略有差异，
> 若按钮无响应，改 `index.html` 顶部的 `FB_API` 常量即可；命令行方式（方式 C）不受影响。

## 方式 B：只用 Docker 编排模板

不想装插件时，直接用 `docker-compose.bt.yml`：

```bash
mkdir -p /www/wwwroot/feedback && cd /www/wwwroot/feedback
git clone -b open-source --depth 1 https://github.com/aa24615/feedback.git .
cp <本包>/feedback/docker-compose.bt.yml .
# 手动写 .env（参考方式 A 生成的字段，或复制开源仓库 .env.example）
docker compose -f docker-compose.bt.yml up -d --build
```

宝塔「Docker → 容器编排」里也可以直接粘贴该模板内容创建编排（需先把 `${...}` 变量换成实际值
或在编排目录放一份 `.env`）。

**注意：不要直接用仓库根目录的 `docker-compose.yml`** —— 那份依赖 `1panel-network` 外部网络，
宝塔环境没有该网络会直接启动失败。本包模板改用自建 `feedback-net` bridge 网络。

## 方式 C：纯命令行

```bash
PLUGIN=/www/server/panel/plugin/feedback
bash $PLUGIN/install.sh install       # 准备源码与 .env（幂等）
bash $PLUGIN/install.sh deploy        # 构建并启动
bash $PLUGIN/install.sh status        # 容器状态 + HTTP 探测
bash $PLUGIN/install.sh logs          # 容器日志
bash $PLUGIN/install.sh restart       # 重启
bash $PLUGIN/install.sh stop          # 停止（保留数据）
bash $PLUGIN/install.sh credentials   # 打印初始账号
bash $PLUGIN/install.sh uninstall     # 停容器，保留源码与数据
```

可用环境变量覆盖：`FEEDBACK_APP_DIR`（源码目录）、`FEEDBACK_PORT`（默认 8081）、
`FEEDBACK_ADMIN_EMAIL`、`FEEDBACK_BASE_URL`（对外访问地址）。

## 生成的环境变量（`/www/wwwroot/feedback/.env`）

| 变量 | 说明 |
| --- | --- |
| `WEB_PORT` | Web 访问端口，默认 8081 |
| `DB_NAME` / `DB_USER` / `DB_PASSWORD` | 内置 MySQL 库名、账号、密码（随机） |
| `MYSQL_ROOT_PASSWORD` | 内置 MySQL root 密码（随机，仅容器网络内使用） |
| `JWT_SECRET` / `EMBED_SECRET` | 签名密钥（随机） |
| `ADMIN_EMAIL` / `ADMIN_PASSWORD` | 唯一管理员账号（密码随机，存 `credentials.txt`） |
| `PUBLIC_BASE_URL` / `WEB_BASE_URL` | 对外访问地址，绑域名后**改成实际域名**再重启 |
| `VITE_API_BASE_URL` | 留空 = 同域 `/api`，由 web 的 nginx 反代到 backend |

`.env` 与 `credentials.txt` 权限均为 600，不会被写进任何仓库。

## 安全与数据

- 卸载只执行 `docker compose down`，**不删除** `/www/wwwroot/feedback`、`./data/mysql`、
  `./data/uploads`、`.env`；脚本内没有任何 `rm -rf`。
- MySQL 端口不暴露到宿主机，只在容器网络内可达。
- 所有密码/密钥首次安装时随机生成，无硬编码默认口令。
- 前端为 HashRouter，刷新任意页面不会 404；不要反向代理到真实子路径。

## 绑定域名

宝塔「网站」新建站点 →「反向代理」目标 `http://127.0.0.1:8081`（代理名称随意），
再把 `.env` 里 `PUBLIC_BASE_URL` / `WEB_BASE_URL` 改成 `https://你的域名`，点「重启」。
公开反馈页地址：`https://你的域名/#/p/{slug}`，可嵌入第三方站点（后端允许任意来源跨域）。

## 常见问题

| 现象 | 处理 |
| --- | --- |
| 部署卡在 npm ci | 服务器访问 npm registry 慢，配置镜像源后重新点「一键部署」 |
| 提示 `1panel-network` 不存在 | 说明用了仓库根的 compose，改用本包的 `docker-compose.bt.yml` |
| 图片地址是 `127.0.0.1` | 反代未透传 Host，或把 `PUBLIC_BASE_URL` 改成域名后重启 |
| 刷新页面 404 | 访问地址少了 `#`，应为 `/#/login`、`/#/p/demo` |
| 忘记管理员密码 | 用 bcrypt 生成新哈希写回 `users.password_hash`（见开源仓库 README） |
| 想换成预构建镜像 | 改完 `.env` 后执行 `docker compose -f docker-compose.bt.yml pull && docker compose -f docker-compose.bt.yml up -d`（不带 `--build`） |
