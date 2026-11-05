import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { get } from '../lib/api.js';
import { useAsync } from '../lib/hooks.js';
import { useAuth } from '../lib/auth.jsx';
import { useToast } from '../lib/toast.jsx';
import { CROP_OPTIONS, money, priceUnit, relative, statusTone, statusText, num, date } from '../lib/format.js';
import { SectionHead, StatusTag, Loading, Empty, Spinner } from '../components/ui.jsx';
import { api } from '../lib/api.js';
import ServiceBar from '../components/ServiceBar.jsx';
import { categoryImage } from '../lib/images.js';

function BriefItem({ item }) {
  const up = item.change > 0;
  const down = item.change < 0;
  return (
    <div className="brief-item">
      <div className="brief-item__row">
        <span className="brief-item__crop">{item.crop}{item.spec ? <span className="small muted" style={{ fontWeight: 400 }}> · {item.spec}</span> : null}</span>
        <span className="brief-item__price">{num(item.price, 2)}</span>
      </div>
      <div className="brief-item__row" style={{ marginTop: 2 }}>
        <span className="brief-item__sub">{item.market}</span>
        {item.comparable ? (
          <span className={`delta ${up ? 'delta--up' : down ? 'delta--down' : ''}`}>
            {up ? '▲' : down ? '▼' : '—'} {Math.abs(item.change).toFixed(2)}（{Math.abs(item.changePct).toFixed(2)}%）
          </span>
        ) : (
          <span className="brief-item__sub">暂无同口径对比</span>
        )}
      </div>
    </div>
  );
}

