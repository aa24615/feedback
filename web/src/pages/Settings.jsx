import React, { useState, useEffect, useRef } from 'react';
import { useOutletContext } from 'react-router-dom';
import api from '../lib/api';
import { Button, Field, toast, Spinner } from '../components/ui';

const BOOLS = [
  { k: 'allow_anonymous', l: '允许匿名提交', hint: '关闭后用户需提供身份（邮箱/自定义）才能反馈' },
  { k: 'require_email', l: '提交时必填邮箱', hint: '便于后续通过邮件通知处理进展' },
  { k: 'need_review', l: '新反馈需审核', hint: '开启后提交内容需管理员通过才对外公开' },
  { k: 'allow_vote', l: '开启投票', hint: '关闭后将隐藏投票按钮' },
  { k: 'allow_comment', l: '开启评论', hint: '关闭后用户无法评论' },
];

export default function Settings() {
  const { id, product, reloadProduct } = useOutletContext();
  const [form, setForm] = useState(null);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef(null);
  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  useEffect(() => {
    api.get(`/products/${id}`).then((r) => {
      const p = r.data.product;
      setForm({ name: p.name, short_desc: p.short_desc || '', description: p.description || '', logo_url: p.logo_url || '', website: p.website || '', industry: p.industry || '', theme_color: p.theme_color, welcome_message: p.welcome_message || '', visibility: p.visibility, allow_anonymous: !!p.allow_anonymous, require_email: !!p.require_email, need_review: !!p.need_review, allow_vote: !!p.allow_vote, allow_comment: !!p.allow_comment, hide_branding: !!p.hide_branding });
    }).catch(() => {});
  }, [id]);

  if (!form) return <Spinner />;
  if (!product.can?.settings) return <div className="empty">只有所有者或管理员可以修改产品设置</div>;


  async function save() {
    setSaving(true);
    try {
      await api.patch(`/products/${id}`, form);
      reloadProduct?.();
      toast('设置已保存', 'success');
    } catch (e) {
      toast(e.message, 'error');
    }
    finally { setSaving(false); }
  }

  /** 选择并上传 Logo（立即上传，不随表单保存） */
  async function onPickLogo(e) {
    const file = e.target.files && e.target.files[0];
    e.target.value = '';
    if (!file) return;
    if (file.size > 2 * 1024 * 1024) { toast('Logo 大小不能超过 2MB', 'error'); return; }
    const fd = new FormData();
    fd.append('logo', file);
    setUploading(true);
    try {
      const r = await api.post(`/products/${id}/logo`, fd);
      set('logo_url', r.data.logo_url);
      reloadProduct?.();
      toast('Logo 已更新', 'success');
    } catch (err) {
      toast(err.message, 'error');
    } finally { setUploading(false); }
  }

  /** 移除 Logo */
  async function removeLogo() {
    setUploading(true);
    try {
      await api.delete(`/products/${id}/logo`);
      set('logo_url', '');
      reloadProduct?.();
      toast('Logo 已移除', 'success');
    } catch (err) {
      toast(err.message, 'error');
    } finally { setUploading(false); }
  }

  return (
    <div>
      <h1 className="page-title">产品设置</h1>
      <p className="page-sub">配置公开反馈页的外观、提交规则与可见性。</p>

      {/* 产品 Logo */}
      <div className="card card-pad mt-3">
        <div className="bold mb-2">产品 Logo</div>
        <div className="row gap-3" style={{ alignItems: 'center' }}>
          <div className="product-logo" style={{ width: 64, height: 64, fontSize: 26, background: form.theme_color, overflow: 'hidden', flexShrink: 0 }}>
            {form.logo_url
              ? <img src={form.logo_url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
              : (form.name || '?').slice(0, 1)}
          </div>
          <div style={{ minWidth: 0 }}>
            <div className="row gap-2">
              <Button size="sm" loading={uploading} onClick={() => fileRef.current && fileRef.current.click()}>
                {form.logo_url ? '更换 Logo' : '上传 Logo'}
              </Button>
              {form.logo_url && <Button size="sm" variant="ghost" loading={uploading} onClick={removeLogo}>移除</Button>}
            </div>
            <div className="muted small mt-1">支持 PNG / JPG / GIF / WebP，不超过 2MB。将展示在公开反馈页、嵌入组件与管理后台。</div>
          </div>
        </div>
        <input ref={fileRef} type="file" accept="image/png,image/jpeg,image/gif,image/webp" style={{ display: 'none' }} onChange={onPickLogo} />
      </div>

      <div className="grid" style={{ gridTemplateColumns: '1fr 1fr', gap: 16, marginTop: 16 }}>
        <div className="card card-pad">
          <div className="bold mb-2">基础信息</div>
          <Field label="产品名称"><input value={form.name} onChange={(e) => set('name', e.target.value)} /></Field>
          <Field label="一句话简介"><input value={form.short_desc} onChange={(e) => set('short_desc', e.target.value)} /></Field>
          <div className="row gap-3">
            <div style={{ flex: 1 }}><Field label="官网"><input value={form.website} onChange={(e) => set('website', e.target.value)} placeholder="https://" /></Field></div>
            <div style={{ flex: 1 }}><Field label="行业"><input value={form.industry} onChange={(e) => set('industry', e.target.value)} /></Field></div>
          </div>
          <Field label="主题色"><input type="color" value={form.theme_color} onChange={(e) => set('theme_color', e.target.value)} style={{ width: 60, height: 38, padding: 2 }} /></Field>
          <Field label="欢迎语"><textarea value={form.welcome_message} onChange={(e) => set('welcome_message', e.target.value)} placeholder="显示在反馈页头部的引导文案" /></Field>
        </div>

        <div className="card card-pad">
          <div className="bold mb-2">提交与可见性</div>
          <Field label="可见性">
            <select value={form.visibility} onChange={(e) => set('visibility', e.target.value)}>
              <option value="public">公开（任何人可访问反馈页）</option>
              <option value="private">私有（仅团队成员可见）</option>
            </select>
          </Field>
          {BOOLS.map((b) => (
            <label key={b.k} className="row between" style={{ padding: '8px 0', borderBottom: '1px solid var(--border)' }}>
              <div><div className="small bold">{b.l}</div><div className="muted small">{b.hint}</div></div>
              <input type="checkbox" checked={form[b.k]} onChange={(e) => set(b.k, e.target.checked)} style={{ width: 'auto' }} />
            </label>
          ))}
          {/* 隐藏品牌署名 */}
          <label className="row between" style={{ padding: '8px 0' }}>
            <div>
              <div className="small bold">隐藏「由反馈墙提供」署名</div>
              <div className="muted small">开启后公开反馈页底部不再显示平台署名</div>
            </div>
            <input
              type="checkbox"
              checked={!!form.hide_branding}
              onChange={(e) => set('hide_branding', e.target.checked)}
              style={{ width: 'auto' }}
            />
          </label>
        </div>
      </div>
      <div className="mt-3"><Button variant="primary" loading={saving} onClick={save}>保存设置</Button></div>
    </div>
  );
}
