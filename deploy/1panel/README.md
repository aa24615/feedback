# 1Panel 应用入驻包

本目录是一份**可直接提交的 1Panel 应用商店应用包**，用于把「反馈墙开源版」做成 1Panel 里的一键安装应用。
格式对齐官方仓库 <https://github.com/1Panel-dev/appstore>（`apps/<key>/data.yml` + `<version>/data.yml` + `docker-compose.yml` + `logo.png`）。

## 目录结构

```
deploy/1panel/
├── data.yaml                    # 自建本地应用商店的全局元数据（提交官方商店时不需要）
├── logo.png                     # 商店品牌图标（提交官方商店时不需要）
├── README.md                    # 本文档
└── apps/
    └── feedback/                # 应用 key：必须小写连字符，且与目录名一致
        ├── data.yml             # 应用级元数据（名称/描述/分类/链接/架构）
        ├── logo.png             # 应用图标 256x256
        ├── README.md            # 商店内展示的中文说明
        ├── README_en.md         # 英文说明
        └── 1.0.0/
            ├── data.yml         # 安装表单字段（formFields）
            └── docker-compose.yml
```

图标由仓库的 `deploy/tools/make-icons.js` 生成（`node deploy/tools/make-icons.js`），与站点 favicon 同一套图形，无第三方依赖。

## 前置条件：先发布 Docker 镜像

官方上架标准明确要求「提供官方 Docker 镜像」。本包使用：

- `ghcr.io/aa24615/feedback-web:1.0.0`
- `ghcr.io/aa24615/feedback-backend:1.0.0`

仓库根目录的 `.github/workflows/docker-publish.yml` 会在推送 `v1.0.0` 这类标签时自动构建两个镜像并推送到 GHCR。
**上架前请确认镜像可公开拉取**：

```bash
docker pull ghcr.io/aa24615/feedback-web:1.0.0
docker pull ghcr.io/aa24615/feedback-backend:1.0.0
```

如果你改用 Docker Hub / 自建仓库，只需改 `1.0.0/docker-compose.yml` 里两处 `image:`；
若改版本号，复制 `1.0.0/` 目录为新版本目录并同步改镜像 tag。

> web 镜像内的 nginx 反代固定指向 `http://backend:4000`，所以 compose 中后端服务名**必须是 `backend`**，勿改名。

## 两条使用路径

### A. 提交到 1Panel 官方应用商店

