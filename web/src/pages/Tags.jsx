import React, { useState, useEffect } from 'react';
import { useOutletContext } from 'react-router-dom';
import api from '../lib/api';
import { Button, Modal, Field, toast, Spinner, Empty } from '../components/ui';
import Icon from '../components/Icon';

export default function Tags() {
  const { id } = useOutletContext();
  const [list, setList] = useState([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState({ name: '', color: '#0EA5E9' });
  const [saving, setSaving] = useState(false);
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  async function load() { setLoading(true); try { const r = await api.get(`/products/${id}/tags`); setList(r.data.tags); } finally { setLoading(false); } }
  useEffect(() => { load(); }, [id]);

  function openNew() { setEditing(null); setForm({ name: '', color: '#0EA5E9' }); setOpen(true); }
  function openEdit(t) { setEditing(t); setForm({ name: t.name, color: t.color }); setOpen(true); }
  async function save() {
    if (!form.name.trim()) return toast('请填写标签名', 'error');
    setSaving(true);
    try {
      if (editing) await api.patch(`/products/${id}/tags/${editing.id}`, form);
      else await api.post(`/products/${id}/tags`, form);
      toast('已保存', 'success'); setOpen(false); load();
    } catch (e) { toast(e.message, 'error'); }
    finally { setSaving(false); }
  }
  async function del(t) {
    if (!window.confirm(`删除标签「${t.name}」？`)) return;
    await api.delete(`/products/${id}/tags/${t.id}`).catch(() => {});
    toast('已删除', 'success'); load();
  }

  return (
    <div>
      <div className="row between"><h1 className="page-title">标签管理</h1><Button variant="primary" size="sm" onClick={openNew}>+ 新建标签</Button></div>
      <p className="page-sub">标签用于对反馈进行多维标记（如「复现中」「高优先级」）。</p>
      {loading ? <Spinner /> : list.length === 0 ? <Empty icon="tag" text="暂无标签" /> :
        <div className="row gap-2 wrap mt-3">
          {list.map((t) => (
            <span key={t.id} className="chip" style={{ borderColor: t.color, color: t.color }}>
              {t.name}
              <span style={{ marginLeft: 6, cursor: 'pointer', color: 'var(--text-3)' }} onClick={() => openEdit(t)}><Icon name="edit" size={13} /></span>
              <span style={{ marginLeft: 2, cursor: 'pointer', color: 'var(--red)' }} onClick={() => del(t)}>×</span>
            </span>
          ))}
        </div>}
      <Modal title={editing ? '编辑标签' : '新建标签'} open={open} onClose={() => setOpen(false)}
        footer={<><Button onClick={() => setOpen(false)}>取消</Button><Button variant="primary" loading={saving} onClick={save}>保存</Button></>}>
        <Field label="名称"><input value={form.name} onChange={set('name')} placeholder="如 高优先级" /></Field>
        <Field label="颜色"><input type="color" value={form.color} onChange={set('color')} style={{ width: 60, height: 38, padding: 2 }} /></Field>
      </Modal>
    </div>
  );
}
