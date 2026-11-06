'use strict';
/**
 * 阿里云 OSS 驱动工厂（ali-oss）。
 * 公开读 URL 优先取 cdn_domain（加速域名，不含协议），
 * 否则用默认 https://<bucket>.<endpoint>。
 */

const crypto = require('crypto');

function create(cfg, loadSdk) {
  const c = cfg.oss;
  const PREFIX = c.prefix || '';
  /** 附件 key 格式：<prefix>posts/2026/10/<hex>.<ext> */
  const KEY_RE = new RegExp(`^${PREFIX.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}posts/\\d{4}/\\d{2}/[a-f0-9]+\\.[a-z0-9]+$`);

  function base() {
    return c.cdnDomain ? `https://${c.cdnDomain}` : `https://${c.bucket}.${c.endpoint}`;
  }

  let client;
  function getClient() {
    if (!client) {
      const OSS = loadSdk('oss', 'ali-oss');
      client = new OSS({
        accessKeyId: c.accessKeyId,
        accessKeySecret: c.accessKeySecret,
        bucket: c.bucket,
        endpoint: c.endpoint,
      });
    }
    return client;
  }

  function buildKey(dir, ext) {
    const now = new Date();
    return `${PREFIX}${dir}/${now.getFullYear()}/${String(now.getMonth() + 1).padStart(2, '0')}/${crypto.randomBytes(12).toString('hex')}.${ext}`;
  }

  /** 从 URL 还原 key：须为本桶/本 CDN 托管且格式合规，否则 null */
  function keyOf(url) {
    if (typeof url !== 'string') return null;
    const u = url.trim();
    if (!u.startsWith(base() + '/')) return null;
    const key = u.slice(base().length + 1);
    return KEY_RE.test(key) ? key : null;
  }

  async function save({ buffer, ext, dir = 'posts', contentType }) {
    const Key = buildKey(dir, ext);
    await getClient().put(Key, buffer, {
      headers: { 'Content-Type': contentType || 'application/octet-stream' },
    });
    return { url: `${base()}/${Key}`, key: Key };
  }

  async function remove(url) {
    try {
      const key = keyOf(url);
      if (!key) return false;
      await getClient().delete(key);
      return true;
    } catch {
      return false;
    }
  }

  async function exists(url) {
    const key = keyOf(url);
    if (!key) return false;
    try {
      await getClient().head(key);
      return true;
    } catch {
      return false;
    }
  }

  function parseKey(url) {
    return keyOf(url);
  }

  /** 连通性探测：list 1 个对象 */
  async function test() {
    try {
      await getClient().list({ 'max-keys': 1 });
      return { ok: true, message: `OSS 连接成功（${c.bucket} @ ${c.endpoint}）` };
    } catch (e) {
      return { ok: false, message: e.message };
    }
  }

  return { driver: 'oss', save, remove, exists, parseKey, test };
}

module.exports = { create };
