'use strict';
const express = require('express');
const db = require('../config/db');
const config = require('../config/env');
const { ok } = require('../utils/response');
const { assetUrl } = require('../utils/assetUrl');

const router = express.Router();

// 嵌入配置：供第三方站点加载 iframe / widget 使用
router.get('/embed', async (req, res, next) => {
  try {
    const p = req.product;
    const categories = await db.query('SELECT id,name,slug,color,icon FROM categories WHERE product_id = ? ORDER BY sort_order ASC, id ASC', [p.id]);
    const hideBranding = !!p.hide_branding;
    return ok(res, {
      slug: p.slug,
      name: p.name,
      logoUrl: assetUrl(p.logo_url),
      themeColor: p.theme_color,
      title: p.name + ' · 反馈',
      baseUrl: config.publicBaseUrl,
      iframeUrl: `/embed/${p.slug}`,
      allowVote: !!p.allow_vote,
      allowComment: !!p.allow_comment,
      allowAnonymous: !!p.allow_anonymous,
      hideBranding,
      categories,
    });
  } catch (e) { next(e); }
});

module.exports = router;
