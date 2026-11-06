'use strict';
/**
 * 用户 SMTP 配置（用户级）：/api/me/smtp-configs
 * 每个用户可配置多个 SMTP；发送通知邮件时在「通知绑定」里任选其一。
 * 密码仅在创建/更新时写入，任何接口不回明文。
 */
const express = require('express');
const db = require('../config/db');
const { requireAuth } = require('../middleware/auth');
const { validate } = require('../utils/validate');
const { ok, badRequest, notFound } = require('../utils/response');
const { verifySmtp, sendMailVia, invalidateTransport, logDelivery } = require('../services/notify');

const router = express.Router();
router.use(requireAuth);

/** 列表脱敏：password → has_password */
function mask(row) {
  if (!row) return row;
  const { password, ...rest } = row;
  return { ...rest, has_password: !!password };
}

// 我的 SMTP 配置列表
router.get('/', async (req, res, next) => {
  try {
    const rows = await db.query(
      'SELECT id, name, host, port, secure, username, from_name, from_address, is_default, created_at, password FROM smtp_configs WHERE user_id = ? ORDER BY is_default DESC, id DESC',
      [req.user.id]
    );
    return ok(res, { configs: rows.map(mask) });
  } catch (e) { next(e); }
});

// 新建配置
router.post('/', async (req, res, next) => {
  try {
    const v = validate(req.body, {
      name: { type: 'string', required: true, min: 1, max: 120, label: '配置名称' },
      host: { type: 'string', required: true, min: 3, max: 255, label: 'SMTP 服务器' },
      port: { type: 'int', min: 1, max: 65535, default: 465 },
      secure: { type: 'boolean', default: true },
      username: { type: 'string', max: 255 },
      password: { type: 'string', max: 255 },
      from_name: { type: 'string', max: 120 },
      from_address: { type: 'string', max: 160 },
      is_default: { type: 'boolean', default: false },
    });
    if (v.from_address && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v.from_address)) {
      return next(badRequest('发件人地址不合法'));
    }
    if (v.is_default) await db.exec('UPDATE smtp_configs SET is_default = 0 WHERE user_id = ?', [req.user.id]);
    const r = await db.exec(
      `INSERT INTO smtp_configs (user_id, name, host, port, secure, username, password, from_name, from_address, is_default)
       VALUES (?,?,?,?,?,?,?,?,?,?)`,
      [req.user.id, v.name, v.host, v.port, v.secure ? 1 : 0, v.username || null, v.password || null, v.from_name || null, v.from_address || null, v.is_default ? 1 : 0]
    );
    const row = await db.queryOne('SELECT * FROM smtp_configs WHERE id = ?', [r.insertId]);
    return ok(res, { config: mask(row) }, '配置已创建');
  } catch (e) { next(e); }
});

// 更新配置（password 留空 = 不修改）
router.patch('/:id(\\d+)', async (req, res, next) => {
  try {
    const cfg = await db.queryOne('SELECT * FROM smtp_configs WHERE id = ? AND user_id = ?', [req.params.id, req.user.id]);
    if (!cfg) return next(notFound('配置不存在'));
    const v = validate(req.body, {
      name: { type: 'string', min: 1, max: 120 },
      host: { type: 'string', min: 3, max: 255 },
      port: { type: 'int', min: 1, max: 65535 },
      secure: { type: 'boolean' },
      username: { type: 'string', max: 255 },
      password: { type: 'string', max: 255 },
      from_name: { type: 'string', max: 120 },
      from_address: { type: 'string', max: 160 },
      is_default: { type: 'boolean' },
    });
    if (v.from_address && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v.from_address)) {
      return next(badRequest('发件人地址不合法'));
    }
    const sets = []; const params = [];
    if (v.name !== undefined) { sets.push('name = ?'); params.push(v.name); }
    if (v.host !== undefined) { sets.push('host = ?'); params.push(v.host); }
    if (v.port !== undefined) { sets.push('port = ?'); params.push(v.port); }
    if (v.secure !== undefined) { sets.push('secure = ?'); params.push(v.secure ? 1 : 0); }
    if (v.username !== undefined) { sets.push('username = ?'); params.push(v.username || null); }
    if (v.password !== undefined) { sets.push('password = ?'); params.push(v.password || null); }
    if (v.from_name !== undefined) { sets.push('from_name = ?'); params.push(v.from_name || null); }
    if (v.from_address !== undefined) { sets.push('from_address = ?'); params.push(v.from_address || null); }
    if (v.is_default !== undefined) { sets.push('is_default = ?'); params.push(v.is_default ? 1 : 0); }
    if (sets.length) { params.push(cfg.id); await db.exec(`UPDATE smtp_configs SET ${sets.join(', ')} WHERE id = ?`, params); }
    if (v.is_default) await db.exec('UPDATE smtp_configs SET is_default = 0 WHERE user_id = ? AND id <> ?', [req.user.id, cfg.id]);
    invalidateTransport(cfg.id);
    const fresh = await db.queryOne('SELECT * FROM smtp_configs WHERE id = ?', [cfg.id]);
    return ok(res, { config: mask(fresh) }, '已保存');
  } catch (e) { next(e); }
});

// 删除配置（引用了它的通知绑定将变为「未选择 SMTP」，需重新指定）
router.delete('/:id(\\d+)', async (req, res, next) => {
  try {
    const cfg = await db.queryOne('SELECT id FROM smtp_configs WHERE id = ? AND user_id = ?', [req.params.id, req.user.id]);
    if (!cfg) return next(notFound('配置不存在'));
    await db.exec('DELETE FROM smtp_configs WHERE id = ?', [cfg.id]);
    invalidateTransport(cfg.id);
    return ok(res, { success: true }, '已删除');
  } catch (e) { next(e); }
});

// 测试连通性：verify + 发一封测试邮件到当前登录账号
router.post('/:id(\\d+)/test', async (req, res, next) => {
  try {
    const cfg = await db.queryOne('SELECT * FROM smtp_configs WHERE id = ? AND user_id = ?', [req.params.id, req.user.id]);
    if (!cfg) return next(notFound('配置不存在'));
    const vr = await verifySmtp(cfg);
    if (!vr.ok) {
      await logDelivery({ product_id: null, channel: 'email', event: 'test', target: req.user.email, success: false, error: vr.error, is_test: 1 });
      return ok(res, { success: false, error: `连接失败：${vr.error}` });
    }
    const r = await sendMailVia(cfg, {
      to: req.user.email,
      subject: '【反馈墙】SMTP 配置测试',
      text: `这是一封来自「${cfg.name}」的测试邮件。\n发送时间：${new Date().toLocaleString('zh-CN', { hour12: false })}`,
    });
    await logDelivery({ product_id: null, channel: 'email', event: 'test', target: req.user.email, success: r.ok, error: r.error, is_test: 1 });
    return ok(res, r.ok ? { success: true } : { success: false, error: `发送失败：${r.error}` });
  } catch (e) { next(e); }
});

module.exports = router;
