'use strict';
/**
 * 本地文件驱动工厂：文件写入 cfg.uploadDir，URL 形如 /uploads/<dir>/<年>/<月>/<hex>.<ext>
 * （/uploads 由 index.js 的 express.static 对外服务）。
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

/** 附件 URL 格式白名单：/uploads/posts/2026/10/<hex>.<ext> */
const KEY_RE = /^\/uploads\/posts\/\d{4}\/\d{2}\/[a-f0-9]+\.[a-z0-9]+$/;

function create(cfg) {
  const UPLOAD_ROOT = path.resolve(cfg.uploadDir);

  function buildKey(dir, ext) {
    const now = new Date();
    return `${dir}/${now.getFullYear()}/${String(now.getMonth() + 1).padStart(2, '0')}/${crypto.randomBytes(12).toString('hex')}.${ext}`;
  }

  function urlToAbs(url) {
    if (typeof url !== 'string' || !url.startsWith('/uploads/')) return null;
    const abs = path.resolve(UPLOAD_ROOT, url.replace(/^\/uploads\/?/, ''));
    return abs.startsWith(UPLOAD_ROOT + path.sep) ? abs : null;
  }

  function save({ buffer, ext, dir = 'posts' }) {
    const key = buildKey(dir, ext);
    const abs = path.resolve(UPLOAD_ROOT, key);
    fs.mkdirSync(path.dirname(abs), { recursive: true });
    fs.writeFileSync(abs, buffer);
    return { url: `/uploads/${key}`, key };
  }

  async function remove(url) {
    const abs = urlToAbs(url);
    if (!abs) return false;
    try {
      if (fs.existsSync(abs)) { fs.unlinkSync(abs); return true; }
    } catch { /* ignore */ }
    return false;
  }

  async function exists(url) {
    const abs = urlToAbs(url);
    return !!abs && fs.existsSync(abs);
  }

  function parseKey(url) {
    if (typeof url !== 'string') return null;
    const u = url.trim();
    return KEY_RE.test(u) ? u.replace(/^\/uploads\/?/, '') : null;
  }

  /** 连通性探测：写一个探测文件再删除 */
  async function test() {
    try {
      const probe = save({ buffer: Buffer.from('ok'), ext: 'txt', dir: '_probe' });
      await remove(probe.url);
      return { ok: true, message: `本地存储可写（${UPLOAD_ROOT}）` };
    } catch (e) {
      return { ok: false, message: e.message };
    }
  }

  return { driver: 'local', save, remove, exists, parseKey, test };
}

module.exports = { create };
