'use strict';
const express = require('express');
const db = require('../config/db');
const { can } = require('../middleware/product');
const { validate } = require('../utils/validate');
const { ok, fail, badRequest, notFound, forbidden } = require('../utils/response');

const router = express.Router();

// 列表
router.get('/', async (req, res, next) => {
  try {
    const rows = await db.query(
      'SELECT * FROM categories WHERE product_id = ? ORDER BY sort_order ASC, id ASC',
      [req.product.id]
    );
    return ok(res, { categories: rows });
  } catch (e) {
    next(e);
  }
});

// 创建
router.post('/', async (req, res, next) => {
  try {
    if (!can(req.member, 'category')) return next(forbidden('无权限管理分类'));
    const v = validate(req.body, {
      name: { type: 'string', required: true, min: 1, max: 60, label: '分类名称' },
      color: { type: 'string', max: 20, default: '#6366F1' },
      icon: { type: 'string', max: 40 },
      description: { type: 'string', max: 255 },
      sort_order: { type: 'int', default: 0 },
    });
    const slug = require('../utils/ids').slugify(v.name, 'cat') + '-' + require('../utils/ids').shortId(4);
    const result = await db.exec(
      'INSERT INTO categories (product_id, name, slug, color, icon, description, sort_order) VALUES (?,?,?,?,?,?,?)',
      [req.product.id, v.name, slug, v.color, v.icon || null, v.description || null, v.sort_order]
    );
    const category = await db.queryOne('SELECT * FROM categories WHERE id = ?', [result.insertId]);
    return ok(res, { category });
  } catch (e) {
    next(e);
  }
});

// 更新
router.patch('/:categoryId', async (req, res, next) => {
  try {
    if (!can(req.member, 'category')) return next(forbidden('无权限管理分类'));
    const category = await db.queryOne('SELECT * FROM categories WHERE id = ? AND product_id = ?', [req.params.categoryId, req.product.id]);
    if (!category) return next(notFound('分类不存在'));
    const v = validate(req.body, {
      name: { type: 'string', min: 1, max: 60 },
      color: { type: 'string', max: 20 },
      icon: { type: 'string', max: 40 },
      description: { type: 'string', max: 255 },
      sort_order: { type: 'int' },
    });
    const sets = [];
    const params = [];
    for (const [k, val] of Object.entries(v)) { sets.push(`${k} = ?`); params.push(val); }
    if (sets.length) { params.push(category.id); await db.exec(`UPDATE categories SET ${sets.join(', ')} WHERE id = ?`, params); }
    return ok(res, { category: await db.queryOne('SELECT * FROM categories WHERE id = ?', [category.id]) });
  } catch (e) {
    next(e);
  }
});

// 删除（其下帖子置空分类）
router.delete('/:categoryId', async (req, res, next) => {
  try {
    if (!can(req.member, 'category')) return next(forbidden('无权限管理分类'));
    const category = await db.queryOne('SELECT * FROM categories WHERE id = ? AND product_id = ?', [req.params.categoryId, req.product.id]);
    if (!category) return next(notFound('分类不存在'));
    if (category.is_default) return next(forbidden('默认分类不可删除'));
    await db.exec('UPDATE posts SET category_id = NULL WHERE category_id = ?', [category.id]);
    await db.exec('DELETE FROM categories WHERE id = ?', [category.id]);
    return ok(res, { success: true });
  } catch (e) {
    next(e);
  }
});

module.exports = router;
