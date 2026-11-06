import React from 'react';

export function MiniLineChart({ data, width = 640, height = 180 }) {
  if (!data || !data.length) return <div className="muted small">暂无数据</div>;
  const max = Math.max(1, ...data.map((d) => d.newPosts + d.resolved));
  const pad = 28;
  const w = width, h = height;
  const stepX = (w - pad * 2) / (data.length - 1 || 1);
  const y = (v) => h - pad - (v / max) * (h - pad * 2);
  const x = (i) => pad + i * stepX;
  const lineNew = data.map((d, i) => `${i === 0 ? 'M' : 'L'}${x(i)},${y(d.newPosts)}`).join(' ');
  const lineRes = data.map((d, i) => `${i === 0 ? 'M' : 'L'}${x(i)},${y(d.resolved)}`).join(' ');
  return (
    <svg viewBox={`0 0 ${w} ${h}`} width="100%" style={{ display: 'block' }}>
      <line x1={pad} y1={h - pad} x2={w - pad} y2={h - pad} stroke="#e8eaed" />
      <path d={lineNew} fill="none" stroke="#4f46e5" strokeWidth="2.5" />
      <path d={lineRes} fill="none" stroke="#16a34a" strokeWidth="2.5" />
      {data.filter((_, i) => i % 5 === 0).map((d, i) => (
        <text key={i} x={x(i * 5)} y={h - 8} fontSize="10" fill="#9ca3af" textAnchor="middle">{(d.date || '').slice(5)}</text>
      ))}
    </svg>
  );
}

export function DistributionBars({ items }) {
  if (!items || !items.length) return <div className="muted small">暂无数据</div>;
  const max = Math.max(1, ...items.map((i) => i.count));
  return (
    <div className="col gap-2">
      {items.map((it) => (
        <div key={it.status || it.type || it.name} className="row gap-2">
          <div style={{ width: 70 }} className="small text-2">{it.status || it.type || it.name}</div>
          <div style={{ flex: 1, background: '#f1f5f9', borderRadius: 6, overflow: 'hidden' }}>
            <div style={{ width: `${(it.count / max) * 100}%`, background: it.color || '#4f46e5', height: 18, borderRadius: 6 }} />
          </div>
          <div style={{ width: 38, textAlign: 'right' }} className="small">{it.count}</div>
        </div>
      ))}
    </div>
  );
}
