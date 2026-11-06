'use strict';
const express = require('express');
const db = require('../config/db');
const { can } = require('../middleware/product');
const { validate } = require('../utils/validate');
const { ok, badRequest, notFound, forbidden } = require('../utils/response');

const router = express.Router();

router.get('/', async (req, res, next) => {
  try {
    const rows = await db.query('SELECT * FROM tags WHERE product_id = ? ORDER BY name ASC', [req.product.id]);
    return ok(res, { tags: rows });
  } catch (e) {
    next(e);
  }
});

router.post('/', async (req, res, next) => {
  try {
    if (!can(req.member, 'tag')) return next(forbidden('无权限管理标签'));
    const v = validate(req.body, {
      name: { type: 'string', required: true, min: 1, max: 40, label: '标签名' },
      color: { type: 'string', max: 20, default: '#0EA5E9' },
    });
    const exists = await db.queryOne('SELECT id FROM tags WHERE product_id = ? AND name = ?', [req.product.id, v.name]);
    if (exists) return ok(res, { tag: exists }, '已存在');
    const result = await db.exec('INSERT INTO tags (product_id, name, color) VALUES (?,?,?)', [req.product.id, v.name, v.color]);
    return ok(res, { tag: await db.queryOne('SELECT * FROM tags WHERE id = ?', [result.insertId]) });
  } catch (e) {
    next(e);
  }
});

router.patch('/:tagId', async (req, res, next) => {
  try {
    if (!can(req.member, 'tag')) return next(forbidden('无权限管理标签'));
    const tag = await db.queryOne('SELECT * FROM tags WHERE id = ? AND product_id = ?', [req.params.tagId, req.product.id]);
    if (!tag) return next(notFound('标签不存在'));
    const v = validate(req.body, { name: { type: 'string', min: 1, max: 40 }, color: { type: 'string', max: 20 } });
    const sets = []; const params = [];
    for (const [k, val] of Object.entries(v)) { sets.push(`${k} = ?`); params.push(val); }
    if (sets.length) { params.push(tag.id); await db.exec(`UPDATE tags SET ${sets.join(', ')} WHERE id = ?`, params); }
    return ok(res, { tag: await db.queryOne('SELECT * FROM tags WHERE id = ?', [tag.id]) });
  } catch (e) {
    next(e);
  }
});

router.delete('/:tagId', async (req, res, next) => {
  try {
    if (!can(req.member, 'tag')) return next(forbidden('无权限管理标签'));
    const tag = await db.queryOne('SELECT * FROM tags WHERE id = ? AND product_id = ?', [req.params.tagId, req.product.id]);
    if (!tag) return next(notFound('标签不存在'));
    await db.exec('DELETE FROM post_tags WHERE tag_id = ?', [tag.id]);
    await db.exec('DELETE FROM tags WHERE id = ?', [tag.id]);
    return ok(res, { success: true });
  } catch (e) {
    next(e);
  }
});

module.exports = router;
