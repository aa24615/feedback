# 反馈墙（开源版）

> 仓库：<https://github.com/aa24615/feedback> · 分支：`open-source`
> 一键部署：`git clone -b open-source https://github.com/aa24615/feedback.git`

一个**开箱即用**的用户反馈系统，Docker 一条命令即可启动，对标腾讯「兔小巢」。

登录管理员账号后即可创建多个产品 / 项目，每个产品拥有独立的公开反馈社区，支持收集
**建议 / 问题 / 吐槽 / 提问**，并提供投票、评论、官方回复、状态流转、数据看板、
通知推送（邮件 / Webhook / 钉钉·企微·飞书群机器人）、开放 API 与嵌入组件。

> **开箱即用**：内置管理员账号（首次启动自动创建，邮箱/密码由环境变量配置），部署完直接登录，全部功能默认解锁。
> 反馈收集、投票评论、状态流转、数据看板、通知推送、开放 API 与嵌入组件一应俱全，数据全在自己的服务器上。

## 技术栈

- **后端**：Node.js + Express + MySQL（mysql2），JWT 鉴权，Multer 上传
- **前端**：React 18 + React Router + Vite，Zustand 状态管理
- **数据库**：MySQL 8（本机安装或 Docker 均可）
- **部署**：Docker Compose（MySQL + 后端 + 前端），生产可单进程托管前后端

## 目录结构

```
.
├── docker-compose.yml      # 一键部署：MySQL 8 + 后端 + 前端（Nginx）
├── .env.example            # 部署配置模板（密钥/端口/存储驱动/管理员账号）
├── server/                 # 后端（Express + MySQL）
│   ├── Dockerfile          # node:20-alpine，启动时自动迁移+种子
│   ├── sql/schema.sql      # 建表脚本
│   ├── scripts/
│   │   ├── init-db.js      # 一键初始化（建库/建账号/导表/幂等迁移）
│   │   └── seed.js         # 初始数据（唯一管理员 + 示例产品，首次启动自动写入）
│   └── src/
│       ├── config/         # env / db 连接池
│       ├── middleware/     # 鉴权、产品作用域、限流、错误处理
│       ├── routes/         # auth/products/posts/public/embed...
│       ├── services/       # 文件存储抽象（local / cos / oss 驱动）+ 系统配置
│       └── index.js        # 入口
├── deploy/                 # 应用商店入驻包
│   ├── 1panel/             # 1Panel 应用商店应用包（官方格式，可 PR 上架 / 自建商店）
│   ├── bt/                 # 宝塔面板第三方应用插件 + Docker 编排模板
│   └── tools/make-icons.js # 生成入驻包图标（纯 Node，无图像依赖）
├── packs/                  # 打包好的入驻包 zip（可直接上传面板 / 提交审核）
├── .github/workflows/
│   └── docker-publish.yml  # 构建 web/backend 镜像并推送 GHCR（入驻包依赖的官方镜像）
└── web/                    # 前端（React + Vite）
    ├── Dockerfile          # 多阶段构建：vite build → nginx:alpine
    ├── nginx.conf          # SPA 回退 + /api、/uploads 反向代理
    └── src/
        ├── pages/          # 控制台 + C 端反馈页 + 嵌入页
        └── components/     # UI 组件、图表、卡片
```

## 快速开始

### 方式 A：Docker 一键部署（推荐）

```bash
git clone -b open-source https://github.com/aa24615/feedback.git
cd feedback
cp .env.example .env      # 首次：复制配置模板
# 编辑 .env：JWT_SECRET / EMBED_SECRET 改为随机长串；ADMIN_EMAIL / ADMIN_PASSWORD 设为你的管理员账号
docker compose --profile local-db up -d --build
```

访问 http://localhost:8081 ，用 `.env` 里的管理员账号登录即可（`--profile local-db` 会同时启动内置 MySQL；若使用外部 MySQL 可去掉该参数并配置 `DB_HOST`）。

| 服务 | 容器 | 端口（默认） | 说明 |
| --- | --- | --- | --- |
| MySQL 8.0 | feedback-mysql | 3307 | `./data/mysql` 绑定挂载持久化（仅 `local-db` profile 启动） |
| 后端 API | feedback-backend | 4000 | 启动时自动建库/幂等迁移/种子（空库才写初始数据） |
| 前端 | feedback-web | 8081 | Nginx 托管构建产物，`/api` 与 `/uploads` 反向代理到后端 |

