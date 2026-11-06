import React, { useState, useEffect } from 'react';
import { useOutletContext } from 'react-router-dom';
import api from '../lib/api';
import { Button, Modal, Field, toast, Spinner, Empty } from '../components/ui';

export default function Faqs() {
  const { id } = useOutletContext();
  const [list, setList] = useState([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState({ question: '', answer: '', is_published: true, sort_order: 0 });
  const [saving, setSaving] = useState(false);
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  async function load() { setLoading(true); try { const r = await api.get(`/products/${id}/faqs`); setList(r.data.faqs); } finally { setLoading(false); } }
  useEffect(() => { load(); }, [id]);

  function openNew() { setEditing(null); setForm({ question: '', answer: '', is_published: true, sort_order: 0 }); setOpen(true); }
  function openEdit(f) { setEditing(f); setForm({ question: f.question, answer: f.answer, is_published: !!f.is_published, sort_order: f.sort_order }); setOpen(true); }
  async function save() {
    if (!form.question.trim() || !form.answer.trim()) return toast('请填写问题与答案', 'error');
    setSaving(true);
    try {
      if (editing) await api.patch(`/products/${id}/faqs/${editing.id}`, form);
      else await api.post(`/products/${id}/faqs`, form);
      toast('已保存', 'success'); setOpen(false); load();
    } catch (e) { toast(e.message, 'error'); }
    finally { setSaving(false); }
  }
  async function del(f) { if (!window.confirm('删除该常见问题？')) return; await api.delete(`/products/${id}/faqs/${f.id}`).catch(() => {}); toast('已删除', 'success'); load(); }

  return (
    <div>
      <div className="row between"><h1 className="page-title">常见问题</h1><Button variant="primary" size="sm" onClick={openNew}>+ 新建</Button></div>
      <p className="page-sub">在公开反馈页展示 FAQ，减少重复提问。</p>
      {loading ? <Spinner /> : list.length === 0 ? <Empty icon="help" text="还没有常见问题" /> :
        <div className="card mt-3" style={{ overflow: 'hidden' }}>
          <table className="table">
            <thead><tr><th>问题</th><th>状态</th><th>浏览</th><th></th></tr></thead>
            <tbody>
              {list.map((f) => (
                <tr key={f.id}>
                  <td className="bold">{f.question}</td>
                  <td>{f.is_published ? <span className="badge badge-status-resolved">已发布</span> : <span className="badge badge-status-closed">草稿</span>}</td>
                  <td className="small text-2">{f.view_count}</td>
                  <td className="row gap-2"><a style={{ color: 'var(--primary)', cursor: 'pointer' }} onClick={() => openEdit(f)}>编辑</a><a style={{ color: 'var(--red)', cursor: 'pointer' }} onClick={() => del(f)}>删除</a></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>}
      <Modal title={editing ? '编辑常见问题' : '新建常见问题'} open={open} onClose={() => setOpen(false)}
        footer={<><Button onClick={() => setOpen(false)}>取消</Button><Button variant="primary" loading={saving} onClick={save}>保存</Button></>}>
        <Field label="问题"><input value={form.question} onChange={set('question')} /></Field>
        <Field label="答案"><textarea value={form.answer} onChange={set('answer')} style={{ minHeight: 110 }} /></Field>
        <label className="row gap-2"><input type="checkbox" checked={form.is_published} onChange={(e) => setForm((f) => ({ ...f, is_published: e.target.checked }))} style={{ width: 'auto' }} /> 立即发布到公开页</label>
      </Modal>
    </div>
  );
}
