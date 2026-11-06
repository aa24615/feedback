import React from 'react';
import { useOutletContext, useNavigate } from 'react-router-dom';
import api from '../lib/api';
import { useAsync } from '../lib/hooks';
import { MiniLineChart, DistributionBars } from '../components/Charts';
import { Spinner, StatusBadge, TypeBadge } from '../components/ui';

export default function Overview() {
  const { id } = useOutletContext();
  const navigate = useNavigate();
  const { data, loading } = useAsync(() => api.get(`/products/${id}/stats`).then((r) => r.data), [id]);
  if (loading) return <Spinner />;
  if (!data) return <div className="empty">暂无数据</div>;
  const o = data.overview;
  const cards = [
    { n: o.total, l: '反馈总数' },
    { n: o.pending, l: '待处理' },
    { n: o.resolved, l: '已解决' },
    { n: o.total_votes, l: '投票总数' },
    { n: o.total_comments, l: '评论总数' },
    { n: o.members, l: '团队成员' },
  ];
  return (
    <div>
      <h1 className="page-title">概览看板</h1>
      <p className="page-sub">实时掌握反馈动态，让决策有数据支撑。</p>

      <div className="grid grid-4 mt-4">
        {cards.map((c) => (
          <div className="card stat-card" key={c.l}>
            <div className="stat-num">{c.n}</div>
            <div className="stat-lbl">{c.l}</div>
          </div>
        ))}
      </div>

      <div className="grid grid-3 mt-4" style={{ gridTemplateColumns: '2fr 1fr' }}>
        <div className="card card-pad">
          <div className="bold mb-2">近 30 天趋势（新增 / 已解决）</div>
          <MiniLineChart data={data.trend} />
          <div className="row gap-3 small mt-2">
            <span className="row gap-1"><span style={{ width: 12, height: 4, background: '#4f46e5', display: 'inline-block', borderRadius: 2 }} /> 新增</span>
            <span className="row gap-1"><span style={{ width: 12, height: 4, background: '#16a34a', display: 'inline-block', borderRadius: 2 }} /> 已解决</span>
          </div>
        </div>
        <div className="card card-pad">
          <div className="bold mb-2">状态分布</div>
          <DistributionBars items={data.statusDistribution} />
        </div>
      </div>

      <div className="grid grid-3 mt-4" style={{ gridTemplateColumns: '1fr 1fr' }}>
        <div className="card card-pad">
          <div className="bold mb-2">类型分布</div>
          <DistributionBars items={data.typeDistribution} />
        </div>
        <div className="card card-pad">
          <div className="bold mb-2">分类分布</div>
          <DistributionBars items={data.categoryDistribution} />
        </div>
      </div>

      <div className="card card-pad mt-4">
        <div className="row between">
          <div className="bold">投票排行 Top 10</div>
          <a className="small" style={{ color: 'var(--primary)', cursor: 'pointer' }} onClick={() => navigate('posts')}>前往管理 →</a>
        </div>
        <div className="col gap-1 mt-2">
          {data.topVoted.map((p) => (
            <div key={p.id} className="row between" style={{ padding: '8px 0', borderBottom: '1px solid var(--border)' }} onClick={() => navigate(`/app/products/${id}/posts/${p.id}`)}>
              <div className="row gap-2" style={{ cursor: 'pointer' }}>
                <span className="tag-chip">#{p.seq}</span>
                <TypeBadge type={p.type} />
                <span className="bold small">{p.title}</span>
              </div>
              <div className="row gap-2">
                <StatusBadge status={p.status} />
                <span className="small text-2">▲ {p.vote_count}</span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
