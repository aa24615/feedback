'use strict';
/**
 * 通知体系（模板制）：
 *   · notify_templates  通知模板（归属于用户；邮件 / Webhook / 钉钉 / 企业微信 / 飞书群机器人）
 *   · smtp_configs      用户自己的 SMTP 配置（可多个，发送时任选）
 *   · notify_bindings   产品引用用户模板（可多产品共用同一模板）
 *   · notify_deliveries 投递记录
 *
 * 事件触发统一走 dispatch(productId, event, payload)：按产品的绑定找到模板 →
 * 渲染 {{变量}} → 邮件走所选 SMTP 配置发出 / Webhook 带签名 POST / 群机器人按平台报文发送 → 记录投递。
 */
const crypto = require('crypto');
const nodemailer = require('nodemailer');
const config = require('../config/env');
const db = require('../config/db');

/** 可订阅事件目录（与旧版 webhooks 保持一致） */
const EVENTS = [
  { k: 'post.created', l: '新反馈提交' },
  { k: 'post.status_changed', l: '反馈状态变更' },
  { k: 'comment.created', l: '新评论 / 回复' },
];

const STATUS_LABEL = {
  pending: '待处理', planned: '已规划', in_progress: '处理中',
  resolved: '已解决', closed: '已关闭', declined: '已拒绝',
};
const TYPE_LABEL = { feedback: '建议', bug: '问题', complaint: '吐槽', question: '提问' };

/* ---------------- 模板渲染 ---------------- */

function getVar(vars, path) {
  return path.split('.').reduce((o, k) => (o == null ? undefined : o[k]), vars);
}

/** 替换 {{a.b}} 占位符；未提供的变量替换为空串 */
function render(tpl, vars) {
  if (!tpl) return '';
  return String(tpl).replace(/\{\{\s*([\w.]+)\s*\}\}/g, (m, path) => {
    const v = getVar(vars, path);
    return v === undefined || v === null ? '' : String(v);
  });
}

/** 构造模板变量（邮件/Webhook 共用） */
function buildVars(product, event, payload) {
  const web = (config.webBaseUrl || '').replace(/\/$/, '');
  const link = product ? `${web}/#/p/${product.slug}` : '';
  const d = payload || {};
  const vars = {
    event,
    time: new Date().toLocaleString('zh-CN', { hour12: false }),
    product: { name: product ? product.name : '', slug: product ? product.slug : '', link },
    post: {},
    comment: {},
  };
  if (d.postId != null) vars.post.id = d.postId;
  if (d.seq != null) vars.post.seq = `#${d.seq}`;
  if (d.title) vars.post.title = d.title;
  if (d.type) vars.post.type = TYPE_LABEL[d.type] || d.type;
  if (d.status) vars.post.status = STATUS_LABEL[d.status] || d.status;
  if (d.oldStatus) vars.post.oldStatus = STATUS_LABEL[d.oldStatus] || d.oldStatus;
  if (d.postId != null && product) vars.post.link = `${link}/posts/${d.postId}`;
  if (d.commentId != null) vars.comment.id = d.commentId;
  if (d.content) vars.comment.content = d.content;
  return vars;
}

