'use strict';
/**
 * 存储抽象层：统一本地文件 / 腾讯云 COS / 阿里云 OSS 三种驱动。
 *
 * 驱动接口（所有驱动一致）：
 *   save({ buffer, ext, dir, contentType }) -> { url, key }
 *   remove(url)                            -> Promise<boolean>
 *   exists(url)                            -> Promise<boolean>
 *   parseKey(url)                          -> string | null   白名单+格式校验，null 表示非本站托管
 *   test()                                 -> Promise<{ ok, message }>  连通性探测
 *
 * 配置来源：DB（system_settings）> .env > 代码默认。
 * getStorage() 为异步：配置变更后自动重建驱动实例（按配置 hash 缓存）。
 */

const settings = require('./settings');

const SETTING_KEYS = [
  'storage.driver',
  'cos.secret_id', 'cos.secret_key', 'cos.bucket', 'cos.region', 'cos.prefix', 'cos.cdn_domain',
  'oss.access_key_id', 'oss.access_key_secret', 'oss.bucket', 'oss.endpoint', 'oss.prefix', 'oss.cdn_domain',
];

/** 合并 env 与 DB 配置得到当前生效的存储配置 */
async function storageConfig() {
  const s = await settings.getMany(SETTING_KEYS);
  const env = require('../config/env'); // 延迟 require，避免循环依赖
  const str = (v, d) => (v === undefined || v === null || v === '' ? d : String(v));
  return {
    driver: str(s['storage.driver'], env.storage.driver),
    uploadDir: env.uploadDir,
    cos: {
      secretId: str(s['cos.secret_id'], env.storage.cos.secretId),
      secretKey: str(s['cos.secret_key'], env.storage.cos.secretKey),
      bucket: str(s['cos.bucket'], env.storage.cos.bucket),
      region: str(s['cos.region'], env.storage.cos.region),
      prefix: str(s['cos.prefix'], env.storage.cos.prefix),
      cdnDomain: str(s['cos.cdn_domain'], env.storage.cos.cdnDomain),
    },
    oss: {
      accessKeyId: str(s['oss.access_key_id'], env.storage.oss.accessKeyId),
      accessKeySecret: str(s['oss.access_key_secret'], env.storage.oss.accessKeySecret),
      bucket: str(s['oss.bucket'], env.storage.oss.bucket),
      endpoint: str(s['oss.endpoint'], env.storage.oss.endpoint),
      prefix: str(s['oss.prefix'], env.storage.oss.prefix),
      cdnDomain: str(s['oss.cdn_domain'], env.storage.oss.cdnDomain),
    },
  };
}

/** 按需加载官方 SDK；未安装时给出可操作的错误提示 */
function loadSdk(driver, pkg) {
  try {
    return require(pkg);
  } catch (e) {
    if (e.code === 'MODULE_NOT_FOUND') {
      throw new Error(`存储驱动 ${driver} 依赖 ${pkg}，请先执行：npm install ${pkg}`);
    }
    throw e;
  }
}

function createDriver(cfg) {
  switch (cfg.driver) {
    case 'cos': return require('./drivers/cos').create(cfg, loadSdk);
    case 'oss': return require('./drivers/oss').create(cfg, loadSdk);
    case 'local': return require('./drivers/local').create(cfg);
    default:
      throw new Error(`未知存储驱动 STORAGE_DRIVER=${cfg.driver}（可选：local / cos / oss）`);
  }
}

let cached = null; // { hash, driver }

/** 获取当前存储驱动（异步；配置变更自动重建） */
async function getStorage() {
  const cfg = await storageConfig();
  const hash = JSON.stringify(cfg);
  if (cached && cached.hash === hash) return cached.driver;
  cached = { hash, driver: createDriver(cfg) };
  return cached.driver;
}

module.exports = { getStorage, storageConfig, createDriver, loadSdk };
