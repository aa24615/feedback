'use strict';
// 种子数据：当数据库为空时自动创建唯一管理员账号 + 一个示例产品与示例反馈。
// 开源版：内置管理员账号；邮箱/密码可通过环境变量覆盖。
const bcrypt = require('bcryptjs');
const db = require('../src/config/db');
const { slugify, shortId } = require('../src/utils/ids');

const ADMIN_EMAIL = process.env.ADMIN_EMAIL || 'admin@feedback.local';
const ADMIN_PASS = process.env.ADMIN_PASSWORD || 'admin123456';

async function ensureCategories(productId) {
  const exists = await db.queryOne('SELECT id FROM categories WHERE product_id = ? LIMIT 1', [productId]);
  if (exists) return;
  const cats = [
    { name: '产品建议', slug: 'suggestion', color: '#4F46E5', icon: '💡', def: 1 },
    { name: '问题反馈', slug: 'bug', color: '#EF4444', icon: '🐞', def: 0 },
    { name: '吐槽', slug: 'complaint', color: '#F59E0B', icon: '😤', def: 0 },
    { name: '其他', slug: 'other', color: '#6B7280', icon: '💬', def: 0 },
  ];
  for (const c of cats) {
    await db.exec(
      'INSERT INTO categories (product_id, name, slug, color, icon, sort_order, is_default) VALUES (?,?,?,?,?,0,?)',
      [productId, c.name, c.slug, c.color, c.icon, c.def]
    );
  }
}

async function seed() {
  const u = await db.queryOne('SELECT id FROM users LIMIT 1');
  if (u) {
    console.log('[seed] 数据库已有数据，跳过');
    return;
  }
  console.log('[seed] 开始写入初始数据（唯一管理员账号 + 示例产品）...');

  const passwordHash = await bcrypt.hash(ADMIN_PASS, 10);
  const userRes = await db.exec(
    'INSERT INTO users (email, password_hash, nickname, company, email_verified) VALUES (?,?,?,?,1)',
    [ADMIN_EMAIL.toLowerCase(), passwordHash, '管理员', null]
  );
  const userId = userRes.insertId;
  // 示例产品默认隐藏「由反馈墙提供」署名
  let slug = 'demo';
  const slugExists = await db.queryOne('SELECT id FROM products WHERE slug = ?', [slug]);
  if (slugExists) slug = `demo-${shortId(4)}`;
  const prodRes = await db.exec(
    `INSERT INTO products (owner_id, name, slug, short_desc, description, theme_color, welcome_message, allow_anonymous, allow_vote, allow_comment, hide_branding)
     VALUES (?, '演示产品 Demo', ?, '一个用于收集用户反馈的演示产品', '在这里体验反馈收集、投票、评论与状态流转的完整流程。', '#4F46E5', '欢迎提出你的建议或问题，我们会认真对待每一条反馈。', 1, 1, 1, 1)`,
    [userId, slug]
  );
  const productId = prodRes.insertId;
  await db.exec('INSERT INTO product_members (product_id, user_id, role, can_reply) VALUES (?,?,?,1)', [productId, userId, 'owner']);
  await db.exec('UPDATE products SET member_count = 1 WHERE id = ?', [productId]);
  await ensureCategories(productId);

  const cats = await db.query('SELECT id, slug FROM categories WHERE product_id = ?', [productId]);
  const catMap = {};
  cats.forEach((c) => (catMap[c.slug] = c.id));

  const samples = [
    { title: '希望增加深色模式', content: '晚上使用产品时眼睛很累，强烈建议增加深色模式，体验会好很多。', type: 'feedback', cat: 'suggestion', status: 'planned', votes: 28, comments: 3 },
    { title: '导出功能偶尔报错', content: '在导出超过 1000 条数据时，页面会卡住并最终报错，希望尽快修复。', type: 'bug', cat: 'bug', status: 'in_progress', votes: 15, comments: 2 },
    { title: '新版首页加载太慢了', content: '更新之后首页打开要 5 秒以上，比之前慢太多了，吐槽一下。', type: 'complaint', cat: 'complaint', status: 'pending', votes: 9, comments: 1 },
    { title: '能否支持微信扫码登录', content: '很多用户都用微信，支持扫码登录会降低注册门槛。', type: 'feedback', cat: 'suggestion', status: 'resolved', votes: 42, comments: 4 },
    { title: '移动端排版有些错位', content: '在 iPhone 上部分按钮文字被截断，请检查一下。', type: 'bug', cat: 'bug', status: 'closed', votes: 6, comments: 1 },
  ];

  let seq = 0;
  for (const s of samples) {
    seq += 1;
    const catId = catMap[s.cat] || null;
    const r = await db.exec(
      `INSERT INTO posts (product_id, seq, title, content, type, category_id, status, author_id, author_name, author_avatar, review_state, source, vote_count, comment_count, responded_at, created_at)
       VALUES (?,?,?,?,?,?,?, NULL, '热心用户', NULL, 'approved', 'web', ?, ?, NOW(), DATE_SUB(NOW(), INTERVAL ? DAY))`,
      [productId, seq, s.title, s.content, s.type, catId, s.status, s.votes, s.comments, seq]
    );
    const postId = r.insertId;
    // 投票占位（匿名）
    for (let i = 0; i < s.votes; i++) {
      await db.exec('INSERT IGNORE INTO votes (post_id, voter_key) VALUES (?,?)', [postId, `seed:${seq}:${i}`]).catch(() => {});
    }
    // 官方回复（对 resolved / in_progress 的给一条）
    if (s.status === 'resolved' || s.status === 'in_progress' || s.status === 'planned') {
      await db.exec(
        "INSERT INTO comments (post_id, parent_id, author_type, author_id, author_name, content, is_official) VALUES (?, NULL, 'member', ?, '演示管理员', ?, 1)",
        [postId, userId, `感谢你的反馈，我们已经${s.status === 'resolved' ? '完成' : '在处理'}这个问题，预计近期上线。`]
      );
    }
  }
  await db.exec('UPDATE products SET post_counter = ?, post_count = ? WHERE id = ?', [seq, seq, productId]);
  console.log(`[seed] 完成。管理员账号 ${ADMIN_EMAIL} / ${ADMIN_PASS}（请登录后尽快修改密码），产品 slug: ${slug}`);
  console.log(`       公开反馈页: /p/${slug}`);
}

if (require.main === module) {
  seed().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
}

module.exports = { seed };
