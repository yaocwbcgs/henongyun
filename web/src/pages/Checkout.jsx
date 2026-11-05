import { useEffect, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { get, post } from '../lib/api.js';
import { useAsync, useTitle } from '../lib/hooks.js';
import { useAuth } from '../lib/auth.jsx';
import { useToast } from '../lib/toast.jsx';
import PageHead from '../components/PageHead.jsx';
import { Empty, ErrorState, Loading, Modal, Spinner } from '../components/ui.jsx';
import { money, num } from '../lib/format.js';
import { categoryImage } from '../lib/images.js';

const emptyAddress = { receiver: '', phone: '', province: '山东省', city: '', district: '', detail: '', isDefault: false };

export default function Checkout() {
  useTitle('结算');
  const { user, booting } = useAuth();
  const navigate = useNavigate();
  const toast = useToast();
  const [params] = useSearchParams();
  const buyNowId = params.get('buyNow');
  const buyNowQty = Number(params.get('quantity') || 1);

  const cart = useAsync(() => (buyNowId ? Promise.resolve({ items: [] }) : get('/shop/cart')), [buyNowId]);
  const product = useAsync(() => (buyNowId ? get(`/shop/products/${buyNowId}`) : Promise.resolve(null)), [buyNowId]);
  const addresses = useAsync(() => (user ? get('/users/me/addresses') : Promise.resolve({ items: [] })), [user?.id]);

  const [selected, setSelected] = useState(null);
  const [addrOpen, setAddrOpen] = useState(false);
  const [form, setForm] = useState(emptyAddress);
  const [errors, setErrors] = useState({});
  const [remark, setRemark] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!booting && !user) navigate(`/login?redirect=${encodeURIComponent(location.pathname + location.search)}`);
  }, [user, booting, navigate]);

  useEffect(() => {
    const list = addresses.data?.items || [];
    if (list.length && !selected) setSelected(list.find((a) => a.isDefault)?.id || list[0].id);
  }, [addresses.data, selected]);

  const items = buyNowId
    ? product.data?.product
      ? [{ productId: product.data.product.id, name: product.data.product.name, spec: product.data.product.spec, unit: product.data.product.unit, price: product.data.product.price, quantity: buyNowQty, coverUrl: product.data.product.coverUrl, category: product.data.product.category, merchantName: product.data.product.shopName || product.data.product.merchantName, stock: product.data.product.stock }]
      : []
    : (cart.data?.items || []).filter((i) => i.status === 'active');

  const goodsTotal = items.reduce((s, i) => s + i.price * i.quantity, 0);
  const shipping = goodsTotal >= 199 || goodsTotal === 0 ? 0 : 12;
  const total = goodsTotal + shipping;

  const saveAddress = async () => {
    const e = {};
    if (form.receiver.trim().length < 2) e.receiver = '请填写收货人';
    if (!/^1[3-9]\d{9}$/.test(form.phone)) e.phone = '手机号格式不正确';
    if (form.city.trim().length < 2) e.city = '请填写城市';
    if (form.district.trim().length < 2) e.district = '请填写区县';
    if (form.detail.trim().length < 5) e.detail = '详细地址至少 5 个字';
    setErrors(e);
    if (Object.keys(e).length) return;
    try {
      await post('/users/me/addresses', form);
      toast.ok('地址已保存');
      setAddrOpen(false);
      setForm(emptyAddress);
      addresses.reload();
    } catch (err) {
      toast.error(err.message || '保存失败');
    }
  };

  const submit = async () => {
    if (!selected) return toast.error('请选择收货地址');
    if (!items.length) return toast.error('没有可结算的商品');
    setBusy(true);
    try {
      const r = await post('/shop/orders', {
        addressId: selected,
        remark: remark.trim() || undefined,
        items: items.map((i) => ({ productId: i.productId, quantity: i.quantity })),
        fromCart: !buyNowId,
      });
      toast.ok(r.orders.length > 1 ? `已生成 ${r.orders.length} 个订单，请分别支付` : '订单已创建');
      navigate(`/orders/${r.orders[0].id}`);
    } catch (err) {
      toast.error(err.message || '下单失败');
    } finally {
      setBusy(false);
    }
  };

  if (!user) return null;
  if (cart.loading || product.loading) return <div className="container" style={{ padding: '60px 32px' }}><Loading rows={3} /></div>;
  if (cart.error || product.error) return <div className="container" style={{ padding: '60px 32px' }}><ErrorState error={cart.error || product.error} onRetry={() => { cart.reload(); product.reload(); }} /></div>;

  return (
    <>
      <PageHead
        items={[{ label: '首页', to: '/' }, { label: '农资商城', to: '/shop' }, { label: '结算' }]}
        title="确认订单"
        desc="核对收货地址与商品明细。提交后系统会按商家拆单，并即时扣减库存。"
      />

      <section className="section" style={{ paddingTop: 26 }}>
        <div className="container">
          {items.length === 0 ? (
            <Empty title="没有可结算的商品" desc="购物车可能为空，或商品已下架。" action={<Link to="/shop" className="btn btn--primary btn--sm">去商城</Link>} />
          ) : (
            <div className="checkout-grid">
              <div>
                <div className="panel panel--white" style={{ padding: 26 }}>
                  <div className="row between" style={{ marginBottom: 14 }}>
                    <h3 className="h4">收货地址</h3>
                    <button type="button" className="btn btn--quiet btn--sm" onClick={() => setAddrOpen(true)}>+ 新增地址</button>
                  </div>

                  {addresses.loading && <Loading rows={1} height={70} />}
                  {!addresses.loading && (addresses.data?.items || []).length === 0 && (
                    <div className="notice notice--warn">
                      <div>
                        <div className="notice__title">还没有收货地址</div>
                        <div className="small">请先添加一个地址，订单会保存提交时的地址快照。</div>
                        <button type="button" className="btn btn--ghost btn--sm mt-8" onClick={() => setAddrOpen(true)}>填写地址</button>
                      </div>
                    </div>
                  )}

                  <div className="stack gap-8">
                    {(addresses.data?.items || []).map((a) => (
                      <label
                        key={a.id}
                        style={{
                          display: 'flex', gap: 12, padding: 14, borderRadius: 8, cursor: 'pointer',
                          border: `1px solid ${selected === a.id ? 'var(--olive)' : 'var(--line)'}`,
                          background: selected === a.id ? 'var(--moss-soft)' : 'transparent',
                        }}
                      >
                        <input type="radio" name="addr" checked={selected === a.id} onChange={() => setSelected(a.id)} style={{ marginTop: 4, accentColor: 'var(--olive)' }} />
                        <div>
                          <div style={{ fontSize: 14 }}>
                            {a.receiver} <span className="muted">· {a.phone}</span>
                            {a.isDefault && <span className="tag tag--olive" style={{ marginLeft: 8 }}>默认</span>}
                          </div>
                          <div className="small muted" style={{ marginTop: 3 }}>{a.province}{a.city}{a.district} {a.detail}</div>
                        </div>
                      </label>
                    ))}
                  </div>
                </div>

                <div className="panel panel--white mt-16" style={{ padding: 26 }}>
                  <h3 className="h4" style={{ marginBottom: 14 }}>商品明细</h3>
                  {items.map((i) => (
                    <div key={i.productId} className="line-item">
                      <div className="line-item__thumb">
                        <img src={i.coverUrl || categoryImage(i.category || '其他')} alt="" />
                      </div>
                      <div>
                        <div style={{ fontSize: 14 }}>{i.name}</div>
                        <div className="small muted">{i.spec} · {i.merchantName}</div>
                      </div>
                      <div style={{ textAlign: 'right' }}>
                        <div className="tabular">{money(i.price)} × {i.quantity}</div>
                        <div className="small muted">{money(i.price * i.quantity)}</div>
                      </div>
                    </div>
                  ))}

                  <label className="field mt-16">
                    <span className="field__label">订单备注</span>
                    <textarea className="textarea" value={remark} onChange={(e) => setRemark(e.target.value)} maxLength={300} placeholder="例如：工作日送货，需随货提供检测报告。" style={{ minHeight: 80 }} />
                  </label>
                </div>
              </div>

              <aside>
                <div className="side-sticky">
                  <div className="side-card">
                    <h3 className="h4" style={{ marginBottom: 12 }}>支付明细</h3>
                    <div className="summary-row"><span>商品合计</span><span className="tabular">{money(goodsTotal)}</span></div>
                    <div className="summary-row"><span>运费</span><span className="tabular">{shipping === 0 ? '免运费' : money(shipping)}</span></div>
                    <div className="summary-row"><span>商品件数</span><span className="tabular">{items.reduce((s, i) => s + i.quantity, 0)}</span></div>
                    <div className="summary-row summary-row--total"><span>应付</span><span className="price">{money(total)}</span></div>

                    <button type="button" className="btn btn--primary btn--block mt-16" onClick={submit} disabled={busy || !selected}>
                      {busy ? <><Spinner /> 提交中…</> : '提交订单'}
                    </button>
                    <p className="field__hint mt-8">提交后库存立即锁定。未支付订单 30 分钟后自动取消并回补库存。</p>
                  </div>

                  <div className="notice notice--plain" style={{ marginTop: 16 }}>
                    <div className="small">
                      不同商家的商品会拆分为多个订单。支付方式与结果以订单详情页显示为准。
                    </div>
                  </div>
                </div>
              </aside>
            </div>
          )}
        </div>
      </section>

      <Modal
        open={addrOpen}
        onClose={() => setAddrOpen(false)}
        title="新增收货地址"
        footer={
          <>
            <button type="button" className="btn btn--ghost btn--sm" onClick={() => setAddrOpen(false)}>取消</button>
            <button type="button" className="btn btn--primary btn--sm" onClick={saveAddress}>保存地址</button>
          </>
        }
      >
        <div className="form-grid">
          <label className="field">
            <span className="field__label">收货人<span className="req">*</span></span>
            <input className="input" value={form.receiver} onChange={(e) => setForm({ ...form, receiver: e.target.value })} aria-invalid={Boolean(errors.receiver)} />
            {errors.receiver && <span className="field__error">{errors.receiver}</span>}
          </label>
          <label className="field">
            <span className="field__label">手机号<span className="req">*</span></span>
            <input className="input" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} aria-invalid={Boolean(errors.phone)} />
            {errors.phone && <span className="field__error">{errors.phone}</span>}
          </label>
          <label className="field">
            <span className="field__label">省份</span>
            <input className="input" value={form.province} onChange={(e) => setForm({ ...form, province: e.target.value })} />
          </label>
          <label className="field">
            <span className="field__label">城市<span className="req">*</span></span>
            <input className="input" value={form.city} onChange={(e) => setForm({ ...form, city: e.target.value })} aria-invalid={Boolean(errors.city)} />
            {errors.city && <span className="field__error">{errors.city}</span>}
          </label>
          <label className="field">
            <span className="field__label">区 / 县<span className="req">*</span></span>
            <input className="input" value={form.district} onChange={(e) => setForm({ ...form, district: e.target.value })} aria-invalid={Boolean(errors.district)} />
            {errors.district && <span className="field__error">{errors.district}</span>}
          </label>
          <label className="field">
            <span className="field__label">详细地址<span className="req">*</span></span>
            <input className="input" value={form.detail} onChange={(e) => setForm({ ...form, detail: e.target.value })} placeholder="街道、门牌号、村组" aria-invalid={Boolean(errors.detail)} />
            {errors.detail && <span className="field__error">{errors.detail}</span>}
          </label>
          <label className="check span-2">
            <input type="checkbox" checked={form.isDefault} onChange={(e) => setForm({ ...form, isDefault: e.target.checked })} />
            设为默认地址
          </label>
        </div>
      </Modal>
    </>
  );
}
