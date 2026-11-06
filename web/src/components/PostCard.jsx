import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../lib/api';
import { TypeBadge, StatusBadge, Avatar, Empty, Spinner } from '../components/ui';
import Icon from './Icon';
import { AttachmentThumbs } from '../components/Attachments';

export default function PostCard({ post, slug, onOpen }) {
  const [voted, setVoted] = useState(!!post.voted);
  const [count, setCount] = useState(post.vote_count || 0);

  async function vote(e) {
    e.stopPropagation();
    try {
      const { data } = await api.post(`/p/${slug}/posts/${post.id}/vote`);
      setVoted(data.voted);
      setCount(data.voteCount);
    } catch { /* ignore */ }
  }

  return (
    <div className="card post-card" onClick={() => onOpen(post.id)}>
      <div className="row gap-3">
        <div className={`vote-box ${voted ? 'voted' : ''}`} onClick={vote}>
          <span className="num">{count}</span>
          <span className="lbl">投票</span>
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div className="row gap-2 wrap" style={{ marginTop: 2 }}>
            <TypeBadge type={post.type} />
            {post.category_name && <span className="tag-chip">{post.category_name}</span>}
            <StatusBadge status={post.status} />
            {post.is_pinned && <span className="badge badge-status-planned">置顶</span>}
          </div>
          <div className="bold mt-1" style={{ fontSize: 15 }}>{post.title}</div>
          <div className="text-2 small mt-1 clamp2">{post.content}</div>
          <AttachmentThumbs attachments={post.attachments} />
          <div className="row gap-3 muted small mt-1">
            <span><Icon name="message" size={13} style={{ marginRight: 3, verticalAlign: '-2px' }} />{post.comment_count}</span>
            <span>#{post.seq}</span>
            <span>· {post.author_name || '匿名用户'}</span>
          </div>
        </div>
      </div>
    </div>
  );
}
