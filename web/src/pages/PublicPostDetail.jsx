import React, { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import api, { ensureSession } from '../lib/api';
import { Button, Spinner, Empty, Avatar, TypeBadge, StatusBadge, toast } from '../components/ui';
import Icon from '../components/Icon';
import { AttachmentGrid } from '../components/Attachments';

function timeAgo(s) {
  const d = new Date(s); const diff = (Date.now() - d.getTime()) / 1000;
  if (diff < 60) return '刚刚';
  if (diff < 3600) return Math.floor(diff / 60) + ' 分钟前';
  if (diff < 86400) return Math.floor(diff / 3600) + ' 小时前';
  return d.toLocaleDateString();
}

export default function PublicPostDetail() {
  const { slug, id } = useParams();
  const navigate = useNavigate();
  const [post, setPost] = useState(null);
  const [comments, setComments] = useState([]);
  const [voted, setVoted] = useState(false);
  const [voteCount, setVoteCount] = useState(0);
  const [commentText, setCommentText] = useState('');
  const [replyTo, setReplyTo] = useState(null);
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await api.get(`/p/${slug}/posts/${id}`);
      setPost(data.post); setComments(data.comments || []);
      setVoted(!!data.voted); setVoteCount(data.post.vote_count || 0);
    } catch { setPost(false); }
    finally { setLoading(false); }
    // eslint-disable-next-line
  }, [slug, id]);

  useEffect(() => { (async () => { await ensureSession(slug); load(); })(); }, [slug, id, load]);

  if (post === false) return <div className="public-shell"><div className="empty"><div className="big" style={{ color: 'var(--text-3)' }}><Icon name="lock" size={34} strokeWidth={1.5} /></div>该反馈不存在或不可见</div></div>;
  if (loading || !post) return <Spinner />;

  async function vote() {
    const { data } = await api.post(`/p/${slug}/posts/${id}/vote`);
    setVoted(data.voted); setVoteCount(data.voteCount);
  }
  async function submitComment(parentId) {
    if (!commentText.trim()) return;
    setSaving(true);
    try {
      await api.post(`/p/${slug}/posts/${id}/comments`, { content: commentText.trim(), parent_id: parentId || undefined });
      setCommentText(''); setReplyTo(null);
      toast('评论已提交', 'success');
      load();
    } catch (e) { toast(e.message, 'error'); }
    finally { setSaving(false); }
  }
  async function likeComment(cid) {
    try { await api.post(`/p/${slug}/comments/${cid}/like`); load(); } catch {}
  }

  // 构造两层评论树
  const top = comments.filter((c) => !c.parent_id);
  const childrenOf = (pid) => comments.filter((c) => c.parent_id === pid);

  return (
    <div className="public-shell" style={{ maxWidth: 720 }}>
      <a className="small text-2" style={{ cursor: 'pointer' }} onClick={() => navigate(`/p/${slug}`)}>← 返回列表</a>

      <div className="card card-pad mt-2">
        <div className="row gap-2 wrap">
          <TypeBadge type={post.type} />
          {post.category_name && <span className="tag-chip">{post.category_name}</span>}
          <StatusBadge status={post.status} />
          {post.is_pinned && <span className="badge badge-status-planned">置顶</span>}
        </div>
        <h2 style={{ marginTop: 8 }}>{post.title}</h2>
        <div className="row gap-2 text-2 small">
          <Avatar name={post.author_name || '匿'} size={26} />
          <span>{post.author_name || '匿名用户'}</span><span>·</span><span>#{post.seq}</span><span>·</span><span>{timeAgo(post.created_at)}</span>
        </div>
        <div className="mt-2" style={{ whiteSpace: 'pre-wrap', lineHeight: 1.8 }}>{post.content}</div>
        <AttachmentGrid attachments={post.attachments} />
        <div className="row gap-3 mt-3">
          <div className={`vote-box ${voted ? 'voted' : ''}`} onClick={vote} style={{ flexDirection: 'row', width: 'auto', padding: '6px 14px', height: 'auto' }}>
            <span className="num" style={{ marginRight: 6 }}>{voted ? <Icon name="check" size={14} strokeWidth={3} /> : <Icon name="arrow-up" size={14} strokeWidth={3} />}</span>
            <span className="lbl">{voteCount} 人投票</span>
          </div>
        </div>
      </div>

      <div className="mt-4">
        <div className="bold mb-2">全部评论（{comments.length}）</div>
        {top.length === 0 ? <Empty icon="message" text="还没有评论，来说两句" /> :
          top.map((c) => (
            <div key={c.id} className={`comment ${c.is_official ? 'official' : ''}`}>
              <Avatar name={c.author_name || '匿'} size={36} />
              <div style={{ flex: 1 }}>
                <div className="row gap-2">
                  <strong>{c.author_name || '匿名用户'}</strong>
                  {c.is_official && <span className="badge badge-status-resolved">官方</span>}
                  <span className="muted small">{timeAgo(c.created_at)}</span>
                </div>
                <div className="mt-1" style={{ whiteSpace: 'pre-wrap' }}>{c.content}</div>
                <div className="row gap-3 mt-1 small">
                  <span className="text-2" style={{ cursor: 'pointer' }} onClick={() => likeComment(c.id)}><Icon name="thumbs-up" size={13} style={{ marginRight: 3, verticalAlign: '-2px' }} />{c.like_count}</span>
                  <span className="text-2" style={{ cursor: 'pointer' }} onClick={() => setReplyTo(c.id)}>回复</span>
                </div>
                {childrenOf(c.id).map((ch) => (
                  <div key={ch.id} className={`comment ${ch.is_official ? 'official' : ''}`} style={{ paddingLeft: 0 }}>
                    <Avatar name={ch.author_name || '匿'} size={30} />
                    <div style={{ flex: 1 }}>
                      <div className="row gap-2">
                        <strong>{ch.author_name || '匿名用户'}</strong>
                        {ch.is_official && <span className="badge badge-status-resolved">官方</span>}
                        <span className="muted small">{timeAgo(ch.created_at)}</span>
                      </div>
                      <div className="mt-1" style={{ whiteSpace: 'pre-wrap' }}>{ch.content}</div>
                      <div className="row gap-3 mt-1 small"><span className="text-2" style={{ cursor: 'pointer' }} onClick={() => likeComment(ch.id)}><Icon name="thumbs-up" size={13} style={{ marginRight: 3, verticalAlign: '-2px' }} />{ch.like_count}</span></div>
                    </div>
                  </div>
                ))}
                {replyTo === c.id && (
                  <div className="mt-2">
                    <textarea value={commentText} onChange={(e) => setCommentText(e.target.value)} placeholder="回复 @${c.author_name}…" style={{ minHeight: 70 }} />
                    <div className="row gap-2 mt-1">
                      <Button size="sm" variant="primary" loading={saving} onClick={() => submitComment(c.id)}>回复</Button>
                      <Button size="sm" onClick={() => { setReplyTo(null); setCommentText(''); }}>取消</Button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          ))}
      </div>

      <div className="card card-pad mt-4">
        <div className="bold mb-2">写下你的评论</div>
        <textarea value={commentText} onChange={(e) => setCommentText(e.target.value)} placeholder="支持游客评论，无需登录" />
        <div className="row between mt-2">
          {replyTo ? <span className="small text-2">正在回复评论…</span> : <span />}
          <Button variant="primary" loading={saving} onClick={() => submitComment(null)}>发表评论</Button>
        </div>
      </div>
    </div>
  );
}
