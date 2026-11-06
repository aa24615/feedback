'use strict';
const crypto = require('crypto');

/** 生成随机 token（hex） */
function randomToken(bytes = 24) {
  return crypto.randomBytes(bytes).toString('hex');
}

/** 短 id，用于 slug 后缀 */
function shortId(len = 8) {
  return crypto.randomBytes(len).toString('base64url').slice(0, len).toLowerCase();
}

function uuid() {
  return crypto.randomUUID();
}

/**
 * 把任意文本转成 URL 友好的 slug
 */
function slugify(input, fallback = 'item') {
  const base = String(input || '')
    .trim()
    .toLowerCase()
    .replace(/[\s_]+/g, '-')
    .replace(/[^a-z0-9\u4e00-\u9fa5-]/g, '')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
  return base || `${fallback}-${shortId(6)}`;
}

module.exports = { randomToken, shortId, uuid, slugify };
