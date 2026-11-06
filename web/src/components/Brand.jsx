import React from 'react';
import Logo from './Logo';
import Icon from './Icon';

/**
 * 品牌组合（图形 + 文字）：全站统一规格，确保官网、控制台、产品页、
 * 登录页的品牌展示完全一致（图形 22px / 间距 8px / 19px / 字重 900）。
 *
 * 用法：
 *   <Brand />                                    静态展示
 *   <Brand onClick={fn} title="返回产品列表" />    可点击（键盘可达）
 *   <Brand backArrow />                          前置返回箭头（面包屑场景）
 */
export default function Brand({ onClick, title, backArrow = false, style }) {
  const content = (
    <>
      {backArrow ? <Icon name="arrow-left" size={17} style={{ marginRight: 2, color: 'var(--text-3)' }} /> : null}
      <Logo size={22} />
      <span>反馈墙</span>
    </>
  );

  if (onClick) {
    return (
      <div
        className="logo"
        role="link"
        tabIndex={0}
        title={title}
        style={{ cursor: 'pointer', ...style }}
        onClick={onClick}
        onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onClick(); } }}
      >
        {content}
      </div>
    );
  }
  return <div className="logo" style={style}>{content}</div>;
}
