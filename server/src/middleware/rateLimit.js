'use strict';
const rateLimit = require('express-rate-limit');
const config = require('../config/env');

const standard = rateLimit({
  windowMs: config.rateLimit.windowMs,
  max: config.rateLimit.max,
  standardHeaders: true,
  legacyHeaders: false,
  message: { code: 429, message: '请求过于频繁，请稍后再试', data: null },
});

/** 匿名提交反馈限流（按 IP） */
const anonSubmit = rateLimit({
  windowMs: 60 * 1000,
  max: config.anonSubmitMax,
  standardHeaders: true,
  legacyHeaders: false,
  message: { code: 429, message: '提交过于频繁，请稍后再试', data: null },
});

/** 匿名附件上传限流（按 IP） */
const anonUpload = rateLimit({
  windowMs: 60 * 1000,
  max: config.anonUploadMax,
  standardHeaders: true,
  legacyHeaders: false,
  message: { code: 429, message: '上传过于频繁，请稍后再试', data: null },
});

module.exports = { standard, anonSubmit, anonUpload };
