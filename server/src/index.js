'use strict';
const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const morgan = require('morgan');
const config = require('./config/env');
const db = require('./config/db');
const { requireAuth } = require('./middleware/auth');
const { loadProduct, loadPublicProduct, requireMember } = require('./middleware/product');
const { resolveEndUser } = require('./middleware/auth');
const { anonUpload } = require('./middleware/rateLimit');
const { notFoundHandler, errorHandler } = require('./middleware/error');
const { seed } = require('../scripts/seed');
const { assetOrigin } = require('./utils/assetUrl');

const app = express();

// 记录本次请求的对外 origin（反代后的真实域名，如 api.example.com），
// 供 assetUrl 拼接附件/图片绝对地址使用。必须挂在所有路由之前。
app.use(assetOrigin);

// CORS：直接允许所有来源（反射请求 Origin 并允许凭证），支持前后端分域名、以及任意第三方域名嵌入。
app.use(cors({ origin: true, credentials: true }));
app.use(express.json({ limit: '2mb' }));
app.use(express.urlencoded({ extended: false }));
if (config.env !== 'test') app.use(morgan('dev'));
app.use('/uploads', express.static(config.uploadDir));

// 生产环境：若前端已构建，则托管 dist 并提供 SPA 回退
const webDist = path.resolve(__dirname, '../../web/dist');
if (config.env === 'production' && fs.existsSync(webDist)) {
  app.use(express.static(webDist));
  app.get(/^(?!\/api|\/uploads).*/, (req, res) => {
    res.sendFile(path.join(webDist, 'index.html'));
  });
}

app.get('/api/health', async (req, res) => {
  const okDb = await db.ping().catch(() => false);
  res.json({ status: 'ok', db: okDb ? 'up' : 'down', time: new Date().toISOString() });
});

// ---- 平台（需登录）----
app.use('/api/auth', require('./routes/auth'));
app.use('/api/products', require('./routes/products'));
app.use('/api/products/:productId/logo', requireAuth, loadProduct, requireMember, require('./routes/logo'));
app.use('/api/products/:productId/categories', requireAuth, loadProduct, requireMember, require('./routes/categories'));
app.use('/api/products/:productId/tags', requireAuth, loadProduct, requireMember, require('./routes/tags'));
app.use('/api/products/:productId/posts', requireAuth, loadProduct, requireMember, require('./routes/posts'));
app.use('/api/products/:productId/faqs', requireAuth, loadProduct, requireMember, require('./routes/faqs'));
app.use('/api/products/:productId/changelogs', requireAuth, loadProduct, requireMember, require('./routes/changelogs'));
app.use('/api/products/:productId/stats', requireAuth, loadProduct, requireMember, require('./routes/stats'));
app.use('/api/products/:productId/notifications', requireAuth, loadProduct, requireMember, require('./routes/notifyBindings'));
app.use('/api/products/:productId/tokens', requireAuth, loadProduct, requireMember, require('./routes/tokens'));
app.use('/api/me/notifications', require('./routes/notifications'));
app.use('/api/me/notify-templates', require('./routes/notifyTemplates'));
app.use('/api/me/smtp-configs', require('./routes/smtpConfigs'));
app.use('/api/upload', require('./routes/upload'));

// ---- C 端公开（按 slug）----
const publicRouter = require('./routes/public');
const embedRouter = require('./routes/embed');
const publicUploadRouter = require('./routes/publicUpload');
// C 端附件上传（游客身份 + 独立限流），须早于 publicRouter 挂载
app.use('/api/p/:slug/upload', loadPublicProduct, resolveEndUser, anonUpload, publicUploadRouter);
app.use('/api/p/:slug', loadPublicProduct, resolveEndUser, publicRouter);
app.use('/api/p/:slug', loadPublicProduct, resolveEndUser, embedRouter);

// ---- 兜底 ----
app.use(notFoundHandler);
// eslint-disable-next-line no-unused-vars
app.use(errorHandler);

const server = app.listen(config.port, () => {
  console.log(`🚀 Feedback API listening on http://localhost:${config.port}`);
  console.log('   CORS: 允许所有来源（反射请求 Origin）');
  console.log(`   DB: ${config.db.host}:${config.db.port}/${config.db.database}`);
  // 数据库就绪后自动播种演示数据（仅当库为空时）
  (async () => {
    for (let i = 0; i < 15; i++) {
      const okDb = await db.ping().catch(() => false);
      if (okDb) { await seed().catch((e) => console.error('[seed] 自动播种失败:', e.message)); break; }
      await new Promise((r) => setTimeout(r, 2000));
    }
  })();
});

function shutdown(sig) {
  console.log(`\n${sig} received, closing...`);
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(1), 5000);
}
process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));

module.exports = app;
