import React, { useState, useEffect } from 'react';
import { useOutletContext } from 'react-router-dom';
import api from '../lib/api';
import { Button, Modal, Field, toast, Spinner, Empty } from '../components/ui';

const STATUS_LABEL = { planned: '计划中', in_progress: '进行中', released: '已发布' };

export default function Changelogs() {
  const { id } = useOutletContext();
  const [list, setList] = useState([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState({ title: '', content: '', version: '', status: 'planned', is_published: false });
  const [saving, setSaving] = useState(false);
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  async function load() { setLoading(true); try { const r = await api.get(`/products/${id}/changelogs`); setList(r.data.changelogs); } finally { setLoading(false); } }
  useEffect(() => { load(); }, [id]);

  function openNew() { setEditing(null); setForm({ title: '', content: '', version: '', status: 'planned', is_published: false }); setOpen(true); }
  function openEdit(c) { setEditing(c); setForm({ title: c.title, content: c.content || '', version: c.version || '', status: c.status, is_published: !!c.is_published }); setOpen(true); }
  async function save() {
    if (!form.title.trim()) return toast('请填写标题', 'error');
    setSaving(true);
    try {
      if (editing) await api.patch(`/products/${id}/changelogs/${editing.id}`, form);
      else await api.post(`/products/${id}/changelogs`, form);
      toast('已保存', 'success'); setOpen(false); load();
    } catch (e) { toast(e.message, 'error'); }
    finally { setSaving(false); }
  }
  async function del(c) { if (!window.confirm('删除该记录？')) return; await api.delete(`/products/${id}/changelogs/${c.id}`).catch(() => {}); toast('已删除', 'success'); load(); }

  return (
    <div>
      <div className="row between"><h1 className="page-title">更新日志 / 路线图</h1><Button variant="primary" size="sm" onClick={openNew}>+ 新建</Button></div>
      <p className="page-sub">对外发布产品更新与路线图，让用户看到进展。</p>
      {loading ? <Spinner /> : list.length === 0 ? <Empty icon="file-text" text="还没有更新日志" /> :
        <div className="card mt-3" style={{ overflow: 'hidden' }}>
          <table className="table">
            <thead><tr><th>版本</th><th>标题</th><th>状态</th><th>发布</th><th></th></tr></thead>
            <tbody>
              {list.map((c) => (
                <tr key={c.id}>
                  <td className="small text-2">{c.version || '-'}</td>
                  <td className="bold">{c.title}</td>
                  <td><span className={`badge badge-status-${c.status}`}>{STATUS_LABEL[c.status]}</span></td>
                  <td className="small text-2">{c.is_published ? '已公开' : '草稿'}</td>
                  <td className="row gap-2"><a style={{ color: 'var(--primary)', cursor: 'pointer' }} onClick={() => openEdit(c)}>编辑</a><a style={{ color: 'var(--red)', cursor: 'pointer' }} onClick={() => del(c)}>删除</a></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>}
      <Modal title={editing ? '编辑记录' : '新建更新日志'} open={open} onClose={() => setOpen(false)}
        footer={<><Button onClick={() => setOpen(false)}>取消</Button><Button variant="primary" loading={saving} onClick={save}>保存</Button></>}>
        <Field label="标题"><input value={form.title} onChange={set('title')} /></Field>
        <div className="row gap-3">
          <div style={{ flex: 1 }}><Field label="版本号"><input value={form.version} onChange={set('version')} placeholder="v1.2.0" /></Field></div>
          <div style={{ flex: 1 }}><Field label="状态">
            <select value={form.status} onChange={set('status')}>
              <option value="planned">计划中</option><option value="in_progress">进行中</option><option value="released">已发布</option>
            </select>
          </Field></div>
        </div>
        <Field label="内容"><textarea value={form.content} onChange={set('content')} style={{ minHeight: 100 }} /></Field>
        <label className="row gap-2"><input type="checkbox" checked={form.is_published} onChange={(e) => setForm((f) => ({ ...f, is_published: e.target.checked }))} style={{ width: 'auto' }} /> 立即发布到公开页</label>
      </Modal>
    </div>
  );
}