/** 测试用的示例变量 */
function sampleVars() {
  return buildVars({ name: '示例产品', slug: 'demo' }, 'post.created', {
    postId: 1, seq: 1, title: '示例反馈：希望支持深色模式', type: 'feedback',
    status: 'pending', commentId: 1, content: '这是一条测试通知的正文内容。',
  });
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

/* ---------------- SMTP 发送（按用户配置） ---------------- */

const transports = new Map(); // key: configId，值: { updatedAt, transporter }

/** 配置更新后调用，清除缓存的 transport */
function invalidateTransport(id) {
  transports.delete(Number(id));
}

function getTransport(cfg) {
  const key = Number(cfg.id);
  const hit = transports.get(key);
  const stamp = cfg.updated_at ? new Date(cfg.updated_at).getTime() : 0;
  if (hit && hit.stamp === stamp) return hit.transporter;
  const transporter = nodemailer.createTransport({
    host: cfg.host,
    port: Number(cfg.port) || 465,
    secure: !!cfg.secure,
    // 明确的超时控制：避免不可达服务器时请求长时间挂起
    connectionTimeout: 10000,
    greetingTimeout: 10000,
    dnsTimeout: 10000,
    auth: cfg.username ? { user: cfg.username, pass: cfg.password || '' } : undefined,
  });
  transports.set(key, { stamp, transporter });
  return transporter;
}

function formatFrom(cfg) {
  const name = cfg.from_name || '反馈墙';
  const addr = cfg.from_address || cfg.username || 'no-reply@example.com';
  return `${name} <${addr}>`;
}

/** 用指定 SMTP 配置发信；返回 { ok, error? } */
async function sendMailVia(cfg, { to, subject, text, html }) {
  if (!cfg || !cfg.host) return { ok: false, error: 'SMTP 配置不存在或未填写服务器' };
  try {
    const t = getTransport(cfg);
    await t.sendMail({ from: formatFrom(cfg), to, subject, text, html: html || text });
    return { ok: true };
  } catch (err) {
    return { ok: false, error: String(err.message || err).slice(0, 500) };
  }
}

/** 校验 SMTP 配置连通性 */
async function verifySmtp(cfg) {
  if (!cfg || !cfg.host) return { ok: false, error: 'SMTP 配置不存在或未填写服务器' };
  try {
    await getTransport(cfg).verify();
    return { ok: true };
  } catch (err) {
    return { ok: false, error: String(err.message || err).slice(0, 500) };
  }
}

/* ---------------- Webhook 投递 ---------------- */

async function postWebhook(url, secret, bodyObj) {
  const body = JSON.stringify(bodyObj);
  const signature = secret ? crypto.createHmac('sha256', secret).update(body).digest('hex') : '';
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Feedback-Event': String(bodyObj.event || ''),
      ...(signature ? { 'X-Feedback-Signature': signature } : {}),
    },
    body,
    signal: AbortSignal.timeout(5000),
  });
  const text = await res.text().catch(() => '');
  return { ok: res.ok, code: res.status, body: text.slice(0, 1000) };
}

/* ---------------- 群机器人（钉钉 / 企业微信 / 飞书） ---------------- */

/** 通道中文名（前端展示与投递记录用） */
const CHANNEL_LABEL = {
  email: '邮件', webhook: 'Webhook',
  dingtalk: '钉钉机器人', wecom: '企业微信机器人', feishu: '飞书机器人',
};

function appendQuery(url, params) {
  const sep = url.includes('?') ? '&' : '?';
  return url + sep + params.map(([k, v]) => `${k}=${encodeURIComponent(v)}`).join('&');
}

const BOTS = {
  // 钉钉自定义机器人：text 报文；加签密钥以 SEC 开头，algorithm = HMAC-SHA256(timestamp\nsecret, secret)
  dingtalk: {
    label: '钉钉机器人',
    build: (text) => ({ msgtype: 'text', text: { content: text } }),
    signUrl: (url, secret) => {
      if (!secret) return url;
      const timestamp = Date.now();
      const hmac = crypto.createHmac('sha256', `${timestamp}\n${secret}`).update(secret).digest('base64');
      return appendQuery(url, [['timestamp', String(timestamp)], ['sign', hmac]]);
    },
    ok: (j) => !!j && j.errcode === 0,
    errMsg: (j) => (j && (j.errmsg || j.error_msg)) || '',
  },
  // 企业微信群机器人：text 报文（content 即文本）；安全设置仅支持 IP 白名单 / 关键词，无签名
  wecom: {
    label: '企业微信机器人',
    build: (text) => ({ msgtype: 'text', content: text }),
    signUrl: (url) => url,
    ok: (j) => !!j && j.errcode === 0,
    errMsg: (j) => (j && j.errmsg) || '',
  },
  // 飞书自定义机器人：text 报文；签名 = base64(HMAC-SHA256(key=timestamp\nsecret, data=''))
  feishu: {
    label: '飞书机器人',
    build: (text) => ({ msg_type: 'text', content: { text } }),
    signUrl: (url, secret) => {
      if (!secret) return url;
      const timestamp = Math.floor(Date.now() / 1000);
      const sign = crypto.createHmac('sha256', `${timestamp}\n${secret}`).update('').digest('base64');
      return appendQuery(url, [['timestamp', String(timestamp)], ['sign', sign]]);
    },
    ok: (j) => !!j && (j.code === 0 || j.StatusCode === 0),
    errMsg: (j) => (j && (j.msg || j.StatusMessage)) || '',
  },
};

/** 群机器人消息文本：模板 body 渲染结果，为空则用默认文案 */
function botText(b, vars, product) {
  const t = render(b.body, vars).trim();
  if (t) return t;
  return [
    `【反馈墙】${product ? product.name : ''}`,
    `反馈：${vars.post.title || '（无标题）'}`,
    vars.post.link ? `详情：${vars.post.link}` : '',
  ].filter(Boolean).join('\n');
}

