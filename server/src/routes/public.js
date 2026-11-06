'use strict';
const express = require('express');
const db = require('../config/db');
const config = require('../config/env');
const { signEndUser } = require('../middleware/auth');
const { validate, pagination, orderBy } = require('../utils/validate');
const { ok, okPage, badRequest, notFound, forbidden } = require('../utils/response');
const { attachTags, attachAttachments } = require('../utils/postView');
const { getStorage } = require('../services/storage');
const { notifyMembers, logActivity } = require('../utils/events');
const { dispatch } = require('../services/notify');
const { assetUrl } = require('../utils/assetUrl');

const router = express.Router();

const PUBLIC_SORT = {
  newest: 'p.created_at DESC',
  votes: 'p.vote_count DESC, p.created_at DESC',
  comments: 'p.comment_count DESC, p.created_at DESC',
};

// 仅后台可见字段：C 端接口一律裁剪后再返回，避免联系方式等内部数据外泄
const PRIVATE_FIELDS = ['contact_type', 'contact_value'];
const stripPrivate = (row) => {
  if (row) PRIVATE_FIELDS.forEach((f) => { delete row[f]; });
  return row;
};

/**
 * 校验并清洗提交的附件列表：
 * URL 必须指向当前存储驱动托管的对象（本地 /uploads/posts/... 或 COS/OSS 桶内 key），
 * 且真实存在（先经 /p/:slug/upload 上传）。
 * 返回 [{ file_name, url, mime_type, size }]；不合法直接抛 400。
 */
async function normalizeAttachments(list) {
  if (list === undefined || list === null) return [];
  if (!Array.isArray(list)) throw badRequest('附件格式有误');
  if (list.length > config.maxPostAttachments) throw badRequest(`最多上传 ${config.maxPostAttachments} 个附件`);
  const store = await getStorage();
  const out = [];
  for (const a of list) {
    if (!a || typeof a.url !== 'string') throw badRequest('附件信息不完整');
    const url = a.url.trim();
    if (!store.parseKey(url)) throw badRequest('附件地址不合法');
    if (!(await store.exists(url))) throw badRequest('附件不存在或已被清理，请重新上传');
    const mime = String(a.mime_type || '');
    if (!mime.startsWith('image/') && !mime.startsWith('video/')) throw badRequest('仅支持图片或视频附件');
    out.push({
      file_name: String(a.file_name || 'file').slice(0, 200),
      url,
      mime_type: mime.slice(0, 100),
      size: Math.max(0, Math.min(parseInt(a.size, 10) || 0, 2147483647)),
    });
  }
  return out;
}

/**
 * 是否隐藏「由反馈墙提供」署名：产品开启 hide_branding 即生效。
 */
async function brandingHidden(product) {
  return !!product.hide_branding;
}

/** 公开产品信息 + 分类 + 统计 */
router.get('/', async (req, res, next) => {
  try {
    const p = req.product;
    const categories = await db.query('SELECT id,name,slug,color,icon FROM categories WHERE product_id = ? ORDER BY sort_order ASC, id ASC', [p.id]);
    const stats = await db.queryOne(
      "SELECT COUNT(*) AS total, SUM(status='pending') AS pending, SUM(status='planned') AS planned, SUM(status='in_progress') AS in_progress, SUM(status='resolved') AS resolved, SUM(status='closed') AS closed, SUM(status='declined') AS declined FROM posts WHERE product_id = ? AND deleted_at IS NULL AND review_state='approved' AND is_hidden=0",
      [p.id]
    );
    const info = {
      id: p.id, name: p.name, slug: p.slug, short_desc: p.short_desc, description: p.description,
      logo_url: assetUrl(p.logo_url), website: p.website, theme_color: p.theme_color, welcome_message: p.welcome_message,
      visibility: p.visibility, allow_anonymous: !!p.allow_anonymous, require_email: !!p.require_email,
      allow_vote: !!p.allow_vote, allow_comment: !!p.allow_comment, contact_fields: p.contact_fields,
      hide_branding: await brandingHidden(p),
    };
    return ok(res, { product: info, categories, stats });
  } catch (e) {
    next(e);
  }
});

