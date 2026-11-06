'use strict';
const nodemailer = require('nodemailer');
const config = require('../config/env');
const db = require('../config/db');

let transporter = null;
function getTransporter() {
  if (!config.smtp.host) return null;
  if (!transporter) {
    transporter = nodemailer.createTransport({
      host: config.smtp.host,
      port: config.smtp.port,
      secure: config.smtp.port === 465,
      auth: config.smtp.user ? { user: config.smtp.user, pass: config.smtp.pass } : undefined,
    });
  }
  return transporter;
}

/**
 * 平台系统邮件（邀请成员、状态变更通知反馈者等），走 .env 的全局 SMTP。
 * 用户自定义的「通知模板」邮件请使用 services/notify.js（按用户 SMTP 配置发送）。
 * 未配置 SMTP 时仅打印日志，不抛错。
 */
async function sendMail({ to, subject, text, html }) {
  if (!to) return false;
  const t = getTransporter();
  if (!t) {
    console.log(`[mail:skip] to=${to} subject=${subject}`);
    return false;
  }
  try {
    await t.sendMail({ from: config.smtp.from, to, subject, text, html: html || text });
    return true;
  } catch (err) {
    console.error('[mail:error]', err.message);
    return false;
  }
}

/** 给产品的团队成员发站内通知 */
async function notifyMembers(productId, { type, title, content, link, excludeUserId }) {
  try {
    const members = await db.query('SELECT user_id FROM product_members WHERE product_id = ?', [productId]);
    const rows = members.filter((m) => !excludeUserId || m.user_id !== excludeUserId).map((m) => [m.user_id, productId, type, title, content || null, link || null]);
    if (!rows.length) return;
    await db.bulkInsert('notifications', ['user_id', 'product_id', 'type', 'title', 'content', 'link'], rows);
  } catch (err) {
    console.error('[notify:error]', err.message);
  }
}

/** 记录操作日志 */
async function logActivity({ productId, userId, action, targetType, targetId, detail, ip }) {
  try {
    await db.exec(
      'INSERT INTO activity_logs (product_id, user_id, action, target_type, target_id, detail, ip) VALUES (?,?,?,?,?,?,?)',
      [productId || null, userId || null, action, targetType || null, targetId || null, detail ? JSON.stringify(detail) : null, ip || null]
    );
  } catch (err) {
    console.error('[log:error]', err.message);
  }
}

module.exports = { sendMail, notifyMembers, logActivity };
