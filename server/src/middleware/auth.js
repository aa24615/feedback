'use strict';
const jwt = require('jsonwebtoken');
const config = require('../config/env');
const db = require('../config/db');
const { unauthorized, forbidden, ApiError } = require('../utils/response');

function signUser(user) {
  return jwt.sign({ uid: user.id, type: 'user' }, config.jwtSecret, { expiresIn: config.jwtExpiresIn });
}
function signEndUser(productId, endUserId) {
  return jwt.sign({ pid: productId, euid: endUserId, type: 'eu' }, config.jwtSecret, { expiresIn: '365d' });
}
function verify(token) {
  return jwt.verify(token, config.jwtSecret);
}
function parseBearer(req) {
  const h = req.headers['authorization'] || req.headers['x-access-token'] || '';
  if (typeof h === 'string' && h.startsWith('Bearer ')) return h.slice(7).trim();
  return null;
}

/** 平台用户登录态（必须） */
async function requireAuth(req, res, next) {
  try {
    const token = parseBearer(req);
    if (!token) return next(unauthorized('请先登录'));
    const payload = verify(token);
    if (payload.type !== 'user') return next(unauthorized('登录态无效'));
    const user = await db.queryOne(
      'SELECT id,email,nickname,avatar_url,role,plan,plan_expires_at,extra_products,status,email_verified FROM users WHERE id=?',
      [payload.uid]
    );
    if (!user) return next(unauthorized('账号不存在'));
    if (user.status === 'disabled') return next(forbidden('账号已被禁用'));
    req.user = user;
    next();
  } catch (e) {
    next(unauthorized('登录已过期，请重新登录'));
  }
}

/** 平台用户登录态（可选，用于公开信息携带但非必须） */
async function optionalAuth(req, res, next) {
  const token = parseBearer(req);
  if (token) {
    try {
      const payload = verify(token);
      if (payload.type === 'user') {
        const user = await db.queryOne('SELECT id,email,nickname,avatar_url,role,plan,plan_expires_at,extra_products,status,email_verified FROM users WHERE id=?', [payload.uid]);
        if (user && user.status !== 'disabled') req.user = user;
      }
    } catch {
      /* ignore */
    }
  }
  next();
}

/** C 端反馈者身份（游客 token / 端用户 JWT） */
async function resolveEndUser(req, res, next) {
  // 已签发的端用户 JWT 优先
  const euToken = req.headers['x-end-user-token'] || req.query.eutoken;
  if (euToken) {
    try {
      const p = verify(euToken);
      if (p.type === 'eu') {
        const eu = await db.queryOne('SELECT * FROM end_users WHERE id=? AND product_id=?', [p.euid, p.pid]);
        if (eu) {
          req.endUser = eu;
          req.voterKey = `eu:${eu.id}`;
          return next();
        }
      }
    } catch {
      /* 落到游客 token */
    }
  }
  // 游客 token（前端 localStorage 生成）
  const guest = req.headers['x-guest-token'] || req.query.guest;
  if (guest) {
    req.guestToken = String(guest).slice(0, 120);
    req.voterKey = `g:${req.guestToken}`;
    return next();
  }
  next();
}

module.exports = { signUser, signEndUser, verify, parseBearer, requireAuth, optionalAuth, resolveEndUser };