/** 建立/恢复反馈者身份（游客 / 邮箱 / 自定义身份） */
router.post('/session', async (req, res, next) => {
  try {
    const p = req.product;
    const v = validate(req.body, {
      guestToken: { type: 'string', max: 120 },
      email: { type: 'string', max: 160 },
      nickname: { type: 'string', max: 60 },
      externalId: { type: 'string', max: 120 },
      avatar_url: { type: 'string', max: 500 },
      meta: { type: 'object' },
    });
    let externalId; let identityType; let nickname; let email;
    if (v.externalId) { externalId = `ext:${v.externalId}`; identityType = 'custom'; nickname = v.nickname || '用户'; }
    else if (v.email) { externalId = `email:${v.email.toLowerCase()}`; identityType = 'email'; nickname = v.nickname || v.email.split('@')[0]; email = v.email; }
    else if (v.guestToken) { externalId = v.guestToken; identityType = 'guest'; nickname = v.nickname || '游客'; }
    else return next(badRequest('缺少必要的身份标识（guestToken / email / externalId）'));

    let eu = await db.queryOne('SELECT * FROM end_users WHERE product_id = ? AND external_id = ?', [p.id, externalId]);
    if (!eu) {
      const r = await db.exec(
        'INSERT INTO end_users (product_id, external_id, identity_type, nickname, email, avatar_url, meta) VALUES (?,?,?,?,?,?,?)',
        [p.id, externalId, identityType, nickname, email || null, v.avatar_url || null, v.meta ? JSON.stringify(v.meta) : null]
      );
      eu = await db.queryOne('SELECT * FROM end_users WHERE id = ?', [r.insertId]);
    } else {
      if (v.meta && identityType === 'custom') {
        await db.exec('UPDATE end_users SET meta = ?, last_seen_at = NOW() WHERE id = ?', [JSON.stringify(v.meta), eu.id]);
      }
    }
    await db.exec('UPDATE end_users SET last_seen_at = NOW() WHERE id = ?', [eu.id]);
    const token = signEndUser(p.id, eu.id);
    return ok(res, {
      endUser: { id: eu.id, nickname: eu.nickname, avatar_url: assetUrl(eu.avatar_url), identity_type: eu.identity_type, email: eu.email },
      token,
    });
  } catch (e) {
    next(e);
  }
});

/** 公开反馈列表 */
router.get('/posts', async (req, res, next) => {
  try {
    const { page, pageSize, offset } = pagination(req.query, 20);
    const p = req.product;
    const where = ['p.product_id = ?', "p.deleted_at IS NULL", "p.review_state = 'approved'", 'p.is_hidden = 0'];
    const params = [p.id];

    // 登录态的反馈者能看到自己的私密/待审核帖子
    let authorFilter = '';
    if (req.endUser) {
      where.push('(p.is_private = 0 OR p.author_id = ?)');
      params.push(req.endUser.id);
      authorFilter = req.endUser.id;
    } else {
      where.push('p.is_private = 0');
    }

    if (req.query.type && ['feedback', 'bug', 'complaint', 'question'].includes(req.query.type)) { where.push('p.type = ?'); params.push(req.query.type); }
    if (req.query.categoryId) { where.push('p.category_id = ?'); params.push(req.query.categoryId); }
    if (req.query.status) { where.push('p.status = ?'); params.push(req.query.status); }
    if (req.query.tagId) { where.push('p.id IN (SELECT post_id FROM post_tags WHERE tag_id = ?)'); params.push(req.query.tagId); }
    if (req.query.keyword) { where.push('(p.title LIKE ? OR p.content LIKE ?)'); params.push(`%${req.query.keyword}%`, `%${req.query.keyword}%`); }
    if (req.query.mine === '1' && req.endUser) { where.push('p.author_id = ?'); params.push(req.endUser.id); }

    const sort = orderBy(req.query.sort, PUBLIC_SORT, 'p.is_pinned DESC, p.created_at DESC');
    const rows = await db.query(
      `SELECT p.*, c.name AS category_name, c.color AS category_color, c.icon AS category_icon
       FROM posts p LEFT JOIN categories c ON c.id = p.category_id
       WHERE ${where.join(' AND ')} ORDER BY ${sort} LIMIT ? OFFSET ?`,
      [...params, pageSize, offset]
    );
    rows.forEach(stripPrivate);
    await attachTags(rows);
    await attachAttachments(rows);
    const countRow = await db.queryOne(`SELECT COUNT(*) AS c FROM posts p WHERE ${where.join(' AND ')}`, params);
    return okPage(res, rows, countRow.c, page, pageSize);
  } catch (e) {
    next(e);
  }
});

