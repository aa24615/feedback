import React, { useState, useEffect, useRef } from 'react';
import api from '../lib/api';
import AppHeader from '../components/AppHeader';
import { Button, Modal, Field, Tabs, toast, Spinner, Empty } from '../components/ui';
import Icon from '../components/Icon';

const EVENTS = [
  { k: 'post.created', l: '新反馈提交' },
  { k: 'post.status_changed', l: '反馈状态变更' },
  { k: 'comment.created', l: '新评论 / 回复' },
];

const VARIABLES = [
  ['{{product.name}}', '产品名称'],
  ['{{product.slug}}', '产品链接后缀'],
  ['{{product.link}}', '产品公开反馈页地址'],
  ['{{post.id}}', '反馈 ID'],
  ['{{post.seq}}', '产品内编号'],
  ['{{post.title}}', '反馈标题'],
  ['{{post.type}}', '反馈类型（建议/问题/吐槽/提问）'],
  ['{{post.status}}', '反馈状态（状态变更事件）'],
  ['{{post.oldStatus}}', '变更前的状态'],
  ['{{post.link}}', '该条反馈的详情页地址'],
  ['{{comment.id}}', '评论 ID'],
  ['{{comment.content}}', '评论内容'],
  ['{{event}}', '事件标识'],
  ['{{time}}', '发送时间'],
];

/* 群机器人通道元数据（钉钉 / 企业微信 / 飞书） */
const BOT_META = {
  dingtalk: {
    label: '钉钉机器人', short: '钉钉',
    urlHint: '钉钉群 → 智能群助手 → 添加机器人 → 自定义（通过 Webhook 发消息）→ 复制 Webhook 地址',
    sign: '加签密钥', signHint: '机器人安全设置选「加签」，复制 SEC 开头的密钥；留空表示不加签',
  },
  wecom: {
    label: '企业微信机器人', short: '企业微信',
    urlHint: '企业微信群 → 群设置 → 群机器人 → 添加 → 复制 Webhook 地址（若设置了 IP 白名单，需放行服务器出口 IP）',
    sign: null,
  },
  feishu: {
    label: '飞书机器人', short: '飞书',
    urlHint: '飞书群 → 设置 → 群机器人 → 添加机器人 → 自定义机器人 → 复制 Webhook 地址',
    sign: '签名密钥', signHint: '机器人安全设置选「签名校验」，复制签名密钥；留空表示不签名',
  },
};
const TYPE_LABEL = { email: '邮件', webhook: 'Webhook', dingtalk: '钉钉', wecom: '企业微信', feishu: '飞书' };
const DEFAULT_BOT_BODY = '【{{product.name}}】新反馈：{{post.title}}\n类型：{{post.type}} · 状态：{{post.status}}\n详情：{{post.link}}';

