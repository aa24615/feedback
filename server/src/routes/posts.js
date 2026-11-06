'use strict';
const express = require('express');
const db = require('../config/db');
const { can } = require('../middleware/product');
const { validate, pagination, orderBy } = require('../utils/validate');
const { ok, okPage, badRequest, notFound, forbidden } = require('../utils/response');
const { attachTags, attachAttachments } = require('../utils/postView');
const { notifyMembers, logActivity } = require('../utils/events');
const { dispatch } = require('../services/notify');

const router = express.Router();

const SORT_MAP = {
  newest: 'p.created_at DESC',
  oldest: 'p.created_at ASC',
  votes: 'p.vote_count DESC, p.created_at DESC',
  comments: 'p.comment_count DESC, p.created_at DESC',
  updated: 'p.updated_at DESC',
  hot: 'p.vote_count DESC',
};

const POST_SELECT = `p.*, c.name AS category_name, c.color AS category_color, c.slug AS category_slug,
  u.nickname AS assignee_name`;

// 列表（含隐藏/私密/待审核，仅团队成员可见）
router.get('/', async (req, res, next) => {
  try {
    const { page, pageSize, offset } = pagination(req.query, 20);
    const where = ['p.product_id = ?', 'p.deleted_at IS NULL'];
    const params = [req.product.id];
    const type = req.query.type;
    if (type && ['feedback', 'bug', 'complaint', 'question'].includes(type)) {
      where.push('p.type = ?');
      params.push(type);
    }
    if (req.query.categoryId) { where.push('p.category_id = ?'); params.push(req.query.categoryId); }
    if (req.query.status) { where.push('p.status = ?'); params.push(req.query.status); }
    if (req.query.reviewState) { where.push('p.review_state = ?'); params.push(req.query.reviewState); }
    if (req.query.isPrivate === '1') where.push('p.is_private = 1');
    if (req.query.isOfficial === '1') where.push('p.is_official = 1');
    if (req.query.authorId) { where.push('p.author_id = ?'); params.push(req.query.authorId); }
    if (req.query.tagId) { where.push('p.id IN (SELECT post_id FROM post_tags WHERE tag_id = ?)'); params.push(req.query.tagId); }
    if (req.query.keyword) { where.push('(p.title LIKE ? OR p.content LIKE ?)'); params.push(`%${req.query.keyword}%`, `%${req.query.keyword}%`); }

    const sort = orderBy(req.query.sort, SORT_MAP, 'p.created_at DESC');
    const listSql = `SELECT ${POST_SELECT} FROM posts p
      LEFT JOIN categories c ON c.id = p.category_id
      LEFT JOIN users u ON u.id = p.assignee_id
      WHERE ${where.join(' AND ')} ORDER BY ${sort} LIMIT ? OFFSET ?`;
    const rows = await db.query(listSql, [...params, pageSize, offset]);
    await attachTags(rows);
    await attachAttachments(rows);
    const countRow = await db.queryOne(`SELECT COUNT(*) AS c FROM posts p WHERE ${where.join(' AND ')}`, params);
    return okPage(res, rows, countRow.c, page, pageSize);
  } catch (e) {
    next(e);
  }
});

