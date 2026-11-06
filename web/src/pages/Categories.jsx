import React, { useState, useEffect } from 'react';
import { useOutletContext } from 'react-router-dom';
import api from '../lib/api';
import { Button, Modal, Field, toast, Spinner, Empty } from '../components/ui';

export default function Categories() {
  const { id } = useOutletContext();
  const [list, setList] = useState([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState({ name: '', color: '#6366F1', icon: '', description: '' });
  const [saving, setSaving] = useState(false);
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  async function load() { setLoading(true); try { const r = await api.get(`/products/${id}/categories`); setList(r.data.categories); } finally { setLoading(false); } }
  useEffect(() => { load(); }, [id]);

  function openNew() { setEditing(null); setForm({ name: '', color: '#6366F1', icon: '', description: '' }); setOpen(true); }
  function openEdit(c) { setEditing(c); setForm({ name: c.name, color: c.color, icon: c.icon || '', description: c.description || '' }); setOpen(true); }
  async function save() {
    if (!form.name.trim()) return toast('请填写分类名称', 'error');
    setSaving(true);
    try {
      if (editing) await api.patch(`/products/${id}/categories/${editing.id}`, form);
      else await api.post(`/products/${id}/categories`, form);
      toast('已保存', 'success'); setOpen(false); load();
    } catch (e) { toast(e.message, 'error'); }
    finally { setSaving(false); }
  }
  async function del(c) {
    if (!window.confirm(`删除分类「${c.name}」？其下反馈将变为未分类`)) return;
    await api.delete(`/products/${id}/categories/${c.id}`).catch(() => {});
    toast('已删除', 'success'); load();
  }

  return (
    <div>
      <div className="row between"><h1 className="page-title">分类管理</h1><Button variant="primary" size="sm" onClick={openNew}>+ 新建分类</Button></div>
      <p className="page-sub">分类帮助用户高效提交反馈，也方便团队处理。</p>
      {loading ? <Spinner /> : list.length === 0 ? <Empty icon="tag" text="还没有分类，新建一个吧" /> :
        <div className="card mt-3" style={{ overflow: 'hidden' }}>
          <table className="table">
            <thead><tr><th>颜色</th><th>名称</th><th>标识</th><th>描述</th><th></th></tr></thead>
            <tbody>
              {list.map((c) => (
                <tr key={c.id}>
                  <td><span style={{ width: 18, height: 18, borderRadius: 5, background: c.color, display: 'inline-block' }} /></td>
                  <td className="bold">{c.icon || ''} {c.name}{c.is_default && <span className="tag-chip">默认</span>}</td>
                  <td className="muted small">{c.slug}</td>
                  <td className="text-2 small">{c.description || '-'}</td>
                  <td className="row gap-2">
                    <a style={{ color: 'var(--primary)', cursor: 'pointer' }} onClick={() => openEdit(c)}>编辑</a>
                    {!c.is_default && <a style={{ color: 'var(--red)', cursor: 'pointer' }} onClick={() => del(c)}>删除</a>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>}
      <Modal title={editing ? '编辑分类' : '新建分类'} open={open} onClose={() => setOpen(false)}
        footer={<><Button onClick={() => setOpen(false)}>取消</Button><Button variant="primary" loading={saving} onClick={save}>保存</Button></>}>
        <Field label="名称"><input value={form.name} onChange={set('name')} /></Field>
        <div className="row gap-3">
          <div style={{ flex: 1 }}><Field label="图标（emoji）"><input value={form.icon} onChange={set('icon')} placeholder="💡" /></Field></div>
          <div style={{ flex: 1 }}><Field label="颜色"><input type="color" value={form.color} onChange={set('color')} style={{ width: 60, height: 38, padding: 2 }} /></Field></div>
        </div>
        <Field label="描述"><input value={form.description} onChange={set('description')} /></Field>
      </Modal>
    </div>
  );
}
