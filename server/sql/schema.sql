-- =============================================================
--  反馈墙 —— 用户反馈系统 · MySQL 8 Schema
--  设计要点：
--   · users         = 平台账号（产品方 / 开发者 / 团队成员）
--   · products      = 产品 / 项目（一个产品 = 一个反馈社区）
--   · product_members = 账号与产品的多对多 + 角色
--   · end_users     = C 端反馈者，按 product_id 隔离，支持游客/邮箱/第三方身份
--   · posts/comments/votes = 反馈主体
-- =============================================================

SET NAMES utf8mb4;
SET FOREIGN_KEY_CHECKS = 0;

-- ---------------- 平台账号 ----------------
CREATE TABLE IF NOT EXISTS users (
  id              BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  email           VARCHAR(160)  NOT NULL,
  password_hash   VARCHAR(255)  NOT NULL,
  nickname        VARCHAR(60)   NOT NULL,
  avatar_url      VARCHAR(500)  DEFAULT NULL,
  role            ENUM('admin','user') NOT NULL DEFAULT 'user',
  plan            ENUM('free','pro') NOT NULL DEFAULT 'free' COMMENT '保留列以兼容旧库（开源版不使用）',
  plan_started_at DATETIME      DEFAULT NULL COMMENT '计划生效时间',
  plan_expires_at DATETIME      DEFAULT NULL COMMENT '计划到期时间',
  status          ENUM('active','disabled') NOT NULL DEFAULT 'active',
  company         VARCHAR(120)  DEFAULT NULL,
  email_verified  TINYINT(1)    NOT NULL DEFAULT 0,
  email_verify_code VARCHAR(10) DEFAULT NULL COMMENT '邮箱验证码（6位，10分钟内有效）',
  email_verify_expires_at DATETIME DEFAULT NULL COMMENT '邮箱验证码过期时间',
  last_login_at   DATETIME      DEFAULT NULL,
  created_at      DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at      DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uk_users_email (email),
  KEY idx_users_status (status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='平台账号（产品方）';

-- ---------------- 产品 / 项目 ----------------
CREATE TABLE IF NOT EXISTS products (
  id               BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  owner_id         BIGINT UNSIGNED NOT NULL,
  name             VARCHAR(120) NOT NULL,
  slug             VARCHAR(80)  NOT NULL COMMENT '公开页地址 /p/{slug}',
  short_desc       VARCHAR(255) DEFAULT NULL,
  description      TEXT,
  logo_url         VARCHAR(500) DEFAULT NULL,
  website          VARCHAR(300) DEFAULT NULL,
  industry         VARCHAR(60)  DEFAULT NULL,
  theme_color      VARCHAR(20)  NOT NULL DEFAULT '#4F46E5',
  welcome_message  VARCHAR(500) DEFAULT NULL,

  -- 访问与提交策略
  visibility       ENUM('public','private') NOT NULL DEFAULT 'public' COMMENT 'private=需登录且是成员才可见',
  allow_anonymous  TINYINT(1) NOT NULL DEFAULT 1 COMMENT '是否允许游客提交反馈',
  require_email    TINYINT(1) NOT NULL DEFAULT 0 COMMENT '提交反馈是否必填邮箱',
  need_review      TINYINT(1) NOT NULL DEFAULT 0 COMMENT '新反馈是否需审核后才公开',
  allow_vote       TINYINT(1) NOT NULL DEFAULT 1,
  allow_comment    TINYINT(1) NOT NULL DEFAULT 1,
  hide_branding    TINYINT(1) NOT NULL DEFAULT 0 COMMENT '隐藏「由反馈墙提供」署名',

  -- 用户信息收集表单（JSON 数组：[{key,label,type,required}]）
  contact_fields   JSON DEFAULT NULL,

  status           ENUM('active','archived') NOT NULL DEFAULT 'active',
  post_counter     INT UNSIGNED NOT NULL DEFAULT 0 COMMENT '帖子编号自增器',
  post_count       INT UNSIGNED NOT NULL DEFAULT 0,
  member_count     INT UNSIGNED NOT NULL DEFAULT 1,
  created_at       DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at       DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uk_products_slug (slug),
  KEY idx_products_owner (owner_id),
  KEY idx_products_status (status),
  CONSTRAINT fk_products_owner FOREIGN KEY (owner_id) REFERENCES users (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='产品/项目';

-- ---------------- 产品成员 ----------------
CREATE TABLE IF NOT EXISTS product_members (
  id          BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  product_id  BIGINT UNSIGNED NOT NULL,
  user_id     BIGINT UNSIGNED NOT NULL,
  role        ENUM('owner','admin','member','viewer') NOT NULL DEFAULT 'member',
  can_reply   TINYINT(1) NOT NULL DEFAULT 1,
  created_at  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uk_pm (product_id, user_id),
  KEY idx_pm_user (user_id),
  CONSTRAINT fk_pm_product FOREIGN KEY (product_id) REFERENCES products (id) ON DELETE CASCADE,
  CONSTRAINT fk_pm_user    FOREIGN KEY (user_id)    REFERENCES users (id)    ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='产品团队成员';

-- ---------------- 反馈分类 ----------------
CREATE TABLE IF NOT EXISTS categories (
  id          BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  product_id  BIGINT UNSIGNED NOT NULL,
  name        VARCHAR(60)  NOT NULL,
  slug        VARCHAR(60)  NOT NULL,
  color       VARCHAR(20)  NOT NULL DEFAULT '#6366F1',
  icon        VARCHAR(40)  DEFAULT NULL,
  description VARCHAR(255) DEFAULT NULL,
  sort_order  INT NOT NULL DEFAULT 0,
  is_default  TINYINT(1) NOT NULL DEFAULT 0,
  created_at  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uk_cat (product_id, slug),
  KEY idx_cat_product (product_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='反馈分类';

-- ---------------- 标签 ----------------
CREATE TABLE IF NOT EXISTS tags (
  id          BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  product_id  BIGINT UNSIGNED NOT NULL,
  name        VARCHAR(40) NOT NULL,
  color       VARCHAR(20) NOT NULL DEFAULT '#0EA5E9',
  created_at  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uk_tag (product_id, name)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='标签';

-- ---------------- C 端反馈者 ----------------
CREATE TABLE IF NOT EXISTS end_users (
  id            BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  product_id    BIGINT UNSIGNED NOT NULL,
  external_id   VARCHAR(120) NOT NULL COMMENT '游客token / 邮箱 / 第三方openid',
  identity_type ENUM('guest','email','custom','oauth') NOT NULL DEFAULT 'guest',
  nickname      VARCHAR(60)  DEFAULT NULL,
  email         VARCHAR(160) DEFAULT NULL,
  avatar_url    VARCHAR(500) DEFAULT NULL,
  meta          JSON DEFAULT NULL COMMENT '设备/版本/自定义字段',
  post_count    INT UNSIGNED NOT NULL DEFAULT 0,
  last_seen_at  DATETIME DEFAULT NULL,
  created_at    DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uk_eu (product_id, external_id),
  KEY idx_eu_product (product_id),
  KEY idx_eu_email (email),
  CONSTRAINT fk_eu_product FOREIGN KEY (product_id) REFERENCES products (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='反馈者（按产品隔离）';

-- ---------------- 反馈帖子 ----------------
CREATE TABLE IF NOT EXISTS posts (
  id             BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  product_id     BIGINT UNSIGNED NOT NULL,
  seq            INT UNSIGNED NOT NULL DEFAULT 0 COMMENT '产品内编号 #12',
  title          VARCHAR(200) NOT NULL,
  content        MEDIUMTEXT NOT NULL,
  content_html   MEDIUMTEXT,
  type           ENUM('feedback','bug','complaint','question') NOT NULL DEFAULT 'feedback',
  category_id    BIGINT UNSIGNED DEFAULT NULL,
  status         ENUM('pending','planned','in_progress','resolved','closed','declined') NOT NULL DEFAULT 'pending',
  author_id      BIGINT UNSIGNED DEFAULT NULL COMMENT 'end_users.id',
  author_name    VARCHAR(60)  DEFAULT NULL COMMENT '冗余展示名（游客）',
  author_avatar  VARCHAR(500) DEFAULT NULL,
  contact_type   ENUM('qq','wechat','email','other') DEFAULT NULL COMMENT '提交者留下的联系方式类型（仅后台可见）',
  contact_value  VARCHAR(120) DEFAULT NULL COMMENT '联系方式内容（选填，仅后台可见，不在社区公开展示）',

  vote_count     INT UNSIGNED NOT NULL DEFAULT 0,
  comment_count  INT UNSIGNED NOT NULL DEFAULT 0,
  view_count     INT UNSIGNED NOT NULL DEFAULT 0,
  official_reply_count INT UNSIGNED NOT NULL DEFAULT 0,

  is_pinned      TINYINT(1) NOT NULL DEFAULT 0,
  is_official    TINYINT(1) NOT NULL DEFAULT 0 COMMENT '官方发布的公告/路线图',
  is_private     TINYINT(1) NOT NULL DEFAULT 0 COMMENT '仅提交者与团队可见',
  is_hidden      TINYINT(1) NOT NULL DEFAULT 0 COMMENT '管理员隐藏（不在公开板展示）',
  review_state   ENUM('approved','pending','rejected') NOT NULL DEFAULT 'approved',

  assignee_id    BIGINT UNSIGNED DEFAULT NULL COMMENT '负责人 platform users.id',
  source         ENUM('web','widget','api','import') NOT NULL DEFAULT 'web',
  meta           JSON DEFAULT NULL COMMENT '设备/版本/自定义字段快照',
  ip             VARCHAR(64) DEFAULT NULL,
  ua             VARCHAR(300) DEFAULT NULL,

  responded_at      DATETIME DEFAULT NULL COMMENT '首次官方回复时间',
  status_changed_at DATETIME DEFAULT NULL,
  last_activity_at  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  created_at        DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at        DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  deleted_at        DATETIME DEFAULT NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uk_post_seq (product_id, seq),
  KEY idx_post_product_status (product_id, status, deleted_at),
  KEY idx_post_product_hot (product_id, vote_count),
  KEY idx_post_product_new (product_id, created_at),
  KEY idx_post_category (category_id),
  KEY idx_post_author (author_id),
  KEY idx_post_title (title),
  CONSTRAINT fk_post_product  FOREIGN KEY (product_id)  REFERENCES products (id)  ON DELETE CASCADE,
  CONSTRAINT fk_post_category FOREIGN KEY (category_id) REFERENCES categories (id) ON DELETE SET NULL,
  CONSTRAINT fk_post_author   FOREIGN KEY (author_id)   REFERENCES end_users (id)  ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='反馈帖子';

CREATE TABLE IF NOT EXISTS post_tags (
  post_id BIGINT UNSIGNED NOT NULL,
  tag_id  BIGINT UNSIGNED NOT NULL,
  PRIMARY KEY (post_id, tag_id),
  KEY idx_pt_tag (tag_id),
  CONSTRAINT fk_pt_post FOREIGN KEY (post_id) REFERENCES posts (id) ON DELETE CASCADE,
  CONSTRAINT fk_pt_tag  FOREIGN KEY (tag_id)  REFERENCES tags (id)  ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------------- 投票 ----------------
CREATE TABLE IF NOT EXISTS votes (
  id          BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  post_id     BIGINT UNSIGNED NOT NULL,
  voter_key   VARCHAR(120) NOT NULL COMMENT 'end_user:{id} 或 guest:{token}',
  end_user_id BIGINT UNSIGNED DEFAULT NULL,
  created_at  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uk_vote (post_id, voter_key),
  KEY idx_vote_post (post_id),
  CONSTRAINT fk_vote_post FOREIGN KEY (post_id) REFERENCES posts (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='反馈投票（+1）';

-- ---------------- 评论 ----------------
CREATE TABLE IF NOT EXISTS comments (
  id           BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  post_id      BIGINT UNSIGNED NOT NULL,
  parent_id    BIGINT UNSIGNED DEFAULT NULL,
  author_type  ENUM('end_user','member','system') NOT NULL DEFAULT 'end_user',
  author_id    BIGINT UNSIGNED DEFAULT NULL COMMENT 'end_users.id / users.id',
  author_name  VARCHAR(60)  DEFAULT NULL,
  author_avatar VARCHAR(500) DEFAULT NULL,
  content      TEXT NOT NULL,
  is_official  TINYINT(1) NOT NULL DEFAULT 0 COMMENT '官方回复（前端置顶高亮）',
  is_pinned    TINYINT(1) NOT NULL DEFAULT 0,
  like_count   INT UNSIGNED NOT NULL DEFAULT 0,
  created_at   DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at   DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  deleted_at   DATETIME DEFAULT NULL,
  PRIMARY KEY (id),
  KEY idx_comment_post (post_id, created_at),
  KEY idx_comment_parent (parent_id),
  CONSTRAINT fk_comment_post   FOREIGN KEY (post_id)   REFERENCES posts (id) ON DELETE CASCADE,
  CONSTRAINT fk_comment_parent FOREIGN KEY (parent_id) REFERENCES comments (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='评论/官方回复';

CREATE TABLE IF NOT EXISTS comment_likes (
  comment_id BIGINT UNSIGNED NOT NULL,
  voter_key  VARCHAR(120) NOT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (comment_id, voter_key),
  CONSTRAINT fk_cl_comment FOREIGN KEY (comment_id) REFERENCES comments (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------------- 附件 ----------------
CREATE TABLE IF NOT EXISTS attachments (
  id          BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  product_id  BIGINT UNSIGNED NOT NULL,
  post_id     BIGINT UNSIGNED DEFAULT NULL,
  comment_id  BIGINT UNSIGNED DEFAULT NULL,
  file_name   VARCHAR(200) NOT NULL,
  file_path   VARCHAR(500) NOT NULL,
  file_url    VARCHAR(500) NOT NULL,
  mime_type   VARCHAR(100) DEFAULT NULL,
  size        INT UNSIGNED NOT NULL DEFAULT 0,
  uploader_key VARCHAR(120) DEFAULT NULL,
  created_at  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_att_post (post_id),
  KEY idx_att_product (product_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='附件/截图';

-- ---------------- 常见问题 ----------------
CREATE TABLE IF NOT EXISTS faqs (
  id          BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  product_id  BIGINT UNSIGNED NOT NULL,
  question    VARCHAR(255) NOT NULL,
  answer      TEXT NOT NULL,
  sort_order  INT NOT NULL DEFAULT 0,
  view_count  INT UNSIGNED NOT NULL DEFAULT 0,
  helpful_count INT UNSIGNED NOT NULL DEFAULT 0,
  is_published TINYINT(1) NOT NULL DEFAULT 1,
  created_at  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_faq_product (product_id),
  CONSTRAINT fk_faq_product FOREIGN KEY (product_id) REFERENCES products (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='常见问题';

-- ---------------- 更新日志 / 路线图 ----------------
CREATE TABLE IF NOT EXISTS changelogs (
  id           BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  product_id   BIGINT UNSIGNED NOT NULL,
  title        VARCHAR(200) NOT NULL,
  content      TEXT,
  version      VARCHAR(40) DEFAULT NULL,
  status       ENUM('planned','in_progress','released') NOT NULL DEFAULT 'planned',
  is_published TINYINT(1) NOT NULL DEFAULT 0,
  published_at DATETIME DEFAULT NULL,
  created_at   DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at   DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_cl_product (product_id, status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='更新日志/路线图';

-- ---------------- 站内通知 ----------------
CREATE TABLE IF NOT EXISTS notifications (
  id          BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  user_id     BIGINT UNSIGNED NOT NULL COMMENT '平台账号（团队成员）',
  product_id  BIGINT UNSIGNED DEFAULT NULL,
  type        VARCHAR(40) NOT NULL,
  title       VARCHAR(255) NOT NULL,
  content     VARCHAR(500) DEFAULT NULL,
  link        VARCHAR(300) DEFAULT NULL,
  is_read     TINYINT(1) NOT NULL DEFAULT 0,
  created_at  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_notif_user (user_id, is_read, created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='站内通知';

-- ---------------- Webhook（旧版，按产品直绑；已被「通知模板 + 通知绑定」取代，保留仅供历史数据迁移） ----------------
CREATE TABLE IF NOT EXISTS webhooks (
  id          BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  product_id  BIGINT UNSIGNED NOT NULL,
  url         VARCHAR(500) NOT NULL,
  secret      VARCHAR(120) DEFAULT NULL,
  events      JSON NOT NULL COMMENT '["post.created","comment.created"]',
  is_active   TINYINT(1) NOT NULL DEFAULT 1,
  fail_count  INT UNSIGNED NOT NULL DEFAULT 0,
  created_at  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_wh_product (product_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='Webhook（旧版，已由通知模板取代）';

CREATE TABLE IF NOT EXISTS webhook_deliveries (
  id          BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  webhook_id  BIGINT UNSIGNED NOT NULL,
  event       VARCHAR(60) NOT NULL,
  payload     JSON NOT NULL,
  response_code INT DEFAULT NULL,
  response_body VARCHAR(1000) DEFAULT NULL,
  success     TINYINT(1) NOT NULL DEFAULT 0,
  created_at  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_wd_hook (webhook_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------------- 通知模板（归属于用户，多个产品可引用同一模板） ----------------
CREATE TABLE IF NOT EXISTS notify_templates (
  id           BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  user_id      BIGINT UNSIGNED NOT NULL COMMENT '归属用户（产品方账号），非产品',
  name         VARCHAR(120) NOT NULL COMMENT '模板名称',
  type         ENUM('email','webhook','dingtalk','wecom','feishu') NOT NULL DEFAULT 'webhook' COMMENT '邮件 / Webhook / 钉钉机器人 / 企业微信机器人 / 飞书机器人',
  -- 邮件模板字段
  subject      VARCHAR(255) DEFAULT NULL COMMENT '邮件主题（支持 {{变量}}）',
  body         TEXT DEFAULT NULL COMMENT '正文模板：邮件正文 / Webhook 自定义报文 / 群机器人消息文本（支持 {{变量}}）',
  to_addresses VARCHAR(500) DEFAULT NULL COMMENT '收件人，多个用逗号分隔',
  -- Webhook / 群机器人模板字段
  url          VARCHAR(500) DEFAULT NULL COMMENT '回调地址 / 机器人 Webhook 地址',
  secret       VARCHAR(120) DEFAULT NULL COMMENT '签名密钥（Webhook: HMAC-SHA256；钉钉: 加签密钥；飞书: 签名密钥）',
  is_active    TINYINT(1) NOT NULL DEFAULT 1,
  legacy_webhook_id BIGINT UNSIGNED DEFAULT NULL COMMENT '由旧版 webhooks 迁移而来（幂等标记）',
  created_at   DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at   DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_nt_user (user_id),
  CONSTRAINT fk_nt_user FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='通知模板（用户级，邮件/Webhook）';

-- ---------------- 用户 SMTP 配置（归属用户，可多个，发送时任选其一） ----------------
CREATE TABLE IF NOT EXISTS smtp_configs (
  id           BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  user_id      BIGINT UNSIGNED NOT NULL COMMENT '归属用户',
  name         VARCHAR(120) NOT NULL COMMENT '配置名称，如「QQ 企业邮箱」',
  host         VARCHAR(255) NOT NULL,
  port         SMALLINT UNSIGNED NOT NULL DEFAULT 465,
  secure       TINYINT(1) NOT NULL DEFAULT 1 COMMENT '1=SSL 直连(465)；0=STARTTLS(587/25)',
  username     VARCHAR(255) DEFAULT NULL,
  password     VARCHAR(255) DEFAULT NULL,
  from_name    VARCHAR(120) DEFAULT NULL COMMENT '发件人显示名',
  from_address VARCHAR(160) DEFAULT NULL COMMENT '发件人地址',
  is_default   TINYINT(1) NOT NULL DEFAULT 0 COMMENT '默认配置',
  created_at   DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at   DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_smtp_user (user_id),
  CONSTRAINT fk_smtp_user FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='用户 SMTP 配置（多配置，发送时选择）';

-- ---------------- 通知绑定（产品引用用户模板；邮件模板需指定 SMTP 配置） ----------------
CREATE TABLE IF NOT EXISTS notify_bindings (
  id             BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  product_id     BIGINT UNSIGNED NOT NULL COMMENT '被通知的产品',
  template_id    BIGINT UNSIGNED NOT NULL COMMENT '引用的用户模板',
  smtp_config_id BIGINT UNSIGNED DEFAULT NULL COMMENT '邮件模板发送时使用的 SMTP 配置',
  events         JSON NOT NULL COMMENT '订阅事件数组；空数组 = 全部事件',
  is_active      TINYINT(1) NOT NULL DEFAULT 1,
  created_at     DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_nb_product (product_id),
  KEY idx_nb_template (template_id),
  CONSTRAINT fk_nb_product  FOREIGN KEY (product_id)     REFERENCES products (id)         ON DELETE CASCADE,
  CONSTRAINT fk_nb_template FOREIGN KEY (template_id)    REFERENCES notify_templates (id) ON DELETE CASCADE,
  CONSTRAINT fk_nb_smtp     FOREIGN KEY (smtp_config_id) REFERENCES smtp_configs (id)     ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='通知绑定（产品 × 用户模板）';

-- ---------------- 通知投递记录 ----------------
CREATE TABLE IF NOT EXISTS notify_deliveries (
  id            BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  product_id    BIGINT UNSIGNED NOT NULL,
  template_id   BIGINT UNSIGNED DEFAULT NULL,
  binding_id    BIGINT UNSIGNED DEFAULT NULL,
  channel       ENUM('email','webhook','dingtalk','wecom','feishu') NOT NULL,
  event         VARCHAR(60) NOT NULL,
  target        VARCHAR(500) DEFAULT NULL COMMENT '收件人 / 回调地址',
  success       TINYINT(1) NOT NULL DEFAULT 0,
  response_code INT DEFAULT NULL,
  response_body VARCHAR(1000) DEFAULT NULL,
  error         VARCHAR(500) DEFAULT NULL,
  is_test       TINYINT(1) NOT NULL DEFAULT 0 COMMENT '是否测试发送',
  created_at    DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_nd_product (product_id, created_at),
  KEY idx_nd_template (template_id, created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='通知投递记录';

-- ---------------- API Key ----------------
CREATE TABLE IF NOT EXISTS api_tokens (
  id          BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  product_id  BIGINT UNSIGNED NOT NULL,
  name        VARCHAR(80) NOT NULL,
  token       VARCHAR(64)  NOT NULL,
  scopes      JSON DEFAULT NULL,
  last_used_at DATETIME DEFAULT NULL,
  revoked     TINYINT(1) NOT NULL DEFAULT 0,
  created_at  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uk_token (token),
  KEY idx_at_product (product_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='产品 API Key';

-- ---------------- 操作日志 ----------------
CREATE TABLE IF NOT EXISTS activity_logs (
  id           BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  product_id   BIGINT UNSIGNED DEFAULT NULL,
  user_id      BIGINT UNSIGNED DEFAULT NULL,
  action       VARCHAR(60) NOT NULL,
  target_type  VARCHAR(40) DEFAULT NULL,
  target_id    BIGINT UNSIGNED DEFAULT NULL,
  detail       JSON DEFAULT NULL,
  ip           VARCHAR(64) DEFAULT NULL,
  created_at   DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_al_product (product_id, created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='操作日志';

-- ---------------- 运营配置（键值对，后台可改，DB 优先于 .env） ----------------
CREATE TABLE IF NOT EXISTS system_settings (
  setting_key VARCHAR(60)  NOT NULL COMMENT '配置键，如 storage.driver / register_enabled',
  value       JSON         NOT NULL COMMENT '配置值（JSON 兼容任意类型）',
  description VARCHAR(255) DEFAULT NULL,
  updated_by  BIGINT UNSIGNED DEFAULT NULL COMMENT '最后修改的平台用户 id',
  updated_at  DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (setting_key)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='系统配置（键值对）';

SET FOREIGN_KEY_CHECKS = 1;