/* ================= 通知模板 ================= */
function TemplatesTab() {
  const [list, setList] = useState([]);
  const [smtps, setSmtps] = useState([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState({ name: '', type: 'webhook', subject: '', body: '', to_addresses: '', url: '', secret: '', is_active: true });
  const [saving, setSaving] = useState(false);
  const [testTarget, setTestTarget] = useState(null); // 待测试的邮件模板（弹 SMTP 选择）
  const [selectedSmtp, setSelectedSmtp] = useState(null);
  const [testing, setTesting] = useState(false);
  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  /* ---- 变量点击插入：记录最后聚焦输入框的光标，插入后恢复焦点与光标 ---- */
  const lastFocus = useRef(null); // { key, el, start, end }

  function captureCursor(key, el) {
    if (!el) return;
    lastFocus.current = { key, el, start: el.selectionStart, end: el.selectionEnd };
  }
  // 输入框事件：聚焦 / 光标移动 / 按键后都刷新记录
  function cursorHandlers(key) {
    return {
      onFocus: (e) => captureCursor(key, e.target),
      onSelect: (e) => captureCursor(key, e.target),
      onKeyUp: (e) => captureCursor(key, e.target),
      onClick: (e) => captureCursor(key, e.target),
    };
  }
  function insertVariable(text) {
    if (!open) { toast('请先新建或编辑模板，再点击变量插入', 'error'); return; }
    // 目标字段：最后聚焦的 subject / body；从未聚焦则默认插入正文
    const f = lastFocus.current;
    const key = f && (f.key === 'subject' || f.key === 'body') ? f.key : 'body';
    const cur = form[key] || '';
    const el = f && f.key === key ? f.el : null;
    const start = el ? (f.start ?? cur.length) : cur.length;
    const end = el ? (f.end ?? start) : cur.length;
    const next = cur.slice(0, start) + text + cur.slice(end);
    set(key, next);
    if (el) {
      const pos = start + text.length;
      requestAnimationFrame(() => {
        el.focus();
        try { el.setSelectionRange(pos, pos); } catch { /* 某些输入类型不支持 */ }
        lastFocus.current = { key, el, start: pos, end: pos };
      });
    }
  }

  async function load() {
    setLoading(true);
    try {
      const [t, s] = await Promise.all([
        api.get('/me/notify-templates').then((r) => r.data.templates || []),
        api.get('/me/smtp-configs').then((r) => r.data.configs || []),
      ]);
      setList(t); setSmtps(s);
    } finally { setLoading(false); }
  }
  useEffect(() => { load(); }, []);

  function openNew() {
    setEditing(null);
    setForm({ name: '', type: 'webhook', subject: '', body: '', to_addresses: '', url: '', secret: '', is_active: true });
    lastFocus.current = null;
    setOpen(true);
  }
  function openEdit(t) {
    setEditing(t);
    setForm({
      name: t.name, type: t.type, subject: t.subject || '', body: t.body || '',
      to_addresses: t.to_addresses || '', url: t.url || '', secret: '', is_active: !!t.is_active,
    });
    lastFocus.current = null;
    setOpen(true);
  }
  async function save() {
    if (!form.name.trim()) return toast('请填写模板名称', 'error');
    if (form.type === 'email' && !form.subject.trim()) return toast('请填写邮件主题', 'error');
    if (form.type === 'email' && !form.to_addresses.trim()) return toast('请填写收件人', 'error');
    if (form.type !== 'email' && !/^https?:\/\//.test(form.url)) return toast('请填写合法的 http(s) 地址', 'error');
    setSaving(true);
    try {
      const payload = { ...form };
      if (editing && !payload.secret) delete payload.secret; // 留空 = 不修改
      if (editing) await api.patch(`/me/notify-templates/${editing.id}`, payload);
      else await api.post('/me/notify-templates', payload);
      toast('已保存', 'success'); setOpen(false); load();
    } catch (e) { toast(e.message, 'error'); }
    finally { setSaving(false); }
  }
  async function del(t) {
    if (!window.confirm(`删除模板「${t.name}」？引用它的产品通知将同时失效。`)) return;
    await api.delete(`/me/notify-templates/${t.id}`).catch((e) => toast(e.message, 'error'));
    toast('已删除', 'success'); load();
  }
  async function runTest(t, smtpConfigId) {
    setTesting(true);
    try {
      const r = await api.post(`/me/notify-templates/${t.id}/test`, smtpConfigId ? { smtp_config_id: smtpConfigId } : {});
      if (r.data.success) toast(`测试已发送${r.data.via ? `（经 ${r.data.via}）` : ''}`, 'success');
      else toast(r.data.error || '测试发送失败', 'error');
      setTestTarget(null);
    } catch (e) { toast(e.message, 'error'); }
    finally { setTesting(false); }
  }
  function onTest(t) {
    if (t.type !== 'email') return runTest(t, null); // Webhook / 群机器人无需 SMTP
    if (!smtps.length) return toast('尚未创建 SMTP 配置，请先到「SMTP 配置」添加', 'error');
    if (smtps.length === 1) return runTest(t, smtps[0].id);
    const preferred = smtps.find((s) => s.is_default) || smtps[0];
    setSelectedSmtp(preferred.id);
    setTestTarget(t);
  }
  function changeType(t) {
    set('type', t);
    // 切到群机器人时预填默认消息文本，降低上手成本
    if (BOT_META[t] && !form.body.trim()) set('body', DEFAULT_BOT_BODY);
  }

  if (loading) return <Spinner />;
  return (
    <div>
      <div className="row between">
        <div>
          <div className="bold">通知模板</div>
          <div className="muted small">模板归属于你个人，多个产品可引用同一模板；在产品「通知设置」里引入即可。</div>
        </div>
        <Button variant="primary" size="sm" onClick={openNew}>+ 新建模板</Button>
      </div>
      {list.length === 0 ? (
        <Empty icon="mail" text="还没有通知模板，点击「新建模板」开始" />
      ) : (
        <div className="card mt-3" style={{ overflow: 'hidden' }}>
          <table className="table">
            <thead><tr><th>名称</th><th>类型</th><th>配置</th><th>状态</th><th></th></tr></thead>
            <tbody>
              {list.map((t) => (
                <tr key={t.id}>
                  <td className="bold">{t.name}</td>
                  <td><span className={`badge ${t.type === 'email' ? 'badge-status-resolved' : 'badge-status-planned'}`}>{TYPE_LABEL[t.type] || t.type}</span></td>
                  <td className="small text-2" style={{ maxWidth: 300 }}>
                    {t.type === 'email'
                      ? <span title={t.to_addresses}>主题：{t.subject}｜发给：{t.to_addresses}</span>
                      : <span title={t.url}>{t.url}{t.secret ? '（已设签名）' : ''}</span>}
                  </td>
                  <td>{t.is_active ? <span className="badge badge-status-resolved">启用</span> : <span className="badge badge-status-closed">停用</span>}</td>
                  <td className="row gap-2">
                    <a style={{ color: 'var(--primary)', cursor: 'pointer' }} onClick={() => onTest(t)}>测试</a>
                    <a style={{ color: 'var(--primary)', cursor: 'pointer' }} onClick={() => openEdit(t)}>编辑</a>
                    <a style={{ color: 'var(--red)', cursor: 'pointer' }} onClick={() => del(t)}>删除</a>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <Modal title={editing ? '编辑模板' : '新建通知模板'} open={open} onClose={() => setOpen(false)} width={620}
        footer={<><Button onClick={() => setOpen(false)}>取消</Button><Button variant="primary" loading={saving} onClick={save}>保存</Button></>}>
        <Field label="模板名称"><input value={form.name} onChange={(e) => set('name', e.target.value)} placeholder="如：新反馈通知到企业微信" /></Field>
        <Field label="通知方式">
          <select value={form.type} disabled={!!editing} onChange={(e) => changeType(e.target.value)}>
            <option value="webhook">Webhook（推送到你的服务）</option>
            <option value="email">邮件（通过你的 SMTP 发送）</option>
            <option value="dingtalk">钉钉群机器人</option>
            <option value="wecom">企业微信群机器人</option>
            <option value="feishu">飞书群机器人</option>
          </select>
          {editing ? <div className="hint">类型创建后不可修改</div> : null}
        </Field>
        {form.type === 'email' ? (
          <>
            <Field label="邮件主题" hint="支持变量，如：【反馈墙】{{product.name}} 收到新反馈"><input {...cursorHandlers('subject')} value={form.subject} onChange={(e) => set('subject', e.target.value)} placeholder="【反馈墙】新反馈：{{post.title}}" /></Field>
            <Field label="邮件正文"><textarea rows={6} {...cursorHandlers('body')} value={form.body} onChange={(e) => set('body', e.target.value)} placeholder={"产品：{{product.name}}\n反馈：{{post.title}}（{{post.seq}}）\n内容：{{comment.content}}\n查看：{{post.link}}"} /></Field>
            <Field label="收件人" hint="多个收件人用逗号分隔"><input value={form.to_addresses} onChange={(e) => set('to_addresses', e.target.value)} placeholder="ops@example.com, boss@example.com" /></Field>
          </>
        ) : BOT_META[form.type] ? (
          <>
            <Field label="机器人 Webhook 地址" hint={BOT_META[form.type].urlHint}><input value={form.url} onChange={(e) => set('url', e.target.value)} placeholder="https://oapi.dingtalk.com/robot/send?access_token=..." /></Field>
            {BOT_META[form.type].sign ? (
              <Field label={`${BOT_META[form.type].sign}（选填）`} hint={BOT_META[form.type].signHint}>
                <input value={form.secret} onChange={(e) => set('secret', e.target.value)} placeholder={editing ? '留空 = 不修改' : ''} />
              </Field>
            ) : null}
            <Field label="消息内容" hint="发送到群里的文本，支持变量与换行；留空则用默认文案">
              <textarea rows={5} {...cursorHandlers('body')} value={form.body} onChange={(e) => set('body', e.target.value)} placeholder={DEFAULT_BOT_BODY} />
            </Field>
          </>
        ) : (
          <>
            <Field label="回调地址" hint="接收 POST JSON 的地址"><input value={form.url} onChange={(e) => set('url', e.target.value)} placeholder="https://your-server.com/hook" /></Field>
            <Field label="签名密钥（选填）" hint="启用后请求头带 X-Feedback-Signature: HMAC-SHA256；留空表示不修改">
              <input value={form.secret} onChange={(e) => set('secret', e.target.value)} placeholder={editing ? '留空 = 不修改' : '用于校验来源'} />
            </Field>
            <Field label="自定义报文（选填）" hint="JSON 模板，留空发送标准事件报文；支持变量"><textarea rows={4} {...cursorHandlers('body')} value={form.body} onChange={(e) => set('body', e.target.value)} placeholder={'{\n  "msgtype": "text",\n  "text": { "content": "{{product.name}} 收到新反馈：{{post.title}}" }\n}'} /></Field>
          </>
        )}
        <div className="var-panel">
          <div className="small muted" style={{ marginBottom: 8 }}>点击下方变量，插入到光标所在位置（先点主题或正文，再点变量即可插入）：</div>
          <div className="var-list">
            {VARIABLES.map(([v, d]) => (
              <button type="button" key={v} className="var-item" onClick={() => insertVariable(v)} title={`插入 ${v}`}>
                <code className="var-token">{v}</code>
                <span className="var-desc">{d}</span>
              </button>
            ))}
          </div>
        </div>
        <label className="row gap-2" style={{ marginTop: 14 }}><input type="checkbox" checked={form.is_active} onChange={(e) => set('is_active', e.target.checked)} style={{ width: 'auto' }} /> 启用</label>
      </Modal>

      <Modal title="选择 SMTP 配置发送测试" open={!!testTarget} onClose={() => setTestTarget(null)}
        footer={<><Button onClick={() => setTestTarget(null)}>取消</Button><Button variant="primary" loading={testing} onClick={() => runTest(testTarget, selectedSmtp)}>发送测试</Button></>}>
        <div className="col gap-2">
          {smtps.map((s) => (
            <label key={s.id} className="row gap-2 card-pad" style={{ border: '1px solid var(--border)', borderRadius: 10, cursor: 'pointer' }}>
              <input type="radio" name="test-smtp" checked={selectedSmtp === s.id} onChange={() => setSelectedSmtp(s.id)} style={{ width: 'auto' }} />
              <div>
                <div className="bold small">{s.name}{s.is_default ? '（默认）' : ''}</div>
                <div className="muted small">{s.host}:{s.port}｜{s.username || '无认证'}</div>
              </div>
            </label>
          ))}
        </div>
        <div className="muted small mt-2">测试邮件将发送到你的登录邮箱，不会打扰模板里的真实收件人。</div>
      </Modal>
    </div>
  );
}

/* ================= SMTP 配置 ================= */
function SmtpTab() {
  const [list, setList] = useState([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState({ name: '', host: '', port: 465, secure: true, username: '', password: '', from_name: '', from_address: '', is_default: false });
  const [saving, setSaving] = useState(false);
  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  async function load() {
    setLoading(true);
    try { const r = await api.get('/me/smtp-configs'); setList(r.data.configs || []); } finally { setLoading(false); }
  }
  useEffect(() => { load(); }, []);

  function openNew() {
    setEditing(null);
    setForm({ name: '', host: '', port: 465, secure: true, username: '', password: '', from_name: '', from_address: '', is_default: false });
    setOpen(true);
  }
  function openEdit(s) {
    setEditing(s);
    setForm({ name: s.name, host: s.host, port: s.port, secure: !!s.secure, username: s.username || '', password: '', from_name: s.from_name || '', from_address: s.from_address || '', is_default: !!s.is_default });
    setOpen(true);
  }
  async function save() {
    if (!form.name.trim()) return toast('请填写配置名称', 'error');
    if (!form.host.trim()) return toast('请填写 SMTP 服务器', 'error');
    setSaving(true);
    try {
      const payload = { ...form, port: Number(form.port) };
      if (editing && !payload.password) delete payload.password;
      if (editing) await api.patch(`/me/smtp-configs/${editing.id}`, payload);
      else await api.post('/me/smtp-configs', payload);
      toast('已保存', 'success'); setOpen(false); load();
    } catch (e) { toast(e.message, 'error'); }
    finally { setSaving(false); }
  }
  async function del(s) {
    if (!window.confirm(`删除 SMTP 配置「${s.name}」？`)) return;
    await api.delete(`/me/smtp-configs/${s.id}`).catch((e) => toast(e.message, 'error'));
    toast('已删除', 'success'); load();
  }
  async function test(s) {
    try {
      const r = await api.post(`/me/smtp-configs/${s.id}/test`);
      toast(r.data.success ? '连接正常，测试邮件已发到你的邮箱' : (r.data.error || '测试失败'), r.data.success ? 'success' : 'error');
    } catch (e) { toast(e.message, 'error'); }
  }

  if (loading) return <Spinner />;
  return (
    <div>
      <div className="row between">
        <div>
          <div className="bold">SMTP 配置</div>
          <div className="muted small">填写你自己的邮箱 SMTP，通知邮件通过这些配置发送；可配置多个，发送时任选。</div>
        </div>
        <Button variant="primary" size="sm" onClick={openNew}>+ 新建配置</Button>
      </div>
      {list.length === 0 ? (
        <Empty icon="send" text="还没有 SMTP 配置" />
      ) : (
        <div className="card mt-3" style={{ overflow: 'hidden' }}>
          <table className="table">
            <thead><tr><th>名称</th><th>服务器</th><th>账号</th><th>发件人</th><th></th></tr></thead>
            <tbody>
              {list.map((s) => (
                <tr key={s.id}>
                  <td className="bold">{s.name}{s.is_default ? <span className="badge badge-status-resolved" style={{ marginLeft: 6 }}>默认</span> : null}</td>
                  <td className="small">{s.host}:{s.port} <span className="muted">({s.secure ? 'SSL' : 'STARTTLS'})</span></td>
                  <td className="small">{s.username || '—'}{s.has_password ? '' : <span className="muted">（未设密码）</span>}</td>
                  <td className="small">{s.from_name ? `${s.from_name} ` : ''}{s.from_address || '—'}</td>
                  <td className="row gap-2">
                    <a style={{ color: 'var(--primary)', cursor: 'pointer' }} onClick={() => test(s)}>测试</a>
                    <a style={{ color: 'var(--primary)', cursor: 'pointer' }} onClick={() => openEdit(s)}>编辑</a>
                    <a style={{ color: 'var(--red)', cursor: 'pointer' }} onClick={() => del(s)}>删除</a>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <Modal title={editing ? '编辑 SMTP 配置' : '新建 SMTP 配置'} open={open} onClose={() => setOpen(false)} width={560}
        footer={<><Button onClick={() => setOpen(false)}>取消</Button><Button variant="primary" loading={saving} onClick={save}>保存</Button></>}>
        <Field label="配置名称" hint="用于发送时区分，如「QQ 企业邮箱」「Gmail」"><input value={form.name} onChange={(e) => set('name', e.target.value)} placeholder="我的邮箱" /></Field>
        <div className="row gap-3">
          <div style={{ flex: 2 }}><Field label="SMTP 服务器"><input value={form.host} onChange={(e) => set('host', e.target.value)} placeholder="smtp.exmail.qq.com" /></Field></div>
          <div style={{ flex: 1 }}><Field label="端口"><input type="number" value={form.port} onChange={(e) => set('port', e.target.value)} /></Field></div>
        </div>
        <Field label="加密方式">
          <select value={form.secure ? 'ssl' : 'starttls'} onChange={(e) => { const ssl = e.target.value === 'ssl'; set('secure', ssl); if (form.port === (ssl ? 587 : 465)) set('port', ssl ? 465 : 587); }}>
            <option value="ssl">SSL 直连（465）</option>
            <option value="starttls">STARTTLS（587）</option>
          </select>
        </Field>
        <div className="row gap-3">
          <div style={{ flex: 1 }}><Field label="登录账号"><input value={form.username} onChange={(e) => set('username', e.target.value)} placeholder="user@example.com" /></Field></div>
          <div style={{ flex: 1 }}><Field label={editing ? '密码（留空不修改）' : '密码 / 授权码'}><input type="password" value={form.password} onChange={(e) => set('password', e.target.value)} placeholder={editing ? '••••••' : ''} /></Field></div>
        </div>
        <div className="row gap-3">
          <div style={{ flex: 1 }}><Field label="发件人名称"><input value={form.from_name} onChange={(e) => set('from_name', e.target.value)} placeholder="反馈墙" /></Field></div>
          <div style={{ flex: 1 }}><Field label="发件人地址"><input value={form.from_address} onChange={(e) => set('from_address', e.target.value)} placeholder="no-reply@example.com" /></Field></div>
        </div>
        <label className="row gap-2"><input type="checkbox" checked={form.is_default} onChange={(e) => set('is_default', e.target.checked)} style={{ width: 'auto' }} /> 设为默认配置</label>
      </Modal>
    </div>
  );
}

/* ================= 页面 ================= */
export default function UserNotifications() {
  const [tab, setTab] = useState('templates');
  return (
    <div>
      <AppHeader />
      <div className="content">
        <h1 className="page-title">通知模板</h1>
        <p className="page-sub">通知模板归属于你（而非产品），多个产品可引用同一模板；邮件通知通过你自己的 SMTP 发送。</p>
        <Tabs tabs={[{ key: 'templates', label: <span><Icon name="mail" size={13} style={{ marginRight: 5, verticalAlign: '-2px' }} />通知模板</span> }, { key: 'smtp', label: <span><Icon name="send" size={13} style={{ marginRight: 5, verticalAlign: '-2px' }} />SMTP 配置</span> }]} active={tab} onChange={setTab} />
        <div className="mt-3">
          {tab === 'templates' ? <TemplatesTab /> : <SmtpTab />}
        </div>
        <div className="card card-pad mt-4">
          <div className="bold mb-2">可用变量（点击即可插入到模板）</div>
          <div className="var-list">
            {VARIABLES.map(([v, d]) => (
              <button type="button" key={v} className="var-item" onClick={() => insertVariable(v)} title={`插入 ${v}`}>
                <code className="var-token">{v}</code>
                <span className="var-desc">{d}</span>
              </button>
            ))}
          </div>
          <div className="muted small mt-2">提示：编辑模板时，先在主题或正文里点一下要插入的位置，再点上面的变量即可插入到光标处。</div>
        </div>
      </div>
    </div>
  );
}
