import { useCallback, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { del, get, patch } from '../lib/api.js';
import { useAsync, useTitle } from '../lib/hooks.js';
import { useAuth } from '../lib/auth.jsx';
import { useToast } from '../lib/toast.jsx';
import PageHead from '../components/PageHead.jsx';
import { Empty, ErrorState, Loading } from '../components/ui.jsx';
import { money, num } from '../lib/format.js';
import { categoryImage } from '../lib/images.js';

export default function Cart() {
  useTitle('购物车');
  const { user } = useAuth();
  const navigate = useNavigate();
  const toast = useToast();
  const { data, loading, error, reload } = useAsync(() => (user ? get('/shop/cart') : Promise.resolve({ items: [], total: 0 })), [user?.id]);
  const [busy, setBusy] = useState('');

  const updateQty = async (item, qty) => {
    if (qty < 1) return;
    if (qty > item.stock) return toast.error(`库存仅剩 ${item.stock}${item.unit}`);
    setBusy(`u${item.id}`);
    try {
      await patch(`/shop/cart/${item.id}`, { quantity: qty });
      await reload();
    } catch (err) {
      toast.error(err.message || '更新失败');
    } finally {
      setBusy('');
    }
  };

  const remove = async (item) => {
    setBusy(`d${item.id}`);
    try {
      await del(`/shop/cart/${item.id}`);
      toast.ok('已从购物车移除');
      reload();
    } catch (err) {
      toast.error(err.message || '删除失败');
    } finally {
      setBusy('');
    }
  };

  const items = data?.items || [];
  const valid = items.filter((i) => i.status === 'active');
  const total = valid.reduce((s, i) => s + i.price * i.quantity, 0);
  const shipping = total >= 199 || total === 0 ? 0 : 12;

  if (!user) {
    return (
      <>
        <PageHead items={[{ label: '首页', to: '/' }, { label: '购物车' }]} title="购物车" />
        <div className="container section">
          <Empty title="登录后查看购物车" desc="购物车与订单数据保存在服务端，换设备登录后依然可见。" action={<Link to="/login?redirect=/cart" className="btn btn--primary btn--sm">去登录</Link>} />
        </div>
      </>
    );
  }

  return (
    <>
      <PageHead items={[{ label: '首页', to: '/' }, { label: '农资商城', to: '/shop' }, { label: '购物车' }]} title="购物车" desc="数量以服务端库存为上限，结算时会再次校验库存。" />

      <section className="section" style={{ paddingTop: 26 }}>
        <div className="container">
          {loading && <Loading rows={3} height={90} />}
          {error && <ErrorState error={error} onRetry={reload} />}
          {!loading && !error && items.length === 0 && (
            <Empty title="购物车还是空的" desc="去看看肥料、种子或农机具。" action={<Link to="/shop" className="btn btn--primary btn--sm">进入商城</Link>} />
          )}

          {items.length > 0 && (
            <div className="checkout-grid">
              <div>
                <div className="table-wrap">
                  <table className="table">
                    <thead>
                      <tr>
                        <th style={{ width: '46%' }}>商品</th>
                        <th>单价</th>
                        <th style={{ width: 132 }}>数量</th>
                        <th style={{ textAlign: 'right' }}>小计</th>
                        <th />
                      </tr>
                    </thead>
                    <tbody>
                      {items.map((i) => (
                        <tr key={i.id}>
                          <td>
                            <div className="row gap-12">
                              <div style={{ width: 56, height: 56, borderRadius: 5, overflow: 'hidden', background: 'var(--paper-deep)', flexShrink: 0 }}>
                                <img src={i.coverUrl || categoryImage('其他')} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                              </div>
                              <div>
                                <Link to={`/shop/${i.productId}`} style={{ fontSize: 14 }}>{i.name}</Link>
                                <div className="small muted">{i.spec} · {i.merchantName}</div>
                                {i.status !== 'active' && <div className="small" style={{ color: 'var(--danger)' }}>商品已下架，结算时将跳过</div>}
                              </div>
                            </div>
                          </td>
                          <td className="num">{money(i.price)}</td>
                          <td>
                            <div className="row gap-8">
                              <button type="button" className="pagination__btn" style={{ minWidth: 30, height: 32, padding: 0 }} onClick={() => updateQty(i, i.quantity - 1)} disabled={busy === `u${i.id}` || i.quantity <= 1}>−</button>
                              <span className="tabular" style={{ minWidth: 22, textAlign: 'center' }}>{i.quantity}</span>
                              <button type="button" className="pagination__btn" style={{ minWidth: 30, height: 32, padding: 0 }} onClick={() => updateQty(i, i.quantity + 1)} disabled={busy === `u${i.id}`}>+</button>
                            </div>
                            <div className="small muted" style={{ marginTop: 4 }}>库存 {num(i.stock)}</div>
                          </td>
                          <td className="num" style={{ textAlign: 'right' }}>{money(i.price * i.quantity)}</td>
                          <td>
                            <button type="button" className="btn btn--quiet btn--sm" onClick={() => remove(i)} disabled={busy === `d${i.id}`} style={{ color: 'var(--danger)' }}>移除</button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <div className="row between mt-16">
                  <Link to="/shop" className="btn btn--quiet btn--sm">← 继续选购</Link>
                  <span className="small muted">共 {valid.length} 种商品</span>
                </div>
              </div>

              <aside>
                <div className="side-card">
                  <h3 className="h4" style={{ marginBottom: 12 }}>结算摘要</h3>
                  <div className="summary-row"><span>商品合计</span><span className="tabular">{money(total)}</span></div>
                  <div className="summary-row"><span>运费</span><span className="tabular">{shipping === 0 ? '免运费' : money(shipping)}</span></div>
                  <div className="summary-row summary-row--total"><span>应付</span><span className="price">{money(total + shipping)}</span></div>
                  <button type="button" className="btn btn--primary btn--block mt-16" disabled={!valid.length} onClick={() => navigate('/checkout')}>
                    去结算
                  </button>
                  <p className="field__hint mt-8">不同商家的商品会拆分为独立订单，分别结算与发货。</p>
                </div>
              </aside>
            </div>
          )}
        </div>
      </section>
    </>
  );
}
