import React from 'react';
import { create } from 'zustand';
import Icon from './Icon';

/* ---------------- Toast ---------------- */
const useToastStore = create((set) => ({
  items: [],
  push: (msg, type = 'info') => {
    const id = Date.now() + Math.random();
    set((s) => ({ items: [...s.items, { id, msg, type }] }));
    setTimeout(() => set((s) => ({ items: s.items.filter((i) => i.id !== id) })), 2600);
  },
}));
export function toast(msg, type) { useToastStore.getState().push(msg, type); }

export function ToastContainer() {
  const items = useToastStore((s) => s.items);
  return (
    <div>
      {items.map((i) => (
        <div className="toast" key={i.id} style={{ background: i.type === 'error' ? '#b91c1c' : i.type === 'success' ? '#15803d' : '#1f2430' }}>
          {i.msg}
        </div>
      ))}
    </div>
  );
}

/* ---------------- Button ---------------- */
export function Button({ variant = 'default', size, block, loading, children, className = '', ...rest }) {
  const cls = ['btn', variant === 'primary' ? 'btn-primary' : variant === 'ghost' ? 'btn-ghost' : variant === 'danger' ? 'btn-danger' : '', size === 'sm' ? 'btn-sm' : '', block ? 'btn-block' : '', className].join(' ');
  return (
    <button className={cls} disabled={loading} {...rest}>
      {loading ? <span className="spinner" /> : null}
      {children}
    </button>
  );
}

/* ---------------- Spinner / Empty ---------------- */
export function Spinner() { return <div className="loading-box"><span className="spinner" /></div>; }
export function Empty({ icon = 'inbox', text = '暂无数据' }) {
  return <div className="empty"><div className="big"><Icon name={icon} size={30} strokeWidth={1.6} /></div><div>{text}</div></div>;
}

/* ---------------- Modal ---------------- */
export function Modal({ title, open, onClose, children, footer, width }) {
  if (!open) return null;
  return (
    <div className="modal-mask" onClick={onClose}>
      <div className="modal" style={width ? { maxWidth: width } : null} onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <strong>{title}</strong>
          <button className="x-btn" onClick={onClose}>×</button>
        </div>
        <div className="modal-body">{children}</div>
        {footer ? <div className="modal-foot">{footer}</div> : null}
      </div>
    </div>
  );
}

/* ---------------- Badges ---------------- */
export function StatusBadge({ status }) {
  const map = { pending: '待处理', planned: '已规划', in_progress: '处理中', resolved: '已解决', closed: '已关闭', declined: '已拒绝' };
  return <span className={`badge badge-status-${status}`}>{map[status] || status}</span>;
}
export function TypeBadge({ type }) {
  const map = { feedback: '建议', bug: '问题', complaint: '吐槽', question: '提问' };
  return <span className={`badge badge-type-${type}`}>{map[type] || type}</span>;
}

/* ---------------- Field ---------------- */
export function Field({ label, hint, children }) {
  return (
    <div className="field">
      {label ? <label>{label}</label> : null}
      {children}
      {hint ? <div className="hint">{hint}</div> : null}
    </div>
  );
}

/* ---------------- Tabs ---------------- */
export function Tabs({ tabs, active, onChange }) {
  return (
    <div className="tabs">
      {tabs.map((t) => (
        <div key={t.key} className={`tab ${active === t.key ? 'active' : ''}`} onClick={() => onChange(t.key)}>
          {t.label}
        </div>
      ))}
    </div>
  );
}

/* ---------------- Avatar ---------------- */
export function Avatar({ name, src, size = 36 }) {
  const letter = (name || '?').slice(0, 1).toUpperCase();
  const style = { width: size, height: size, fontSize: size * 0.42 };
  if (src) return <img src={src} alt="" className="avatar" style={style} />;
  return <div className="avatar" style={{ ...style, background: stringColor(name || '') }}>{letter}</div>;
}
function stringColor(s) {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = s.charCodeAt(i) + ((h << 5) - h);
  const colors = ['#4f46e5', '#0ea5e9', '#16a34a', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899'];
  return colors[Math.abs(h) % colors.length];
}
