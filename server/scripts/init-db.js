'use strict';
/**
 * 数据库初始化脚本：建库 → 建专用账号（'%' 主机，兼容容器/沙箱网段）→ 导入表结构
 *
 * 用法：
 *   node scripts/init-db.js                                          # 用应用账号（DB_USER/DB_PASSWORD）初始化
 *   INIT_DB_USER=root INIT_ROOT_PASSWORD=xxx node scripts/init-db.js # 需高权限账号建库时
 *
 * 连接账号（建库/建表）：默认直接复用应用账号 DB_USER/DB_PASSWORD——生产/托管 MySQL 的应用账号
 *   通常已具备建库建表权限，无需 root。仅在「应用账号无建库/建应用账号权限」时，才用
 *   INIT_DB_USER / INIT_DB_PASSWORD（或 INIT_ROOT_PASSWORD）指定更高权限账号（如 RDS 主账号）。
 *   账号已预先建好时设 INIT_SKIP_USER=1 跳过 CREATE USER/GRANT。
 * 连接具备重试：MySQL 未就绪时每 2s 重试，最多 30 次，兼容外部/慢启动场景。
 */
const fs = require('fs');
const path = require('path');
const mysql = require('mysql2/promise');

(async () => {
  // 不依赖 .env 的完整加载也能跑：单独读关键项
  require('dotenv').config();
  const host = process.env.DB_HOST || '127.0.0.1';
  const port = Number(process.env.DB_PORT || 3306);
  const dbName = process.env.DB_NAME || 'feedback';
  const dbUser = process.env.DB_USER || 'feedback';
  const dbPass = process.env.DB_PASSWORD || 'feedback123';
  // 初始化连接账号（建库/建表用）：【默认直接用应用账号 DB_USER/DB_PASSWORD】。
  // 绝大多数生产/托管 MySQL 的应用账号本身就具备建库建表权限，无需 root。
  // 仅当「应用账号无建库/建应用账号权限」时，才用 INIT_DB_USER / INIT_DB_PASSWORD（或 INIT_ROOT_PASSWORD）指定更高权限账号。
  const initUser = process.env.INIT_DB_USER || dbUser;
  const initPass = process.env.INIT_DB_PASSWORD || (initUser === dbUser ? dbPass : (process.env.INIT_ROOT_PASSWORD || ''));
  // 跳过「建应用账号 + GRANT 授权」：账号已预先建好（外部/托管库不支持 CREATE USER/GRANT）时置 1。
  // 当初始化账号即为应用账号本身时，也会自动跳过（账号已存在，无需再建/授权）。
  const skipUser = process.env.INIT_SKIP_USER === '1' || process.env.INIT_SKIP_USER === 'true' || initUser === dbUser;

  const schema = fs.readFileSync(path.join(__dirname, '..', 'sql', 'schema.sql'), 'utf8');

  // 连接前先打印实际解析出的参数，便于排查 .env 是否生效 / 镜像是否重建（密码不打印明文，仅显示是否已设置）
  console.log(`[init] 连接参数：host=${host} port=${port} db=${dbName} user=${initUser} 密码=${initPass ? '已设置' : '为空'} 账号来源=${initUser === dbUser ? '应用账号(DB_USER/DB_PASSWORD)' : 'INIT_DB_USER 指定'} skipUser=${skipUser}`);
  // 连接带重试：兼容外部 MySQL 未就绪 / 网络延迟（每 2s 重试，最多 30 次）
  let root;
  const maxAttempts = 30, delayMs = 2000;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      root = await mysql.createConnection({ host, port, user: initUser, password: initPass, multipleStatements: true });
      console.log(`[init] 已连接 MySQL ${host}:${port}（账号 ${initUser}）`);
      break;
    } catch (e) {
      if (attempt === maxAttempts) {
        throw new Error(`无法连接 MySQL ${host}:${port}（账号 ${initUser}）：${e.message}`);
      }
      console.log(`[init] 连接 MySQL 失败（${attempt}/${maxAttempts}） ${host}:${port} 账号 ${initUser}：${e.message}，2s 后重试…`);
      await new Promise((r) => setTimeout(r, delayMs));
    }
  }

  await root.query(`CREATE DATABASE IF NOT EXISTS \`${dbName}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`);
  if (skipUser) {
    console.log('[init] INIT_SKIP_USER=1：跳过创建应用账号与授权（使用外部预置账号）');
  } else {
    // '%' 主机：同时兼容本机直连与 Docker/沙箱网段（连接会以网关 IP 出现）
    await root.query(`CREATE USER IF NOT EXISTS '${dbUser}'@'%' IDENTIFIED BY ?`, [dbPass]);
    await root.query(`GRANT ALL PRIVILEGES ON \`${dbName}\`.* TO '${dbUser}'@'%'`);
    await root.query('FLUSH PRIVILEGES');
  }
  await root.query(`USE \`${dbName}\``);
  await root.query(schema);

  // ---- 幂等迁移：为已有库补充兼容列（保留以兼容旧库，开源版不使用）----
  const [planCol] = await root.query("SHOW COLUMNS FROM users LIKE 'plan'");
  if (!planCol.length) {
    await root.query(
      "ALTER TABLE users ADD COLUMN plan ENUM('free','pro') NOT NULL DEFAULT 'free' COMMENT '保留列（兼容旧库）' AFTER role, " +
      'ADD COLUMN plan_started_at DATETIME DEFAULT NULL, ' +
      'ADD COLUMN plan_expires_at DATETIME DEFAULT NULL'
    );
    console.log('[init] 已迁移 users 表：新增 plan / plan_started_at / plan_expires_at');
  }
  const [brandCol] = await root.query("SHOW COLUMNS FROM products LIKE 'hide_branding'");
  if (!brandCol.length) {
    await root.query(
      "ALTER TABLE products ADD COLUMN hide_branding TINYINT(1) NOT NULL DEFAULT 0 COMMENT '隐藏品牌署名' AFTER allow_comment"
    );
    console.log('[init] 已迁移 products 表：新增 hide_branding');
  }

  // ---- 幂等迁移：运营配置（system_settings，存储驱动等仍需使用）----
  const [settingsTable] = await root.query("SHOW TABLES LIKE 'system_settings'");
  if (!settingsTable.length) {
    await root.query(
      `CREATE TABLE IF NOT EXISTS system_settings (
        setting_key VARCHAR(60)  NOT NULL COMMENT '配置键',
        value       JSON         NOT NULL COMMENT '配置值',
        description VARCHAR(255) DEFAULT NULL,
        updated_by  BIGINT UNSIGNED DEFAULT NULL,
        updated_at  DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        PRIMARY KEY (setting_key)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='系统配置（键值对）'`
    );
    console.log('[init] 已建表 system_settings');
  }
  const [roleCol] = await root.query("SHOW COLUMNS FROM users LIKE 'role'");
  if (!roleCol.length) {
    await root.query("ALTER TABLE users ADD COLUMN role ENUM('admin','user') NOT NULL DEFAULT 'user' AFTER avatar_url");
    console.log('[init] 已迁移 users 表：新增 role');
  }

  // ---- 幂等迁移：通知模板体系（notify_templates / smtp_configs / notify_bindings / notify_deliveries）----
  // 新库由 schema.sql 直接建好；此处对已有库补建 + 把旧版 webhooks 数据迁移为「用户模板 + 产品绑定」
  await root.query(
    `CREATE TABLE IF NOT EXISTS notify_templates (
      id           BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
      user_id      BIGINT UNSIGNED NOT NULL COMMENT '归属用户（产品方账号），非产品',
      name         VARCHAR(120) NOT NULL COMMENT '模板名称',
      type         ENUM('email','webhook','dingtalk','wecom','feishu') NOT NULL DEFAULT 'webhook' COMMENT '邮件 / Webhook / 钉钉 / 企业微信 / 飞书群机器人',
      subject      VARCHAR(255) DEFAULT NULL COMMENT '邮件主题（支持 {{变量}}）',
      body         TEXT DEFAULT NULL COMMENT '正文模板：邮件正文 / Webhook 自定义报文 / 群机器人消息文本（支持 {{变量}}）',
      to_addresses VARCHAR(500) DEFAULT NULL COMMENT '收件人，多个用逗号分隔',
      url          VARCHAR(500) DEFAULT NULL COMMENT '回调地址 / 机器人 Webhook 地址',
      secret       VARCHAR(120) DEFAULT NULL COMMENT '签名密钥（Webhook: HMAC-SHA256；钉钉: 加签密钥；飞书: 签名密钥）',
      is_active    TINYINT(1) NOT NULL DEFAULT 1,
      legacy_webhook_id BIGINT UNSIGNED DEFAULT NULL COMMENT '由旧版 webhooks 迁移而来（幂等标记）',
      created_at   DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at   DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      PRIMARY KEY (id),
      KEY idx_nt_user (user_id),
      CONSTRAINT fk_nt_user FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='通知模板（用户级，邮件/Webhook）'`
  );
  await root.query(
    `CREATE TABLE IF NOT EXISTS smtp_configs (
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
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='用户 SMTP 配置（多配置，发送时选择）'`
  );
  await root.query(
    `CREATE TABLE IF NOT EXISTS notify_bindings (
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
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='通知绑定（产品 × 用户模板）'`
  );
  await root.query(
    `CREATE TABLE IF NOT EXISTS notify_deliveries (
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
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='通知投递记录'`
  );
  // 已有库：把 type / channel 的 ENUM 扩展到群机器人（CREATE IF NOT EXISTS 不会改列，须显式 MODIFY）
  await root.query(
    "ALTER TABLE notify_templates MODIFY COLUMN type ENUM('email','webhook','dingtalk','wecom','feishu') NOT NULL DEFAULT 'webhook' COMMENT '邮件 / Webhook / 钉钉 / 企业微信 / 飞书群机器人'"
  );
  await root.query(
    "ALTER TABLE notify_deliveries MODIFY COLUMN channel ENUM('email','webhook','dingtalk','wecom','feishu') NOT NULL"
  );
  // 旧版 webhooks → 用户模板 + 产品绑定（legacy_webhook_id 保证幂等）
  const [legacyHooks] = await root.query('SELECT * FROM webhooks');
  let migrated = 0;
  for (const wh of legacyHooks) {
    const [done] = await root.query('SELECT id FROM notify_templates WHERE legacy_webhook_id = ?', [wh.id]);
    if (done.length) continue;
    const [owner] = await root.query('SELECT owner_id FROM products WHERE id = ?', [wh.product_id]);
    if (!owner.length) continue;
    const [tr] = await root.query(
      'INSERT INTO notify_templates (user_id, name, type, url, secret, is_active, legacy_webhook_id, created_at) VALUES (?,?,?,?,?,?,?,?)',
      [owner[0].owner_id, `迁移自旧版 Webhook`, 'webhook', wh.url, wh.secret, wh.is_active ? 1 : 0, wh.id, wh.created_at]
    );
    await root.query(
      'INSERT INTO notify_bindings (product_id, template_id, events, is_active, created_at) VALUES (?,?,?,?,?)',
      [wh.product_id, tr.insertId, JSON.stringify(wh.events || []), wh.is_active ? 1 : 0, wh.created_at]
    );
    migrated++;
  }
  if (migrated) console.log(`[init] 已迁移 ${migrated} 条旧版 Webhook 为通知模板 + 绑定`);

  // ---- 幂等迁移：邮箱验证（users.email_verify_code / email_verify_expires_at）----
  const EMAIL_VERIFY_COLS = [
    ['email_verify_code', "ALTER TABLE users ADD COLUMN email_verify_code VARCHAR(10) DEFAULT NULL COMMENT '邮箱验证码（6位）' AFTER email_verified"],
    ['email_verify_expires_at', "ALTER TABLE users ADD COLUMN email_verify_expires_at DATETIME DEFAULT NULL COMMENT '邮箱验证码过期时间' AFTER email_verify_code"],
  ];
  for (const [col, ddl] of EMAIL_VERIFY_COLS) {
    const [c] = await root.query(`SHOW COLUMNS FROM users LIKE '${col}'`);
    if (!c.length) {
      await root.query(ddl);
      console.log(`[init] 已迁移 users 表：新增 ${col}`);
    }
  }

  // ---- 幂等迁移：反馈联系方式（posts.contact_type / contact_value，仅后台可见）----
  const CONTACT_COLS = [
    ['contact_type', "ALTER TABLE posts ADD COLUMN contact_type ENUM('qq','wechat','email','other') DEFAULT NULL COMMENT '提交者留下的联系方式类型（仅后台可见）' AFTER author_avatar"],
    ['contact_value', "ALTER TABLE posts ADD COLUMN contact_value VARCHAR(120) DEFAULT NULL COMMENT '联系方式内容（选填，仅后台可见，不在社区公开展示）' AFTER contact_type"],
  ];
  for (const [col, ddl] of CONTACT_COLS) {
    const [c] = await root.query(`SHOW COLUMNS FROM posts LIKE '${col}'`);
    if (!c.length) {
      await root.query(ddl);
      console.log(`[init] 已迁移 posts 表：新增 ${col}`);
    }
  }

  // 首个管理员：ADMIN_EMAIL 指定，默认 demo@feedback.dev（仅在该账号存在时提升）
  const adminEmail = process.env.ADMIN_EMAIL || 'demo@feedback.dev';
  const [r] = await root.query('UPDATE users SET role = ? WHERE email = ? AND role <> ?', ['admin', adminEmail, 'admin']);
  if (r.affectedRows) console.log(`[init] 已将 ${adminEmail} 提升为管理员`);

  const [tables] = await root.query('SHOW TABLES');
  console.log(`[init] 数据库 ${dbName} 就绪，共 ${tables.length} 张表`);
  console.log(`[init] 应用账号：${dbUser} / ${dbPass}（主机 %）`);
  await root.end();
  process.exit(0);
})().catch((e) => {
  console.error('[init] 失败:', e.message);
  console.error('       默认使用应用账号（DB_USER/DB_PASSWORD）连接；若应用账号无建库权限，');
  console.error('       请在 .env 设 INIT_DB_USER / INIT_DB_PASSWORD 指定高权限账号，或预建库后设 INIT_SKIP_USER=1');
  if (host === '127.0.0.1' || host === 'localhost') {
    console.error('       ⚠ 检测到 DB_HOST=' + host + '：在 Docker 容器内 127.0.0.1/localhost 指向【容器自身】，并非宿主机上的 MySQL。');
    console.error('       同一台宿主机的 MySQL 请改用 host.docker.internal（Docker Desktop）或宿主机内网 IP / docker 网桥网关（Linux 通常为 172.17.0.1）。');
  }
  process.exit(1);
});
