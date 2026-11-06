'use strict';
const path = require('path');
const dotenv = require('dotenv');

dotenv.config({ path: path.resolve(__dirname, '../../.env') });
dotenv.config({ path: path.resolve(__dirname, '../../server/.env') });

const num = (v, d) => (v === undefined || v === '' ? d : Number(v));

module.exports = {
  env: process.env.NODE_ENV || 'development',
  port: num(process.env.PORT, 4000),
  apiPrefix: process.env.API_PREFIX || '/api',
  publicBaseUrl: process.env.PUBLIC_BASE_URL || 'http://localhost:4000',
  webBaseUrl: process.env.WEB_BASE_URL || 'http://localhost:5173',

  db: {
    host: process.env.DB_HOST || '127.0.0.1',
    port: num(process.env.DB_PORT, 3306),
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME || 'feedback',
    poolLimit: num(process.env.DB_POOL_LIMIT, 10),
  },

  jwtSecret: process.env.JWT_SECRET || 'dev-secret-change-me',
  jwtExpiresIn: process.env.JWT_EXPIRES_IN || '7d',
  embedSecret: process.env.EMBED_SECRET || 'dev-embed-secret',

  uploadDir: path.resolve(process.env.UPLOAD_DIR || path.join(__dirname, '../../server/uploads')),
  maxUploadMb: num(process.env.MAX_UPLOAD_MB, 5),
  allowMime: (process.env.ALLOW_MIME || 'image/png,image/jpeg,image/gif,image/webp').split(','),
  // 反馈附件（C 端提交）：图片与视频分别限额
  allowImageMime: (process.env.ALLOW_IMAGE_MIME || 'image/png,image/jpeg,image/jpg,image/gif,image/webp').split(','),
  allowVideoMime: (process.env.ALLOW_VIDEO_MIME || 'video/mp4,video/webm,video/quicktime').split(','),
  maxVideoMb: num(process.env.MAX_VIDEO_MB, 50),
  maxPostAttachments: num(process.env.MAX_POST_ATTACHMENTS, 9),
  anonUploadMax: num(process.env.ANON_UPLOAD_MAX, 30),

  // 文件存储：local（本地磁盘，默认）/ cos（腾讯云）/ oss（阿里云）
  storage: {
    driver: (process.env.STORAGE_DRIVER || 'local').toLowerCase(),
    cos: {
      secretId: process.env.COS_SECRET_ID || '',
      secretKey: process.env.COS_SECRET_KEY || '',
      bucket: process.env.COS_BUCKET || '',
      region: process.env.COS_REGION || 'ap-guangzhou',
      // 对象 key 前缀（如 feedback/），需与 bucket 内目录一致；留空表示根目录
      prefix: process.env.COS_PREFIX || '',
      // 加速域名（不含协议），配置后 URL 用它；留空用默认存储桶域名
      cdnDomain: process.env.COS_CDN_DOMAIN || '',
    },
    oss: {
      accessKeyId: process.env.OSS_ACCESS_KEY_ID || '',
      accessKeySecret: process.env.OSS_ACCESS_KEY_SECRET || '',
      bucket: process.env.OSS_BUCKET || '',
      endpoint: process.env.OSS_ENDPOINT || 'oss-cn-hangzhou.aliyuncs.com',
      prefix: process.env.OSS_PREFIX || '',
      cdnDomain: process.env.OSS_CDN_DOMAIN || '',
    },
  },

  rateLimit: {
    windowMs: num(process.env.RATE_LIMIT_WINDOW_MS, 60000),
    max: num(process.env.RATE_LIMIT_MAX, 120),
  },
  anonSubmitMax: num(process.env.ANON_SUBMIT_MAX, 5),

  smtp: {
    host: process.env.SMTP_HOST || '',
    port: num(process.env.SMTP_PORT, 465),
    user: process.env.SMTP_USER || '',
    pass: process.env.SMTP_PASS || '',
    from: process.env.MAIL_FROM || 'Feedback <no-reply@example.com>',
  },
};
