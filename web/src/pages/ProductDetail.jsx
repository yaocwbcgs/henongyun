import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { get, post } from '../lib/api.js';
import { useAsync, useTitle } from '../lib/hooks.js';
import { useAuth } from '../lib/auth.jsx';
import { useToast } from '../lib/toast.jsx';
import PageHead from '../components/PageHead.jsx';
import { Avatar, Empty, ErrorState, Loading, Spinner, Stars, StatusTag } from '../components/ui.jsx';
import { money, num } from '../lib/format.js';
import { categoryImage } from '../lib/images.js';

export default function ProductDetail() {
  const { id } = useParams();
  const { user } = useAuth();
  const navigate = useNavigate();
  const toast = useToast();
  const { data, loading, error, reload } = useAsync(() => get(`/shop/products/${id}`), [id]);
  const [quantity, setQuantity] = useState(1);
  const [active, setActive] = useState(0);
  const [busy, setBusy] = useState('');
  const p = data?.product;
  useTitle(p?.name);

  const addToCart = async (thenCheckout = false) => {
    if (!user) return navigate(`/login?redirect=/shop/${id}`);
    if (!p || quantity > p.stock) return toast.error('数量超过库存');
    setBusy(thenCheckout ? 'buy' : 'cart');
    try {
      await post('/shop/cart', { productId: p.id, quantity });
      if (thenCheckout) {
        navigate(`/checkout?buyNow=${p.id}&quantity=${quantity}`);
      } else {
        toast.ok(`已加入购物车（${quantity} ${p.unit}）`);
      }
    } catch (err) {
      toast.error(err.message || '操作失败');
    } finally {
      setBusy('');
    }
  };

  if (loading) return <div className="container" style={{ padding: '60px 32px' }}><Loading rows={3} height={110} /></div>;
  if (error) return <div className="container" style={{ padding: '60px 32px' }}><ErrorState error={error} onRetry={reload} /></div>;
  if (!p) return null;

  const images = p.imageUrls?.length ? p.imageUrls : [p.coverUrl || categoryImage(p.category)];
  const usingCategoryImage = !p.coverUrl && !p.imageUrls?.length;
  const outOfStock = p.stock <= 0;

  return (
    <>
      <PageHead
        items={[{ label: '首页', to: '/' }, { label: '农资商城', to: '/shop' }, { label: p.name }]}
        title={p.name}
        desc={`${p.category} · ${p.spec} · ${p.shopName || p.merchantName}`}
        actions={<StatusTag status={outOfStock ? 'closed' : 'active'} text={outOfStock ? '暂时缺货' : '在售'} tone={outOfStock ? 'muted' : 'olive'} />}
      />

      <section className="section" style={{ paddingTop: 24 }}>
        <div className="container">
          <div className="detail-grid">
            <div>
              <figure className="detail-figure" style={{ marginTop: 0, position: 'relative' }}>
                <img src={images[active]} alt={p.name} style={{ aspectRatio: '4/3', objectFit: 'cover' }} />
                {usingCategoryImage && <span className="img-note">品类示意图</span>}
              </figure>
              {usingCategoryImage && <p className="field__hint">当前展示为品类示意图，商家尚未上传实拍图。</p>}
              {images.length > 1 && (
                <div className="thumb-row mt-16">
                  {images.map((src, i) => (
                    <button key={src} type="button" className="thumb" onClick={() => setActive(i)} style={{ borderColor: i === active ? 'var(--olive)' : 'var(--line)', padding: 0, background: 'none' }} aria-label={`第 ${i + 1} 张`}>
                      <img src={src} alt="" />
                    </button>
                  ))}
                </div>
              )}

              <div className="spec-board">
                <div>
                  <div className="spec-board__label">规格</div>
                  <div className="spec-board__value" style={{ fontSize: 17 }}>{p.spec}</div>
                </div>
                <div>
                  <div className="spec-board__label">库存</div>
                  <div className="spec-board__value" style={{ fontSize: 17 }}>{num(p.stock)} <small>{p.unit}</small></div>
                </div>
                <div>
                  <div className="spec-board__label">累计售出</div>
                  <div className="spec-board__value" style={{ fontSize: 17 }}>{num(p.sales)} <small>{p.unit}</small></div>
                </div>
              </div>

              <div className="mt-24">
                <div className="eyebrow" style={{ marginBottom: 10 }}>商品说明</div>
                <p className="prose" style={{ whiteSpace: 'pre-wrap' }}>{p.description || '商家未补充商品说明。'}</p>
              </div>

              {p.applicable && (
                <div className="panel mt-16">
                  <div className="eyebrow" style={{ marginBottom: 6 }}>适用范围</div>
                  <p className="small" style={{ lineHeight: 1.9 }}>{p.applicable}</p>
                </div>
              )}

              <div className="panel mt-16">
                <div className="eyebrow" style={{ marginBottom: 6 }}>货源与合规说明</div>
                <p className="small" style={{ lineHeight: 1.9 }}>{p.sourceNote || '商家未提供货源说明，购买前建议在站内消息中索要检测报告或登记证信息。'}</p>
                <p className="field__hint mt-8">农药、肥料等商品的实际登记信息以包装标签为准，平台不替代监管部门核验。</p>
              </div>

              <div className="mt-32">
                <div className="row between" style={{ marginBottom: 12 }}>
                  <h3 className="h4">商品评价</h3>
                  <span className="small muted">{p.rating ? `平均 ${p.rating} 分` : '暂无评分'}</span>
                </div>
                {!(data.reviews || []).length && <Empty title="还没有评价" desc="完成订单后可以对商品评价。" />}
                <div className="stack">
                  {(data.reviews || []).map((r) => (
                    <div key={r.id} style={{ padding: '14px 0', borderBottom: '1px solid var(--line-soft)' }}>
                      <div className="row between" style={{ marginBottom: 5 }}>
                        <span className="row gap-8"><Avatar name={r.user_name} /><span style={{ fontSize: 13.5 }}>{r.user_name}</span></span>
                        <Stars value={r.rating} readOnly />
                      </div>
                      <p className="small" style={{ lineHeight: 1.8 }}>{r.content || '未填写文字评价'}</p>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            <aside>
              <div className="side-sticky">
                <div className="side-card">
                  <div className="side-price">{money(p.price)}<small> /{p.unit}</small></div>
                  <div className="small muted mt-8">满 ¥{data.shipping.freeThreshold} 免运费，未满收取 ¥{data.shipping.fee} 运费</div>

                  <div className="row gap-12 mt-16" style={{ alignItems: 'flex-end' }}>
                    <label className="field" style={{ width: 120 }}>
                      <span className="field__label">数量（{p.unit}）</span>
                      <input
                        className="input"
                        type="number"
                        min="1"
                        max={p.stock}
                        value={quantity}
                        onChange={(e) => setQuantity(Math.max(1, Math.min(p.stock, Number(e.target.value) || 1)))}
                        aria-label="购买数量"
                      />
                    </label>
                    <div className="small muted" style={{ paddingBottom: 12 }}>库存 {num(p.stock)} {p.unit}</div>
                  </div>

                  <div className="row between mt-16" style={{ borderTop: '1px solid var(--line-soft)', paddingTop: 14 }}>
                    <span className="small muted">小计</span>
                    <span className="price" style={{ fontSize: 22 }}>{money(p.price * quantity)}</span>
                  </div>

                  <button type="button" className="btn btn--primary btn--block mt-16" disabled={outOfStock || busy === 'buy'} onClick={() => addToCart(true)}>
                    {busy === 'buy' ? <><Spinner /> 处理中</> : outOfStock ? '暂时缺货' : '立即购买'}
                  </button>
                  <button type="button" className="btn btn--ghost btn--block mt-8" disabled={outOfStock || busy === 'cart'} onClick={() => addToCart(false)}>
                    {busy === 'cart' ? <><Spinner /> 加入中</> : '加入购物车'}
                  </button>

                  <div className="owner-line" style={{ marginTop: 16 }}>
                    <Avatar name={p.shopName || p.merchantName} />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div className="owner-line__name">{p.shopName || p.merchantName}</div>
                      <div className="owner-line__sub">商家店铺</div>
                    </div>
                  </div>
                </div>

                <div className="notice notice--plain" style={{ marginTop: 16 }}>
                  <div className="small" style={{ lineHeight: 1.9 }}>
                    · 支付结果以服务端支付通知或主动查询为准；<br />
                    · 发货信息由商家录入真实运单号，可在订单详情查看；<br />
                    · 收到商品 7 天内可在订单页发起售后申请。
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
