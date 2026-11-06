'use strict';
const express = require('express');
const db = require('../config/db');
const config = require('../config/env');
const { loadProduct, requireMember, can } = require('../middleware/product');
const { requireAuth } = require('../middleware/auth');
const { validate, pagination, orderBy } = require('../utils/validate');
const { ok, okPage, fail, badRequest, notFound, forbidden, conflict } = require('../utils/response');
const { slugify, shortId } = require('../utils/ids');
const { notifyMembers, logActivity } = require('../utils/events');
const { assetUrl } = require('../utils/assetUrl');

const router = express.Router();

const DEFAULT_CATEGORIES = [
  { name: '产品建议', slug: 'suggestion', color: '#4F46E5', icon: '💡' },
  { name: '问题反馈', slug: 'bug', color: '#EF4444', icon: '🐞' },
  { name: '吐槽', slug: 'complaint', color: '#F59E0B', icon: '😤' },
  { name: '其他', slug: 'other', color: '#6B7280', icon: '💬' },
];

// 保留后缀，避免与平台路由冲突
const RESERVED_SLUGS = new Set(['api', 'p', 'admin', 'auth', 'uploads', 'embed', 'static', 'assets', 'health', 'favicon.ico', 'robots.txt']);

/** 清洗用户自定义 slug；返回 null 表示不合法 */
function sanitizeSlug(input) {
  const s = slugify(input, '');
  if (!s || s.length < 2 || s.length > 60) return null;
  if (RESERVED_SLUGS.has(s)) return null;
  return s;
}

/** 我加入的产品列表 */
router.get('/', requireAuth, async (req, res, next) => {
  try {
    const { page, pageSize, offset } = pagination(req.query, 12);
    const rows = await db.query(
      `SELECT p.*, pm.role, pm.can_reply,
              (SELECT COUNT(*) FROM posts po WHERE po.product_id = p.id AND po.deleted_at IS NULL AND po.review_state='approved') AS visible_posts
       FROM products p
       JOIN product_members pm ON pm.product_id = p.id
       WHERE pm.user_id = ? AND p.status != 'archived'
       ORDER BY p.created_at DESC
       LIMIT ? OFFSET ?`,
      [req.user.id, pageSize, offset]
    );
    const totalRow = await db.queryOne('SELECT COUNT(*) AS c FROM product_members WHERE user_id = ?', [req.user.id]);
    rows.forEach((r) => { r.logo_url = assetUrl(r.logo_url); });
    return okPage(res, rows, totalRow.c, page, pageSize);
  } catch (e) {
    next(e);
  }
});

/** 创建产品（自动成为 owner + 默认分类） */
router.post('/', requireAuth, async (req, res, next) => {
  try {
    const v = validate(req.body, {
      name: { type: 'string', required: true, min: 1, max: 120, label: '产品名称' },
      slug: { type: 'string', max: 120 },
      short_desc: { type: 'string', max: 255 },
      description: { type: 'string', max: 2000 },
      website: { type: 'string', max: 300 },
      industry: { type: 'string', max: 60 },
      theme_color: { type: 'string', max: 20 },
      welcome_message: { type: 'string', max: 500 },
    });
    // 开源版：产品数量不限制
    let slug;
    if (v.slug) {
      slug = sanitizeSlug(v.slug);
      if (!slug) return next(badRequest('链接后缀格式不正确（2-60 位字母、数字、连字符，且不能使用保留字）'));
      const dup = await db.queryOne('SELECT id FROM products WHERE slug = ?', [slug]);
      if (dup) return next(conflict('该链接后缀已被占用，请换一个'));
    }
    await db.transaction(async (t) => {
      if (!slug) {
        slug = await uniqueSlug(t, slugify(v.name, 'product'));
      }
      const result = await t.exec(
        `INSERT INTO products (owner_id, name, slug, short_desc, description, website, industry, theme_color, welcome_message)
         VALUES (?,?,?,?,?,?,?,?,?)`,
        [
          req.user.id,
          v.name,
          slug,
          v.short_desc || null,
          v.description || null,
          v.website || null,
          v.industry || null,
          v.theme_color || '#4F46E5',
          v.welcome_message || null,
        ]
      );
      const productId = result.insertId;
      await t.exec('INSERT INTO product_members (product_id, user_id, role, can_reply) VALUES (?,?,?,1)', [
        productId,
        req.user.id,
        'owner',
      ]);
      await t.exec('UPDATE products SET member_count = 1 WHERE id = ?', [productId]);
      for (const c of DEFAULT_CATEGORIES) {
        await t.exec(
          'INSERT INTO categories (product_id, name, slug, color, icon, sort_order, is_default) VALUES (?,?,?,?,?,?,?)',
          [productId, c.name, c.slug, c.color, c.icon, 0, c.slug === 'suggestion' ? 1 : 0]
        );
      }
      const product = await t.queryOne('SELECT * FROM products WHERE id = ?', [productId]);
      product.role = 'owner';
      res._created = product;
    });
    res._created.logo_url = assetUrl(res._created.logo_url);
    return ok(res, { product: res._created }, '产品创建成功');
  } catch (e) {
    next(e);
  }
});

