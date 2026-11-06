import React, { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import api, { ensureSession } from '../lib/api';
import { Button, Empty, Spinner, toast } from '../components/ui';
import Icon from '../components/Icon';
import PostCard from '../components/PostCard';

const TYPE_OPTIONS = [
  { key: '', label: '全部类型' },
  { key: 'feedback', label: '建议' },
  { key: 'bug', label: '问题' },
  { key: 'complaint', label: '吐槽' },
  { key: 'question', label: '提问' },
];
const STATUS_OPTIONS = [
  { key: '', label: '全部状态' },
  { key: 'pending', label: '待处理' },
  { key: 'planned', label: '已规划' },
  { key: 'in_progress', label: '处理中' },
  { key: 'resolved', label: '已解决' },
  { key: 'closed', label: '已关闭' },
];
const SORT_OPTIONS = [
  { key: 'newest', label: '最新' },
  { key: 'votes', label: '最热' },
  { key: 'comments', label: '评论多' },
];

export default function PublicBoard({ embed = false }) {
  const { slug } = useParams();
  const navigate = useNavigate();
  const [product, setProduct] = useState(null);
  const [categories, setCategories] = useState([]);
  const [posts, setPosts] = useState([]);
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [filters, setFilters] = useState({ type: '', status: '', categoryId: '', sort: 'newest', keyword: '' });
  const isEmbed = embed || (typeof window !== 'undefined' && window.self !== window.top);

  const loadPosts = useCallback(async () => {
    setLoading(true);
    try {
      const qs = new URLSearchParams();
      if (filters.type) qs.set('type', filters.type);
      if (filters.status) qs.set('status', filters.status);
      if (filters.categoryId) qs.set('categoryId', filters.categoryId);
      if (filters.sort) qs.set('sort', filters.sort);
      if (filters.keyword) qs.set('keyword', filters.keyword);
      const { data } = await api.get(`/p/${slug}/posts?${qs.toString()}`);
      setPosts(data.list || []);
    } finally { setLoading(false); }
    // eslint-disable-next-line
  }, [slug, filters]);

  useEffect(() => {
    let alive = true;
    (async () => {
      await ensureSession(slug);
      try {
        const { data } = await api.get(`/p/${slug}`);
        if (!alive) return;
        setProduct(data.product); setCategories(data.categories || []); setStats(data.stats);
      } catch {
        if (alive) setProduct(false);
      }
    })();
  }, [slug]);

  useEffect(() => { loadPosts(); }, [loadPosts]);

  if (product === false) {
    return <div className="public-shell"><div className="empty"><div className="big" style={{ color: 'var(--text-3)' }}><Icon name="lock" size={34} strokeWidth={1.5} /></div>该产品不存在或暂未公开</div></div>;
  }
  if (!product) return <Spinner />;
  const theme = product.theme_color || '#4F46E5';

  return (
    <div className="public-shell" style={embed ? { paddingTop: 10, paddingBottom: 20 } : null}>
      {!isEmbed && (
        <div className="public-header" style={{ background: theme }}>
          <div className="row gap-3">
            <div className="product-logo" style={{ background: 'rgba(255,255,255,.25)' }}>
              {(product.logo_url ? <img src={product.logo_url} alt="" style={{ width: 44, height: 44, borderRadius: 10 }} /> : product.name.slice(0, 1))}
            </div>
            <div>
              <div style={{ fontSize: 22, fontWeight: 900 }}>{product.name}</div>
              <div style={{ opacity: .9 }}>{product.short_desc || '欢迎提出你的建议、问题与吐槽'}</div>
            </div>
          </div>
          {product.welcome_message && <div style={{ opacity: .92, marginTop: 12 }}>{product.welcome_message}</div>}
        </div>
      )}

      <div className="row between wrap gap-3" style={{ marginBottom: 12 }}>
        <Button variant="primary" onClick={() => navigate(`/p/${slug}/new`)}>+ 提交反馈</Button>
        {!isEmbed && !product.hide_branding && <a className="small text-2" style={{ cursor: 'pointer' }} onClick={() => navigate('/')}>由 反馈墙 提供</a>}
      </div>

      <div className="filter-bar">
        <input className="search-input" placeholder="搜索反馈…" value={filters.keyword}
          onChange={(e) => setFilters((f) => ({ ...f, keyword: e.target.value }))} />
        {[{ key: '', label: '全部分类' }, ...categories.map((c) => ({ key: String(c.id), label: c.name }))].map((c) => (
          <span key={c.key} className={`chip ${filters.categoryId === c.key ? 'active' : ''}`} onClick={() => setFilters((f) => ({ ...f, categoryId: c.key }))}>{c.label}</span>
        ))}
      </div>
      <div className="filter-bar">
        {TYPE_OPTIONS.map((t) => (<span key={t.key} className={`chip ${filters.type === t.key ? 'active' : ''}`} onClick={() => setFilters((f) => ({ ...f, type: t.key }))}>{t.label}</span>))}
        <span className="filter-spacer" />
        {STATUS_OPTIONS.map((s) => (<span key={s.key} className={`chip ${filters.status === s.key ? 'active' : ''}`} onClick={() => setFilters((f) => ({ ...f, status: s.key }))}>{s.label}</span>))}
        <select className="filter-sort" value={filters.sort} onChange={(e) => setFilters((f) => ({ ...f, sort: e.target.value }))} style={{ width: 'auto' }}>
          {SORT_OPTIONS.map((s) => <option key={s.key} value={s.key}>{s.label}</option>)}
        </select>
      </div>

      {loading ? <Spinner /> :
        posts.length === 0 ? <Empty icon="message" text="还没有反馈，来做第一个吧！" /> :
          <div className="col gap-3">
            {posts.map((p) => <PostCard key={p.id} post={p} slug={slug} onOpen={(id) => navigate(`/p/${slug}/posts/${id}`)} />)}
          </div>}
    </div>
  );
}
