import React, { useState, useEffect } from 'react';
import { useOutletContext, useNavigate } from 'react-router-dom';
import api from '../lib/api';
import { usePaged } from '../lib/hooks';
import { Spinner, StatusBadge, TypeBadge, Button, toast } from '../components/ui';
import Icon from '../components/Icon';

const STATUS_LABEL = { pending: '待处理', planned: '已计划', in_progress: '处理中', resolved: '已解决', closed: '已关闭', declined: '已拒绝' };
const TYPE_LABEL = { feedback: '建议', bug: '问题', complaint: '吐槽', question: '咨询' };

export default function PostsManage() {
  const { id } = useOutletContext();
  const navigate = useNavigate();
  const [filters, setFilters] = useState({ status: '', type: '', categoryId: '', keyword: '' });
  const [cats, setCats] = useState([]);
  const [exporting, setExporting] = useState(false);

  useEffect(() => {
    api.get(`/products/${id}/categories`).then((r) => setCats(r.data.categories)).catch(() => {});
  }, [id]);

  const fetcher = (p) => {
    const qs = new URLSearchParams({ page: p, pageSize: 15 });
    if (filters.status) qs.set('status', filters.status);
    if (filters.type) qs.set('type', filters.type);
    if (filters.categoryId) qs.set('categoryId', filters.categoryId);
    if (filters.keyword) qs.set('keyword', filters.keyword);
    return api.get(`/products/${id}/posts?${qs.toString()}`).then((r) => r.data);
  };
  const { list, total, page, loading, setPage, load } = usePaged(fetcher, [id, filters.status, filters.type, filters.categoryId, filters.keyword]);

  function onChange(k, v) { setFilters((f) => ({ ...f, [k]: v })); }

  async function exportCsv() {
    setExporting(true);
    try {
      const qs = new URLSearchParams();
      if (filters.status) qs.set('status', filters.status);
      if (filters.type) qs.set('type', filters.type);
      if (filters.categoryId) qs.set('categoryId', filters.categoryId);
      if (filters.keyword) qs.set('keyword', filters.keyword);
      const res = await api.get(`/products/${id}/posts/export?${qs.toString()}`, { responseType: 'blob' });
      const disposition = res.headers && res.headers['content-disposition'];
      let filename = 'feedback-export.csv';
      if (typeof disposition === 'string') {
        const m = disposition.match(/filename="?([^"]+)"?/);
        if (m) filename = m[1];
      }
      const url = URL.createObjectURL(res.data);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      toast('导出成功', 'success');
    } catch (e) {
      toast(e.message || '导出失败', 'error');
    } finally {
      setExporting(false);
    }
  }

  return (
    <div>
      <h1 className="page-title">反馈管理</h1>
      <p className="page-sub">查看、筛选、回复与流转每一条反馈。共 {total} 条。</p>

      <div className="filter-bar mt-3">
        <input className="search-input" placeholder="搜索标题或内容…" value={filters.keyword} onChange={(e) => onChange('keyword', e.target.value)} />
        <select value={filters.status} onChange={(e) => onChange('status', e.target.value)} style={{ width: 'auto' }}>
          <option value="">全部状态</option>
          {Object.keys(STATUS_LABEL).map((s) => <option key={s} value={s}>{STATUS_LABEL[s]}</option>)}
        </select>
        <select value={filters.type} onChange={(e) => onChange('type', e.target.value)} style={{ width: 'auto' }}>
          <option value="">全部类型</option>
          {Object.keys(TYPE_LABEL).map((t) => <option key={t} value={t}>{TYPE_LABEL[t]}</option>)}
        </select>
        <select value={filters.categoryId} onChange={(e) => onChange('categoryId', e.target.value)} style={{ width: 'auto' }}>
          <option value="">全部分类</option>
          {cats.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
        <Button size="sm" onClick={() => load(1)}>筛选</Button>
        <Button size="sm" loading={exporting} onClick={exportCsv}>导出 CSV</Button>
      </div>

      {loading ? <Spinner /> :
        <div className="card" style={{ overflow: 'hidden' }}>
          <table className="table">
            <thead><tr><th>#</th><th>标题</th><th>类型</th><th>分类</th><th>状态</th><th>反馈者</th><th><Icon name="arrow-up" size={13} strokeWidth={2.5} /></th><th><Icon name="message" size={13} /></th><th>更新</th><th></th></tr></thead>
            <tbody>
              {list.length === 0 ? (
                <tr><td colSpan={10}><div className="empty" style={{ padding: 30 }}>暂无反馈</div></td></tr>
              ) : list.map((p) => (
                <tr key={p.id} style={{ cursor: 'pointer' }} onClick={() => navigate(`/app/products/${id}/posts/${p.id}`)}>
                  <td className="muted">#{p.seq}</td>
                  <td><div className="row gap-2" style={{ minWidth: 0 }}>
                    <div className="bold small" style={{ maxWidth: 280, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.title}</div>
                    {p.attachments && p.attachments.length > 0 && <span className="muted small" title={`${p.attachments.length} 个附件`}><Icon name="paperclip" size={12} style={{ verticalAlign: '-2px' }} />{p.attachments.length}</span>}
                  </div></td>
                  <td><TypeBadge type={p.type} /></td>
                  <td><span className="tag-chip">{p.category_name || '-'}</span></td>
                  <td><StatusBadge status={p.status} /></td>
                  <td className="small text-2">{p.author_name || '匿名'}</td>
                  <td className="small">{p.vote_count}</td>
                  <td className="small">{p.comment_count}</td>
                  <td className="small text-3">{(p.updated_at || '').slice(0, 10)}</td>
                  <td><a className="small" style={{ color: 'var(--primary)' }} onClick={(e) => { e.stopPropagation(); navigate(`/app/products/${id}/posts/${p.id}`); }}>查看</a></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>}

      {total > 15 && (
        <div className="row gap-2 mt-3 center" style={{ justifyContent: 'center' }}>
          <Button size="sm" disabled={page <= 1} onClick={() => load(page - 1)}>上一页</Button>
          <span className="small text-2">第 {page} 页 / 共 {Math.ceil(total / 15)} 页</span>
          <Button size="sm" disabled={page * 15 >= total} onClick={() => load(page + 1)}>下一页</Button>
        </div>
      )}
    </div>
  );
}