/** 反馈详情 + 评论 */
router.get('/posts/:postId', async (req, res, next) => {
  try {
    const p = req.product;
    let post = await db.queryOne(
      `SELECT p.*, c.name AS category_name, c.color AS category_color, c.icon AS category_icon
       FROM posts p LEFT JOIN categories c ON c.id = p.category_id
       WHERE p.id = ? AND p.product_id = ? AND p.deleted_at IS NULL`,
      [req.params.postId, p.id]
    );
    if (!post) return next(notFound('帖子不存在'));
    stripPrivate(post);
    // 私密帖仅作者可见
    if (post.is_private && !(req.endUser && req.endUser.id === post.author_id)) return next(notFound('帖子不存在'));
    // 待审核仅作者可见
    if (post.review_state !== 'approved' && !(req.endUser && req.endUser.id === post.author_id)) return next(notFound('帖子不存在'));
    await attachTags([post]);
    await attachAttachments([post]);
    await db.exec('UPDATE posts SET view_count = view_count + 1 WHERE id = ?', [post.id]);

    const comments = await db.query(
      'SELECT * FROM comments WHERE post_id = ? AND deleted_at IS NULL ORDER BY is_pinned DESC, created_at ASC',
      [post.id]
    );
    comments.forEach((c) => { c.author_avatar = assetUrl(c.author_avatar); });
    let voted = false;
    if (req.voterKey) {
      const v = await db.queryOne('SELECT id FROM votes WHERE post_id = ? AND voter_key = ?', [post.id, req.voterKey]);
      voted = !!v;
    }
    return ok(res, { post, comments, voted });
  } catch (e) {
    next(e);
  }
});

/** 提交反馈 */
router.post('/posts', async (req, res, next) => {
  try {
    const p = req.product;
    if (p.visibility === 'private') return next(forbidden('该产品为私有，无法公开提交反馈'));

    const v = validate(req.body, {
      title: { type: 'string', required: true, min: 4, max: 200, label: '标题' },
      content: { type: 'string', required: true, min: 1, max: 5000, label: '内容' },
      type: { type: 'enum', values: ['feedback', 'bug', 'complaint', 'question'], default: 'feedback' },
      category_id: { type: 'int' },
      email: { type: 'string', max: 160 },
      nickname: { type: 'string', max: 60 },
      contact_type: { type: 'enum', values: ['qq', 'wechat', 'email', 'other'] },
      contact_value: { type: 'string', max: 120, label: '联系方式' },
      meta: { type: 'object' },
    });

    // 联系方式选填：只有填了内容才落库，空内容一律不存
    const contactValue = (v.contact_value || '').trim();
    const contactType = contactValue ? (v.contact_type || 'other') : null;

    // 确定反馈者身份
    let endUser = req.endUser || null;
    if (!endUser && v.email) {
      const ext = `email:${v.email.toLowerCase()}`;
      endUser = await db.queryOne('SELECT * FROM end_users WHERE product_id = ? AND external_id = ?', [p.id, ext]);
      if (!endUser) {
        const r = await db.exec('INSERT INTO end_users (product_id, external_id, identity_type, nickname, email) VALUES (?,?,?,?,?)',
          [p.id, ext, 'email', v.nickname || v.email.split('@')[0], v.email]);
        endUser = await db.queryOne('SELECT * FROM end_users WHERE id = ?', [r.insertId]);
      }
    } else if (!endUser && req.guestToken) {
      const ext = req.guestToken;
      endUser = await db.queryOne('SELECT * FROM end_users WHERE product_id = ? AND external_id = ?', [p.id, ext]);
      if (!endUser) {
        const r = await db.exec('INSERT INTO end_users (product_id, external_id, identity_type, nickname) VALUES (?,?,?,?)',
          [p.id, ext, 'guest', v.nickname || '游客']);
        endUser = await db.queryOne('SELECT * FROM end_users WHERE id = ?', [r.insertId]);
      }
    }

    if (!endUser) {
      if (!p.allow_anonymous) return next(forbidden('该产品要求登录后才能提交反馈'));
      return next(badRequest('请先创建反馈身份（游客/邮箱）'));
    }
    if (!p.allow_anonymous && endUser.identity_type === 'guest') {
      return next(forbidden('该产品不允许匿名提交，请提供邮箱'));
    }
    if (p.require_email && !endUser.email) {
      return next(badRequest('该产品要求提交反馈时填写邮箱'));
    }

    if (v.category_id) {
      const cat = await db.queryOne('SELECT id FROM categories WHERE id = ? AND product_id = ?', [v.category_id, p.id]);
      if (!cat) return next(badRequest('分类不存在'));
    }

    const reviewState = p.need_review ? 'pending' : 'approved';
    // 附件（先经公开上传端点落存储，此处绑定到帖子；URL 白名单 + 对象存在性校验）
    const attachments = await normalizeAttachments(req.body.attachments);
    const result = await db.transaction(async (t) => {
      const c = await t.queryOne('SELECT post_counter FROM products WHERE id = ? FOR UPDATE', [p.id]);
      const seq = (c.post_counter || 0) + 1;
      await t.exec('UPDATE products SET post_counter = ?, post_count = post_count + 1 WHERE id = ?', [seq, p.id]);
      const r = await t.exec(
        `INSERT INTO posts (product_id, seq, title, content, type, category_id, status, author_id, author_name, author_avatar, contact_type, contact_value, review_state, source, meta, ip, ua, last_activity_at)
         VALUES (?,?,?,?,?,?, 'pending', ?,?,?,?,?,?, 'web', ?, ?,?, NOW())`,
        [p.id, seq, v.title, v.content, v.type, v.category_id || null, endUser.id, endUser.nickname, endUser.avatar_url || null, contactType, contactValue || null, reviewState, v.meta ? JSON.stringify(v.meta) : null, req.ip || null, (req.headers['user-agent'] || '').slice(0, 300)]
      );
      const postId = r.insertId;
      for (const a of attachments) {
        await t.exec(
          'INSERT INTO attachments (product_id, post_id, file_name, file_path, file_url, mime_type, size, uploader_key) VALUES (?,?,?,?,?,?,?,?)',
          [p.id, postId, a.file_name, a.url, a.url, a.mime_type, a.size, `endUser:${endUser.id}`]
        );
      }
      return postId;
    });

    const post = stripPrivate(await db.queryOne('SELECT * FROM posts WHERE id = ?', [result]));
    await attachAttachments([post]);
    await dispatch(p.id, 'post.created', { postId: post.id, seq: post.seq, title: post.title, type: post.type });
    await notifyMembers(p.id, { type: 'post.created', title: '收到新反馈', content: `「${post.title}」`, link: `/products/${p.id}/posts/${post.id}` });
    await logActivity({ productId: p.id, action: 'post.created', targetType: 'post', targetId: post.id, ip: req.ip });
    return ok(res, { post }, reviewState === 'pending' ? '提交成功，将在审核后公开' : '提交成功');
  } catch (e) {
    next(e);
  }
});

