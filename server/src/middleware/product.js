'use strict';
const db = require('../config/db');
const { notFound, forbidden } = require('../utils/response');

/**
 * 角色权限矩阵。
 * 权限位：read / reply / manage(状态/分类/标签/指派/置顶/隐藏) / category / tag / member / settings / delete
 */
const ROLE_PERMS = {
  owner: ['read', 'reply', 'manage', 'category', 'tag', 'member', 'settings', 'delete'],
  admin: ['read', 'reply', 'manage', 'category', 'tag', 'member', 'settings'],
  member: ['read', 'reply', 'manage', 'category', 'tag'],
  viewer: ['read'],
};

function can(member, action) {
  if (!member) return false;
  return (ROLE_PERMS[member.role] || []).includes(action);
}

/** 按 id 载入产品并挂到 req.product（同时 join 出 owner 的计划信息） */
async function loadProduct(req, res, next) {
  try {
    const id = Number(req.params.productId);
    if (!id) return next(notFound('产品不存在'));
    const product = await db.queryOne(
      `SELECT p.*, ou.plan AS owner_plan, ou.plan_expires_at AS owner_plan_expires_at
       FROM products p LEFT JOIN users ou ON ou.id = p.owner_id
       WHERE p.id = ?`,
      [id]
    );
    if (!product) return next(notFound('产品不存在'));
    req.product = product;
    next();
  } catch (e) {
    next(e);
  }
}

/** 按 slug 载入公开产品（C 端） */
async function loadPublicProduct(req, res, next) {
  try {
    const slug = req.params.slug;
    if (!slug) return next(notFound('产品不存在'));
    const product = await db.queryOne('SELECT * FROM products WHERE slug = ?', [slug]);
    if (!product) return next(notFound('产品不存在'));
    if (product.status === 'archived') return next(notFound('该产品已归档'));
    if (product.visibility === 'private') return next(notFound('该产品为私有，不对外公开'));
    req.product = product;
    next();
  } catch (e) {
    next(e);
  }
}

/** 需要是产品成员，并写入 req.member */
async function requireMember(req, res, next) {
  try {
    if (!req.user) return next(forbidden('请先登录'));
    const member = await db.queryOne('SELECT * FROM product_members WHERE product_id = ? AND user_id = ?', [
      req.product.id,
      req.user.id,
    ]);
    if (!member) return next(forbidden('你不是该产品的团队成员'));
    req.member = member;
    next();
  } catch (e) {
    next(e);
  }
}

/** 组合：loadProduct + requireMember */
function productScope(action) {
  return [
    loadProduct,
    requireMember,
    (req, res, next) => {
      if (action && !can(req.member, action)) return next(forbidden('当前角色无权执行此操作'));
      req.can = (a) => can(req.member, a);
      next();
    },
  ];
}

module.exports = { can, loadProduct, loadPublicProduct, requireMember, productScope };
