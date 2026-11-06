'use strict';
const express = require('express');
const db = require('../config/db');
const { can } = require('../middleware/product');
const { validate } = require('../utils/validate');
const { ok, badRequest, notFound, forbidden } = require('../utils/response');

const router = express.Router();

router.get('/', async (req, res, next) => {
  try {
    const rows = await db.query('SELECT * FROM faqs WHERE product_id = ? ORDER BY sort_order ASC, id ASC', [req.product.id]);
    return ok(res, { faqs: rows });
  } catch (e) { next(e); }
});

router.post('/', async (req, res, next) => {
  try {
    if (!can(req.member, 'manage')) return next(forbidden('无权限'));
    const v = validate(req.body, {
      question: { type: 'string', required: true, min: 1, max: 255, label: '问题' },
      answer: { type: 'string', required: true, max: 5000, label: '答案' },
      sort_order: { type: 'int', default: 0 },
      is_published: { type: 'boolean', default: true },
    });
    const r = await db.exec('INSERT INTO faqs (product_id, question, answer, sort_order, is_published) VALUES (?,?,?,?,?)',
      [req.product.id, v.question, v.answer, v.sort_order, v.is_published ? 1 : 0]);
    return ok(res, { faq: await db.queryOne('SELECT * FROM faqs WHERE id = ?', [r.insertId]) });
  } catch (e) { next(e); }
});

router.patch('/:faqId', async (req, res, next) => {
  try {
    if (!can(req.member, 'manage')) return next(forbidden('无权限'));
    const faq = await db.queryOne('SELECT * FROM faqs WHERE id = ? AND product_id = ?', [req.params.faqId, req.product.id]);
    if (!faq) return next(notFound('FAQ 不存在'));
    const v = validate(req.body, {
      question: { type: 'string', min: 1, max: 255 },
      answer: { type: 'string', max: 5000 },
      sort_order: { type: 'int' },
      is_published: { type: 'boolean' },
    });
    const sets = []; const params = [];
    for (const [k, val] of Object.entries(v)) { sets.push(`${k} = ?`); params.push(k === 'is_published' ? (val ? 1 : 0) : val); }
    if (sets.length) { params.push(faq.id); await db.exec(`UPDATE faqs SET ${sets.join(', ')} WHERE id = ?`, params); }
    return ok(res, { faq: await db.queryOne('SELECT * FROM faqs WHERE id = ?', [faq.id]) });
  } catch (e) { next(e); }
});

router.delete('/:faqId', async (req, res, next) => {
  try {
    if (!can(req.member, 'manage')) return next(forbidden('无权限'));
    const faq = await db.queryOne('SELECT * FROM faqs WHERE id = ? AND product_id = ?', [req.params.faqId, req.product.id]);
    if (!faq) return next(notFound('FAQ 不存在'));
    await db.exec('DELETE FROM faqs WHERE id = ?', [faq.id]);
    return ok(res, { success: true });
  } catch (e) { next(e); }
});

module.exports = router;
