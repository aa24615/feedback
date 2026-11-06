'use strict';
const express = require('express');
const bcrypt = require('bcryptjs');
const db = require('../config/db');
const { can } = require('../middleware/product');
const { validate } = require('../utils/validate');
const { ok, badRequest, notFound, forbidden } = require('../utils/response');
const { randomToken } = require('../utils/ids');

const router = express.Router();

router.get('/', async (req, res, next) => {
  try {
    const rows = await db.query('SELECT id, name, scopes, last_used_at, revoked, created_at FROM api_tokens WHERE product_id = ? ORDER BY id DESC', [req.product.id]);
    return ok(res, { tokens: rows });
  } catch (e) { next(e); }
});

router.post('/', async (req, res, next) => {
  try {
    if (!can(req.member, 'settings')) return next(forbidden('无权限'));
    const v = validate(req.body, {
      name: { type: 'string', required: true, min: 1, max: 80, label: '名称' },
      scopes: { type: 'array', max: 10 },
    });
    const raw = randomToken(32);
    const r = await db.exec(
      'INSERT INTO api_tokens (product_id, name, token, scopes) VALUES (?,?,?,?)',
      [req.product.id, v.name, raw, JSON.stringify(v.scopes || ['read', 'write'])]
    );
    const token = await db.queryOne('SELECT id, name, scopes, created_at FROM api_tokens WHERE id = ?', [r.insertId]);
    // token 仅此一次明文返回
    return ok(res, { token: { ...token, token: raw } }, '请妥善保存，token 仅显示一次');
  } catch (e) { next(e); }
});

router.delete('/:id', async (req, res, next) => {
  try {
    if (!can(req.member, 'settings')) return next(forbidden('无权限'));
    const t = await db.queryOne('SELECT id FROM api_tokens WHERE id = ? AND product_id = ?', [req.params.id, req.product.id]);
    if (!t) return next(notFound('密钥不存在'));
    await db.exec('UPDATE api_tokens SET revoked = 1 WHERE id = ?', [t.id]);
    return ok(res, { success: true });
  } catch (e) { next(e); }
});

module.exports = router;
