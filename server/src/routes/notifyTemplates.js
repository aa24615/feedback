'use strict';
/**
 * 通知模板（用户级）：/api/me/notify-templates
 * 模板归属于用户（而非产品），多个产品可通过「通知绑定」引用同一模板。
 * 支持邮件、Webhook、钉钉 / 企业微信 / 飞书群机器人五种通道。
 */
const express = require('express');
const db = require('../config/db');
const { requireAuth } = require('../middleware/auth');
const { validate } = require('../utils/validate');
const { ok, badRequest, notFound } = require('../utils/response');
const { EVENTS, CHANNEL_LABEL, testTemplate } = require('../services/notify');

const router = express.Router();
router.use(requireAuth);

const VALID_TYPES = ['email', 'webhook', 'dingtalk', 'wecom', 'feishu'];
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const parseAddresses = (s) => String(s || '').split(/[,，;；\s]+/).map((x) => x.trim()).filter(Boolean);

/** 脱敏：secret 仅告知是否已设置 */
function mask(row) {
  if (!row) return row;
  return { ...row, secret: row.secret ? '********' : '' };
}

// 可订阅事件目录（前端下拉用）
router.get('/events', (req, res) => ok(res, { events: EVENTS, channels: CHANNEL_LABEL }));

// 我的模板列表
router.get('/', async (req, res, next) => {
  try {
    const rows = await db.query(
      'SELECT id, name, type, subject, body, to_addresses, url, secret, is_active, created_at FROM notify_templates WHERE user_id = ? ORDER BY id DESC',
      [req.user.id]
    );
    return ok(res, { templates: rows.map(mask) });
  } catch (e) { next(e); }
});

// 新建模板
router.post('/', async (req, res, next) => {
  try {
    const v = validate(req.body, {
      name: { type: 'string', required: true, min: 1, max: 120, label: '模板名称' },
      type: { type: 'enum', values: VALID_TYPES, default: 'webhook' },
      subject: { type: 'string', max: 255 },
      body: { type: 'string', max: 8000 },
      to_addresses: { type: 'string', max: 500 },
      url: { type: 'string', max: 500 },
      secret: { type: 'string', max: 120 },
      is_active: { type: 'boolean', default: true },
    });
    if (v.type === 'email') {
      if (!v.subject) return next(badRequest('邮件模板必须填写主题'));
      const to = parseAddresses(v.to_addresses);
      if (!to.length) return next(badRequest('邮件模板必须填写收件人'));
      const bad = to.find((a) => !EMAIL_RE.test(a));
      if (bad) return next(badRequest(`收件人地址不合法：${bad}`));
    } else if (!/^https?:\/\//.test(v.url || '')) {
      return next(badRequest(`${CHANNEL_LABEL[v.type] || 'Webhook'} 模板必须填写合法的 http(s) 地址`));
    }
    const r = await db.exec(
      `INSERT INTO notify_templates (user_id, name, type, subject, body, to_addresses, url, secret, is_active)
       VALUES (?,?,?,?,?,?,?,?,?)`,
      [req.user.id, v.name, v.type, v.subject || null, v.body || null, v.to_addresses || null, v.url || null, v.secret || null, v.is_active ? 1 : 0]
    );
    const tpl = await db.queryOne(
      'SELECT id, name, type, subject, body, to_addresses, url, is_active, created_at FROM notify_templates WHERE id = ?',
      [r.insertId]
    );
    return ok(res, { template: tpl }, '模板已创建');
  } catch (e) { next(e); }
});

// 模板详情
router.get('/:id(\\d+)', async (req, res, next) => {
  try {
    const tpl = await db.queryOne('SELECT * FROM notify_templates WHERE id = ? AND user_id = ?', [req.params.id, req.user.id]);
    if (!tpl) return next(notFound('模板不存在'));
    return ok(res, { template: mask(tpl) });
  } catch (e) { next(e); }
});

