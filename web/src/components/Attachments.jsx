import React, { useState, useCallback, useEffect } from 'react';
import Icon from './Icon';

function isVideo(a) {
  return (a.mime_type || '').startsWith('video/');
}

/** 详情页完整附件：图片网格（点击放大）+ 内嵌视频播放器 */
export function AttachmentGrid({ attachments }) {
  const [lightbox, setLightbox] = useState(null);
  if (!attachments || !attachments.length) return null;
  return (
    <div className="mt-3">
      <div className="att-grid">
        {attachments.map((a) => (isVideo(a) ? (
          <video key={a.id || a.url} className="att-video" src={a.url} controls preload="metadata" playsInline />
        ) : (
          <img key={a.id || a.url} className="att-img" src={a.url} alt={a.file_name || ''} loading="lazy" onClick={() => setLightbox(a)} />
        )))}
      </div>
      {lightbox && <Lightbox src={lightbox.url} name={lightbox.file_name} onClose={() => setLightbox(null)} />}
    </div>
  );
}

/** 列表卡片紧凑预览：最多 max 个缩略图，超出显示 +n（视频显示播放角标） */
export function AttachmentThumbs({ attachments, max = 3 }) {
  if (!attachments || !attachments.length) return null;
  const shown = attachments.slice(0, max);
  const rest = attachments.length - shown.length;
  return (
    <div className="att-thumbs">
      {shown.map((a) => (
        <div key={a.id || a.url} className="att-thumb" title={a.file_name || ''}>
          {isVideo(a) ? <span className="att-thumb-video"><Icon name="play" size={12} /></span> : <img src={a.url} alt="" loading="lazy" />}
        </div>
      ))}
      {rest > 0 && <div className="att-thumb att-thumb-more">+{rest}</div>}
    </div>
  );
}

/** 图片放大浮层（点击遮罩或 Esc 关闭） */
export function Lightbox({ src, name, onClose }) {
  const onKey = useCallback((e) => { if (e.key === 'Escape') onClose(); }, [onClose]);
  useEffect(() => {
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onKey]);
  return (
    <div className="lightbox" onClick={onClose}>
      <img src={src} alt={name || ''} onClick={(e) => e.stopPropagation()} />
      <button type="button" className="lightbox-x" onClick={onClose}>×</button>
    </div>
  );
}
