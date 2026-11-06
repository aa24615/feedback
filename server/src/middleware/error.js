'use strict';
const express = require('express');

function notFoundHandler(req, res) {
  res.status(404).json({ code: 404, message: `接口不存在: ${req.method} ${req.path}`, data: null });
}

// eslint-disable-next-line no-unused-vars
function errorHandler(err, req, res, next) {
  if (res.headersSent) return next(err);
  const status = err.status || (err.expose ? 400 : 500);
  const message = err.message || '服务器内部错误';
  if (status >= 500) console.error('[ERROR]', err);
  res.status(status).json({ code: err.code || status, message, data: null });
}

module.exports = { notFoundHandler, errorHandler };
