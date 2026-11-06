'use strict';
/**
 * 系统配置服务：system_settings 表读写，进程内缓存（TTL 5 秒）降低查询压力。
 * 优先级：DB 配置 > .env 环境变量 > 代码默认值。
 *
 * 配置键一览（与 .env 同名，便于对照）：
 *   storage.driver / storage.upload_dir
 *   cos.secret_id / cos.secret_key / cos.bucket / cos.region / cos.prefix / cos.cdn_domain
 *   oss.access_key_id / oss.access_key_secret / oss.bucket / oss.endpoint / oss.prefix / oss.cdn_domain
 *   site.name                    站点名称
 */

const db = require('../config/db');

const TTL_MS = 5000;

let cache = { at: 0, map: null };

async function loadAll() {
  if (cache.map && Date.now() - cache.at < TTL_MS) return cache.map;
  const rows = await db.query('SELECT setting_key, value FROM system_settings');
  const map = {};
  for (const r of rows) map[r.setting_key] = r.value; // mysql2 已把 JSON 列解析为对象
  cache = { at: Date.now(), map };
  return map;
}

/** 写后立即失效缓存，保证下次读取拿到最新值 */
function invalidate() {
  cache = { at: 0, map: null };
}

/** 读取单个配置；未设置返回 def */
async function get(key, def = null) {
  const map = await loadAll();
  return (key in map) ? map[key] : def;
}

/** 批量读取（一次查询，TTL 内共用缓存） */
async function getMany(keys) {
  const map = await loadAll();
  const out = {};
  for (const k of keys) out[k] = (k in map) ? map[k] : null;
  return out;
}

/** 写入配置（upsert），userId 为操作者 */
async function set(key, value, userId = null) {
  const json = JSON.stringify(value === undefined ? null : value);
  await db.exec(
    `INSERT INTO system_settings (setting_key, value, updated_by) VALUES (?, ?, ?)
     ON DUPLICATE KEY UPDATE value = VALUES(value), updated_by = VALUES(updated_by)`,
    [key, json, userId]
  );
  invalidate();
}

/** 读取某个分组下的全部已配置键（如 storage.*），用于后台回显 */
async function getGroup(prefix) {
  const map = await loadAll();
  const out = {};
  const p = prefix + '.';
  for (const k of Object.keys(map)) {
    if (k.startsWith(p)) out[k.slice(p.length)] = map[k];
  }
  return out;
}

module.exports = { get, getMany, set, getGroup, invalidate };
