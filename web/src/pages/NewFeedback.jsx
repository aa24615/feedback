import React, { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import api, { ensureSession } from '../lib/api';
import { Button, Field, toast, Spinner } from '../components/ui';
import Icon from '../components/Icon';

const MAX_FILES = 9;
const CONTACT_PLACEHOLDER = { qq: '填写 QQ 号', wechat: '填写微信号', email: '填写邮箱', other: '填写联系方式' };
const IMAGE_MAX = 5 * 1024 * 1024;  // 图片 ≤5MB（与后端一致）
const VIDEO_MAX = 50 * 1024 * 1024; // 视频 ≤50MB（与后端一致）

let seq = 0;

export default function NewFeedback() {
  const { slug } = useParams();
  const navigate = useNavigate();
  const [product, setProduct] = useState(null);
  const [categories, setCategories] = useState([]);
  const [form, setForm] = useState({ title: '', content: '', type: 'feedback', category_id: '', email: '', nickname: '', contact_type: 'qq', contact_value: '' });
  const [saving, setSaving] = useState(false);
  // 待上传/已上传的附件：{ key, file, name, mime, size, status: uploading|done|error, url, preview }
  const [files, setFiles] = useState([]);
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  // 卸载时释放预览 objectURL
  useEffect(() => () => { files.forEach((f) => f.preview && URL.revokeObjectURL(f.preview)); }, []); // eslint-disable-line

  useEffect(() => {
    (async () => {
      await ensureSession(slug);
      try {
        const { data } = await api.get(`/p/${slug}`);
        setProduct(data.product); setCategories(data.categories || []);
      } catch { setProduct(false); }
    })();
  }, [slug]);

  if (product === false) return <div className="public-shell"><div className="empty"><div className="big" style={{ color: 'var(--text-3)' }}><Icon name="lock" size={34} strokeWidth={1.5} /></div>该产品不存在或暂未公开</div></div>;
  if (!product) return <Spinner />;

  /** 选择文件：本地校验（类型/大小/数量）后立即上传 */
  function onPick(e) {
    const picked = Array.from(e.target.files || []);
    e.target.value = '';
    if (!picked.length) return;
    if (files.length + picked.length > MAX_FILES) { toast(`最多上传 ${MAX_FILES} 个图片/视频`, 'error'); return; }
    for (const f of picked) {
      const isVideo = f.type.startsWith('video/');
      const isImage = f.type.startsWith('image/');
      if (!isImage && !isVideo) { toast(`「${f.name}」不是图片或视频`, 'error'); continue; }
      if (isImage && f.size > IMAGE_MAX) { toast(`图片「${f.name}」超过 5MB`, 'error'); continue; }
      if (isVideo && f.size > VIDEO_MAX) { toast(`视频「${f.name}」超过 50MB`, 'error'); continue; }
      const item = {
        key: `f${Date.now()}_${(seq += 1)}`,
        file: f, name: f.name, mime: f.type, size: f.size,
        status: 'uploading', url: '',
        preview: isImage ? URL.createObjectURL(f) : '',
      };
      setFiles((fs) => [...fs, item]);
      uploadOne(item);
    }
  }

  async function uploadOne(item) {
    try {
      const fd = new FormData();
      fd.append('files', item.file);
      const r = await api.post(`/p/${slug}/upload`, fd);
      const f = r.data.files && r.data.files[0];
      if (!f) throw new Error('上传失败');
      setFiles((fs) => fs.map((x) => (x.key === item.key ? { ...x, status: 'done', url: f.url, mime: f.mime_type, size: f.size } : x)));
    } catch (err) {
      toast(err.message || `「${item.name}」上传失败`, 'error');
      setFiles((fs) => fs.map((x) => (x.key === item.key ? { ...x, status: 'error' } : x)));
    }
  }

  function removeFile(key) {
    setFiles((fs) => {
      const target = fs.find((x) => x.key === key);
      if (target && target.preview) URL.revokeObjectURL(target.preview);
      return fs.filter((x) => x.key !== key);
    });
  }

  async function submit(e) {
    e.preventDefault();
    if (form.title.trim().length < 4) return toast('标题至少 4 个字', 'error');
    if (form.content.trim().length < 1) return toast('请填写反馈内容', 'error');
    if (files.some((f) => f.status === 'uploading')) return toast('请等待文件上传完成', 'error');
    if (files.some((f) => f.status === 'error')) return toast('有文件上传失败，请移除后重试', 'error');
    setSaving(true);
    try {
      const payload = { ...form };
      if (!form.category_id) delete payload.category_id;
      // 联系方式选填：没填就不提交，避免落库空值
      if (!form.contact_value.trim()) { delete payload.contact_type; delete payload.contact_value; }
      const done = files.filter((f) => f.status === 'done');
      if (done.length) {
        payload.attachments = done.map((f) => ({ url: f.url, file_name: f.name, mime_type: f.mime, size: f.size }));
      }
      const { data } = await api.post(`/p/${slug}/posts`, payload);
      toast(data.message || '提交成功', 'success');
      navigate(`/p/${slug}/posts/${data.post.id}`);
    } catch (err) {
      toast(err.message, 'error');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="public-shell" style={{ maxWidth: 640 }}>
      <div className="row between mb-3">
        <h2 style={{ margin: 0 }}>提交反馈 · {product.name}</h2>
        <a className="small text-2" style={{ cursor: 'pointer' }} onClick={() => navigate(`/p/${slug}`)}>← 返回</a>
      </div>
      <div className="card card-pad">
        <form onSubmit={submit}>
          <Field label="标题"><input value={form.title} onChange={set('title')} placeholder="一句话概括你的反馈" /></Field>
          <div className="row gap-3 nf-fields">
            <div style={{ flex: 1 }}><Field label="类型">
              <select value={form.type} onChange={set('type')}>
                <option value="feedback">建议</option>
                <option value="bug">问题</option>
                <option value="complaint">吐槽</option>
                <option value="question">提问</option>
              </select>
            </Field></div>
            <div style={{ flex: 1 }}><Field label="分类（选填）">
              <select value={form.category_id} onChange={set('category_id')}>
                <option value="">不指定</option>
                {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </Field></div>
          </div>
          <Field label="内容"><textarea value={form.content} onChange={set('content')} placeholder="描述具体问题、建议或想吐槽的点…" style={{ minHeight: 140 }} /></Field>

          {/* 图片 / 视频附件 */}
          <Field label="图片 / 视频（选填）" hint={`最多 ${MAX_FILES} 个；图片 ≤5MB，视频 ≤50MB。附件将展示在反馈详情中。`}>
            <div className="att-picker">
              {files.map((f) => (
                <div key={f.key} className={`att-pick ${f.status === 'error' ? 'att-pick-error' : ''}`} title={f.name}>
                  {f.preview
                    ? <img src={f.preview} alt="" />
                    : <div className="att-pick-video">{f.status === 'uploading' ? '' : <Icon name="play" size={18} />}</div>}
                  {f.status === 'uploading' && <div className="att-pick-mask"><span className="spinner" /></div>}
                  {f.status === 'error' && <div className="att-pick-mask att-pick-mask-error">失败</div>}
                  <button type="button" className="att-pick-x" onClick={() => removeFile(f.key)}>×</button>
                </div>
              ))}
              {files.length < MAX_FILES && (
                <label className="att-add">
                  <span>＋</span>
                  <input type="file" accept="image/*,video/*" multiple hidden onChange={onPick} />
                </label>
              )}
            </div>
          </Field>

          {product.require_email && <Field label="邮箱（必填）"><input value={form.email} onChange={set('email')} type="email" placeholder="用于接收处理进展" /></Field>}
          {!product.require_email && product.allow_anonymous && <Field label="昵称（选填）"><input value={form.nickname} onChange={set('nickname')} placeholder="匿名用户" /></Field>}
          <Field label="联系方式（选填）" hint="方便我们就这条反馈回访你。仅工作人员可见，不会在反馈社区公开展示。">
            <div className="row gap-2">
              <select value={form.contact_type} onChange={set('contact_type')} style={{ width: 96, flex: '0 0 auto' }}>
                <option value="qq">QQ</option>
                <option value="wechat">微信</option>
                <option value="email">邮箱</option>
              </select>
              <input
                value={form.contact_value}
                onChange={set('contact_value')}
                type={form.contact_type === 'email' ? 'email' : 'text'}
                placeholder={CONTACT_PLACEHOLDER[form.contact_type]}
                style={{ flex: 1, minWidth: 0 }}
              />
            </div>
          </Field>
          <Button variant="primary" block loading={saving} type="submit">提交反馈</Button>
          <div className="hint center mt-2">提交即表示你同意我们收集上述信息用于产品改进。</div>
        </form>
      </div>
    </div>
  );
}