function HomeDiagnose() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const toast = useToast();
  const [file, setFile] = useState(null);
  const [preview, setPreview] = useState(null);
  const [crop, setCrop] = useState('tomato');
  const [busy, setBusy] = useState(false);

  const pick = (f) => {
    if (!f) return;
    if (!f.type.startsWith('image/')) return toast.error('请选择图片文件');
    if (f.size > 8 * 1024 * 1024) return toast.error('图片不能超过 8MB');
    setFile(f);
    setPreview(URL.createObjectURL(f));
  };

  const submit = async () => {
    if (!user) {
      navigate('/login?redirect=/diagnose');
      return;
    }
    if (!file) return toast.error('请先上传一张作物照片');
    setBusy(true);
    try {
      const fd = new FormData();
      fd.append('image', file);
      fd.append('crop', crop);
      const data = await api('/diagnoses', { method: 'POST', body: fd, formData: true });
      navigate(`/diagnose/result/${data.diagnosis.id}`);
    } catch (err) {
      toast.error(err.message || '提交失败');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="diagnose-panel">
      <div className="diagnose-panel__main">
        <div className="row between" style={{ marginBottom: 16, alignItems: 'flex-start' }}>
          <div>
            <div className="eyebrow eyebrow--olive">识别与防控</div>
            <h3 className="h3" style={{ marginTop: 8 }}>拍下叶片，先把问题看清</h3>
          </div>
          <span className="tag tag--muted">真人农技复核可及</span>
        </div>

        {preview ? (
          <div className="preview-box">
            <img src={preview} alt="待识别的作物照片预览" />
            <div className="preview-box__actions">
              <button type="button" className="btn btn--sm" onClick={() => { setFile(null); setPreview(null); }}>重新选择</button>
            </div>
          </div>
        ) : (
          <label className="dropzone" style={{ cursor: 'pointer' }}>
            <input
              type="file"
              accept="image/jpeg,image/png,image/webp"
              hidden
              onChange={(e) => pick(e.target.files?.[0])}
            />
            <div className="dropzone__icon" aria-hidden="true">
              <svg width="30" height="30" viewBox="0 0 24 24" fill="none">
                <rect x="3" y="5" width="18" height="14" rx="2" stroke="currentColor" strokeWidth="1.3" />
                <circle cx="9" cy="10.5" r="1.6" stroke="currentColor" strokeWidth="1.3" />
                <path d="M4 17l4.5-4.5 3 3L15 12l5 5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </div>
            <div className="dropzone__title">点击拍照或从相册选择</div>
            <div className="dropzone__hint">建议对准病斑、在自然光下拍摄，保留叶片轮廓<br />支持 JPG / PNG / WebP，单张不超过 8MB</div>
          </label>
        )}

        <div className="row gap-12 mt-16" style={{ flexWrap: 'wrap' }}>
          <label className="field" style={{ flex: '0 0 168px' }}>
            <span className="field__label">作物</span>
            <select className="select" value={crop} onChange={(e) => setCrop(e.target.value)} aria-label="选择作物">
              {CROP_OPTIONS.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
            </select>
          </label>
          <div style={{ flex: 1, minWidth: 160, display: 'flex', alignItems: 'flex-end' }}>
            <button type="button" className="btn btn--primary" onClick={submit} disabled={busy || !file} style={{ width: '100%' }}>
              {busy ? <><Spinner /> 提交中…</> : '开始识别'}
            </button>
          </div>
        </div>
        <p className="small muted" style={{ marginTop: 10 }}>
          识别结果为辅助判断，不能替代田间诊断。低置信度或超出支持范围时会提示人工复核。
        </p>
      </div>

      <aside className="diagnose-panel__side">
        <div className="row between" style={{ marginBottom: 8 }}>
          <span className="eyebrow" style={{ color: 'var(--olive)' }}>行情摘要</span>
          <Link to="/prices" className="small" style={{ color: 'var(--olive)', textDecoration: 'underline', textUnderlineOffset: 3 }}>全部</Link>
        </div>
        <MarketBriefLines />
      </aside>
    </div>
  );
}

function MarketBriefLines() {
  const { data, loading } = useAsync(() => get('/market/overview'), []);
  if (loading) return <div className="stack gap-12 mt-16">{Array.from({ length: 3 }).map((_, i) => <div key={i} className="skeleton" style={{ height: 52 }} />)}</div>;
  const items = data?.items || [];
  if (!items.length) {
    return (
      <div className="mt-16 small" style={{ lineHeight: 1.9, color: 'var(--ink-soft)' }}>
        当前还没有通过审核的行情记录。平台只在数据经人工核对后展示，不使用随机数或占位价格。
        <div className="mt-16"><Link to="/prices" className="btn btn--ghost btn--sm">查看行情中心</Link></div>
      </div>
    );
  }
  return (
    <div className="mt-8">
      {items.slice(0, 4).map((it) => <BriefItem key={`${it.crop}-${it.market}`} item={it} />)}
      <div className="small muted" style={{ marginTop: 12, fontSize: 11, lineHeight: 1.7 }}>
        单位与报价口径以行情中心标注为准
      </div>
    </div>
  );
}

export default function Home() {
  const supply = useAsync(() => get('/posts', { type: 'supply', pageSize: 4 }), []);
  const demand = useAsync(() => get('/posts', { type: 'demand', pageSize: 3 }), []);
  const machines = useAsync(() => get('/machinery', { pageSize: 3 }), []);
  const products = useAsync(() => get('/shop/products', { pageSize: 4 }), []);
  const articles = useAsync(() => get('/knowledge', { pageSize: 3 }), []);

  const tradeItems = [
    ...(supply.data?.items || []).slice(0, 3).map((p) => ({ ...p, kind: '供应' })),
    ...(demand.data?.items || []).slice(0, 2).map((p) => ({ ...p, kind: '采购' })),
  ].sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt))).slice(0, 5);

  return (
    <>
      <section className="hero">
        <div className="container hero__inner">
          <div className="hero__lead">
            <div className="hero__meta">
              <span className="eyebrow">现代农业综合服务</span>
              <span className="rule" />
              <span className="eyebrow">FIELD NOTES · 2026</span>
            </div>
            <h1 className="display">
              让每一季耕耘，<br />都有更好的收获
            </h1>
          </div>
          <div className="hero__aside">
            <p className="lede">
              从一片叶子的病斑，到一车粮食的成交价。禾农云把病虫害识别、产销对接、农机调度、农资采购与行情判断连成一条线，让种地这件事，少一点凭经验，多一点有据可依。
            </p>
            <div className="hero__actions">
              <Link to="/diagnose" className="btn btn--primary btn--lg">开始识别</Link>
              <Link to="/trade/publish" className="btn btn--ghost btn--lg">发布供需</Link>
            </div>
            <div className="hero__note">
              <span className="status-dot status-dot--ok" />
              农技咨询由持证农技人员受理，回复留痕可查
            </div>
          </div>
        </div>
      </section>

      <div className="container hero-visual">
        <figure>
          <div className="hero-visual__frame">
            <img src="/images/hero-field.jpg" alt="航拍视角下规整的农田，作物行间可见晨光与田埂" />
          </div>
          <figcaption className="hero-visual__caption">
            <span>山东 · 潍坊 · 冬小麦返青期</span>
            <span>田间影像 / 禾农云</span>
          </figcaption>
        </figure>
      </div>

      <div style={{ marginTop: 30 }}>
        <ServiceBar />
      </div>

      <section className="section">
        <div className="container">
          <div className="split-8-4">
            <HomeDiagnose />
            <div>
              <div className="panel" style={{ background: 'transparent', border: '1px solid var(--line)', padding: 26 }}>
                <div className="eyebrow eyebrow--olive">为什么先看这一眼</div>
                <p className="prose" style={{ marginTop: 12, fontSize: 14.5 }}>
                  病害在初期往往只有几个斑点。早一天确认，可能就少一遍药、少一片损失。
                </p>
                <div className="stack gap-16" style={{ marginTop: 22 }}>
                  {[
                    ['图像质量先过一遍', '分辨率、亮度、清晰度在服务端实算，不合格会直接提示重拍。'],
                    ['结果标注来源', '候选病害与概率来自识别服务模型，不换算成平台自造的准确率。'],
                    ['不确定就转人工', '低置信度或超出作物范围，可一键提交农技咨询工单。'],
                  ].map(([t, d], i) => (
                    <div key={t} style={{ display: 'grid', gridTemplateColumns: '22px 1fr', gap: 10 }}>
                      <span style={{ fontFamily: 'var(--font-serif)', color: 'var(--wheat)', fontSize: 13 }}>0{i + 1}</span>
                      <div>
                        <div style={{ fontSize: 14, fontWeight: 500 }}>{t}</div>
                        <div className="small muted" style={{ lineHeight: 1.8, marginTop: 2 }}>{d}</div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="section section--line">
        <div className="container">
          <SectionHead
            index="02"
            title="产销对接"
            desc="把地头的货和要货的人放在一张桌子上。供应与采购都需审核后公开，询价、报价与沟通全程留痕。"
            more="/supply"
            moreLabel="进入供应大厅"
          />
          <div className="trade-grid">
            <figure className="feature-photo">
              <div className="feature-photo__frame">
                <img src="/images/produce.jpg" alt="采收后的番茄装在周转筐中，自然光下的果实细节" />
              </div>
              <figcaption className="feature-photo__caption">
                <div className="feature-photo__title">一筐番茄，从地头到货架</div>
                <p className="feature-photo__text">
                  产地直供的信息里，规格、数量、可接受的价格方式与有效期，比形容词更重要。我们把这几项放在最前面，减少来回问价。
                </p>
                <div className="row gap-12 mt-16">
                  <Link to="/trade/publish?type=supply" className="btn btn--ghost btn--sm">发布供应</Link>
                  <Link to="/demand" className="btn btn--quiet btn--sm" style={{ padding: 0 }}>我要采购 →</Link>
                </div>
              </figcaption>
            </figure>

            <div>
              <div className="list-rows">
                {supply.loading && <Loading rows={4} height={68} />}
                {!supply.loading && tradeItems.length === 0 && (
                  <Empty title="暂时没有公开的供需信息" desc="发布一条供应或采购信息，审核通过后会出现在这里。" action={<Link to="/trade/publish" className="btn btn--primary btn--sm">去发布</Link>} />
                )}
                {tradeItems.map((p) => (
                  <Link key={p.id} to={`/trade/${p.id}`} className="list-row">
                    <span className={`list-row__kind ${p.type === 'supply' ? 'is-supply' : 'is-demand'}`}>
                      {p.type === 'supply' ? '供 应' : '采 购'}
                    </span>
                    <div>
                      <div className="list-row__title">{p.title}</div>
                      <div className="list-row__meta">
                        <span>{p.province} · {p.city}</span>
                        <span>{p.category}{p.spec ? ` · ${p.spec}` : ''}</span>
                        <span>{num(p.quantity, 2)} {p.unit}</span>
                      </div>
                    </div>
                    <div className="list-row__price">
                      {p.priceType === 'negotiable' ? '价格面议' : <>{money(p.price)}<small>/{p.unit}</small></>}
                    </div>
                    <div className="list-row__time">{relative(p.createdAt)}</div>
                  </Link>
                ))}
              </div>
              <div className="row between mt-24">
                <span className="small muted">信息经平台审核后展示 · 合作状态需双方确认</span>
                <Link to="/demand" className="btn btn--quiet btn--sm">查看采购需求 →</Link>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="section">
        <div className="container">
          <SectionHead
            index="03"
            title="农机服务"
            desc="按亩、按小时或按天计价，服务范围与可预约时间由机手维护。同一时段只确认一单。"
            more="/machinery"
            moreLabel="查找农机"
          />
          <div className="machinery-band">
            <div className="machinery-band__visual">
              <img src="/images/machinery.jpg" alt="联合收割机在金色麦田中作业，秸秆粉碎还田" />
            </div>
            <div className="machinery-band__overlay">
              <div>
                <h3>从打药到收割，把时间算清楚</h3>
                <p>跨区作业、临时调度，最怕时间对不上。预约时段写入数据库并占用唯一档期。</p>
              </div>
              <Link to="/machinery" className="btn btn--ghost" style={{ background: 'rgba(250,248,241,0.9)', flexShrink: 0 }}>按地区找设备</Link>
            </div>
          </div>

          <div className="machine-list">
            {machines.loading && <div className="skeleton" style={{ height: 120 }} />}
            {(machines.data?.items || []).slice(0, 3).map((m) => (
              <Link key={m.id} to={`/machinery/${m.id}`} className="machine-item">
                <div className="machine-item__type">{m.type}</div>
                <div className="machine-item__name">{m.name}</div>
                <div className="machine-item__meta">
                  {m.province} · {m.city}<br />
                  服务范围：{m.serviceArea}
                </div>
                <div className="machine-item__price">
                  ¥{num(m.price, 0)}<small> /{m.pricingType === 'per_mu' ? '亩' : m.pricingType === 'per_hour' ? '小时' : '天'}</small>
                </div>
              </Link>
            ))}
          </div>
        </div>
      </section>

      <section className="section section--line">
        <div className="container">
          <SectionHead
            index="04"
            title="农资精选"
            desc="规格、适用范围与来源写在明处。库存以下单时服务端扣减为准，避免超卖。"
            more="/shop"
            moreLabel="进入商城"
          />
          <div className="product-grid">
            {products.loading && Array.from({ length: 4 }).map((_, i) => <div key={i} className="skeleton" style={{ height: 300 }} />)}
            {(products.data?.items || []).slice(0, 4).map((p) => (
              <Link key={p.id} to={`/shop/${p.id}`} className="product-card">
                <div className="product-card__frame">
                  <img src={p.coverUrl || categoryImage(p.category)} alt={p.name} />
                  {!p.coverUrl && <span className="img-note">品类示意图</span>}
                </div>
                <div className="product-card__body">
                  <div className="product-card__name">{p.name}</div>
                  <div className="product-card__spec">{p.spec} · {p.category}</div>
                  <div className="product-card__foot">
                    <span className="price">{money(p.price)}<small>/{p.unit}</small></span>
                    <span className="product-card__shop">{p.shopName || p.merchantName}</span>
                  </div>
                </div>
              </Link>
            ))}
          </div>
        </div>
      </section>

      <section className="section section--tight" style={{ borderTop: '1px solid var(--line)' }}>
        <div className="container">
          <div className="grid12" style={{ alignItems: 'start' }}>
            <div style={{ gridColumn: 'span 4' }}>
              <div className="eyebrow">农技支持</div>
              <h2 className="h2" style={{ marginTop: 12 }}>不确定的时候，<br />问一个能负责的人</h2>
              <p className="small muted" style={{ marginTop: 14, lineHeight: 1.9 }}>
                识别结果只是起点。农技咨询会生成工单，由农技人员受理并回复，历史记录可随时回看，不用在群里反复描述。
              </p>
              <Link to="/me?tab=advisories" className="btn btn--ghost btn--sm mt-24">查看我的咨询</Link>
            </div>
            <div style={{ gridColumn: 'span 8' }}>
              <div className="list-rows">
                {(articles.data?.items || []).map((a) => (
                  <Link key={a.id} to={`/knowledge/${a.slug}`} className="list-row" style={{ gridTemplateColumns: '1fr 120px' }}>
                    <div>
                      <div className="list-row__title">{a.title}</div>
                      <div className="list-row__meta">
                        <span>{a.crop}</span>
                        <span>{a.category}</span>
                        <span>{a.source_name ? '已审核' : ''}</span>
                      </div>
                    </div>
                    <div className="list-row__time" style={{ textAlign: 'right' }}>知识库 ↗</div>
                  </Link>
                ))}
                {!articles.loading && !(articles.data?.items || []).length && <Empty title="知识库还没有文章" />}
              </div>
              <div className="row gap-12 mt-16">
                <Link to="/knowledge" className="btn btn--quiet btn--sm">浏览全部防控知识 →</Link>
              </div>
            </div>
          </div>
        </div>
      </section>
    </>
  );
}
