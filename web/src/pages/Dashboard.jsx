import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../lib/api';
import { useAsync } from '../lib/hooks';
import AppHeader from '../components/AppHeader';
import { Button, Modal, Field, toast, Spinner } from '../components/ui';
import Icon from '../components/Icon';
import Logo from '../components/Logo';
import { useUser } from '../store/user';

export default function Dashboard() {
  const navigate = useNavigate();
  const { data, loading, reload } = useAsync(() => api.get('/products?pageSize=50').then((r) => r.data), []);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ name: '', slug: '', short_desc: '', website: '', industry: '', theme_color: '#4F46E5' });
  const [saving, setSaving] = useState(false);
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  const products = data?.list || [];

  async function create() {
    if (!form.name.trim()) return toast('请填写产品名称', 'error');
    setSaving(true);
    try {
      const { data } = await api.post('/products', form);
      toast('产品创建成功', 'success');
      setOpen(false);
      navigate(`/app/products/${data.product.id}/overview`);
    } catch (e) {
      toast(e.message, 'error');
    }
    finally { setSaving(false); }
  }

  return (
    <div>
      <AppHeader>
        <div className="row gap-2">
          <Button variant="primary" size="sm" onClick={() => setOpen(true)}>+ 新建产品</Button>
        </div>
      </AppHeader>
      <div className="content">
        <div className="row between mb-4">
          <div>
            <h1 className="page-title">我的产品</h1>
            <p className="page-sub">创建并管理你的反馈社区，每个产品都有独立的公开反馈页。</p>
          </div>
        </div>
        {loading ? <Spinner /> :
          products.length === 0 ? (
            <div className="empty">
              <div className="big"><Logo size={44} /></div>
              <div>还没有产品，点击右上角「新建产品」开始吧</div>
            </div>
          ) : (
            <div className="grid grid-3">
              {products.map((p) => (
                <div className="card product-card" key={p.id} onClick={() => navigate(`/app/products/${p.id}/overview`)}>
                  <div className="row gap-3">
                    <div className="product-logo" style={{ background: p.theme_color, overflow: 'hidden' }}>
                      {p.logo_url
                        ? <img src={p.logo_url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                        : p.name.slice(0, 1)}
                    </div>
                    <div style={{ minWidth: 0 }}>
                      <div className="bold" style={{ fontSize: 16 }}>{p.name}</div>
                      <div className="text-3 small">@{p.slug} · {p.role === 'owner' ? '所有者' : p.role === 'admin' ? '管理员' : p.role === 'member' ? '成员' : '只读'}</div>
                    </div>
                  </div>
                  <div className="text-2 small mt-2" style={{ minHeight: 38 }}>{p.short_desc || '暂无简介'}</div>
                  <div className="row between mt-2">
                    <span className="muted small">公开反馈 {p.visible_posts || 0} 条</span>
                    <a className="small" style={{ color: 'var(--primary)' }} onClick={(e) => { e.stopPropagation(); window.open(`/#/p/${p.slug}`, '_blank'); }}>查看公开页 ↗</a>
                  </div>
                </div>
              ))}
            </div>
          )}
      </div>

      <Modal title="新建产品" open={open} onClose={() => setOpen(false)}
        footer={<>
          <Button onClick={() => setOpen(false)}>取消</Button>
          <Button variant="primary" loading={saving} onClick={create}>创建</Button>
        </>}>
        <Field label="产品名称" hint="将作为反馈社区标题，例如「XX App」"><input value={form.name} onChange={set('name')} placeholder="我的产品" /></Field>
        <Field label="链接后缀（选填）" hint="公开反馈页地址：/p/你的后缀。留空则自动生成，2-60 位字母、数字、连字符">
          <div className="row gap-2">
            <span className="muted" style={{ lineHeight: '38px' }}>/p/</span>
            <input value={form.slug} onChange={(e) => setForm((f) => ({ ...f, slug: e.target.value }))} placeholder="my-app" style={{ flex: 1 }} />
          </div>
        </Field>
        <Field label="简介（选填）"><input value={form.short_desc} onChange={set('short_desc')} placeholder="一句话描述你的产品" /></Field>
        <div className="row gap-3">
          <div style={{ flex: 1 }}><Field label="官网（选填）"><input value={form.website} onChange={set('website')} placeholder="https://" /></Field></div>
          <div style={{ flex: 1 }}><Field label="行业（选填）"><input value={form.industry} onChange={set('industry')} placeholder="如 SaaS / 游戏" /></Field></div>
        </div>
        <Field label="主题色"><input type="color" value={form.theme_color} onChange={set('theme_color')} style={{ width: 60, height: 38, padding: 2 }} /></Field>
      </Modal>
    </div>
  );
}
