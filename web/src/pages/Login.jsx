import React, { useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import api, { TOKEN_KEY } from '../lib/api';
import { useUser, login } from '../store/user';
import { Button, Field, toast } from '../components/ui';
import Brand from '../components/Brand';

export default function Login() {
  const navigate = useNavigate();
  const location = useLocation();
  const setAuth = useUser((s) => s.setAuth);
  const [email, setEmail] = useState('demo@feedback.dev');
  const [password, setPassword] = useState('123456');
  const [loading, setLoading] = useState(false);

  async function submit(e) {
    e.preventDefault();
    setLoading(true);
    try {
      const data = await login(email, password);
      localStorage.setItem(TOKEN_KEY, data.token);
      setAuth(data.token, data.user);
      toast('登录成功', 'success');
      const from = location.state?.from || '/app';
      navigate(from);
    } catch (err) {
      toast(err.message, 'error');
    } finally { setLoading(false); }
  }

  return (
    <div className="hero" style={{ maxWidth: 380, paddingTop: 80 }}>
      <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 20 }}>
        <Brand onClick={() => navigate('/')} title="返回首页" />
      </div>
      <div className="card card-pad">
        <h2 style={{ marginTop: 0 }}>登录</h2>
        <form onSubmit={submit}>
          <Field label="邮箱"><input value={email} onChange={(e) => setEmail(e.target.value)} type="email" placeholder="you@example.com" /></Field>
          <Field label="密码"><input value={password} onChange={(e) => setPassword(e.target.value)} type="password" placeholder="••••••" /></Field>
          <Button variant="primary" block loading={loading} type="submit">登录</Button>
        </form>
        <div className="center mt-3 muted small">默认账号见部署配置 ADMIN_EMAIL / ADMIN_PASSWORD，登录后可在「账户」中修改密码</div>
      </div>
    </div>
  );
}