// 更新模板（类型不可改；secret 留空 = 不修改）
router.patch('/:id(\\d+)', async (req, res, next) => {
  try {
    const tpl = await db.queryOne('SELECT * FROM notify_templates WHERE id = ? AND user_id = ?', [req.params.id, req.user.id]);
    if (!tpl) return next(notFound('模板不存在'));
    if (req.body.type && req.body.type !== tpl.type) return next(badRequest('模板类型不可修改，请新建对应类型的模板'));
    const v = validate(req.body, {
      name: { type: 'string', min: 1, max: 120 },
      subject: { type: 'string', max: 255 },
      body: { type: 'string', max: 8000 },
      to_addresses: { type: 'string', max: 500 },
      url: { type: 'string', max: 500 },
      secret: { type: 'string', max: 120 },
      is_active: { type: 'boolean' },
    });
    const sets = []; const params = [];
    if (v.name !== undefined) { sets.push('name = ?'); params.push(v.name); }
    if (v.subject !== undefined) { sets.push('subject = ?'); params.push(v.subject || null); }
    if (v.body !== undefined) { sets.push('body = ?'); params.push(v.body || null); }
    if (v.to_addresses !== undefined) { sets.push('to_addresses = ?'); params.push(v.to_addresses || null); }
    if (v.url !== undefined) { sets.push('url = ?'); params.push(v.url || null); }
    if (v.secret !== undefined) { sets.push('secret = ?'); params.push(v.secret || null); }
    if (v.is_active !== undefined) { sets.push('is_active = ?'); params.push(v.is_active ? 1 : 0); }
    // 按最终类型补校验
    const finalType = tpl.type;
    const finalSubject = v.subject !== undefined ? v.subject : tpl.subject;
    const finalTo = v.to_addresses !== undefined ? v.to_addresses : tpl.to_addresses;
    const finalUrl = v.url !== undefined ? v.url : tpl.url;
    if (finalType === 'email') {
      if (!finalSubject) return next(badRequest('邮件模板必须填写主题'));
      const to = parseAddresses(finalTo);
      if (!to.length) return next(badRequest('邮件模板必须填写收件人'));
      const bad = to.find((a) => !EMAIL_RE.test(a));
      if (bad) return next(badRequest(`收件人地址不合法：${bad}`));
    } else if (!/^https?:\/\//.test(finalUrl || '')) {
      return next(badRequest(`${CHANNEL_LABEL[finalType] || 'Webhook'} 模板必须填写合法的 http(s) 地址`));
    }
    if (sets.length) { params.push(tpl.id); await db.exec(`UPDATE notify_templates SET ${sets.join(', ')} WHERE id = ?`, params); }
    const fresh = await db.queryOne('SELECT * FROM notify_templates WHERE id = ?', [tpl.id]);
    return ok(res, { template: mask(fresh) }, '已保存');
  } catch (e) { next(e); }
});

// 删除模板（其下的产品绑定级联删除；投递历史保留）
router.delete('/:id(\\d+)', async (req, res, next) => {
  try {
    const tpl = await db.queryOne('SELECT id FROM notify_templates WHERE id = ? AND user_id = ?', [req.params.id, req.user.id]);
    if (!tpl) return next(notFound('模板不存在'));
    await db.exec('DELETE FROM notify_templates WHERE id = ?', [tpl.id]);
    return ok(res, { success: true }, '已删除');
  } catch (e) { next(e); }
});

// 测试发送：邮件模板需指定 SMTP 配置（或使用默认配置），默认发到当前登录账号邮箱
router.post('/:id(\\d+)/test', async (req, res, next) => {
  try {
    const tpl = await db.queryOne('SELECT * FROM notify_templates WHERE id = ? AND user_id = ?', [req.params.id, req.user.id]);
    if (!tpl) return next(notFound('模板不存在'));
    const smtpConfigId = req.body && req.body.smtp_config_id ? Number(req.body.smtp_config_id) : null;
    const r = await testTemplate(tpl, { smtpConfigId });
    return ok(res, { success: !!r.ok, error: r.error || null, via: r.via || null });
  } catch (e) { next(e); }
});

module.exports = router;
