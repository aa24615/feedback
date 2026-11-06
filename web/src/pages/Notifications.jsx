import React, { useState, useEffect } from 'react';
import { useNavigate, useOutletContext } from 'react-router-dom';
import api from '../lib/api';
import { Button, Modal, Field, toast, Spinner, Empty } from '../components/ui';

const EVENTS = [
  { k: 'post.created', l: '新反馈提交' },
  { k: 'post.status_changed', l: '反馈状态变更' },
  { k: 'comment.created', l: '新评论 / 回复' },
];

const TYPE_LABEL = { email: '邮件', webhook: 'Webhook', dingtalk: '钉钉', wecom: '企业微信', feishu: '飞书' };

export default function Notifications() {
  const { id } = useOutletContext();
  const navigate = useNavigate();
  const [list, setList] = useState([]);
  const [templates, setTemplates] = useState([]);
  const [smtps, setSmtps] = useState([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState({ template_id: '', events: ['post.created'], smtp_config_id: '', is_active: true });
  const [saving, setSaving] = useState(false);
  const [deliveries, setDeliveries] = useState(null);
  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));
  const toggleEvent = (k) => setForm((f) => ({ ...f, events: f.events.includes(k) ? f.events.filter((x) => x !== k) : [...f.events, k] }));

  async function load() {
    setLoading(true);
    try {
      const [b, t, s] = await Promise.all([
        api.get(`/products/${id}/notifications`).then((r) => r.data.bindings || []),
        api.get('/me/notify-templates').then((r) => r.data.templates || []),
        api.get('/me/smtp-configs').then((r) => r.data.configs || []),
      ]);
      setList(b); setTemplates(t.filter((x) => x.is_active)); setSmtps(s);
    } finally { setLoading(false); }
  }
  useEffect(() => { load(); }, [id]);

  const activeTemplates = templates;
  const emailTemplates = activeTemplates.filter((t) => t.type === 'email');

  function openNew() {
    if (!activeTemplates.length) { toast('还没有可用的通知模板，请先到「通知模板」页创建', 'error'); return; }
    setEditing(null);
    const first = activeTemplates[0];
    setForm({
      template_id: String(first.id),
      events: ['post.created'],
      smtp_config_id: first.type === 'email' ? String((smtps.find((s) => s.is_default) || smtps[0] || {}).id || '') : '',
      is_active: true,
    });
    setOpen(true);
  }
  function openEdit(b) {
    setEditing(b);
    setForm({
      template_id: String(b.template_id),
      events: b.events && b.events.length ? b.events : [],
      smtp_config_id: b.smtp_config_id ? String(b.smtp_config_id) : '',
      is_active: !!b.is_active,
    });
    setOpen(true);
  }
  const currentTemplate = activeTemplates.find((t) => String(t.id) === String(form.template_id)) || (editing ? { type: editing.channel } : null);

  async function save() {
    if (!form.template_id) return toast('请选择模板', 'error');
    if (currentTemplate && currentTemplate.type === 'email' && !form.smtp_config_id) return toast('邮件模板需选择 SMTP 配置', 'error');
    setSaving(true);
    try {
      const payload = {
        events: form.events,
        is_active: form.is_active,
        ...(currentTemplate && currentTemplate.type === 'email' ? { smtp_config_id: Number(form.smtp_config_id) } : {}),
      };
      if (editing) await api.patch(`/products/${id}/notifications/${editing.id}`, payload);
      else await api.post(`/products/${id}/notifications`, { template_id: Number(form.template_id), ...payload });
      toast('已保存', 'success'); setOpen(false); load();
    } catch (e) {
      toast(e.message, 'error');
    }
    finally { setSaving(false); }
  }
  async function del(b) {
    if (!window.confirm(`解除绑定「${b.template_name}」？`)) return;
    await api.delete(`/products/${id}/notifications/${b.id}`).catch((e) => toast(e.message, 'error'));
    toast('已解除', 'success'); load();
  }
  async function test(b) {
    try {
      const r = await api.post(`/products/${id}/notifications/${b.id}/test`);
      toast(r.data.success ? '测试已发送' : (r.data.error || '测试失败'), r.data.success ? 'success' : 'error');
      load();
    } catch (e) { toast(e.message, 'error'); }
  }
  async function viewDeliveries() {
    const r = await api.get(`/products/${id}/notifications/deliveries?pageSize=30`).catch(() => ({ data: { list: [] } }));
    setDeliveries(r.data.list || []);
  }

  if (loading) return <Spinner />;
  return (
    <div>
      <div className="row between">
        <div>
          <h1 className="page-title">通知设置</h1>
          <p className="page-sub">
            通过引用「通知模板」接收新反馈、状态变更与评论通知，支持邮件、Webhook 与钉钉 / 企业微信 / 飞书群机器人。模板归属于你个人，多个产品可共用，
            <a style={{ color: 'var(--primary)', cursor: 'pointer', fontWeight: 600 }} onClick={() => navigate('/app/notifications')}>去管理通知模板 →</a>
          </p>
        </div>
        <Button variant="primary" size="sm" onClick={openNew}>+ 引入模板</Button>
      </div>

      {list.length === 0 ? (
        <Empty icon="bell" text={activeTemplates.length ? '还没有引入通知模板' : '还没有通知模板，请先到「通知模板」页创建'} />
      ) : (
        <div className="card mt-3" style={{ overflow: 'hidden' }}>
          <table className="table">
            <thead><tr><th>模板</th><th>类型</th><th>触发事件</th><th>发送配置</th><th>状态</th><th></th></tr></thead>
            <tbody>
              {list.map((b) => (
                <tr key={b.id}>
                  <td className="bold">{b.template_name}</td>
                  <td><span className={`badge ${b.channel === 'email' ? 'badge-status-resolved' : 'badge-status-planned'}`}>{TYPE_LABEL[b.channel] || b.channel}</span></td>
                  <td className="small text-2">{(b.events || []).length ? b.events.map((e) => EVENTS.find((x) => x.k === e)?.l || e).join('、') : '全部'}</td>
                  <td className="small">{b.channel === 'email' ? (b.smtp_name || <span className="muted">未选择 SMTP</span>) : '—'}</td>
                  <td>{b.is_active ? <span className="badge badge-status-resolved">启用</span> : <span className="badge badge-status-closed">停用</span>}</td>
                  <td className="row gap-2">
                    <a style={{ color: 'var(--primary)', cursor: 'pointer' }} onClick={() => test(b)}>测试</a>
                    <a style={{ color: 'var(--primary)', cursor: 'pointer' }} onClick={() => openEdit(b)}>编辑</a>
                    <a style={{ color: 'var(--text-2)', cursor: 'pointer' }} onClick={viewDeliveries}>投递</a>
                    <a style={{ color: 'var(--red)', cursor: 'pointer' }} onClick={() => del(b)}>移除</a>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <Modal title={editing ? '编辑通知' : '引入通知模板'} open={open} onClose={() => setOpen(false)} width={560}
        footer={<><Button onClick={() => setOpen(false)}>取消</Button><Button variant="primary" loading={saving} onClick={save}>保存</Button></>}>
        <Field label="通知模板" hint="模板在「通知模板」页统一维护，可多个产品共用">
          <select value={form.template_id} disabled={!!editing} onChange={(e) => {
            const t = activeTemplates.find((x) => String(x.id) === e.target.value);
            set('template_id', e.target.value);
            if (t && t.type === 'email' && !form.smtp_config_id) {
              set('smtp_config_id', String((smtps.find((s) => s.is_default) || smtps[0] || {}).id || ''));
            }
          }}>
            {activeTemplates.map((t) => <option key={t.id} value={t.id}>{t.name}（{TYPE_LABEL[t.type] || t.type}）</option>)}
          </select>
          {editing ? <div className="hint">模板创建绑定后不可更换，可移除后重新引入</div> : null}
        </Field>
        <Field label="触发事件" hint="不勾选 = 全部事件都触发">
          <div className="col gap-1">
            {EVENTS.map((ev) => (
              <label key={ev.k} className="row gap-2"><input type="checkbox" checked={form.events.includes(ev.k)} onChange={() => toggleEvent(ev.k)} style={{ width: 'auto' }} /> {ev.l} <span className="muted small">({ev.k})</span></label>
            ))}
          </div>
        </Field>
        {currentTemplate && currentTemplate.type === 'email' ? (
          <Field label="发送用的 SMTP 配置" hint="在「通知模板 → SMTP 配置」中维护，可配置多个">
            {smtps.length ? (
              <select value={form.smtp_config_id} onChange={(e) => set('smtp_config_id', e.target.value)}>
                <option value="">请选择</option>
                {smtps.map((s) => <option key={s.id} value={s.id}>{s.name}{s.is_default ? '（默认）' : ''} — {s.host}</option>)}
              </select>
            ) : <div className="hint">尚未创建 SMTP 配置，<a style={{ color: 'var(--primary)', cursor: 'pointer' }} onClick={() => navigate('/app/notifications')}>去添加 →</a></div>}
          </Field>
        ) : null}
        <label className="row gap-2"><input type="checkbox" checked={form.is_active} onChange={(e) => set('is_active', e.target.checked)} style={{ width: 'auto' }} /> 启用</label>
      </Modal>

      <Modal title="投递记录" open={!!deliveries} onClose={() => setDeliveries(null)} width={600}>
        {deliveries && (
          deliveries.length === 0 ? <div className="empty" style={{ padding: 24 }}>暂无投递</div> :
            <div className="col gap-2">
              {deliveries.map((d) => (
                <div key={d.id} className="card-pad" style={{ border: '1px solid var(--border)', borderRadius: 10 }}>
                  <div className="row between">
                    <span className="small bold">{d.template_name || '—'} <span className="muted">· {d.event}{d.is_test ? '（测试）' : ''}</span></span>
                    <span className={d.success ? 'badge badge-status-resolved' : 'badge badge-status-declined'}>{d.success ? '成功' : (d.response_code || '失败')}</span>
                  </div>
                  <div className="muted small mt-1">{new Date(d.created_at).toLocaleString()}｜{TYPE_LABEL[d.channel] || d.channel}｜{d.target || '—'}</div>
                  {(d.error || d.response_body) ? <div className="small mt-1" style={{ color: 'var(--red)', wordBreak: 'break-all' }}>{d.error || d.response_body}</div> : null}
                </div>
              ))}
            </div>
        )}
      </Modal>
    </div>
  );
}
