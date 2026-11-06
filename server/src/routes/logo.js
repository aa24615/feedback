'use strict';
const express = require('express');
const multer = require('multer');
const db = require('../config/db');
const { can } = require('../middleware/product');
const { sniffFileType, mimeOfType, IMAGE_TYPES } = require('../utils/fileSniff');
const { getStorage } = require('../services/storage');
const { assetUrl } = require('../utils/assetUrl');
const { ok, badRequest, forbidden } = require('../utils/response');

const router = express.Router();

const MAX_LOGO_MB = 2;
const ALLOWED_EXT = ['png', 'jpg', 'jpeg', 'gif', 'webp'];
const ALLOWED_MIME = ['image/png', 'image/jpeg', 'image/jpg', 'image/gif', 'image/webp'];

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_LOGO_MB * 1024 * 1024, files: 1 },
  fileFilter: (req, file, cb) => {
    if (!ALLOWED_MIME.includes(file.mimetype)) return cb(new Error('仅支持 PNG / JPG / GIF / WebP 图片'));
    cb(null, true);
  },
});

/** 根据文件头识别真实图片类型，防止伪造 MIME；无法识别返回 null */
function sniffImageType(buf) {
  const type = sniffFileType(buf);
  return type && IMAGE_TYPES.has(type) ? type : null;
}

/** 删除旧 Logo（仅限当前存储驱动托管的 URL） */
async function removeLogoFile(logoUrl) {
  await (await getStorage()).remove(logoUrl);
}

/** 权限：所有者/管理员（settings 权限位） */
function requireSettings(req, res, next) {
  if (!can(req.member, 'settings')) return next(forbidden('无权限修改产品设置'));
  next();
}

/** 上传/更换产品 Logo */
router.post('/', requireSettings, (req, res, next) => {
  upload.single('logo')(req, res, async (err) => {
    if (err) {
      const msg = err.code === 'LIMIT_FILE_SIZE'
        ? `Logo 大小不能超过 ${MAX_LOGO_MB}MB`
        : (err.message || '文件上传失败');
      return next(badRequest(msg));
    }
    try {
      if (!req.file) return next(badRequest('请选择要上传的图片'));
      const type = sniffImageType(req.file.buffer);
      if (!type) return next(badRequest('仅支持 PNG / JPG / GIF / WebP 图片'));

      const { url } = await (await getStorage()).save({
        buffer: req.file.buffer,
        ext: type,
        dir: 'logos',
        contentType: mimeOfType(type),
      });
      await removeLogoFile(req.product.logo_url); // 清理旧文件
      await db.exec('UPDATE products SET logo_url = ? WHERE id = ?', [url, req.product.id]);
      const product = await db.queryOne('SELECT * FROM products WHERE id = ?', [req.product.id]);
      return ok(res, { product, logo_url: assetUrl(url) }, 'Logo 已更新');
    } catch (e) {
      next(e);
    }
  });
});

/** 移除产品 Logo */
router.delete('/', requireSettings, async (req, res, next) => {
  try {
    await removeLogoFile(req.product.logo_url);
    await db.exec('UPDATE products SET logo_url = NULL WHERE id = ?', [req.product.id]);
    const product = await db.queryOne('SELECT * FROM products WHERE id = ?', [req.product.id]);
    return ok(res, { product, logo_url: null }, 'Logo 已移除');
  } catch (e) {
    next(e);
  }
});

module.exports = router;