// 导出 CSV（支持与列表相同的筛选条件）
// 注意：必须注册在 /:postId 之前，否则 /export 会被当成帖子 id
router.get('/export', async (req, res, next) => {
  try {
    if (!can(req.member, 'read')) return next(forbidden('无权限导出数据'));
    const where = ['p.product_id = ?', 'p.deleted_at IS NULL'];
    const params = [req.product.id];
    if (req.query.status) { where.push('p.status = ?'); params.push(req.query.status); }
    if (req.query.categoryId) { where.push('p.category_id = ?'); params.push(req.query.categoryId); }
    if (req.query.type && ['feedback', 'bug', 'complaint', 'question'].includes(req.query.type)) {
      where.push('p.type = ?');
      params.push(req.query.type);
    }
    if (req.query.keyword) {
      where.push('(p.title LIKE ? OR p.content LIKE ?)');
      params.push(`%${req.query.keyword}%`, `%${req.query.keyword}%`);
    }
    if (req.query.from) { where.push('p.created_at >= ?'); params.push(`${req.query.from} 00:00:00`); }
    if (req.query.to) { where.push('p.created_at <= ?'); params.push(`${req.query.to} 23:59:59`); }

    const rows = await db.query(
      `SELECT p.seq, p.title, p.content, p.type, c.name AS category_name, p.status,
              p.author_name, eu.email AS author_email, p.contact_type, p.contact_value,
              p.vote_count, p.comment_count, p.created_at
       FROM posts p
       LEFT JOIN categories c ON c.id = p.category_id
       LEFT JOIN end_users eu ON eu.id = p.author_id
       WHERE ${where.join(' AND ')}
       ORDER BY p.id ASC
       LIMIT 20000`,
      params
    );

    const TYPE_LABEL = { feedback: '建议', bug: '问题', complaint: '吐槽', question: '咨询' };
    const STATUS_LABEL = { pending: '待处理', planned: '已计划', in_progress: '处理中', resolved: '已解决', closed: '已关闭', declined: '已拒绝' };
    const CONTACT_LABEL = { qq: 'QQ', wechat: '微信', email: '邮箱', other: '其他' };
    const fmtContact = (t, val) => (val ? `${CONTACT_LABEL[t] || '其他'} · ${val}` : '');
    const fmtDate = (d) => {
      if (!(d instanceof Date)) return d == null ? '' : String(d);
      const p = (n) => String(n).padStart(2, '0');
      return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
    };
    const esc = (v) => {
      const s = v == null ? '' : String(v);
      return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    };
    const header = ['编号', '标题', '内容', '类型', '分类', '状态', '提交人', '邮箱', '联系方式', '投票数', '评论数', '提交时间'];
    const lines = [header.join(',')];
    for (const r of rows) {
      lines.push([
        `#${r.seq}`,
        esc(r.title),
        esc(r.content),
        TYPE_LABEL[r.type] || r.type,
        esc(r.category_name),
        STATUS_LABEL[r.status] || r.status,
        esc(r.author_name),
        esc(r.author_email),
        esc(fmtContact(r.contact_type, r.contact_value)),
        r.vote_count,
        r.comment_count,
        esc(fmtDate(r.created_at)),
      ].join(','));
    }
    const csv = '\uFEFF' + lines.join('\r\n');
    const filename = `feedback-${req.product.slug}-${new Date().toISOString().slice(0, 10)}.csv`;
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    return res.send(csv);
  } catch (e) {
    next(e);
  }
});

// 详情
router.get('/:postId', async (req, res, next) => {
  try {
    const post = await db.queryOne(
      `SELECT ${POST_SELECT} FROM posts p
       LEFT JOIN categories c ON c.id = p.category_id
       LEFT JOIN users u ON u.id = p.assignee_id
       WHERE p.id = ? AND p.product_id = ? AND p.deleted_at IS NULL`,
      [req.params.postId, req.product.id]
    );
    if (!post) return next(notFound('帖子不存在'));
    await attachTags([post]);
    await attachAttachments([post]);
    return ok(res, { post });
  } catch (e) {
    next(e);
  }
});

