'use strict';
/**
 * 通知绑定（产品级）：/api/products/:productId/notifications
 * 产品通过「绑定」引用当前用户的通知模板；邮件模板需指定发送用的 SMTP 配置，
 * Webhook / 钉钉 / 企业微信 / 飞书群机器人模板无需 SMTP。
 * 模板与 SMTP 配置均归属于用户，多个产品可引用同一模板。
 */
const express = require('express');
const db = require('../config/db');
const { can } = require('../middleware/product');
const { validate, pagination } = require('../utils/validate');
const { ok, badRequest, notFound, forbidden } = require('../utils/response');
const { EVENTS, testBinding } = require('../services/notify');

const router = express.Router();
const EVENT_KEYS = EVENTS.map((e) => e.k);

const LIST_SQL = `
  SELECT b.id, b.events, b.is_active, b.created_at,
         t.id AS template_id, t.name AS template_name, t.type AS channel,
         s.id AS smtp_config_id, s.name AS smtp_name
  FROM notify_bindings b
  JOIN notify_templates t ON t.id = b.template_id
  LEFT JOIN smtp_configs s ON s.id = b.smtp_config_id
  WHERE b.product_id = ?`;

// 绑定列表（模板 + SMTP 配置一并返回）
router.get('/', async (req, res, next) => {
  try {
    const rows = await db.query(`${LIST_SQL} ORDER BY b.id DESC`, [req.product.id]);
    return ok(res, { bindings: rows });
  } catch (e) { next(e); }
});

// 引入模板
router.post('/', async (req, res, next) => {
  try {
    if (!can(req.member, 'settings')) return next(forbidden('无权限'));
    const v = validate(req.body, {
      template_id: { type: 'int', required: true, min: 1, label: '模板' },
      events: { type: 'array', max: 10 },
      smtp_config_id: { type: 'int', min: 1 },
      is_active: { type: 'boolean', default: true },
    });
    // 模板必须属于当前用户（模板归属于用户）
    const tpl = await db.queryOne('SELECT * FROM notify_templates WHERE id = ? AND user_id = ?', [v.template_id, req.user.id]);
    if (!tpl) return next(notFound('模板不存在或不属于你'));
    const badEvents = (v.events || []).filter((e) => !EVENT_KEYS.includes(e));
    if (badEvents.length) return next(badRequest(`不支持的事件：${badEvents.join(', ')}`));
    let smtpConfigId = null;
    if (tpl.type === 'email') {
      if (!v.smtp_config_id) return next(badRequest('邮件模板需选择发送用的 SMTP 配置'));
      const cfg = await db.queryOne('SELECT id FROM smtp_configs WHERE id = ? AND user_id = ?', [v.smtp_config_id, req.user.id]);
      if (!cfg) return next(notFound('SMTP 配置不存在或不属于你'));
      smtpConfigId = cfg.id;
    }
    const r = await db.exec(
      'INSERT INTO notify_bindings (product_id, template_id, smtp_config_id, events, is_active) VALUES (?,?,?,?,?)',
      [req.product.id, tpl.id, smtpConfigId, JSON.stringify(v.events || []), v.is_active ? 1 : 0]
    );
    const row = await db.queryOne(`${LIST_SQL} AND b.id = ?`, [req.product.id, r.insertId]);
    return ok(res, { binding: row }, '已引入模板');
  } catch (e) { next(e); }
});

// 更新绑定（事件 / SMTP 配置 / 启停）
router.patch('/:id(\\d+)', async (req, res, next) => {
  try {
    if (!can(req.member, 'settings')) return next(forbidden('无权限'));
    const b = await db.queryOne('SELECT * FROM notify_bindings WHERE id = ? AND product_id = ?', [req.params.id, req.product.id]);
    if (!b) return next(notFound('绑定不存在'));
    const v = validate(req.body, {
      events: { type: 'array', max: 10 },
      smtp_config_id: { type: 'int', min: 1 },
      is_active: { type: 'boolean' },
    });
    const badEvents = (v.events || []).filter((e) => !EVENT_KEYS.includes(e));
    if (badEvents.length) return next(badRequest(`不支持的事件：${badEvents.join(', ')}`));
    const sets = []; const params = [];
    if (v.events !== undefined) { sets.push('events = ?'); params.push(JSON.stringify(v.events)); }
    if (v.is_active !== undefined) { sets.push('is_active = ?'); params.push(v.is_active ? 1 : 0); }
    if (v.smtp_config_id !== undefined) {
      // 邮件模板必须保留一个可用 SMTP；Webhook / 群机器人模板无需 SMTP
      const tpl = await db.queryOne('SELECT type FROM notify_templates WHERE id = ?', [b.template_id]);
      if (tpl && tpl.type === 'email') {
        const cfg = await db.queryOne('SELECT id FROM smtp_configs WHERE id = ? AND user_id = ?', [v.smtp_config_id, req.user.id]);
        if (!cfg) return next(notFound('SMTP 配置不存在或不属于你'));
        sets.push('smtp_config_id = ?'); params.push(cfg.id);
      } else {
        sets.push('smtp_config_id = ?'); params.push(null);
      }
    }
    if (sets.length) { params.push(b.id); await db.exec(`UPDATE notify_bindings SET ${sets.join(', ')} WHERE id = ?`, params); }
    const row = await db.queryOne(`${LIST_SQL} AND b.id = ?`, [req.product.id, b.id]);
    return ok(res, { binding: row }, '已保存');
  } catch (e) { next(e); }
});

// 解除绑定
router.delete('/:id(\\d+)', async (req, res, next) => {
  try {
    if (!can(req.member, 'settings')) return next(forbidden('无权限'));
    const b = await db.queryOne('SELECT id FROM notify_bindings WHERE id = ? AND product_id = ?', [req.params.id, req.product.id]);
    if (!b) return next(notFound('绑定不存在'));
    await db.exec('DELETE FROM notify_bindings WHERE id = ?', [b.id]);
    return ok(res, { success: true }, '已解除绑定');
  } catch (e) { next(e); }
});

// 本产品的投递记录
router.get('/deliveries', async (req, res, next) => {
  try {
    const { page, pageSize, offset } = pagination(req.query, 20);
    const rows = await db.query(
      `SELECT d.*, t.name AS template_name
       FROM notify_deliveries d
       LEFT JOIN notify_templates t ON t.id = d.template_id
       WHERE d.product_id = ? ORDER BY d.id DESC LIMIT ? OFFSET ?`,
      [req.product.id, pageSize, offset]
    );
    const t = await db.queryOne('SELECT COUNT(*) AS c FROM notify_deliveries WHERE product_id = ?', [req.product.id]);
    return ok(res, {
      list: rows, total: t.c, page, pageSize, totalPages: Math.ceil(t.c / pageSize) || 1,
    });
  } catch (e) { next(e); }
});

// 测试该绑定（用产品最近一条反馈做变量渲染）
router.post('/:id(\\d+)/test', async (req, res, next) => {
  try {
    if (!can(req.member, 'settings')) return next(forbidden('无权限'));
    const b = await db.queryOne('SELECT id FROM notify_bindings WHERE id = ? AND product_id = ?', [req.params.id, req.product.id]);
    if (!b) return next(notFound('绑定不存在'));
    const r = await testBinding(b.id);
    return ok(res, { success: !!r.ok, error: r.error || null });
  } catch (e) { next(e); }
});

module.exports = router;
