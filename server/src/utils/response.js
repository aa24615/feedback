'use strict';

class ApiError extends Error {
  constructor(status, message, code) {
    super(message);
    this.status = status;
    this.code = code || 'error';
    this.expose = true;
  }
}

const badRequest = (msg = '请求参数有误') => new ApiError(400, msg, 'bad_request');
const unauthorized = (msg = '请先登录') => new ApiError(401, msg, 'unauthorized');
const forbidden = (msg = '没有权限执行该操作') => new ApiError(403, msg, 'forbidden');
const notFound = (msg = '资源不存在') => new ApiError(404, msg, 'not_found');
const conflict = (msg = '资源冲突') => new ApiError(409, msg, 'conflict');

function ok(res, data = null, message = 'ok') {
  return res.json({ code: 0, message, data });
}

function okPage(res, list, total, page, pageSize, extra = null) {
  return res.json({
    code: 0,
    message: 'ok',
    data: {
      list,
      total,
      page,
      pageSize,
      totalPages: Math.ceil(total / pageSize) || 1,
      ...(extra && typeof extra === 'object' ? extra : {}),
    },
  });
}

function fail(res, status, message, code) {
  return res.status(status).json({ code: code || status, message, data: null });
}

module.exports = { ApiError, badRequest, unauthorized, forbidden, notFound, conflict, ok, okPage, fail };