// 更新
router.patch('/:postId', async (req, res, next) => {
  try {
    if (!can(req.member, 'manage')) return next(forbidden('无权限管理该反馈'));
    const post = await db.queryOne('SELECT * FROM posts WHERE id = ? AND product_id = ? AND deleted_at IS NULL', [req.params.postId, req.product.id]);
    if (!post) return next(notFound('帖子不存在'));
    const v = validate(req.body, {
      title: { type: 'string', min: 1, max: 200 },
      content: { type: 'string', max: 5000 },
      type: { type: 'enum', values: ['feedback', 'bug', 'complaint', 'question'] },
      category_id: { type: 'int' },
      assignee_id: { type: 'int' },
      is_pinned: { type: 'boolean' },
      is_hidden: { type: 'boolean' },
      is_private: { type: 'boolean' },
      status: { type: 'enum', values: ['pending', 'planned', 'in_progress', 'resolved', 'closed', 'declined'] },
      review_state: { type: 'enum', values: ['approved', 'pending', 'rejected'] },
      tag_ids: { type: 'array', max: 10, item: 'int' },
    });

    const oldStatus = post.status;
    const sets = [];
    const params = [];
    for (const k of ['title', 'content', 'type', 'category_id', 'assignee_id', 'review_state']) {
      if (v[k] !== undefined) { sets.push(`${k} = ?`); params.push(v[k]); }
    }
    for (const k of ['is_pinned', 'is_hidden', 'is_private']) {
      if (v[k] !== undefined) { sets.push(`${k} = ?`); params.push(v[k] ? 1 : 0); }
    }
    if (v.status !== undefined) {
      if (!['pending', 'planned', 'in_progress', 'resolved', 'closed', 'declined'].includes(v.status)) return next(badRequest('状态不合法'));
      sets.push('status = ?');
      params.push(v.status);
      sets.push('status_changed_at = NOW()');
    }
    if (sets.length) {
      params.push(post.id);
      await db.exec(`UPDATE posts SET ${sets.join(', ')} WHERE id = ?`, params);
    }

    // 标签同步
    if (v.tag_ids) {
      await db.exec('DELETE FROM post_tags WHERE post_id = ?', [post.id]);
      if (v.tag_ids.length) {
        const vals = v.tag_ids.map((tid) => [post.id, tid]);
        await db.bulkInsert('post_tags', ['post_id', 'tag_id'], vals);
      }
    }

    const updated = await db.queryOne('SELECT * FROM posts WHERE id = ?', [post.id]);

    if (v.status !== undefined && v.status !== oldStatus) {
      await dispatch(req.product.id, 'post.status_changed', { postId: post.id, seq: post.seq, title: post.title, status: v.status, oldStatus });
      // 通知提交者
      if (post.author_id) {
        const eu = await db.queryOne('SELECT * FROM end_users WHERE id = ?', [post.author_id]);
        if (eu && eu.email) {
          const { sendMail } = require('../utils/events');
          sendMail({ to: eu.email, subject: `你的反馈「${post.title}」状态更新为：${v.status}`, text: `查看：产品反馈页` });
        }
      }
      await notifyMembers(req.product.id, { type: 'post.status_changed', title: '反馈状态更新', content: `「${post.title}」→ ${v.status}`, excludeUserId: req.user.id });
    }
    await logActivity({ productId: req.product.id, userId: req.user.id, action: 'post.update', targetType: 'post', targetId: post.id, ip: req.ip });
    return ok(res, { post: updated });
  } catch (e) {
    next(e);
  }
});

// 官方回复
router.post('/:postId/reply', async (req, res, next) => {
  try {
    if (!can(req.member, 'reply')) return next(forbidden('无权限回复'));
    const post = await db.queryOne('SELECT * FROM posts WHERE id = ? AND product_id = ? AND deleted_at IS NULL', [req.params.postId, req.product.id]);
    if (!post) return next(notFound('帖子不存在'));
    const v = validate(req.body, { content: { type: 'string', required: true, min: 1, max: 2000, label: '回复内容' } });
    const isFirstOfficial = post.official_reply_count === 0;
    const result = await db.exec(
      `INSERT INTO comments (post_id, parent_id, author_type, author_id, author_name, author_avatar, content, is_official)
       VALUES (?,?, 'member', ?,?,?,?,1)`,
      [post.id, null, req.user.id, req.user.nickname, req.user.avatar_url || null, v.content]
    );
    const inc = 'official_reply_count = official_reply_count + 1, comment_count = comment_count + 1, last_activity_at = NOW()';
    const sets2 = isFirstOfficial ? `${inc}, responded_at = NOW()` : inc;
    await db.exec(`UPDATE posts SET ${sets2} WHERE id = ?`, [post.id]);

    const comment = await db.queryOne('SELECT * FROM comments WHERE id = ?', [result.insertId]);
    await dispatch(req.product.id, 'comment.created', { postId: post.id, seq: post.seq, commentId: comment.id, official: true, content: v.content });
    if (post.author_id) {
      const eu = await db.queryOne('SELECT * FROM end_users WHERE id = ?', [post.author_id]);
      if (eu) await notifyMembers(req.product.id, { type: 'comment.created', title: '收到官方回复', content: `「${post.title}」`, excludeUserId: req.user.id });
    }
    return ok(res, { comment });
  } catch (e) {
    next(e);
  }
});

// 软删除
router.delete('/:postId', async (req, res, next) => {
  try {
    if (!can(req.member, 'manage')) return next(forbidden('无权限删除该反馈'));
    const post = await db.queryOne('SELECT * FROM posts WHERE id = ? AND product_id = ? AND deleted_at IS NULL', [req.params.postId, req.product.id]);
    if (!post) return next(notFound('帖子不存在'));
    await db.exec('UPDATE posts SET deleted_at = NOW() WHERE id = ?', [post.id]);
    await db.exec('UPDATE products SET post_count = GREATEST(0, post_count - 1) WHERE id = ?', [req.product.id]);
    await logActivity({ productId: req.product.id, userId: req.user.id, action: 'post.delete', targetType: 'post', targetId: post.id, ip: req.ip });
    return ok(res, { success: true });
  } catch (e) {
    next(e);
  }
});

module.exports = router;
