import React, { useState, useEffect, useCallback } from 'react';
import { useParams, useOutletContext, useNavigate } from 'react-router-dom';
import api from '../lib/api';
import { Spinner, StatusBadge, TypeBadge, Button, Avatar, toast, Field } from '../components/ui';
import Icon from '../components/Icon';
import { AttachmentGrid } from '../components/Attachments';

const STATUS_LIST = ['pending', 'planned', 'in_progress', 'resolved', 'closed', 'declined'];
const CONTACT_LABEL = { qq: 'QQ', wechat: '微信', email: '邮箱', other: '其他' };
const STATUS_LABEL = { pending: '待处理', planned: '已规划', in_progress: '处理中', resolved: '已解决', closed: '已关闭', declined: '已拒绝' };

export default function PostDetailManage() {
  const { id: productId, postId } = useParams();
  const { product } = useOutletContext();
  const navigate = useNavigate();
  const [post, setPost] = useState(null);
  const [comments, setComments] = useState([]);
  const [tags, setTags] = useState([]);
  const [cats, setCats] = useState([]);
  const [reply, setReply] = useState('');
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const p = await api.get(`/products/${productId}/posts/${postId}`).then((r) => r.data.post);
    setPost(p);
    setComments([]);
    try {
      const pb = await api.get(`/p/${product.slug}/posts/${postId}`).then((r) => r.data);
      setComments(pb.comments || []);
    } catch { /* ignore */ }
  }, [productId, postId, product.slug]);

  useEffect(() => {
    load();
    api.get(`/products/${productId}/tags`).then((r) => setTags(r.data.tags)).catch(() => {});
    api.get(`/products/${productId}/categories`).then((r) => setCats(r.data.categories)).catch(() => {});
  }, [load, productId]);

  if (!post) return <Spinner />;

  async function patch(payload, msg) {
    setBusy(true);
    try {
      await api.patch(`/products/${productId}/posts/${postId}`, payload);
      toast(msg || '已更新', 'success');
      load();
    } catch (e) { toast(e.message, 'error'); }
    finally { setBusy(false); }
  }
  async function sendReply() {
    if (!reply.trim()) return;
    setBusy(true);
    try {
      await api.post(`/products/${productId}/posts/${postId}/reply`, { content: reply.trim() });
      setReply(''); toast('官方回复已发布', 'success'); load();
    } catch (e) { toast(e.message, 'error'); }
    finally { setBusy(false); }
  }
  async function remove() {
    if (!window.confirm('确定删除该反馈？此操作不可恢复。')) return;
    await api.delete(`/products/${productId}/posts/${postId}`).catch(() => {});
    toast('已删除', 'success'); navigate('../posts');
  }
  const selectedTags = (post.tags || []).map((t) => t.id);
  function toggleTag(tid) {
    const next = selectedTags.includes(tid) ? selectedTags.filter((x) => x !== tid) : [...selectedTags, tid];
    patch({ tag_ids: next }, '标签已更新');
  }

  return (
    <div>
      <a className="small text-2" style={{ cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 5 }} onClick={() => navigate('../posts')}><Icon name="arrow-left" size={13} />返回反馈列表</a>
      <div className="grid mt-2" style={{ gridTemplateColumns: '1.6fr 1fr', gap: 16, alignItems: 'start' }}>
        <div className="card card-pad">
          <div className="row gap-2 wrap">
            <TypeBadge type={post.type} />
            <StatusBadge status={post.status} />
            {post.is_pinned && <span className="badge badge-status-planned">置顶</span>}
            {post.is_hidden && <span className="badge badge-status-closed">已隐藏</span>}
            {post.is_private && <span className="badge badge-status-declined">私密</span>}
            {post.review_state === 'pending' && <span className="badge badge-status-pending">待审核</span>}
          </div>
          <h2 style={{ margin: '8px 0' }}>{post.title}</h2>
          <div className="row gap-2 text-2 small mb-2">
            <Avatar name={post.author_name || '匿'} size={24} />
            <span>{post.author_name || '匿名用户'}</span><span>·</span><span>#{post.seq}</span><span>·</span><span><Icon name="arrow-up" size={12} strokeWidth={3} style={{ verticalAlign: '-1px' }} /> {post.vote_count}</span><span>·</span><span><Icon name="message" size={12} style={{ verticalAlign: '-2px' }} /> {post.comment_count}</span>
          </div>
          <div style={{ whiteSpace: 'pre-wrap', lineHeight: 1.8 }}>{post.content}</div>
          <AttachmentGrid attachments={post.attachments} />

          <div className="divider" />
          <div className="bold mb-2">全部评论（{comments.length}）</div>
          <div className="col gap-2">
            {comments.length === 0 ? <div className="muted small">暂无评论</div> :
              comments.map((c) => (
                <div key={c.id} className={`comment ${c.is_official ? 'official' : ''}`}>
                  <Avatar name={c.author_name || '匿'} size={32} />
                  <div style={{ flex: 1 }}>
                    <div className="row gap-2"><strong>{c.author_name}</strong>{c.is_official && <span className="badge badge-status-resolved">官方</span>}</div>
                    <div className="mt-1" style={{ whiteSpace: 'pre-wrap' }}>{c.content}</div>
                  </div>
                </div>
              ))}
          </div>
        </div>

        <div className="col gap-3">
          <div className="card card-pad">
            <div className="bold mb-2">状态与分类</div>
            <Field label="状态">
              <select value={post.status} onChange={(e) => patch({ status: e.target.value }, '状态已更新')}>
                {STATUS_LIST.map((s) => <option key={s} value={s}>{STATUS_LABEL[s]}</option>)}
              </select>
            </Field>
            <Field label="分类">
              <select value={post.category_id || ''} onChange={(e) => patch({ category_id: e.target.value ? Number(e.target.value) : null }, '分类已更新')}>
                <option value="">不指定</option>
                {cats.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </Field>
            <div className="row gap-2 wrap mt-2">
              <Button size="sm" onClick={() => patch({ is_pinned: !post.is_pinned })}>{post.is_pinned ? '取消置顶' : '置顶'}</Button>
              <Button size="sm" onClick={() => patch({ is_hidden: !post.is_hidden })}>{post.is_hidden ? '取消隐藏' : '隐藏'}</Button>
              <Button size="sm" onClick={() => patch({ is_private: !post.is_private })}>{post.is_private ? '转公开' : '设为私密'}</Button>
              {post.review_state === 'pending' && <Button size="sm" variant="primary" onClick={() => patch({ review_state: 'approved' })}>通过审核</Button>}
            </div>
          </div>

          {post.contact_value && (
            <div className="card card-pad">
              <div className="bold mb-2">联系方式</div>
              <div className="row gap-2 wrap">
                <span className="badge badge-status-planned">{CONTACT_LABEL[post.contact_type] || '其他'}</span>
                <span style={{ wordBreak: 'break-all' }}>{post.contact_value}</span>
              </div>
              <div className="hint mt-1">由提交者选填，仅团队成员可见，不会在反馈社区展示</div>
            </div>
          )}

          <div className="card card-pad">
            <div className="bold mb-2">标签</div>
            <div className="row gap-2 wrap">
              {tags.length === 0 ? <span className="muted small">暂无标签</span> :
                tags.map((t) => (
                  <span key={t.id} className="chip" style={{ borderColor: selectedTags.includes(t.id) ? t.color : 'var(--border)', background: selectedTags.includes(t.id) ? t.color : '#fff', color: selectedTags.includes(t.id) ? '#fff' : 'var(--text-2)' }} onClick={() => toggleTag(t.id)}>{t.name}</span>
                ))}
            </div>
          </div>

          <div className="card card-pad">
            <div className="bold mb-2">官方回复</div>
            <textarea value={reply} onChange={(e) => setReply(e.target.value)} placeholder="以官方身份回复，将高亮置顶展示给用户" style={{ minHeight: 90 }} />
            <Button variant="primary" block className="mt-2" loading={busy} onClick={sendReply}>发布回复</Button>
          </div>

          <Button variant="danger" onClick={remove}>删除该反馈</Button>
        </div>
      </div>
    </div>
  );
}