/** 发送群机器人消息；返回 { ok, code?, body?, error? }（HTTP 200 但 errcode≠0 也判失败） */
async function postBot(channel, url, secret, text) {
  const bot = BOTS[channel];
  if (!bot) return { ok: false, error: `不支持的通道：${channel}` };
  if (!url) return { ok: false, error: '模板未配置机器人 Webhook 地址' };
  const target = bot.signUrl(url, secret);
  try {
    const res = await fetch(target, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(bot.build(text)),
      signal: AbortSignal.timeout(5000),
    });
    const raw = await res.text().catch(() => '');
    let j = null;
    try { j = JSON.parse(raw); } catch { /* 保留原文 */ }
    if (!res.ok) return { ok: false, code: res.status, body: raw.slice(0, 1000), error: `对方返回 HTTP ${res.status}` };
    if (!bot.ok(j)) return { ok: false, code: res.status, body: raw.slice(0, 1000), error: bot.errMsg(j) || '返回内容无法识别' };
    return { ok: true, code: res.status, body: raw.slice(0, 1000) };
  } catch (err) {
    return { ok: false, error: String(err.message || err).slice(0, 500) };
  }
}

/* ---------------- 投递日志 ---------------- */

async function logDelivery(row) {
  try {
    await db.exec(
      `INSERT INTO notify_deliveries
         (product_id, template_id, binding_id, channel, event, target, success, response_code, response_body, error, is_test)
       VALUES (?,?,?,?,?,?,?,?,?,?,?)`,
      [
        row.product_id || null, row.template_id || null, row.binding_id || null,
        row.channel, row.event, row.target ? String(row.target).slice(0, 500) : null,
        row.success ? 1 : 0, row.response_code || null,
        row.response_body ? String(row.response_body).slice(0, 1000) : null,
        row.error ? String(row.error).slice(0, 500) : null, row.is_test ? 1 : 0,
      ]
    );
  } catch (err) {
    console.error('[notify:log]', err.message);
  }
}

/* ---------------- 核心分发 ---------------- */

/**
 * 事件分发：找到产品的激活绑定 → 渲染模板 → 发送 → 记录投递。
 * 单条投递失败不影响其他绑定，也不影响主流程（调用方无需 await 等待网络）。
 */
async function dispatch(productId, event, payload) {
  let bindings;
  try {
    bindings = await db.query(
      `SELECT b.id AS binding_id, b.events, t.id AS template_id, t.type AS channel, t.subject, t.body,
              t.to_addresses, t.url, t.secret, t.name AS template_name,
              s.id AS smtp_id, s.host AS smtp_host, s.port AS smtp_port, s.secure AS smtp_secure,
              s.username AS smtp_user, s.password AS smtp_pass, s.from_name AS smtp_from_name,
              s.from_address AS smtp_from_address, s.updated_at AS smtp_updated_at
       FROM notify_bindings b
       JOIN notify_templates t ON t.id = b.template_id
       LEFT JOIN smtp_configs s ON s.id = b.smtp_config_id
       WHERE b.product_id = ? AND b.is_active = 1 AND t.is_active = 1`,
      [productId]
    );
  } catch (err) {
    console.error('[notify:error]', err.message);
    return;
  }
  if (!bindings.length) return;

  let product = null;
  try {
    product = await db.queryOne('SELECT id, name, slug FROM products WHERE id = ?', [productId]);
  } catch { /* 产品信息仅用于变量，缺失时降级 */ }
  const vars = buildVars(product, event, payload);

  for (const b of bindings) {
    const events = Array.isArray(b.events) ? b.events : [];
    if (events.length && !events.includes(event)) continue;
    // 不阻塞主流程；内部自行记录投递日志
    deliverOne(b, event, vars, product, payload, false).catch((e) => console.error('[notify:error]', e.message));
  }
}

