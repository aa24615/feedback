'use strict';
const express = require('express');
const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const db = require('../config/db');
const config = require('../config/env');
const { signUser, requireAuth } = require('../middleware/auth');
const { validate } = require('../utils/validate');
const { ok, badRequest, unauthorized } = require('../utils/response');
const { sendMail } = require('../utils/events');
const { assetUrl } = require('../utils/assetUrl');

const router = express.Router();

const EMAIL_VERIFY_TTL_MS = 10 * 60 * 1000; // 验证码 10 分钟内有效

router.post('/login', async (req, res, next) => {
  try {
    const v = validate(req.body, {
      email: { type: 'string', required: true, label: '邮箱' },
      password: { type: 'string', required: true, label: '密码' },
    });
    const user = await db.queryOne('SELECT * FROM users WHERE email = ?', [v.email.toLowerCase()]);
    if (!user) return next(unauthorized('邮箱或密码错误'));
    if (user.status === 'disabled') return next(unauthorized('账号已被禁用'));
    const match = await bcrypt.compare(v.password, user.password_hash);
    if (!match) return next(unauthorized('邮箱或密码错误'));
    await db.exec('UPDATE users SET last_login_at = NOW() WHERE id = ?', [user.id]);
    const safe = { id: user.id, email: user.email, nickname: user.nickname, avatar_url: assetUrl(user.avatar_url), role: user.role, status: user.status };
    return ok(res, { token: signUser(safe), user: safe });
  } catch (e) {
    next(e);
  }
});

router.get('/me', requireAuth, async (req, res, next) => {
  next();
}, async (req, res, next) => {
  try {
    req.user.avatar_url = assetUrl(req.user.avatar_url);
    return ok(res, { user: req.user });
  } catch (e) {
    next(e);
  }
});

router.patch('/me', requireAuth, async (req, res, next) => {
  try {
    const v = validate(req.body, {
      nickname: { type: 'string', min: 1, max: 60 },
      avatar_url: { type: 'string', max: 500 },
      company: { type: 'string', max: 120 },
    });
    const sets = [];
    const params = [];
    if (v.nickname) { sets.push('nickname = ?'); params.push(v.nickname); }
    if (v.avatar_url !== undefined) { sets.push('avatar_url = ?'); params.push(v.avatar_url || null); }
    if (v.company !== undefined) { sets.push('company = ?'); params.push(v.company || null); }
    if (sets.length) {
      params.push(req.user.id);
      await db.exec(`UPDATE users SET ${sets.join(', ')} WHERE id = ?`, params);
    }
    const user = await db.queryOne('SELECT id,email,nickname,avatar_url,role,status,email_verified FROM users WHERE id = ?', [req.user.id]);
    user.avatar_url = assetUrl(user.avatar_url);
    return ok(res, { user });
  } catch (e) {
    next(e);
  }
});

/**
 * 修改密码：校验当前密码后更新。
 */
router.post('/me/password', requireAuth, async (req, res, next) => {
  try {
    const v = validate(req.body, {
      current_password: { type: 'string', required: true, label: '当前密码' },
      new_password: { type: 'string', required: true, min: 6, max: 64, label: '新密码' },
    });
    const row = await db.queryOne('SELECT password_hash FROM users WHERE id = ?', [req.user.id]);
    const match = await bcrypt.compare(v.current_password, row.password_hash);
    if (!match) return next(badRequest('当前密码不正确'));
    if (v.current_password === v.new_password) return next(badRequest('新密码不能与当前密码相同'));
    const passwordHash = await bcrypt.hash(v.new_password, 10);
    await db.exec('UPDATE users SET password_hash = ? WHERE id = ?', [passwordHash, req.user.id]);
    return ok(res, {}, '密码已修改');
  } catch (e) {
    next(e);
  }
});

/**
 * 发送邮箱验证码（用于邮箱认证）：生成 6 位验证码写入 users，并尝试发信。
 * 未配置 SMTP（多为本地/演示环境）时返回 devCode，便于直接测试。
 */
router.post('/me/email/send-verify', requireAuth, async (req, res, next) => {
  try {
    const code = String(crypto.randomInt(100000, 1000000)); // 6 位数字
    const expires = new Date(Date.now() + EMAIL_VERIFY_TTL_MS);
    await db.exec('UPDATE users SET email_verify_code = ?, email_verify_expires_at = ? WHERE id = ?', [code, expires, req.user.id]);
    const sent = await sendMail({
      to: req.user.email,
      subject: '反馈墙 · 邮箱验证码',
      text: `你的反馈墙邮箱验证码是：${code}（10 分钟内有效）。如非本人操作，请忽略本邮件。`,
    });
    if (sent) return ok(res, { sent: true });
    // 未真正发出（多为未配置 SMTP 的演示/自部署环境）：直接回传验证码，方便完成验证流程。
    // 仅当确实无法发信时才回传，已配置 SMTP 的正式环境仍走邮件。
    if (!config.smtp.host || config.env !== 'production') return ok(res, { sent: false, devCode: code, dev: true });
    return ok(res, { sent: false });
  } catch (e) {
    next(e);
  }
});

/**
 * 校验邮箱验证码：通过则标记 email_verified=1 并清除验证码。
 */
router.post('/me/email/verify', requireAuth, async (req, res, next) => {
  try {
    const v = validate(req.body, { code: { type: 'string', required: true, label: '验证码' } });
    const row = await db.queryOne('SELECT email_verify_code, email_verify_expires_at FROM users WHERE id = ?', [req.user.id]);
    if (!row.email_verify_code || !row.email_verify_expires_at) return next(badRequest('请先获取验证码'));
    if (new Date(row.email_verify_expires_at).getTime() < Date.now()) return next(badRequest('验证码已过期，请重新获取'));
    if (row.email_verify_code !== v.code) return next(badRequest('验证码不正确'));
    await db.exec("UPDATE users SET email_verified = 1, email_verify_code = NULL, email_verify_expires_at = NULL WHERE id = ?", [req.user.id]);
    const user = await db.queryOne('SELECT id,email,nickname,avatar_url,role,status,email_verified FROM users WHERE id = ?', [req.user.id]);
    return ok(res, { user, emailVerified: true }, '邮箱已认证');
  } catch (e) {
    next(e);
  }
});

module.exports = router;
