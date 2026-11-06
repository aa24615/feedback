'use strict';
const db = require('../config/db');
const { assetUrl } = require('./assetUrl');

/**
 * 批量 IN 查询的占位符展开。
 * 注意：db.query 走 mysql2 execute（预编译），`IN (?)` 传数组不会被展开，
 * 必须手工展开占位符并传扁平参数（与 bulkInsert 同一套路）。
 */
function inClause(ids) {
  const safe = ids.map((i) => Number(i)).filter((n) => Number.isFinite(n));
  return { sql: safe.map(() => '?').join(','), params: safe };
}

/** 把 tags 批量挂到帖子数组 */
async function attachTags(posts) {
  if (!posts || !posts.length) return posts;
  const { sql, params } = inClause(posts.map((p) => p.id));
  if (!params.length) { for (const p of posts) p.tags = []; return posts; }
  const rows = await db.query(
    `SELECT pt.post_id, t.id, t.name, t.color FROM post_tags pt JOIN tags t ON t.id = pt.tag_id WHERE pt.post_id IN (${sql})`,
    params
  );
  const map = {};
  for (const r of rows) {
    (map[r.post_id] = map[r.post_id] || []).push({ id: r.id, name: r.name, color: r.color });
  }
  for (const p of posts) p.tags = map[p.id] || [];
  return posts;
}

/** 把评论标签挂上 */
async function attachCommentTags(comments) {
  return comments;
}

/** 把附件（图片/视频）批量挂到帖子数组 */
async function attachAttachments(posts) {
  if (!posts || !posts.length) return posts;
  const { sql, params } = inClause(posts.map((p) => p.id));
  if (!params.length) { for (const p of posts) p.attachments = []; return posts; }
  const rows = await db.query(
    `SELECT id, post_id, file_name, file_url, mime_type, size FROM attachments WHERE post_id IN (${sql}) ORDER BY id ASC`,
    params
  );
  const map = {};
  for (const r of rows) {
    (map[r.post_id] = map[r.post_id] || []).push({
      id: r.id, file_name: r.file_name, url: assetUrl(r.file_url), mime_type: r.mime_type, size: r.size,
    });
  }
  for (const p of posts) {
    p.attachments = map[p.id] || [];
    p.author_avatar = assetUrl(p.author_avatar);
  }
  return posts;
}

module.exports = { attachTags, attachCommentTags, attachAttachments };
