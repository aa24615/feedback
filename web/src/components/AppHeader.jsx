import React, { useState, useEffect, useRef } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useUser } from '../store/user';
import api from '../lib/api';
import { Avatar, Button, Modal, toast } from './ui';
import Icon from './Icon';
import Brand from './Brand';

function NotificationBell() {
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState([]);
  const [unread, setUnread] = useState(0);

  async function load() {
    try {
      const { data } = await api.get('/me/notifications?pageSize=12');
      setItems(data.list || []);
      setUnread(data.unread || 0);
    } catch { /* ignore */ }
  }
  useEffect(() => { load(); }, []);
  async function readAll() {
    await api.post('/me/notifications/read-all').catch(() => {});
    setUnread(0); setItems((it) => it.map((x) => ({ ...x, is_read: 1 })));
  }
  return (
    <div style={{ position: 'relative' }}>
      <button className="btn btn-ghost btn-sm" onClick={() => { setOpen(!open); if (!open) load(); }}><Icon name="bell" size={15} /> {unread > 0 ? <span className="badge badge-status-resolved" style={{ marginLeft: 2 }}>{unread}</span> : null}</button>
      {open && (
        <div className="card" style={{ position: 'absolute', right: 0, top: 44, width: 320, zIndex: 50, boxShadow: 'var(--shadow-lg)' }}>
          <div className="row between card-pad" style={{ borderBottom: '1px solid var(--border)' }}>
            <strong>通知</strong>
            <span className="small text-2" style={{ cursor: 'pointer' }} onClick={readAll}>全部已读</span>
          </div>
          <div style={{ maxHeight: 360, overflowY: 'auto' }}>
            {items.length === 0 ? <div className="empty" style={{ padding: 24 }}>暂无通知</div> :
              items.map((n) => (
                <div key={n.id} className="card-pad" style={{ borderBottom: '1px solid var(--border)', background: n.is_read ? '#fff' : '#f8faff' }}>
                  <div className="bold small">{n.title}</div>
                  <div className="text-2 small">{n.content}</div>
                  <div className="muted small">{new Date(n.created_at).toLocaleString()}</div>
                </div>
              ))}
          </div>
        </div>
      )}
    </div>
  );
}

function UserMenu() {
  const navigate = useNavigate();
  const { user, logout } = useUser();
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  useEffect(() => {
    if (!open) return;
    function onDown(e) {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    }
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [open]);
  function goAccount() { setOpen(false); navigate('/app/account'); }
  function doLogout() {
    setOpen(false);
    logout();
    localStorage.removeItem('fb_user_token');
    navigate('/login');
  }
  return (
    <div ref={ref} style={{ position: 'relative' }}>
      <div className="row gap-2" style={{ cursor: 'pointer', padding: '4px 6px', borderRadius: 8 }} onClick={() => setOpen(!open)} title="账号菜单">
        <Avatar name={user?.nickname || 'U'} size={32} />
        <span className="small text-2">{user?.nickname}</span>
        <Icon name="chevron-down" size={14} style={{ color: 'var(--text-3)' }} />
      </div>
      {open && (
        <div className="card" style={{ position: 'absolute', right: 0, top: 46, width: 184, zIndex: 60, boxShadow: 'var(--shadow-lg)', padding: 6 }}>
          <button type="button" className="menu-item" onClick={goAccount}>
            <Icon name="user" size={15} /><span>个人中心</span>
          </button>
          <button type="button" className="menu-item menu-item-danger" onClick={doLogout}>
            <Icon name="logout" size={15} /><span>退出登录</span>
          </button>
        </div>
      )}
    </div>
  );
}

export default function AppHeader({ children }) {
  const navigate = useNavigate();
  const location = useLocation();
  const { user } = useUser();
  // 产品页内：logo 变为面包屑「‹ 反馈墙」，作为返回产品列表的固定入口（侧边栏在小屏会隐藏）
  const inProduct = location.pathname.startsWith('/app/products');
  return (
    <div className="landing-nav between" style={{ background: '#fff', borderBottom: '1px solid var(--border)' }}>
      <Brand backArrow={inProduct} onClick={() => navigate('/app')} title="返回产品列表" />
      <div className="row gap-3">
        <Button variant="ghost" size="sm" onClick={() => navigate('/app/notifications')}><Icon name="mail" size={14} style={{ marginRight: 4, verticalAlign: '-2px' }} />通知模板</Button>
        <NotificationBell />
        {children}
        <UserMenu />
      </div>
    </div>
  );
}