async function deliverOne(b, event, vars, product, payload, isTest) {
  const base = { product_id: product ? product.id : null, template_id: b.template_id, binding_id: b.binding_id, event, is_test: !!isTest };
  if (b.channel === 'email') {
    const to = String(b.to_addresses || '').split(/[,，;；\s]+/).filter(Boolean);
    if (!to.length) {
      await logDelivery({ ...base, channel: 'email', target: '', success: false, error: '模板未配置收件人' });
      return;
    }
    if (!b.smtp_id) {
      await logDelivery({ ...base, channel: 'email', target: to.join(','), success: false, error: '未选择 SMTP 配置' });
      return;
    }
    const subject = render(b.subject, vars) || `[${product ? product.name : '反馈墙'}] ${event}`;
    const text = render(b.body, vars);
    const html = escapeHtml(text).replace(/\r?\n/g, '<br>');
    const r = await sendMailVia(b, { to: to.join(','), subject, text, html });
    await logDelivery({ ...base, channel: 'email', target: to.join(','), success: r.ok, error: r.error });
    return;
  }
  // 群机器人（钉钉 / 企业微信 / 飞书）：body 为消息文本，url 为机器人 Webhook 地址
  if (BOTS[b.channel]) {
    if (!b.url) {
      await logDelivery({ ...base, channel: b.channel, target: '', success: false, error: '模板未配置机器人 Webhook 地址' });
      return;
    }
    const r = await postBot(b.channel, b.url, b.secret, botText(b, vars, product));
    await logDelivery({ ...base, channel: b.channel, target: b.url, success: r.ok, response_code: r.code, response_body: r.body, error: r.error });
    return;
  }
  // Webhook：自定义报文模板优先，为空则发送标准事件报文
  const custom = b.body ? String(b.body).trim() : '';
  let bodyObj;
  if (custom) {
    const rendered = render(custom, vars);
    try { bodyObj = JSON.parse(rendered); } catch { bodyObj = { raw: rendered }; }
  } else {
    bodyObj = {
      event,
      productId: product ? product.id : null,
      product: product ? product.name : null,
      timestamp: new Date().toISOString(),
      data: payload || {},
    };
  }
  if (!b.url) {
    await logDelivery({ ...base, channel: 'webhook', target: '', success: false, error: '模板未配置回调地址' });
    return;
  }
  try {
    const r = await postWebhook(b.url, b.secret, bodyObj);
    await logDelivery({ ...base, channel: 'webhook', target: b.url, success: r.ok, response_code: r.code, response_body: r.body });
  } catch (err) {
    await logDelivery({ ...base, channel: 'webhook', target: b.url, success: false, error: String(err.message || err).slice(0, 500) });
  }
}

/** 测试某条产品绑定（用产品最近一条真实反馈做变量，无反馈则用示例数据） */
async function testBinding(bindingId) {
  const b = await db.queryOne(
    `SELECT b.id AS binding_id, b.product_id, b.events, t.id AS template_id, t.type AS channel, t.subject, t.body,
            t.to_addresses, t.url, t.secret, t.name AS template_name, t.user_id AS template_user_id,
            s.id AS smtp_id, s.host AS smtp_host, s.port AS smtp_port, s.secure AS smtp_secure,
            s.username AS smtp_user, s.password AS smtp_pass, s.from_name AS smtp_from_name,
            s.from_address AS smtp_from_address, s.updated_at AS smtp_updated_at
     FROM notify_bindings b
     JOIN notify_templates t ON t.id = b.template_id
     LEFT JOIN smtp_configs s ON s.id = b.smtp_config_id
     WHERE b.id = ?`,
    [bindingId]
  );
  if (!b) return { ok: false, error: '绑定不存在' };
  const product = await db.queryOne('SELECT id, name, slug FROM products WHERE id = ?', [b.product_id]);
  const lastPost = await db.queryOne(
    'SELECT id, seq, title, type, status FROM posts WHERE product_id = ? AND deleted_at IS NULL ORDER BY id DESC LIMIT 1',
    [b.product_id]
  );
  const vars = lastPost
    ? buildVars(product, 'post.created', { ...lastPost, content: '（测试通知）这是一条示例正文内容。' })
    : buildVars(product, 'test', { postId: 1, seq: 1, title: '示例反馈：希望支持深色模式', type: 'feedback', status: 'pending', content: '这是一条测试通知的正文内容。' });
  if (b.channel === 'email' && !b.smtp_id) {
    await logDelivery({ product_id: b.product_id, template_id: b.template_id, binding_id: b.binding_id, channel: 'email', event: 'test', success: false, error: '未选择 SMTP 配置', is_test: 1 });
    return { ok: false, error: '该绑定未选择 SMTP 配置' };
  }
  if (b.channel !== 'email' && !b.url) {
    await logDelivery({ product_id: b.product_id, template_id: b.template_id, binding_id: b.binding_id, channel: b.channel, event: 'test', success: false, error: '模板未配置回调地址', is_test: 1 });
    return { ok: false, error: '模板未配置回调地址' };
  }
  // 复用分发逻辑（is_test 标记）
  const before = Date.now();
  await deliverOne(b, 'test', vars, product, { postId: lastPost ? lastPost.id : 1, seq: lastPost ? lastPost.seq : 1, title: lastPost ? lastPost.title : '示例反馈', content: '这是一条测试通知的正文内容。' }, true);
  // deliverOne 内部已记录投递；这里回读结果
  const row = await db.queryOne(
    'SELECT success, error, response_code, response_body FROM notify_deliveries WHERE binding_id = ? AND is_test = 1 ORDER BY id DESC LIMIT 1',
    [b.binding_id]
  );
  if (row && !row.success) return { ok: false, error: row.error || `对方返回 ${row.response_code || '失败'}` };
  if (!row) return { ok: false, error: '未记录到投递结果' };
  void before;
  return { ok: true };
}