### 方式 B：本机开发

```bash
# 1. 初始化数据库（连接 server/.env 里的 MySQL）
cd server && npm install && npm run db:init

# 2. 启动后端
npm run dev              # http://localhost:4000

# 3. 启动前端
cd ../web && npm install && npm run dev   # http://localhost:5173
```

### 管理员账号

- 首次启动（数据库为空）时自动创建唯一管理员：`ADMIN_EMAIL` / `ADMIN_PASSWORD`（见 `.env.example`，默认 `admin@feedback.local / admin123456`）
- 管理员账号由环境变量配置，首次启动自动创建；请登录后在「账户」页修改密码
- 同时自动创建一个示例产品（slug 为 `demo`）与若干示例反馈，可在后台删除

## 面板一键安装（1Panel / 宝塔）

仓库自带两套应用商店入驻包，源码在 `deploy/`，可直接上传的压缩包在 `packs/`：

| 平台 | 包源码 | 打包产物 | 形式 |
| --- | --- | --- | --- |
| 1Panel | `deploy/1panel/apps/feedback/` | `packs/feedback-1panel.zip` | 官方 appstore 格式（`data.yml` + `docker-compose.yml` + `logo.png`），可 PR 到官方商店，也可作为自建本地商店 |
| 宝塔 | `deploy/bt/feedback/` | `packs/feedback-bt.zip` | 第三方应用插件（`info.json` + `install.sh` + `index.html` + `feedback_main.py`），另附独立 Docker 编排模板 |

- **1Panel**：应用商店 → 添加本地商店源（指向 `deploy/1panel/`）→ 搜索 `FeedbackWall` → 填表安装；
  三容器一体（自带 MySQL），安装后访问 `http://IP:端口/#/login`。详见 [`deploy/1panel/README.md`](deploy/1panel/README.md)。
- **宝塔**：软件商店 → 第三方应用 → 导入插件 → 上传 zip → 在插件「设置」里点「一键部署」；
  源码落到 `/www/wwwroot/feedback`，数据在该目录 `./data` 下。详见 [`deploy/bt/README.md`](deploy/bt/README.md)。
  不装插件也可直接用 `deploy/bt/feedback/docker-compose.bt.yml` 在「Docker → 容器编排」里创建。

> 两套包都**不使用仓库根的 `docker-compose.yml`**：根目录那份依赖 `1panel-network` 外部网络，
> 通用环境没有该网络会启动失败；入驻包各自使用独立网络或公开镜像。

入驻包依赖公开镜像 `ghcr.io/aa24615/feedback-web` 与 `ghcr.io/aa24615/feedback-backend`，
由 `.github/workflows/docker-publish.yml` 构建推送：推 `v1.0.0` 标签，或在 Actions 里手动运行并填 `version=1.0.0` 即可。
上架前请先确认镜像可公开拉取。

## 核心功能

| 模块 | 说明 |
| --- | --- |
| 多产品 | 一个账号创建多个产品，每个产品独立反馈社区与公开页 |
| 反馈收集 | 分类（建议/问题/吐槽/提问）、状态流转（待处理→规划→处理中→已解决→关闭/拒绝）|
| 图片 / 视频附件 | 每帖最多 9 个（图片 ≤5MB，视频 ≤50MB），详情页灯箱放大、视频内嵌播放、列表缩略图 |
| 投票排序 | 游客 / 邮箱身份均可投票，热门自动上浮 |
| 互动 | 官方回复高亮置顶、二级评论、评论点赞 |
| 数据看板 | 状态/类型/分类分布、30 天趋势、Top 投票排行 |
| 运营工具 | 常见问题、更新日志 / 路线图、反馈一键导出 CSV（无数量限制） |
| 集成 | 通知模板（邮件 / Webhook / 钉钉·企微·飞书群机器人）、开放 API Key、链接跳转 / iframe 嵌入 |
| 配置 | 匿名提交、必填邮箱、提交审核、私密产品、主题色、欢迎语、隐藏署名（全部可用） |
| 产品 Logo | 上传 / 更换 / 移除（PNG/JPG/GIF/WebP ≤ 2MB） |
| 文件存储 | 本地磁盘 / 腾讯云 COS / 阿里云 OSS 三种驱动（`STORAGE_DRIVER`） |

