import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../lib/api';
import { me, useUser } from '../store/user';
import AppHeader from '../components/AppHeader';
import { Button, Field, toast, Spinner, Avatar } from '../components/ui';
import Icon from '../components/Icon';

export default function Account() {
  const navigate = useNavigate();
  const { user, setUser } = useUser();

  // 进入页面先刷新一次登录态（确保 email_verified 等字段为最新）
  useEffect(() => {
    me().then((r) => setUser(r.data.user)).catch(() => {});
  }, [setUser]);

  /* ---------------- 基本资料 ---------------- */
  const [form, setForm] = useState({ nickname: '', avatar_url: '', company: '' });
  const [profileSaving, setProfileSaving] = useState(false);
  useEffect(() => {
    if (user) setForm({ nickname: user.nickname || '', avatar_url: user.avatar_url || '', company: user.company || '' });
  }, [user?.id]); // eslint-disable-line

  async function saveProfile() {
    if (!form.nickname.trim()) return toast('请填写昵称', 'error');
    setProfileSaving(true);
    try {
      const { data } = await api.patch('/auth/me', {
        nickname: form.nickname.trim(),
        avatar_url: form.avatar_url || null,
        company: form.company || null,
      });
      setUser(data.user);
      toast('资料已保存', 'success');
    } catch (e) {
      toast(e.message, 'error');
    } finally {
      setProfileSaving(false);
    }
  }

  /* ---------------- 修改密码 ---------------- */
  const [pw, setPw] = useState({ current_password: '', new_password: '', confirm: '' });
  const [pwSaving, setPwSaving] = useState(false);
  const setP = (k) => (e) => setPw((p) => ({ ...p, [k]: e.target.value }));
  async function savePassword() {
    if (!pw.current_password) return toast('请填写当前密码', 'error');
    if (pw.new_password.length < 6) return toast('新密码至少 6 位', 'error');
    if (pw.new_password !== pw.confirm) return toast('两次输入的新密码不一致', 'error');
    setPwSaving(true);
    try {
      await api.post('/auth/me/password', { current_password: pw.current_password, new_password: pw.new_password });
      setPw({ current_password: '', new_password: '', confirm: '' });
      toast('密码已修改', 'success');
    } catch (e) {
      toast(e.message, 'error');
    } finally {
      setPwSaving(false);
    }
  }

  /* ---------------- 邮箱认证 ---------------- */
  const [code, setCode] = useState('');
  const [codeSent, setCodeSent] = useState(false);
  const [devCode, setDevCode] = useState('');
  const [sending, setSending] = useState(false);
  const [verifying, setVerifying] = useState(false);
  const [cooldown, setCooldown] = useState(0);
  const coolTimer = useRef(null);
  const verified = !!user?.email_verified;

  function startCooldown() {
    setCooldown(60);
    coolTimer.current = setInterval(() => {
      setCooldown((c) => {
        if (c <= 1) { clearInterval(coolTimer.current); return 0; }
        return c - 1;
      });
    }, 1000);
  }
  useEffect(() => () => coolTimer.current && clearInterval(coolTimer.current), []);

  async function sendCode() {
    setSending(true);
    try {
      const { data } = await api.post('/auth/me/email/send-verify');
      setCodeSent(true);
      setDevCode(data.devCode || '');
      if (data.devCode) toast(`验证码已发送（演示环境）：${data.devCode}`, 'success');
      else toast('验证码已发送到你的邮箱', 'success');
      startCooldown();
    } catch (e) {
      toast(e.message, 'error');
    } finally {
      setSending(false);
    }
  }

  async function verifyEmail() {
    if (!code.trim()) return toast('请填写验证码', 'error');
    setVerifying(true);
    try {
      const { data } = await api.post('/auth/me/email/verify', { code: code.trim() });
      setUser(data.user);
      setCode(''); setCodeSent(false); setDevCode('');
      toast('邮箱已认证', 'success');
    } catch (e) {
      toast(e.message, 'error');
    } finally {
      setVerifying(false);
    }
  }

  if (!user) return <Spinner />;

  return (
    <div>
      <AppHeader />
      <div className="content" style={{ maxWidth: 860, margin: '0 auto' }}>
        <h1 className="page-title">个人中心</h1>
        <p className="page-sub">管理你的账号资料、登录密码与邮箱认证。</p>

        {/* 基本资料 */}
        <div className="card card-pad mt-3">
          <div className="row gap-3" style={{ marginBottom: 16 }}>
            <Avatar name={form.nickname || user.nickname || 'U'} src={form.avatar_url} size={56} />
            <div>
              <div className="bold" style={{ fontSize: 16 }}>{form.nickname || user.nickname}</div>
              <div className="muted small">{user.email}</div>
            </div>
          </div>
          <div className="bold mb-2">基本资料</div>
          <Field label="昵称"><input value={form.nickname} onChange={(e) => setForm((f) => ({ ...f, nickname: e.target.value }))} placeholder="你的昵称" /></Field>
          <Field label="头像地址" hint="填写图片 URL（https 开头）。留空则使用昵称首字母头像。"><input value={form.avatar_url} onChange={(e) => setForm((f) => ({ ...f, avatar_url: e.target.value }))} placeholder="https://" /></Field>
          <Field label="公司 / 团队（选填）"><input value={form.company} onChange={(e) => setForm((f) => ({ ...f, company: e.target.value }))} placeholder="如 某某科技" /></Field>
          <div className="row gap-2">
            <Button variant="primary" loading={profileSaving} onClick={saveProfile}>保存资料</Button>
          </div>
        </div>

        {/* 修改密码 */}
        <div className="card card-pad mt-3">
          <div className="bold mb-2"><Icon name="lock" size={14} style={{ marginRight: 6, verticalAlign: '-2px', color: 'var(--primary)' }} />修改密码</div>
          <Field label="当前密码"><input type="password" value={pw.current_password} onChange={setP('current_password')} placeholder="请输入当前密码" /></Field>
          <div className="row gap-3">
            <div style={{ flex: 1 }}><Field label="新密码"><input type="password" value={pw.new_password} onChange={setP('new_password')} placeholder="至少 6 位" /></Field></div>
            <div style={{ flex: 1 }}><Field label="确认新密码"><input type="password" value={pw.confirm} onChange={setP('confirm')} placeholder="再次输入新密码" /></Field></div>
          </div>
          <Button variant="primary" loading={pwSaving} onClick={savePassword}>更新密码</Button>
        </div>

        {/* 邮箱认证 */}
        <div className="card card-pad mt-3">
          <div className="bold mb-2"><Icon name="mail" size={14} style={{ marginRight: 6, verticalAlign: '-2px', color: 'var(--primary)' }} />邮箱认证</div>
          <div className="row between wrap gap-2" style={{ marginBottom: 12 }}>
            <div className="row gap-2">
              <span className="muted small">登录邮箱</span>
              <span className="bold small">{user.email}</span>
            </div>
            {verified
              ? <span className="badge" style={{ background: '#dcfce7', color: '#15803d' }}><Icon name="check-circle" size={12} style={{ marginRight: 4, verticalAlign: '-2px' }} />已认证</span>
              : <span className="badge" style={{ background: '#f1f5f9', color: '#64748b' }}>未认证</span>}
          </div>

          {!codeSent ? (
            <div className="muted small" style={{ marginBottom: 12 }}>
              {verified ? '你的邮箱已完成认证。如需重新发送验证邮件，可点击下方按钮。' : '验证邮箱以提升账号安全性，并用于接收重要通知。'}
            </div>
          ) : (
            <div style={{ background: 'var(--primary-50, #eef2ff)', border: '1px solid var(--primary-100, #e0e7ff)', borderRadius: 10, padding: 12, marginBottom: 12 }}>
              <div className="small mb-2">验证码已发送，请查收邮件并在下方填写（10 分钟内有效）。</div>
              <div className="row gap-2 wrap">
                <input
                  value={code}
                  onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                  placeholder="6 位验证码"
                  style={{ width: 160, letterSpacing: 4 }}
                  inputMode="numeric"
                />
                <Button variant="primary" size="sm" loading={verifying} onClick={verifyEmail}>验证</Button>
              </div>
              {devCode && (
                <div className="small mt-2" style={{ color: '#b45309' }}>演示环境未配置 SMTP，验证码：<b>{devCode}</b></div>
              )}
            </div>
          )}

          {!codeSent && (
            <Button variant="primary" loading={sending} disabled={cooldown > 0} onClick={sendCode}>
              {cooldown > 0 ? `重新发送（${cooldown}s）` : (verified ? '重新发送验证邮件' : '发送验证邮件')}
            </Button>
          )}
          {codeSent && cooldown > 0 && (
            <Button variant="ghost" size="sm" disabled style={{ marginLeft: 8 }}>重新发送（{cooldown}s）</Button>
          )}
          {codeSent && cooldown === 0 && (
            <Button variant="ghost" size="sm" onClick={sendCode} style={{ marginLeft: 8 }}>重新发送</Button>
          )}
        </div>

        <div className="muted small mt-3" style={{ textAlign: 'center' }}>
          本系统为开源自部署版本，管理员账号由环境变量配置，首次启动自动创建
        </div>
      </div>
    </div>
  );
}