/* ---------------- 测试发送 ---------------- */

/**
 * 测试一个通知模板（用户级）。
 * @param template 模板行（须含 user 上下文由路由层保证）
 * @param opts { smtpConfigId?: 邮件模板使用的 SMTP 配置；to?: 收件人（默认当前用户邮箱） }
 */
async function testTemplate(template, opts = {}) {
  const vars = sampleVars();
  if (template.type === 'email') {
    let cfg = null;
    if (opts.smtpConfigId) {
      cfg = await db.queryOne('SELECT * FROM smtp_configs WHERE id = ? AND user_id = ?', [opts.smtpConfigId, template.user_id]);
      if (!cfg) return { ok: false, error: 'SMTP 配置不存在' };
    } else {
      cfg = await db.queryOne('SELECT * FROM smtp_configs WHERE user_id = ? ORDER BY is_default DESC, id DESC LIMIT 1', [template.user_id]);
      if (!cfg) return { ok: false, error: '尚未创建 SMTP 配置，请先到「SMTP 配置」添加' };
    }
    const to = opts.to || (await db.queryOne('SELECT email FROM users WHERE id = ?', [template.user_id])).email;
    const subject = `【测试】${render(template.subject, vars) || '通知模板测试'}`;
    const text = render(template.body, vars);
    const r = await sendMailVia(cfg, { to, subject, text, html: escapeHtml(text).replace(/\r?\n/g, '<br>') });
    await logDelivery({
      product_id: null, template_id: template.id, channel: 'email', event: 'test',
      target: to, success: r.ok, error: r.error, is_test: 1,
    });
    return r.ok ? { ok: true, via: cfg.name } : r;
  }
  // 群机器人模板测试
  if (BOTS[template.type]) {
    if (!template.url) return { ok: false, error: '模板未配置机器人 Webhook 地址' };
    const r = await postBot(template.type, template.url, template.secret, botText(template, vars, { name: '测试产品' }));
    await logDelivery({
      product_id: null, template_id: template.id, channel: template.type, event: 'test',
      target: template.url, success: r.ok, response_code: r.code, response_body: r.body, error: r.error, is_test: 1,
    });
    return r;
  }
  // Webhook 模板测试
  if (!template.url) return { ok: false, error: '模板未配置回调地址' };
  const bodyObj = {
    event: 'test', productId: null, product: '测试产品',
    timestamp: new Date().toISOString(),
    data: { postId: 1, seq: 1, title: '示例反馈：希望支持深色模式', type: 'feedback', status: 'pending', content: '这是一条测试通知的正文内容。' },
  };
  try {
    const r = await postWebhook(template.url, template.secret, bodyObj);
    await logDelivery({
      product_id: null, template_id: template.id, channel: 'webhook', event: 'test',
      target: template.url, success: r.ok, response_code: r.code, response_body: r.body, is_test: 1,
    });
    return r;
  } catch (err) {
    const msg = String(err.message || err).slice(0, 500);
    await logDelivery({ product_id: null, template_id: template.id, channel: 'webhook', event: 'test', target: template.url, success: false, error: msg, is_test: 1 });
    return { ok: false, error: msg };
  }
}

module.exports = {
  EVENTS, CHANNEL_LABEL, BOTS, render, buildVars, sampleVars, dispatch, deliverOne, testBinding,
  sendMailVia, verifySmtp, invalidateTransport, postWebhook, postBot, logDelivery, testTemplate,
};