/** 投票（切换） */
router.post('/posts/:postId/vote', async (req, res, next) => {
  try {
    const p = req.product;
    if (!p.allow_vote) return next(forbidden('该产品已关闭投票功能'));
    if (!req.voterKey) return next(badRequest('请先创建反馈身份'));
    const post = await db.queryOne('SELECT id, vote_count FROM posts WHERE id = ? AND product_id = ? AND deleted_at IS NULL', [req.params.postId, p.id]);
    if (!post) return next(notFound('帖子不存在'));
    const existing = await db.queryOne('SELECT id FROM votes WHERE post_id = ? AND voter_key = ?', [post.id, req.voterKey]);
    let voted;
    if (existing) {
      await db.exec('DELETE FROM votes WHERE id = ?', [existing.id]);
      await db.exec('UPDATE posts SET vote_count = GREATEST(0, vote_count - 1) WHERE id = ?', [post.id]);
      voted = false;
    } else {
      await db.exec('INSERT INTO votes (post_id, voter_key, end_user_id) VALUES (?,?,?)', [post.id, req.voterKey, req.endUser ? req.endUser.id : null]);
      await db.exec('UPDATE posts SET vote_count = vote_count + 1 WHERE id = ?', [post.id]);
      voted = true;
    }
    const fresh = await db.queryOne('SELECT vote_count FROM posts WHERE id = ?', [post.id]);
    return ok(res, { voted, voteCount: fresh.vote_count });
  } catch (e) {
    next(e);
  }
});

/** 当前是否投票 */
router.get('/posts/:postId/vote', async (req, res, next) => {
  try {
    const p = req.product;
    let voted = false;
    if (req.voterKey) {
      const post = await db.queryOne('SELECT id FROM posts WHERE id = ? AND product_id = ? AND deleted_at IS NULL', [req.params.postId, p.id]);
      if (!post) return next(notFound('帖子不存在'));
      const v = await db.queryOne('SELECT id FROM votes WHERE post_id = ? AND voter_key = ?', [post.id, req.voterKey]);
      voted = !!v;
    }
    return ok(res, { voted });
  } catch (e) {
    next(e);
  }
});

