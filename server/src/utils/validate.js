'use strict';
const { badRequest } = require('./response');

/**
 * 极简校验器
 * schema: { field: { type, required, min, max, values, default, trim } }
 * 返回清洗后的对象；失败抛 400
 */
function validate(payload, schema) {
  const src = payload && typeof payload === 'object' ? payload : {};
  const out = {};
  for (const [key, rule] of Object.entries(schema)) {
    let v = src[key];
    if (v === undefined || v === null || v === '') {
      if (rule.required) throw badRequest(`${rule.label || key}不能为空`);
      if (rule.default !== undefined) out[key] = rule.default;
      continue;
    }
    const type = rule.type || 'string';
    if (type === 'string') {
      v = String(v);
      if (rule.trim !== false) v = v.trim();
      if (rule.min && v.length < rule.min) throw badRequest(`${rule.label || key}至少 ${rule.min} 个字符`);
      if (rule.max && v.length > rule.max) throw badRequest(`${rule.label || key}不能超过 ${rule.max} 个字符`);
    } else if (type === 'number' || type === 'int') {
      v = type === 'int' ? parseInt(v, 10) : Number(v);
      if (Number.isNaN(v)) throw badRequest(`${rule.label || key}必须是数字`);
      if (rule.min !== undefined && v < rule.min) throw badRequest(`${rule.label || key}不能小于 ${rule.min}`);
      if (rule.max !== undefined && v > rule.max) throw badRequest(`${rule.label || key}不能大于 ${rule.max}`);
    } else if (type === 'boolean') {
      v = v === true || v === 'true' || v === 1 || v === '1';
    } else if (type === 'enum') {
      if (!rule.values.includes(v)) {
        throw badRequest(`${rule.label || key}取值不合法`);
      }
    } else if (type === 'array') {
      if (!Array.isArray(v)) throw badRequest(`${rule.label || key}必须是数组`);
      if (rule.max && v.length > rule.max) throw badRequest(`${rule.label || key}最多 ${rule.max} 项`);
      v = v.map((i) => (rule.item === 'int' ? parseInt(i, 10) : String(i).trim())).filter((i) => i !== '' && !Number.isNaN(i));
    } else if (type === 'object') {
      if (typeof v !== 'object') throw badRequest(`${rule.label || key}格式有误`);
    }
    out[key] = v;
  }
  return out;
}

/** 分页参数 */
function pagination(query, defaultSize = 20, maxSize = 100) {
  const page = Math.max(1, parseInt(query.page, 10) || 1);
  const rawSize = parseInt(query.pageSize, 10) || parseInt(query.limit, 10) || defaultSize;
  const pageSize = Math.min(maxSize, Math.max(1, rawSize));
  return { page, pageSize, offset: (page - 1) * pageSize };
}

/** 安全的排序白名单 */
function orderBy(value, whitelist, fallback) {
  return whitelist[value] || fallback;
}

module.exports = { validate, pagination, orderBy };
