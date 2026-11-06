'use strict';
const express = require('express');
const db = require('../config/db');
const { ok } = require('../utils/response');

const router = express.Router();

router.get('/', async (req, res, next) => {
  try {
    const pid = req.product.id;
    const overview = await db.queryOne(
      `SELECT
        COUNT(*) AS total,
        SUM(status='pending') AS pending,
        SUM(status='planned') AS planned,
        SUM(status='in_progress') AS in_progress,
        SUM(status='resolved') AS resolved,
        SUM(status='closed') AS closed,
        SUM(status='declined') AS declined,
        SUM(review_state='pending') AS pending_review,
        SUM(is_pinned=1) AS pinned
       FROM posts WHERE product_id = ? AND deleted_at IS NULL`,
      [pid]
    );
    const counts = await db.queryOne(
      'SELECT (SELECT COUNT(*) FROM votes v JOIN posts p ON p.id=v.post_id WHERE p.product_id=?) AS total_votes, (SELECT COUNT(*) FROM comments c JOIN posts p ON p.id=c.post_id WHERE p.product_id=?) AS total_comments, (SELECT COUNT(*) FROM end_users WHERE product_id=?) AS end_users',
      [pid, pid, pid]
    );
    overview.total_votes = counts.total_votes || 0;
    overview.total_comments = counts.total_comments || 0;
    overview.end_users = counts.end_users || 0;
    overview.members = req.product.member_count;

    const statusDistribution = await db.query(
      `SELECT status, COUNT(*) AS count FROM posts WHERE product_id = ? AND deleted_at IS NULL GROUP BY status`, [pid]
    );
    const typeDistribution = await db.query(
      `SELECT type, COUNT(*) AS count FROM posts WHERE product_id = ? AND deleted_at IS NULL GROUP BY type`, [pid]
    );
    const categoryDistribution = await db.query(
      `SELECT c.id AS category_id, c.name, c.color, COUNT(p.id) AS count
       FROM categories c LEFT JOIN posts p ON p.category_id = c.id AND p.deleted_at IS NULL AND p.product_id = ?
       WHERE c.product_id = ? GROUP BY c.id ORDER BY c.sort_order ASC, c.id ASC`, [pid, pid]
    );
    const assigneeDistribution = await db.query(
      `SELECT COALESCE(u.nickname, '未分配') AS assignee, COUNT(*) AS count
       FROM posts p LEFT JOIN users u ON u.id = p.assignee_id
       WHERE p.product_id = ? AND p.deleted_at IS NULL AND p.assignee_id IS NOT NULL GROUP BY p.assignee_id`, [pid]
    );
    const topVoted = await db.query(
      `SELECT p.id, p.seq, p.title, p.vote_count, p.status, p.type, c.name AS category_name
       FROM posts p LEFT JOIN categories c ON c.id = p.category_id
       WHERE p.product_id = ? AND p.deleted_at IS NULL AND p.review_state='approved' AND p.is_hidden=0
       ORDER BY p.vote_count DESC LIMIT 10`, [pid]
    );

    // 近 30 天趋势
    const rows = await db.query(
      `SELECT DATE(created_at) AS d, COUNT(*) AS c FROM posts WHERE product_id = ? AND created_at >= DATE_SUB(NOW(), INTERVAL 30 DAY) AND deleted_at IS NULL GROUP BY DATE(created_at)`,
      [pid]
    );
    const resolvedRows = await db.query(
      `SELECT DATE(updated_at) AS d, COUNT(*) AS c FROM posts WHERE product_id = ? AND status='resolved' AND updated_at >= DATE_SUB(NOW(), INTERVAL 30 DAY) AND deleted_at IS NULL GROUP BY DATE(updated_at)`,
      [pid]
    );
    const newMap = {}; const resMap = {};
    rows.forEach((r) => (newMap[r.d] = r.c));
    resolvedRows.forEach((r) => (resMap[r.d] = r.c));
    const trend = [];
    for (let i = 29; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      const key = d.toISOString().slice(0, 10);
      trend.push({ date: key, newPosts: newMap[key] || 0, resolved: resMap[key] || 0 });
    }

    return ok(res, { overview, statusDistribution, typeDistribution, categoryDistribution, assigneeDistribution, topVoted, trend });
  } catch (e) {
    next(e);
  }
});

module.exports = router;
