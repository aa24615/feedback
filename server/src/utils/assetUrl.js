'use strict';
const { AsyncLocalStorage } = require('async_hooks');
const config = require('../config/env');

/**
 * 当前请求的「对外 origin」上下文。
 *
 * 生产部署中后端藏在反向代理（1Panel / nginx）之后：真实对外域名是 api.example.com，
 * 而后端自身看到的是内网地址（localhost:4000 / backend:4000）。
 * 因此资源 URL 必须以「请求进来的对外域名」为准，而不是后端内网地址或写死的 localhost。
 *
 * 用 AsyncLocalStorage 传递，好处是：assetUrl(url) 的调用点（约十几处）完全不用改，
 * 只要中间件跑在最前面，同一次请求内的所有 assetUrl 都能拿到正确 origin，且并发请求互不干扰。
 */
const originStore = new AsyncLocalStorage();

/** 取主机名（去协议、去端口、去路径） */
function hostOf(value) {
  return String(value || '')
    .replace(/^https?:\/\//i, '')
    .split('/')[0]
    .split(':')[0]
    .toLowerCase();
}

/** 判断是否内网/容器内部主机：localhost、127.0.0.1、容器服务名、私有网段 */
function isInternalHost(value) {
  const h = hostOf(value);
  if (!h) return true;
  if (['localhost', '127.0.0.1', '::1', '0.0.0.0'].includes(h)) return true;
  if (!h.includes('.')) return true; // 容器服务名 / 短主机名，如 backend、api
  if (/^10\./.test(h)) return true;
  if (/^192\.168\./.test(h)) return true;
  if (/^172\.(1[6-9]|2\d|3[01])\./.test(h)) return true;
  return false;
}

/**
 * 从请求推导对外 origin：优先 X-Forwarded-Host / X-Forwarded-Proto（反向代理），回退 Host 头。
 * 公网域名在没有协议头时默认 https，避免在 https 页面出现混合内容（http 图片被拦截）。
 */
function deriveOrigin(req) {
  const headers = (req && req.headers) || {};
  const host = String(headers['x-forwarded-host'] || headers.host || '').split(',')[0].trim();
  if (!host) return '';
  const xfp = String(headers['x-forwarded-proto'] || '').split(',')[0].trim();
  let proto = xfp;
  if (!proto) proto = isInternalHost(host) ? (req.protocol || 'http') : 'https';
  return `${proto}://${host}`;
}

/** Express 中间件：把当前请求的对外 origin 存入 AsyncLocalStorage */
function assetOrigin(req, res, next) {
  originStore.run(deriveOrigin(req), () => next());
}

/**
 * 把存储层返回的资源地址规范为完整可访问 URL。
 *
 * - 本地驱动（local）返回 `/uploads/...` 相对路径 → 拼上「对外可访问 /uploads 的基址」，
 *   优先用当前请求进来的对外域名（生产反代场景），其次用配置的 PUBLIC_BASE_URL。
 * - COS / OSS 等驱动已返回完整 URL → 原样返回。
 * - 非字符串 / 已是 http(s) / 空值 → 原样返回。
 */
function assetUrl(url) {
  if (typeof url !== 'string' || !url) return url;
  if (/^https?:\/\//i.test(url)) return url; // 已是完整 URL（COS/OSS）
  if (!url.startsWith('/')) return url;

  const reqOrigin = String(originStore.getStore() || '').replace(/\/+$/, '');
  const envBase = String(config.publicBaseUrl || '').replace(/\/+$/, '');

  // 1) 请求进来的对外域名（生产反代下即 api.example.com）
  if (reqOrigin && !isInternalHost(reqOrigin)) return reqOrigin + url;
  // 2) 显式配置的 PUBLIC_BASE_URL（兜底 / 后台任务无请求上下文时用）
  if (envBase && !isInternalHost(envBase)) return envBase + url;
  // 3) 两者都是内网地址（本地开发）→ 用请求来源，保证同源可访问
  if (reqOrigin) return reqOrigin + url;
  if (envBase) return envBase + url;
  return url;
}

module.exports = { assetUrl, assetOrigin, deriveOrigin, isInternalHost };
