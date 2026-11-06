'use strict';
const express = require('express');
const db = require('../config/db');
const { can } = require('../middleware/product');
const { validate } = require('../utils/validate');
const { ok, badRequest, notFound, forbidden } = require('../utils/response');

const router = express.Router();

router.get('/', async (req, res, next) => {
  try {
    const rows = await db.query('SELECT * FROM changelogs WHERE product_id = ? ORDER BY published_at DESC, id DESC', [req.product.id]);
    return ok(res, { changelogs: rows });
  } catch (e) { next(e); }
});

router.post('/', async (req, res, next) => {
  try {
    if (!can(req.member, 'manage')) return next(forbidden('无权限'));
    const v = validate(req.body, {
      title: { type: 'string', required: true, min: 1, max: 200, label: '标题' },
      content: { type: 'string', max: 5000 },
      version: { type: 'string', max: 40 },
      status: { type: 'enum', values: ['planned', 'in_progress', 'released'], default: 'planned' },
      is_published: { type: 'boolean', default: false },
    });
    const r = await db.exec(
      'INSERT INTO changelogs (product_id, title, content, version, status, is_published) VALUES (?,?,?,?,?,?)',
      [req.product.id, v.title, v.content || null, v.version || null, v.status, v.is_published ? 1 : 0]
    );
    if (v.is_published) await db.exec("UPDATE changelogs SET published_at = NOW() WHERE id = ? AND published_at IS NULL", [r.insertId]);
    return ok(res, { changelog: await db.queryOne('SELECT * FROM changelogs WHERE id = ?', [r.insertId]) });
  } catch (e) { next(e); }
});

router.patch('/:id', async (req, res, next) => {
  try {
    if (!can(req.member, 'manage')) return next(forbidden('无权限'));
    const cl = await db.queryOne('SELECT * FROM changelogs WHERE id = ? AND product_id = ?', [req.params.id, req.product.id]);
    if (!cl) return next(notFound('记录不存在'));
    const v = validate(req.body, {
      title: { type: 'string', min: 1, max: 200 },
      content: { type: 'string', max: 5000 },
      version: { type: 'string', max: 40 },
      status: { type: 'enum', values: ['planned', 'in_progress', 'released'] },
      is_published: { type: 'boolean' },
    });
    const sets = []; const params = [];
    for (const [k, val] of Object.entries(v)) {
      if (k === 'is_published') { sets.push(`is_published = ?`); params.push(val ? 1 : 0); }
      else { sets.push(`${k} = ?`); params.push(val); }
    }
    if (sets.length) {
      params.push(cl.id);
      await db.exec(`UPDATE changelogs SET ${sets.join(', ')} WHERE id = ?`, params);
      if (v.is_published) await db.exec("UPDATE changelogs SET published_at = NOW() WHERE id = ? AND published_at IS NULL", [cl.id]);
    }
    return ok(res, { changelog: await db.queryOne('SELECT * FROM changelogs WHERE id = ?', [cl.id]) });
  } catch (e) { next(e); }
});

router.delete('/:id', async (req, res, next) => {
  try {
    if (!can(req.member, 'manage')) return next(forbidden('无权限'));
    const cl = await db.queryOne('SELECT * FROM changelogs WHERE id = ? AND product_id = ?', [req.params.id, req.product.id]);
    if (!cl) return next(notFound('记录不存在'));
    await db.exec('DELETE FROM changelogs WHERE id = ?', [cl.id]);
    return ok(res, { success: true });
  } catch (e) { next(e); }
});

module.exports = router;
