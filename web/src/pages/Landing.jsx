import React from 'react';
import { useNavigate } from 'react-router-dom';
import { useUser } from '../store/user';
import { Button } from '../components/ui';
import Icon from '../components/Icon';
import Brand from '../components/Brand';

const features = [
  { ico: 'layers', t: '开箱即用', d: '不用开发、不用部署，创建产品后用链接跳转或 iframe 嵌入两种方式引用，就能开始收集反馈。' },
  { ico: 'idea', t: '建议 / Bug / 吐槽', d: '内置分类与状态流转（待处理→处理中→已解决），让反馈井井有条。' },
  { ico: 'vote', t: '投票排序', d: '用户为想法投票，热门需求自动上浮，需求优先级一目了然。' },
  { ico: 'message', t: '双向互动', d: '官方回复置顶高亮，支持追问与评论，把一次吐槽变成一次对话。' },
  { ico: 'chart', t: '数据看板', d: '状态分布、类型占比、趋势曲线与 Top 投票，决策有依据。' },
  { ico: 'mail', t: '邮件 / Webhook 通知', d: '新反馈实时推送邮件、企业微信、飞书等，开放 API 与嵌入组件轻松接入。' },
];

export default function Landing() {
  const navigate = useNavigate();
  const token = useUser((s) => s.token);
  return (
    <div>
      <div className="landing-nav between">
        <Brand />
        <div className="row gap-2">
          {token ? (
            <Button variant="primary" onClick={() => navigate('/app')}>进入控制台</Button>
          ) : (
            <Button variant="primary" onClick={() => navigate('/login')}>登录</Button>
          )}
        </div>
      </div>

      <div className="hero">
        <h1>把用户的每一条声音，<br />都变成产品迭代的方向</h1>
        <p>反馈墙是一个开箱即用的用户反馈系统。登录后创建产品，收集建议、问题、吐槽，用投票和评论凝聚共识，用状态流转和看板高效跟进 —— 链接跳转或 iframe 嵌入，两种方式任选。</p>
        <div className="row gap-3 mt-4">
          <Button variant="primary" onClick={() => navigate(token ? '/app' : '/login')}>开始使用</Button>
          <Button onClick={() => navigate('/p/demo')}>查看演示反馈页 →</Button>
        </div>

        <div className="feature-grid">
          {features.map((f) => (
            <div className="card feature" key={f.t}>
              <div className="ico"><Icon name={f.ico} size={24} strokeWidth={1.7} /></div>
              <div className="bold mt-2" style={{ fontSize: 16 }}>{f.t}</div>
              <div className="text-2 mt-1 small">{f.d}</div>
            </div>
          ))}
        </div>

        <div className="card card-pad mt-6 center">
          <div className="bold" style={{ fontSize: 17 }}>想立刻体验？</div>
          <div className="text-2 mt-1">使用管理员账号登录即可开始创建产品（默认账号见部署配置 ADMIN_EMAIL / ADMIN_PASSWORD）。</div>
        </div>
      </div>
    </div>
  );
}
