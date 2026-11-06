import React from 'react';
import { useNavigate } from 'react-router-dom';
import Icon from '../components/Icon';

export default function NotFound() {
  const navigate = useNavigate();
  return (
    <div className="empty" style={{ paddingTop: 100 }}>
      <div className="big" style={{ color: 'var(--text-3)' }}><Icon name="compass" size={34} strokeWidth={1.5} /></div>
      <h2>页面不存在</h2>
      <p className="text-2">你访问的页面可能已被移动或删除。</p>
      <button className="btn btn-primary" onClick={() => navigate('/')}>返回首页</button>
    </div>
  );
}
