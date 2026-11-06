import React, { useState } from 'react';
import { useParams, useNavigate, useLocation, Outlet } from 'react-router-dom';
import api from '../lib/api';
import { useAsync } from '../lib/hooks';
import AppHeader from '../components/AppHeader';
import { toast } from '../components/ui';
import Icon from '../components/Icon';

const NAV = [
  { key: 'overview', label: '概览看板', icon: 'chart', perm: null },
  { key: 'posts', label: '反馈管理', icon: 'message', perm: null },
  { key: 'categories', label: '分类管理', icon: 'tag', perm: 'category' },
  { key: 'tags', label: '标签管理', icon: 'hash', perm: 'tag' },
  { key: 'faqs', label: '常见问题', icon: 'help', perm: 'manage' },
  { key: 'changelogs', label: '更新日志', icon: 'file-text', perm: 'manage' },
  { key: 'notifications', label: '通知设置', icon: 'bell', perm: 'settings' },
  { key: 'tokens', label: 'API 密钥', icon: 'key', perm: 'settings' },
  { key: 'settings', label: '产品设置', icon: 'settings', perm: 'settings' },
];

export default function ProductLayout() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { data: product, loading, reload } = useAsync(() => api.get(`/products/${id}`).then((r) => r.data.product), [id]);
  if (loading) return <div className="loading-box"><span className="spinner" /></div>;
  if (!product) return <div className="empty">产品不存在或无权访问</div>;

  const can = product.can || {};
  const nav = NAV.filter((n) => !n.perm || can[n.perm]);

  const cur = useLocation().pathname.split('/').pop();

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="row gap-2" style={{ marginBottom: 12, padding: '0 4px' }}>
          <div className="product-logo" style={{ width: 32, height: 32, fontSize: 14, background: product.theme_color, overflow: 'hidden' }}>
            {product.logo_url
              ? <img src={product.logo_url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
              : product.name.slice(0, 1)}
          </div>
          <div style={{ minWidth: 0 }}>
            <div className="bold" style={{ fontSize: 14 }}>{product.name}</div>
            <div className="text-3 small">@{product.slug}</div>
          </div>
        </div>
        <div className="nav-item" onClick={() => navigate('/app')} title="返回产品列表">
          <Icon name="arrow-left" size={14} style={{ opacity: 0.7 }} />返回产品列表
        </div>
        <div className="nav-item" onClick={() => window.open(`/#/p/${product.slug}`, '_blank')} title="在新窗口打开公开反馈页">
          <Icon name="external-link" size={14} style={{ opacity: 0.7 }} />公开反馈页 ↗
        </div>
        <div className="divider" />
        {nav.map((n) => (
          <div key={n.key} className={`nav-item ${cur === n.key ? 'active' : ''}`} onClick={() => navigate(`/app/products/${id}/${n.key}`)}>
            <Icon name={n.icon} size={15} style={{ opacity: 0.85 }} />{n.label}
          </div>
        ))}
      </aside>
      <div className="main-area">
        <AppHeader />
        {/* 小屏侧边栏隐藏时的兜底导航：返回产品列表 + 页面切换 + 公开页 */}
        <div className="product-mobile-nav">
          <button className="btn btn-ghost btn-sm" onClick={() => navigate('/app')}><Icon name="arrow-left" size={13} style={{ marginRight: 4, verticalAlign: '-2px' }} />产品列表</button>
          <span className="product-mobile-sep" />
          {nav.map((n) => (
            <button key={n.key} className={`btn btn-sm ${cur === n.key ? 'btn-primary' : 'btn-ghost'}`} onClick={() => navigate(`/app/products/${id}/${n.key}`)}>
              <Icon name={n.icon} size={13} style={{ marginRight: 4, verticalAlign: '-2px' }} />{n.label}
            </button>
          ))}
          <span className="product-mobile-sep" />
          <button className="btn btn-ghost btn-sm" onClick={() => window.open(`/#/p/${product.slug}`, '_blank')}><Icon name="external-link" size={13} style={{ marginRight: 4, verticalAlign: '-2px' }} />公开页</button>
        </div>
        <div className="content">
          <Outlet context={{ product, id, reloadProduct: reload }} />
        </div>
      </div>
    </div>
  );
}