## 通知模板（邮件 / Webhook / 群机器人）

通知采用**模板制**：模板为用户级（本版本即唯一管理员），多个产品可引用同一模板；在产品「通知设置」页引入模板即完成配置。

- **通道**：邮件（主题/正文，走自己的 SMTP）、Webhook（自定义 JSON 报文）、钉钉 / 企业微信 / 飞书群机器人（支持加签）
- **变量**：`{{product.name}}` / `{{post.title}}` / `{{post.status}}` / `{{post.link}}` / `{{comment.content}}` / `{{event}}` / `{{time}}` 等（页面底部有完整清单）
- **投递记录**：每次发送（含测试）记录通道、目标、结果与错误，产品页可查
- 接口：`/api/me/notify-templates`、`/api/me/smtp-configs`、`/api/products/:id/notifications`（含 `/test` 测试端点）

## 引用方式：链接跳转 / iframe 嵌入

反馈页只有两种引用方式，数据完全同步；地址都须带 `#/`（前端使用 hash 路由）。

**链接跳转** —— 把公开地址放进官网导航、公众号菜单、邮件或社群，点击直接打开完整反馈社区：

```
http://localhost:8081/#/p/{slug}
```

**iframe 嵌入** —— 把嵌入地址写进 iframe 标签，用户不离开当前页面即可反馈：

```html
<iframe src="http://localhost:8081/#/embed/{slug}"
        style="width:100%;height:600px;border:0" title="反馈"></iframe>
```

## 开放 API 速览

```
POST /api/auth/login                管理员登录
GET  /api/products                  我的产品列表
POST /api/products                  创建产品（可自定义 slug，数量不限）
GET  /api/p/{slug}                  公开产品信息 + 分类 + 统计
POST /api/p/{slug}/session          建立反馈者身份（游客/邮箱/自定义）
POST /api/p/{slug}/upload           上传反馈附件（multipart，图片/视频）
GET  /api/p/{slug}/posts            公开反馈列表（可按类型/分类/状态/关键词筛选）
POST /api/p/{slug}/posts            提交反馈
POST /api/p/{slug}/posts/:id/vote   投票（切换）
POST /api/p/{slug}/posts/:id/comments 评论
POST /api/products/:id/posts/:id/reply 官方回复
GET  /api/products/:id/posts/export 导出 CSV（支持筛选条件）
GET  /api/products/:id/stats        数据看板
GET  /api/products/:id/tokens       生成 API 密钥
POST /api/products/:id/logo         上传产品 Logo
GET  /api/me/notifications          我的站内通知
```

## 文件存储配置

产品 Logo、反馈附件统一经 `server/src/services/` 存储层读写，通过 `.env` 的 `STORAGE_DRIVER` 切换驱动：

| 驱动 | 说明 | 依赖安装 |
| --- | --- | --- |
| `local`（默认） | 写入 `server/uploads/`，经 `/uploads` 静态路由访问 | 无 |
| `cos` | 腾讯云 COS | `npm install cos-nodejs-sdk` |
| `oss` | 阿里云 OSS | `npm install ali-oss` |

关键配置（完整示例见 `.env.example` / `server/.env.example`）：

```bash
STORAGE_DRIVER=cos                    # local / cos / oss
COS_BUCKET=your-bucket-1250000000     # 存储桶名
COS_REGION=ap-guangzhou               # 地域
COS_PREFIX=feedback/                  # 对象 key 前缀
```

说明：
- 切换驱动后新上传的文件走新存储，已有文件仍按原 URL 访问，建议迁移完成后再切换
- 云存储桶需开启**公共读**（或 CDN 回源鉴权放行 GET），否则公开页图片/视频无法直接加载

## 安全提示

- `.env` 中的 `JWT_SECRET`、`EMBED_SECRET` 默认仅供本地开发，生产务必替换为随机长串：
  `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`
- 部署后请立即登录修改默认管理员密码
- 通知邮件使用你自己的 SMTP 配置（「通知模板 → SMTP 配置」页填写，可多个）
- 附件/图片 URL 会以「请求进来的对外域名」自动拼接绝对地址（反代部署无需额外配置）；`PUBLIC_BASE_URL` 仅作兜底，建议填真实对外地址
