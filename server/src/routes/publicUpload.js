'use strict';
const express = require('express');
const multer = require('multer');
const db = require('../config/db');
const config = require('../config/env');
const { sniffFileType, mimeOfType, IMAGE_TYPES } = require('../utils/fileSniff');
const { getStorage } = require('../services/storage');
const { assetUrl } = require('../utils/assetUrl');
const { ok, badRequest } = require('../utils/response');

const router = express.Router();

/**
 * 解析反馈者身份：端用户 JWT（req.endUser）或游客 token；
 * 游客首次上传时自动建档（与提交反馈的行为一致）。
 */
async function resolveUploader(req) {
  if (req.endUser) return req.endUser;
  if (!req.guestToken) return null;
  let eu = await db.queryOne('SELECT * FROM end_users WHERE product_id = ? AND external_id = ?', [req.product.id, req.guestToken]);
  if (!eu) {
    const r = await db.exec('INSERT INTO end_users (product_id, external_id, identity_type, nickname) VALUES (?,?,?,?)',
      [req.product.id, req.guestToken, 'guest', '游客']);
    eu = await db.queryOne('SELECT * FROM end_users WHERE id = ?', [r.insertId]);
  }
  return eu;
}

/**
 * C 端反馈附件上传（游客身份，经 X-Guest-Token / X-End-User-Token 建立）。
 * 附件先落存储（attachments.post_id 为空，未绑定），提交反馈时绑定到帖子。
 */
const upload = multer({
  storage: multer.memoryStorage(),
  // 单文件上限取视频档（较大者），图片档在 handler 内按类型分别校验
  limits: { fileSize: config.maxVideoMb * 1024 * 1024, files: config.maxPostAttachments },
  fileFilter: (req, file, cb) => {
    const allowed = config.allowImageMime.includes(file.mimetype) || config.allowVideoMime.includes(file.mimetype);
    if (!allowed) {
      return cb(new Error(`仅支持图片（PNG/JPG/GIF/WebP，≤${config.maxUploadMb}MB）或视频（MP4/WebM/MOV，≤${config.maxVideoMb}MB）`));
    }
    cb(null, true);
  },
});

router.post('/', (req, res, next) => {
  upload.array('files', config.maxPostAttachments)(req, res, async (err) => {
    if (err) {
      const msg = err.code === 'LIMIT_FILE_SIZE'
        ? `单个文件不能超过 ${config.maxVideoMb}MB`
        : (err.message || '上传失败');
      return next(badRequest(msg));
    }
    const uploader = await resolveUploader(req).catch(() => null);
    if (!uploader) return next(badRequest('请先建立反馈身份后再上传'));
    const store = await getStorage();
    const written = []; // 本次已保存的 URL，失败时回滚
    const reject = async (msg) => {
      for (const url of written) { await store.remove(url).catch(() => {}); }
      return next(badRequest(msg));
    };
    try {
      if (!req.files || !req.files.length) return await reject('未接收到文件');
      if (req.files.length > config.maxPostAttachments) {
        return await reject(`一次最多上传 ${config.maxPostAttachments} 个文件`);
      }
      const result = [];
      for (const f of req.files) {
        const type = sniffFileType(f.buffer);
        if (!type) return await reject(`「${f.originalname}」不是有效的图片或视频文件`);
        const isImage = IMAGE_TYPES.has(type);
        const maxMb = isImage ? config.maxUploadMb : config.maxVideoMb;
        if (f.size > maxMb * 1024 * 1024) {
          return await reject(`${isImage ? '图片' : '视频'}不能超过 ${maxMb}MB`);
        }
        const { url } = await store.save({
          buffer: f.buffer,
          ext: type,
          dir: 'posts',
          contentType: mimeOfType(type),
        });
        written.push(url);
        result.push({
          file_name: String(f.originalname || 'file').slice(0, 200),
          url: assetUrl(url),
          mime_type: mimeOfType(type),
          size: f.size,
        });
      }
      return ok(res, { files: result }, '上传成功');
    } catch (e) {
      for (const url of written) { await store.remove(url).catch(() => {}); }
      next(e);
    }
  });
});

module.exports = router;