1. Fork `1Panel-dev/appstore`，切出新分支。
2. 把本目录的 `apps/feedback/` 整个复制到 fork 仓库的 `apps/` 下。
3. 按官方 [「如何提交自己想要的应用」wiki](https://github.com/1Panel-dev/appstore/wiki/%E5%A6%82%E4%BD%95%E6%8F%90%E4%BA%A4%E8%87%AA%E5%B7%B1%E6%83%B3%E8%A6%81%E7%9A%84%E5%BA%94%E7%94%A8) 校验（也可用官方 `1Panel-appstore-skills` 的校验脚本）。
4. 提交 PR，等待审核。官方上架标准：知名且活跃的开源项目、有一定安装量、提供官方 Docker 镜像。
5. 根 `data.yaml` / 根 `logo.png` / 本 README **不属于**单个应用包，不要一起提交。

### B. 自建本地应用商店 / 本地应用（推荐先自测）

1. 把整个 `deploy/1panel/` 目录放到服务器（或做成一个 git 仓库）。
2. 在 1Panel「应用商店 → 设置」中添加该目录作为应用商店源 / 本地应用源，或直接按官方 wiki 导入 `apps/feedback`。
3. 在应用列表里搜索 `FeedbackWall`，点安装并填写表单。
4. 安装完成后访问 `http://服务器IP:端口/#/login`。

> 若面板版本不支持自定义商店源，也可以直接把 `apps/feedback/1.0.0/docker-compose.yml` 复制到面板的
> 「容器 → 编排 / 创建 compose」，把 `${...}` 变量替换成实际值后手动启动。

## 安装表单字段

| envKey | 类型 | 默认 | 说明 |
| --- | --- | --- | --- |
| `PANEL_APP_PORT_HTTP` | number | 8081 | Web 访问端口 |
| `FEEDBACK_BASE_URL` | text | `http://127.0.0.1:8081` | 对外访问地址，绑域名后**务必改成实际域名** |
| `PANEL_ADMIN_EMAIL` | text | `admin@feedback.local` | 管理员登录邮箱 |
| `PANEL_ADMIN_PASSWORD` | password(随机) | — | 管理员登录密码，安装后请保存 |
| `PANEL_APP_JWT_SECRET` | password(随机) | — | JWT 签名密钥 |
| `PANEL_APP_EMBED_SECRET` | password(随机) | — | 嵌入组件签名密钥 |
| `PANEL_DB_ROOT_PASSWORD` | password(随机) | — | 内置 MySQL root 密码 |
| `PANEL_DB_NAME` / `PANEL_DB_USER` | text(随机) | feedback | 内置库名 / 账号 |
| `PANEL_DB_USER_PASSWORD` | password(随机) | — | 内置数据库密码 |

所有 `random: true` 的字段由 1Panel 自动生成随机值，避免弱密码。端口 / 地址 / 管理员账号密码带 `edit: true`，安装后可在应用详情里改。

## 设计说明与校验清单

- **自带数据库**：一个 compose 内含 `web` + `backend` + `mysql` 三个服务，用户无需先装 MySQL；`container_name` 分别为 `${CONTAINER_NAME}`、`${CONTAINER_NAME}-backend`、`${CONTAINER_NAME}-mysql`。
- **网络**：全部接入 `1panel-network`（`external: true`），便于面板反代与容器互联。
- **标签**：每个服务都有 `labels: createdBy: "Apps"`，面板才能识别并托管。
- **持久化**：只用相对 `./data/...` 绑定挂载，不用宿主机绝对路径；`./data/mysql` + `./data/uploads` 即全部数据。
- **不暴露数据库端口**：MySQL 仅在容器网络内可达，降低攻击面。
- **安全**：无硬编码密码，密钥与账号全部来自表单；CORS 任意来源（公开反馈页需支持嵌入第三方域名）。

本地自检命令（在仓库根目录执行）：

```bash
# 1) 校验 compose 模板能正确渲染（变量用示例值）
cd deploy/1panel/apps/feedback/1.0.0
CONTAINER_NAME=feedback \
PANEL_APP_PORT_HTTP=8081 FEEDBACK_BASE_URL=http://127.0.0.1:8081 \
PANEL_ADMIN_EMAIL=admin@example.com PANEL_ADMIN_PASSWORD=Passw0rd! \
PANEL_APP_JWT_SECRET=abcdefghijklmnop PANEL_APP_EMBED_SECRET=abcdefghijklmnop \
PANEL_DB_ROOT_PASSWORD=RootPass1 PANEL_DB_NAME=feedback \
PANEL_DB_USER=feedback PANEL_DB_USER_PASSWORD=DbPass1 \
docker compose -f docker-compose.yml config >/dev/null && echo "compose OK"

# 2) 校验 YAML 能被解析（需 js-yaml / yq / python-yaml 任一）
node -e "console.log(require('js-yaml').load(require('fs').readFileSync('data.yml','utf8')).additionalProperties.formFields.length + ' 个表单字段')"
```

## 已知限制

- **独立 API 域名**：`VITE_API_BASE_URL` 在 web 镜像构建时写入静态资源，运行时改环境变量无效。
  如需前后端分域名，请自行重建 web 镜像并注入该构建参数，同时为 API 域名单独配置反代。
  默认（留空）走同域 `/api`，由 web 的 nginx 反代到 `backend:4000`，最省心。
- **多服务应用**：1Panel 面板主要跟踪主容器 `${CONTAINER_NAME}`（web），backend / mysql 以同名前缀容器存在，
  日志与状态可在「容器」里查看。
- **架构**：`data.yml` 声明 amd64 / arm64；若基础镜像不支持某架构，请从 `architectures` 里移除。
