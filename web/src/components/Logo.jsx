import React, { useId } from 'react';

/**
 * 品牌 Logo：渐变圆角方块 + 白色对话气泡 + 三点。
 * 意象：用户的声音（气泡与三点）汇聚到反馈墙。
 * 用法：<Logo size={28} />（颜色固定品牌渐变，不随文字色变化）
 */
export default function Logo({ size = 28, style, title }) {
  const raw = useId();
  const gid = `brandGrad-${raw.replace(/[:]/g, '')}`;
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 48 48"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      style={{ display: 'inline-block', verticalAlign: 'middle', flexShrink: 0, ...style }}
      role={title ? 'img' : 'presentation'}
      aria-label={title || undefined}
      aria-hidden={title ? undefined : true}
    >
      {title ? <title>{title}</title> : null}
      <defs>
        <linearGradient id={gid} x1="8" y1="2" x2="40" y2="46" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#6366f1" />
          <stop offset="1" stopColor="#4f46e5" />
        </linearGradient>
      </defs>
      {/* 圆角方块底 */}
      <rect x="2" y="2" width="44" height="44" rx="12" fill={`url(#${gid})`} />
      {/* 顶部高光，增加质感 */}
      <path d="M14 4.6a10 10 0 0 1 8-2.6h4a10 10 0 0 1 8 2.6 22 22 0 0 1-20 0Z" fill="#fff" opacity="0.14" />
      {/* 对话气泡（白） */}
      <rect x="13" y="11.5" width="22" height="16.5" rx="5.5" fill="#fff" />
      <path d="M19 28h10.5L17.5 36.2a.6.6 0 0 1-.9-.7L19 28Z" fill="#fff" />
      {/* 气泡内三点：用户的声音 */}
      <circle cx="18.6" cy="19.8" r="1.9" fill="#4f46e5" />
      <circle cx="24" cy="19.8" r="1.9" fill="#4f46e5" />
      <circle cx="29.4" cy="19.8" r="1.9" fill="#4f46e5" />
    </svg>
  );
}
