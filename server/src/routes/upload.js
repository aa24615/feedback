'use strict';
const express = require('express');
const multer = require('multer');
const config = require('../config/env');
const { requireAuth } = require('../middleware/auth');
const { getStorage } = require('../services/storage');
const { assetUrl } = require('../utils/assetUrl');
const { ok, fail, badRequest } = require('../utils/response');

const router = express.Router();

const storage = multer.memoryStorage();
const upload = multer({
  storage,
  limits: { fileSize: config.maxUploadMb * 1024 * 1024, files: 6 },
  fileFilter: (req, file, cb) => {
    if (!config.allowMime.includes(file.mimetype)) return cb(new Error('不支持的文件类型'));
    cb(null, true);
  },
});

router.post('/', requireAuth, upload.array('files', 6), (req, res, next) => {
  (async () => {
    try {
      if (!req.files || !req.files.length) return next(badRequest('未接收到文件'));
      const store = await getStorage();
      const result = [];
      for (const f of req.files) {
        const ext = (f.originalname.split('.').pop() || 'bin').slice(0, 8).toLowerCase();
        const { url } = await store.save({
          buffer: f.buffer,
          ext,
          dir: 'files',
          contentType: f.mimetype,
        });
        result.push({ file_name: f.originalname, url: assetUrl(url), mime_type: f.mimetype, size: f.size });
      }
      return ok(res, { files: result });
    } catch (e) {
      return fail(res, 500, e.message);
    }
  })();
});

module.exports = router;