/** 提交评论 */
router.post('/posts/:postId/comments', async (req, res, next) => {
  try {
    const p = req.product;
    if (!p.allow_comment) return next(forbidden('该产品已关闭评论功能'));
    if (!req.endUser && !req.guestToken) return next(badRequest('请先创建反馈身份'));
    const post = await db.queryOne('SELECT id, comment_count FROM posts WHERE id = ? AND product_id = ? AND deleted_at IS NULL', [req.params.postId, p.id]);
    if (!post) return next(notFound('帖子不存在'));
    const v = validate(req.body, {
      content: { type: 'string', required: true, min: 1, max: 2000, label: '评论内容' },
      parent_id: { type: 'int' },
    });
    let endUser = req.endUser;
    if (!endUser && req.guestToken) {
      endUser = await db.queryOne('SELECT * FROM end_users WHERE product_id = ? AND external_id = ?', [p.id, req.guestToken]);
      if (!endUser) {
        const r = await db.exec('INSERT INTO end_users (product_id, external_id, identity_type, nickname) VALUES (?,?,?,?)', [p.id, req.guestToken, 'guest', '游客']);
        endUser = await db.queryOne('SELECT * FROM end_users WHERE id = ?', [r.insertId]);
      }
    }
    let parentId = null;
    if (v.parent_id) {
      const parent = await db.queryOne('SELECT id FROM comments WHERE id = ? AND post_id = ? AND deleted_at IS NULL', [v.parent_id, post.id]);
      if (!parent) return next(badRequest('回复的评论不存在'));
      parentId = parent.id;
    }
    const r = await db.exec(
      `INSERT INTO comments (post_id, parent_id, author_type, author_id, author_name, author_avatar, content)
       VALUES (?,?, 'end_user', ?,?,?,?)`,
      [post.id, parentId, endUser.id, endUser.nickname, endUser.avatar_url || null, v.content]
    );
    await db.exec('UPDATE posts SET comment_count = comment_count + 1, last_activity_at = NOW() WHERE id = ?', [post.id]);
    const comment = await db.queryOne('SELECT * FROM comments WHERE id = ?', [r.insertId]);
    comment.author_avatar = assetUrl(comment.author_avatar);
    await dispatch(p.id, 'comment.created', { postId: post.id, commentId: comment.id, official: false, content: v.content });
    return ok(res, { comment });
  } catch (e) {
    next(e);
  }
});

/** 评论点赞 */
router.post('/comments/:commentId/like', async (req, res, next) => {
  try {
    if (!req.voterKey) return next(badRequest('请先创建反馈身份'));
    const comment = await db.queryOne('SELECT id FROM comments WHERE id = ? AND deleted_at IS NULL', [req.params.commentId]);
    if (!comment) return next(notFound('评论不存在'));
    const existing = await db.queryOne('SELECT 1 FROM comment_likes WHERE comment_id = ? AND voter_key = ?', [comment.id, req.voterKey]);
    let liked;
    if (existing) {
      await db.exec('DELETE FROM comment_likes WHERE comment_id = ? AND voter_key = ?', [comment.id, req.voterKey]);
      await db.exec('UPDATE comments SET like_count = GREATEST(0, like_count - 1) WHERE id = ?', [comment.id]);
      liked = false;
    } else {
      await db.exec('INSERT INTO comment_likes (comment_id, voter_key) VALUES (?,?)', [comment.id, req.voterKey]);
      await db.exec('UPDATE comments SET like_count = like_count + 1 WHERE id = ?', [comment.id]);
      liked = true;
    }
    const fresh = await db.queryOne('SELECT like_count FROM comments WHERE id = ?', [comment.id]);
    return ok(res, { liked, likeCount: fresh.like_count });
  } catch (e) {
    next(e);
  }
});

/** 公开 FAQ */
router.get('/faqs', async (req, res, next) => {
  try {
    const rows = await db.query("SELECT id, question, answer, sort_order, view_count, helpful_count FROM faqs WHERE product_id = ? AND is_published = 1 ORDER BY sort_order ASC, id ASC", [req.product.id]);
    return ok(res, { faqs: rows });
  } catch (e) {
    next(e);
  }
});

/** 公开更新日志 */
router.get('/changelogs', async (req, res, next) => {
  try {
    const rows = await db.query("SELECT id, title, content, version, status, published_at FROM changelogs WHERE product_id = ? AND is_published = 1 ORDER BY published_at DESC, id DESC", [req.product.id]);
    return ok(res, { changelogs: rows });
  } catch (e) {
    next(e);
  }
});

module.exports = router;
