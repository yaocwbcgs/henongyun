import { useEffect, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { get, post, put } from '../lib/api.js';
import { useAuth } from '../lib/auth.jsx';
import { useToast } from '../lib/toast.jsx';
import { useTitle } from '../lib/hooks.js';
import PageHead from '../components/PageHead.jsx';
import ImageUploader from '../components/ImageUploader.jsx';
import { Spinner, Field, Loading } from '../components/ui.jsx';
import { POST_CATEGORIES, PROVINCES, UNITS, date } from '../lib/format.js';

const tomorrow = () => {
  const d = new Date(Date.now() + 86400000);
  return d.toISOString().slice(0, 10);
};

export default function TradePublish() {
  const [params] = useSearchParams();
  const editingId = params.get('id');
  useTitle(editingId ? '编辑供需信息' : '发布供需信息');
  const { user, booting } = useAuth();
  const navigate = useNavigate();
  const toast = useToast();

  const [type, setType] = useState(params.get('type') === 'demand' ? 'demand' : 'supply');
  const [form, setForm] = useState({
    title: '',
    category: '蔬菜',
    variety: '',
    spec: '',
    quantity: '',
    unit: '吨',
    priceType: 'fixed',
    price: '',
    province: '山东省',
    city: '',
    validUntil: tomorrow(),
    description: '',
  });
  const [images, setImages] = useState([]);
  const [errors, setErrors] = useState({});
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(Boolean(editingId));

  useEffect(() => {
    if (booting) return;
    if (!user) navigate(`/login?redirect=${encodeURIComponent(location.pathname + location.search)}`);
  }, [user, booting, navigate]);

  useEffect(() => {
    if (!editingId || !user) return;
    get(`/posts/${editingId}`)
      .then(({ post }) => {
        if (post.owner?.id !== user.id && user.role !== 'admin') {
          toast.error('只能编辑自己发布的信息');
          navigate('/me?tab=posts');
          return;
        }
        setType(post.type);
        setForm({
          title: post.title,
          category: post.category,
          variety: post.variety || '',
          spec: post.spec || '',
          quantity: String(post.quantity),
          unit: post.unit,
          priceType: post.priceType,
          price: post.price ? String(post.price) : '',
          province: post.province,
          city: post.city,
          validUntil: post.validUntil,
          description: post.description || '',
        });
        setImages((post.images || []).map((img) => ({ id: img.id, url: img.url, thumbUrl: img.url })));
        setLoading(false);
      })
      .catch((err) => {
        toast.error(err.message || '加载失败');
        setLoading(false);
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editingId, user?.id]);

  const set = (k, v) => {
    setForm((f) => ({ ...f, [k]: v }));
    setErrors((e) => ({ ...e, [k]: undefined }));
  };

  const validate = () => {
    const e = {};
    if (form.title.trim().length < 6) e.title = '标题至少 6 个字，写清品类、规格与产地';
    if (!form.quantity || Number(form.quantity) <= 0) e.quantity = '请填写大于 0 的数量';
    if (form.priceType === 'fixed' && (!form.price || Number(form.price) <= 0)) e.price = '一口价需填写具体金额';
    if (!form.city.trim() || form.city.trim().length < 2) e.city = '请填写城市';
    if (!form.validUntil || form.validUntil <= new Date().toISOString().slice(0, 10)) e.validUntil = '有效期需晚于今天';
    if (form.description && form.description.length > 1200) e.description = '说明不超过 1200 字';
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const submit = async (asDraft) => {
    if (!validate()) {
      toast.error('请先补充标红的字段');
      return;
    }
    setBusy(true);
    try {
      const payload = {
        type,
        title: form.title.trim(),
        category: form.category,
        variety: form.variety.trim() || undefined,
        spec: form.spec.trim() || undefined,
        quantity: Number(form.quantity),
        unit: form.unit,
        priceType: form.priceType,
        price: form.priceType === 'fixed' ? Number(form.price) : null,
        province: form.province,
        city: form.city.trim(),
        validUntil: form.validUntil,
        description: form.description.trim() || undefined,
        imageIds: images.map((i) => i.id),
      };
      if (editingId) {
        await put(`/posts/${editingId}${asDraft ? '' : '?submit=1'}`, payload);
      } else {
        await post(`/posts${asDraft ? '' : '?submit=1'}`, payload);
      }
      toast.ok(asDraft ? '草稿已保存' : '已提交审核，通过后会公开展示');
      navigate('/me?tab=posts');
    } catch (err) {
      if (err.details?.length) {
        setErrors(Object.fromEntries(err.details.map((d) => [d.field, d.message])));
      }
      toast.error(err.message || '提交失败');
    } finally {
      setBusy(false);
    }
  };

  if (loading) return <div className="container" style={{ padding: '60px 32px' }}><Loading rows={4} height={90} /></div>;

  return (
    <>
      <PageHead
        items={[{ label: '首页', to: '/' }, { label: '产销对接', to: '/supply' }, { label: editingId ? '编辑信息' : '发布信息' }]}
        title={editingId ? '编辑供需信息' : '发布供需信息'}
        desc="信息提交后由平台审核，通过后在大厅公开展示。请如实填写规格、数量与价格方式，避免使用「优质」「大量」等无法核实的描述代替具体参数。"
      />

      <section className="section" style={{ paddingTop: 30 }}>
        <div className="container">
          <div className="grid12" style={{ alignItems: 'start' }}>
            <div style={{ gridColumn: 'span 8' }}>
              <div className="panel panel--white" style={{ padding: 30 }}>
                <div className="row gap-8" style={{ marginBottom: 24 }}>
                  <div className="filter-tabs" role="group" aria-label="信息类型">
                    <button type="button" aria-pressed={type === 'supply'} onClick={() => setType('supply')}>我要供应</button>
                    <button type="button" aria-pressed={type === 'demand'} onClick={() => setType('demand')}>我要采购</button>
                  </div>
                  <span className="small muted" style={{ marginLeft: 'auto' }}>发布到{type === 'supply' ? '供应' : '采购'}大厅</span>
                </div>

                <div className="form-grid">
                  <Field label="标题" required error={errors.title} className="span-2" htmlFor="f-title">
                    <input
                      id="f-title"
                      className="input"
                      value={form.title}
                      onChange={(e) => set('title', e.target.value)}
                      maxLength={60}
                      aria-invalid={Boolean(errors.title)}
                      placeholder="例如：寿光硬粉番茄 精品级 30 吨 可分批供货"
                    />
                    <span className="field__hint">建议包含：产地 + 品种 + 规格 + 数量。{form.title.length}/60</span>
                  </Field>

                  <Field label="品类" required htmlFor="f-cat">
                    <select id="f-cat" className="select" value={form.category} onChange={(e) => set('category', e.target.value)}>
                      {POST_CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
                    </select>
                  </Field>

                  <Field label="品种" htmlFor="f-variety">
                    <input id="f-variety" className="input" value={form.variety} onChange={(e) => set('variety', e.target.value)} maxLength={40} placeholder="例如：硬粉番茄" />
                  </Field>

                  <Field label="规格" htmlFor="f-spec" className="span-2">
                    <input id="f-spec" className="input" value={form.spec} onChange={(e) => set('spec', e.target.value)} maxLength={80} placeholder="例如：单果 180-220g，精品级，纸箱装" />
                  </Field>

                  <Field label="数量" required error={errors.quantity} htmlFor="f-qty">
                    <div className="row gap-8">
                      <input
                        id="f-qty"
                        className="input"
                        type="number"
                        min="0"
                        step="0.01"
                        value={form.quantity}
                        onChange={(e) => set('quantity', e.target.value)}
                        aria-invalid={Boolean(errors.quantity)}
                      />
                      <select className="select" style={{ width: 96 }} value={form.unit} onChange={(e) => set('unit', e.target.value)} aria-label="单位">
                        {UNITS.map((u) => <option key={u} value={u}>{u}</option>)}
                      </select>
                    </div>
                  </Field>

                  <Field label="价格方式" required error={errors.price}>
                    <div className="row gap-8">
                      <select className="select" style={{ width: 120 }} value={form.priceType} onChange={(e) => set('priceType', e.target.value)} aria-label="价格方式">
                        <option value="fixed">一口价</option>
                        <option value="negotiable">价格面议</option>
                      </select>
                      {form.priceType === 'fixed' && (
                        <input
                          className="input"
                          type="number"
                          min="0"
                          step="0.01"
                          value={form.price}
                          onChange={(e) => set('price', e.target.value)}
                          placeholder={`元/${form.unit}`}
                          aria-label="单价"
                          aria-invalid={Boolean(errors.price)}
                        />
                      )}
                    </div>
                  </Field>

                  <Field label="所在省份" required htmlFor="f-prov">
                    <select id="f-prov" className="select" value={form.province} onChange={(e) => set('province', e.target.value)}>
                      {PROVINCES.map((p) => <option key={p} value={p}>{p}</option>)}
                    </select>
                  </Field>

                  <Field label="城市 / 区县" required error={errors.city} htmlFor="f-city">
                    <input id="f-city" className="input" value={form.city} onChange={(e) => set('city', e.target.value)} placeholder="例如：潍坊市寿光市" aria-invalid={Boolean(errors.city)} />
                  </Field>

                  <Field label="有效期至" required error={errors.validUntil} htmlFor="f-valid">
                    <input id="f-valid" className="input" type="date" value={form.validUntil} min={tomorrow()} onChange={(e) => set('validUntil', e.target.value)} aria-invalid={Boolean(errors.validUntil)} />
                    <span className="field__hint">到期后信息自动下架，可重新编辑发布。</span>
                  </Field>

                  <Field label="补充说明" error={errors.description} htmlFor="f-desc" className="span-2">
                    <textarea
                      id="f-desc"
                      className="textarea"
                      value={form.description}
                      onChange={(e) => set('description', e.target.value)}
                      maxLength={1200}
                      placeholder="包装方式、交付节奏、可提供的检测报告、结算方式等。"
                      style={{ minHeight: 120 }}
                    />
                    <span className="field__hint">{form.description.length}/1200</span>
                  </Field>

                  <div className="span-2">
                    <span className="field__label" style={{ display: 'block', marginBottom: 8 }}>图片（最多 6 张）</span>
                    <ImageUploader value={images} onChange={setImages} purpose="post" max={6} label="上传产品图片" />
                    <p className="field__hint" style={{ marginTop: 8 }}>
                      建议上传 1 张整体照 + 1 张规格细节照。图片会压缩并去除拍摄信息后存储。
                    </p>
                  </div>
                </div>

                <div className="row between mt-32" style={{ flexWrap: 'wrap', gap: 12 }}>
                  <Link to="/me?tab=posts" className="btn btn--quiet btn--sm">取消</Link>
                  <div className="row gap-12">
                    <button type="button" className="btn btn--ghost" onClick={() => submit(true)} disabled={busy}>保存草稿</button>
                    <button type="button" className="btn btn--primary" onClick={() => submit(false)} disabled={busy}>
                      {busy ? <><Spinner /> 提交中…</> : '提交审核'}
                    </button>
                  </div>
                </div>
              </div>
            </div>

            <aside style={{ gridColumn: 'span 4' }}>
              <div className="side-sticky">
                <div className="panel">
                  <h3 className="h4" style={{ marginBottom: 10 }}>审核规则</h3>
                  <div className="stack gap-10 small" style={{ lineHeight: 1.9, color: 'var(--ink-soft)' }}>
                    <p>· 信息需包含可核实的规格与数量，不接受「天价」「跳楼价」等表述；</p>
                    <p>· 禁止发布农药、种子等需要经营许可的品类到供需大厅，请使用农资商城；</p>
                    <p>· 同一批货请勿重复发布，审核会合并处理；</p>
                    <p>· 审核一般在 1 个工作日内完成，结果通过站内消息通知。</p>
                  </div>
                </div>
                <div className="notice notice--plain" style={{ marginTop: 16 }}>
                  <div className="small">
                    发布即表示你确认信息真实，并同意平台对不当内容进行下架处理。合作状态变更需双方在站内确认。
                  </div>
                </div>
              </div>
            </aside>
          </div>
        </div>
      </section>
    </>
  );
}
