import React, { useState, useEffect } from 'react';
import { useOutletContext } from 'react-router-dom';
import api from '../lib/api';
import { Button, Modal, Field, toast, Spinner, Empty } from '../components/ui';

export default function ApiTokens() {
  const { id } = useOutletContext();
  const [list, setList] = useState([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const [saving, setSaving] = useState(false);
  const [created, setCreated] = useState(null);

  async function load() { setLoading(true); try { const r = await api.get(`/products/${id}/tokens`); setList(r.data.tokens); } finally { setLoading(false); } }
  useEffect(() => { load(); }, [id]);

  async function create() {
    if (!name.trim()) return toast('请填写名称', 'error');
    setSaving(true);
    try {
      const r = await api.post(`/products/${id}/tokens`, { name });
      setCreated(r.data.token.token);
      setName(''); setOpen(false); load();
    } catch (e) { toast(e.message, 'error'); }
    finally { setSaving(false); }
  }
  async function revoke(t) { if (!window.confirm('吊销该密钥？已集成的调用将立即失败。')) return; await api.delete(`/products/${id}/tokens/${t.id}`).catch(() => {}); toast('已吊销', 'success'); load(); }

  return (
    <div>
      <div className="row between"><h1 className="page-title">API 密钥</h1><Button variant="primary" size="sm" onClick={() => setOpen(true)}>+ 新建密钥</Button></div>
      <p className="page-sub">用于通过开放 API 以编程方式读写反馈数据。密钥仅展示一次，请妥善保存。</p>
      {loading ? <Spinner /> : list.length === 0 ? <Empty icon="key" text="还没有 API 密钥" /> :
        <div className="card mt-3" style={{ overflow: 'hidden' }}>
          <table className="table">
            <thead><tr><th>名称</th><th>权限</th><th>最后使用</th><th>状态</th><th></th></tr></thead>
            <tbody>
              {list.map((t) => (
                <tr key={t.id}>
                  <td className="bold">{t.name}</td>
                  <td className="small text-2">{(t.scopes || []).join(', ')}</td>
                  <td className="small text-2">{t.last_used_at ? new Date(t.last_used_at).toLocaleString() : '从未'}</td>
                  <td>{t.revoked ? <span className="badge badge-status-closed">已吊销</span> : <span className="badge badge-status-resolved">有效</span>}</td>
                  <td>{!t.revoked && <a style={{ color: 'var(--red)', cursor: 'pointer' }} onClick={() => revoke(t)}>吊销</a>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>}
      <Modal title="新建 API 密钥" open={open} onClose={() => setOpen(false)}
        footer={<><Button onClick={() => setOpen(false)}>取消</Button><Button variant="primary" loading={saving} onClick={create}>生成</Button></>}>
        <Field label="名称" hint="便于识别用途，如「官网嵌入脚本」"><input value={name} onChange={(e) => setName(e.target.value)} placeholder="密钥名称" /></Field>
      </Modal>
      <Modal title="密钥已生成" open={!!created} onClose={() => setCreated(null)}>
        <div className="muted small mb-2">请立即复制保存，关闭后无法再次查看：</div>
        <code style={{ display: 'block', background: '#f1f5f9', padding: 12, borderRadius: 8, wordBreak: 'break-all' }}>{created}</code>
        <div className="row gap-2 mt-3"><Button variant="primary" onClick={() => { navigator.clipboard?.writeText(created); toast('已复制', 'success'); }}>复制</Button><Button onClick={() => setCreated(null)}>我知道了</Button></div>
      </Modal>
    </div>
  );
}