async function uniqueSlug(t, base) {
  let slug = base;
  let i = 0;
  while (true) {
    const ex = await t.queryOne('SELECT id FROM products WHERE slug = ?', [slug]);
    if (!ex) return slug;
    i += 1;
    slug = `${base}-${shortId(4)}`;
    if (i > 10) slug = `${base}-${shortId(8)}`;
  }
}

/** 产品详情（我是成员） */
router.get('/:productId', requireAuth, loadProduct, requireMember, async (req, res, next) => {
  try {
    const product = req.product;
    product.role = req.member.role;
    product.logo_url = assetUrl(product.logo_url);
    product.can = {
      settings: can(req.member, 'settings'),
      member: can(req.member, 'member'),
      category: can(req.member, 'category'),
      tag: can(req.member, 'tag'),
      manage: can(req.member, 'manage'),
      reply: can(req.member, 'reply'),
      delete: can(req.member, 'delete'),
    };
    return ok(res, { product });
  } catch (e) {
    next(e);
  }
});

/** 更新产品设置 */
router.patch('/:productId', requireAuth, loadProduct, requireMember, async (req, res, next) => {
  try {
    if (!can(req.member, 'settings')) return next(forbidden('无权限修改设置'));
    const v = validate(req.body, {
      name: { type: 'string', min: 1, max: 120 },
      short_desc: { type: 'string', max: 255 },
      description: { type: 'string', max: 2000 },
      logo_url: { type: 'string', max: 500 },
      website: { type: 'string', max: 300 },
      industry: { type: 'string', max: 60 },
      theme_color: { type: 'string', max: 20 },
      welcome_message: { type: 'string', max: 500 },
      visibility: { type: 'enum', values: ['public', 'private'] },
      allow_anonymous: { type: 'boolean' },
      require_email: { type: 'boolean' },
      need_review: { type: 'boolean' },
      allow_vote: { type: 'boolean' },
      allow_comment: { type: 'boolean' },
      hide_branding: { type: 'boolean' },
      contact_fields: { type: 'object' },
    });
    const fields = [];
    const params = [];
    for (const [k, val] of Object.entries(v)) {
      fields.push(`${k} = ?`);
      params.push(val);
    }
    if (!fields.length) { req.product.logo_url = assetUrl(req.product.logo_url); return ok(res, { product: req.product }); }
    params.push(req.product.id);
    await db.exec(`UPDATE products SET ${fields.join(', ')} WHERE id = ?`, params);
    const product = await db.queryOne('SELECT * FROM products WHERE id = ?', [req.product.id]);
    await logActivity({ productId: req.product.id, userId: req.user.id, action: 'product.update', ip: req.ip });
    product.logo_url = assetUrl(product.logo_url);
    return ok(res, { product });
  } catch (e) {
    next(e);
  }
});

/** 删除产品（owner / delete 权限） */
router.delete('/:productId', requireAuth, loadProduct, requireMember, async (req, res, next) => {
  try {
    if (!can(req.member, 'delete')) return next(forbidden('仅产品所有者可删除'));
    await db.exec("UPDATE products SET status = 'archived' WHERE id = ?", [req.product.id]);
    await logActivity({ productId: req.product.id, userId: req.user.id, action: 'product.delete', ip: req.ip });
    return ok(res, { success: true });
  } catch (e) {
    next(e);
  }
});

module.exports = router;
