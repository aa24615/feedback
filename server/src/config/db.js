'use strict';
const mysql = require('mysql2/promise');
const config = require('./env');

const pool = mysql.createPool({
  host: config.db.host,
  port: config.db.port,
  user: config.db.user,
  password: config.db.password,
  database: config.db.database,
  waitForConnections: true,
  connectionLimit: config.db.poolLimit,
  queueLimit: 0,
  charset: 'utf8mb4',
  timezone: '+08:00',
  namedPlaceholders: false,
  multipleStatements: false,
  // BIGINT / DECIMAL 以 JS number 返回
  supportBigNumbers: false,
  bigNumberStrings: false,
  typeCast: (field, next) => {
    if (field.type === 'TINY' && field.length === 1) return field.string() === '1';
    if (field.type === 'JSON') {
      // JSON 列默认按 BINARY 解释，需显式指定 utf8，否则中文双重编码
      const v = field.string('utf8');
      if (v == null) return null;
      try {
        return JSON.parse(v);
      } catch {
        return null;
      }
    }
    return next();
  },
});

/**
 * 执行查询，返回行数组
 */
async function query(sql, params = []) {
  const [rows] = await pool.execute(sql, params);
  return rows;
}

async function queryOne(sql, params = []) {
  const rows = await query(sql, params);
  return rows[0] || null;
}

async function exec(sql, params = []) {
  const [result] = await pool.execute(sql, params);
  return result;
}

/**
 * 批量插入（兼容 prepared statement：手工展开占位符）
 * 注意：table / columns 必须是代码内的硬编码值，不要传用户输入
 */
async function bulkInsert(table, columns, rows) {
  if (!rows.length) return;
  const one = `(${columns.map(() => '?').join(',')})`;
  const placeholders = rows.map(() => one).join(', ');
  const flat = rows.flat();
  const [result] = await pool.execute(`INSERT INTO ${table} (${columns.join(', ')}) VALUES ${placeholders}`, flat);
  return result;
}

async function transaction(fn) {
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const out = await fn({
      query: async (sql, params = []) => {
        const [rows] = await conn.execute(sql, params);
        return rows;
      },
      queryOne: async (sql, params = []) => {
        const [rows] = await conn.execute(sql, params);
        return rows[0] || null;
      },
      exec: async (sql, params = []) => {
        const [result] = await conn.execute(sql, params);
        return result;
      },
    });
    await conn.commit();
    return out;
  } catch (err) {
    await conn.rollback().catch(() => {});
    throw err;
  } finally {
    conn.release();
  }
}

async function ping() {
  const row = await queryOne('SELECT 1 AS ok');
  return !!row;
}

module.exports = { pool, query, queryOne, exec, bulkInsert, transaction, ping };
