'use strict';
const express = require('express');
const db = require('../config/db');
const { requireAuth } = require('../middleware/auth');
const { ok, notFound } = require('../utils/response');
const { pagination } = require('../utils/validate');

const router = express.Router();
router.use(requireAuth);

// 我的通知
router.get('/', async (req, res, next) => {
  try {
    const { page, pageSize, offset } = pagination(req.query, 20);
    const rows = await db.query(
      'SELECT * FROM notifications WHERE user_id = ? ORDER BY created_at DESC LIMIT ? OFFSET ?',
      [req.user.id, pageSize, offset]
    );
    const t = await db.queryOne('SELECT COUNT(*) AS c FROM notifications WHERE user_id = ?', [req.user.id]);
    const unread = await db.queryOne('SELECT COUNT(*) AS c FROM notifications WHERE user_id = ? AND is_read = 0', [req.user.id]);
    return ok(res, {
      list: rows,
      total: t.c,
      page,
      pageSize,
      totalPages: Math.ceil(t.c / pageSize) || 1,
      unread: unread.c,
    });
  } catch (e) { next(e); }
});

router.patch('/:id/read', async (req, res, next) => {
  try {
    await db.exec('UPDATE notifications SET is_read = 1 WHERE id = ? AND user_id = ?', [req.params.id, req.user.id]);
    return ok(res, { success: true });
  } catch (e) { next(e); }
});

router.post('/read-all', async (req, res, next) => {
  try {
    await db.exec('UPDATE notifications SET is_read = 1 WHERE user_id = ?', [req.user.id]);
    return ok(res, { success: true });
  } catch (e) { next(e); }
});

router.delete('/:id', async (req, res, next) => {
  try {
    await db.exec('DELETE FROM notifications WHERE id = ? AND user_id = ?', [req.params.id, req.user.id]);
    return ok(res, { success: true });
  } catch (e) { next(e); }
});

module.exports = router;
