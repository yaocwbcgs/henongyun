import { useCallback, useEffect, useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { get, post } from '../lib/api.js';
import { useAsync, useTitle } from '../lib/hooks.js';
import { useToast } from '../lib/toast.jsx';
import { useRealtimeEvent } from '../lib/realtime.jsx';
import PageHead from '../components/PageHead.jsx';
import { ErrorState, Loading, Modal, Spinner, StatusTag, Stars } from '../components/ui.jsx';
import { dateTime, money, num, statusText, statusTone } from '../lib/format.js';
import { categoryImage } from '../lib/images.js';

const FLOW = ['pending_payment', 'paid', 'shipped', 'completed'];
const FLOW_LABEL = { pending_payment: '待付款', paid: '待发货', shipped: '已发货', completed: '已完成' };

export default function OrderDetail() {
  const { id } = useParams();
  const [params, setParams] = useSearchParams();
  const toast = useToast();
  const { data, loading, error, reload } = useAsync(() => get(`/shop/orders/${id}`), [id]);
  const [busy, setBusy] = useState('');
  const [payHint, setPayHint] = useState('');
  const [shipOpen, setShipOpen] = useState(false);
  const [refundOpen, setRefundOpen] = useState(false);
  const [reviewOpen, setReviewOpen] = useState(false);
  const [company, setCompany] = useState('');
  const [trackingNo, setTrackingNo] = useState('');
  const [refundAmount, setRefundAmount] = useState('');
  const [refundReason, setRefundReason] = useState('');
  const [rating, setRating] = useState(5);
  const [reviewText, setReviewText] = useState('');
  const o = data?.order;
  useTitle(o ? `订单 ${o.order_no}` : '订单详情');

  useRealtimeEvent('order', useCallback((p) => {
    if (p?.id === Number(id)) reload();
  }, [id, reload]));

  useEffect(() => {
    if (!o) return;
    setRefundAmount(String(o.total));
  }, [o?.id]);

  useEffect(() => {
    if (params.get('paid') !== '1') return;
    post(`/payments/orders/${id}/verify`)
      .then((r) => {
        toast.ok(r.changed ? '支付已确认' : r.status === 'pending_payment' ? '正在等待支付服务确认，请稍后刷新' : '订单状态已更新');
        reload();
      })
      .catch(() => toast.error('暂时无法核验支付结果，请稍后刷新页面'));
    const next = new URLSearchParams(params);
    next.delete('paid');
    setParams(next, { replace: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params.get('paid')]);

  const act = async (name, fn, okMsg) => {
    setBusy(name);
    try {
      await fn();
      toast.ok(okMsg);
      reload();
    } catch (err) {
      toast.error(err.message || '操作失败');
    } finally {
      setBusy('');
    }
  };

  const pay = async () => {
    setBusy('pay');
    setPayHint('');
    try {
      const r = await post(`/shop/orders/${id}/pay`);
      if (r.checkoutUrl) {
        window.location.href = r.checkoutUrl;
        return;
      }
      toast.error('支付服务未返回收银台地址');
    } catch (err) {
      if (err.status === 503) {
        setPayHint(err.message);
      } else {
        toast.error(err.message || '发起支付失败');
      }
    } finally {
      setBusy('');
    }
  };

  const ship = async () => {
    if (company.trim().length < 2) return toast.error('请填写物流公司');
    if (trackingNo.trim().length < 6) return toast.error('请填写真实运单号');
    await act('ship', () => post(`/shop/orders/${id}/ship`, { trackingCompany: company.trim(), trackingNo: trackingNo.trim() }), '已提交发货信息');
    setShipOpen(false);
  };

  const submitRefund = async () => {
    if (refundReason.trim().length < 5) return toast.error('请说明售后原因');
    await act('refund', () => post(`/shop/orders/${id}/refund`, { amount: Number(refundAmount) || undefined, reason: refundReason.trim() }), '售后申请已提交');
    setRefundOpen(false);
  };

  const submitReview = async () => {
    await act('review', () => post(`/shop/orders/${id}/review`, { rating, content: reviewText.trim() || undefined }), '评价已提交');
    setReviewOpen(false);
  };

  if (loading) return <div className="container" style={{ padding: '60px 32px' }}><Loading rows={4} height={100} /></div>;
  if (error) return <div className="container" style={{ padding: '60px 32px' }}><ErrorState error={error} onRetry={reload} /></div>;
  if (!o) return null;

  const isBuyer = data.role === 'buyer';
  const isMerchant = data.role === 'merchant';
  const addr = JSON.parse(o.address_json);
  const flowIndex = FLOW.indexOf(o.status);
  const closed = ['cancelled', 'refunded'].includes(o.status);
  const afterSale = ['refunding', 'refunded'].includes(o.status);

  return (
    <>
      <PageHead
        items={[{ label: '首页', to: '/' }, { label: '我的订单', to: '/orders' }, { label: o.order_no }]}
        title={`订单 ${o.order_no}`}
        desc={`下单时间 ${dateTime(o.created_at)} · 共 ${data.items.length} 种商品 · 应付 ${money(o.total)}`}
        actions={<StatusTag status={o.status} text={statusText(o.status)} tone={statusTone(o.status)} />}
      />

      <section className="section" style={{ paddingTop: 24 }}>
        <div className="container">
          {!closed && (
            <div className="steps">
              {FLOW.map((s, i) => (
                <div key={s} className={`step ${i < flowIndex ? 'is-done' : ''} ${i === flowIndex ? 'is-current' : ''}`}>{FLOW_LABEL[s]}</div>
              ))}
            </div>
          )}

          {o.status === 'cancelled' && (
            <div className="notice notice--danger" style={{ marginBottom: 20 }}>
              <div className="small">订单已取消，占用的库存已回补。取消时间：{dateTime(o.cancelled_at)}</div>
            </div>
          )}

          <div className="checkout-grid">
            <div>
              <div className="panel panel--white" style={{ padding: 26 }}>
                <h3 className="h4" style={{ marginBottom: 14 }}>商品</h3>
                {data.items.map((it) => (
                  <div key={it.id} className="line-item">
                    <div className="line-item__thumb">
                      <img src={categoryImage('其他')} alt="" />
                    </div>
                    <div>
                      <Link to={`/shop/${it.product_id}`} style={{ fontSize: 14 }}>{it.name}</Link>
                      <div className="small muted">{it.spec} · {it.quantity} {it.unit}</div>
                    </div>
                    <div style={{ textAlign: 'right' }}>
                      <div className="tabular">{money(it.price)} × {it.quantity}</div>
                      <div className="small muted">{money(it.subtotal)}</div>
                    </div>
                  </div>
                ))}
                <div className="row between mt-16">
                  <span className="small muted">商品合计 {money(o.goods_total)} · 运费 {money(o.shipping_fee)}</span>
                  <span className="price">{money(o.total)}</span>
                </div>
              </div>

              <div className="panel panel--white mt-16" style={{ padding: 26 }}>
                <h3 className="h4" style={{ marginBottom: 14 }}>收货信息</h3>
                <div className="info-list">
                  <div className="info-list__row"><dt>收货人</dt><dd>{addr.receiver} · {addr.phone}</dd></div>
                  <div className="info-list__row"><dt>地址</dt><dd style={{ maxWidth: 420, textAlign: 'right' }}>{addr.province}{addr.city}{addr.district} {addr.detail}</dd></div>
                  {o.remark && <div className="info-list__row"><dt>备注</dt><dd style={{ maxWidth: 420, textAlign: 'right' }}>{o.remark}</dd></div>}
                  {o.tracking_no && (
                    <div className="info-list__row"><dt>物流</dt><dd>{o.tracking_company} · {o.tracking_no}</dd></div>
                  )}
                </div>
              </div>

              {data.payments.length > 0 && (
                <div className="panel mt-16">
                  <h3 className="h4" style={{ marginBottom: 12 }}>支付记录</h3>
                  <div className="table-wrap">
                    <table className="table table--compact">
                      <thead><tr><th>渠道</th><th>金额</th><th>状态</th><th>时间</th></tr></thead>
                      <tbody>
                        {data.payments.map((p) => (
                          <tr key={p.id}>
                            <td>{p.provider === 'stripe' ? 'Stripe Checkout' : '线下收款'}</td>
                            <td className="num">{money(p.amount)}</td>
                            <td>{p.status === 'succeeded' ? '成功' : p.status === 'refunded' ? '已退款' : p.status}</td>
                            <td className="small muted">{dateTime(p.paid_at || p.created_at)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {data.refunds.length > 0 && (
                <div className="panel mt-16">
                  <h3 className="h4" style={{ marginBottom: 12 }}>售后记录</h3>
                  {data.refunds.map((r) => (
                    <div key={r.id} style={{ padding: '10px 0', borderBottom: '1px solid var(--line-soft)' }}>
                      <div className="row between">
                        <span style={{ fontSize: 14 }}>退款 {money(r.amount)}</span>
                        <StatusTag status={r.status} text={statusText(r.status)} tone={statusTone(r.status)} />
                      </div>
                      <div className="small muted mt-8">原因：{r.reason}</div>
                      {r.admin_note && <div className="small muted">处理说明：{r.admin_note}</div>}
                    </div>
                  ))}
                </div>
              )}
            </div>

            <aside>
              <div className="side-sticky">
                <div className="side-card">
                  <div className="eyebrow eyebrow--olive">订单操作</div>
                  <div className="stack gap-8 mt-12">
                    {isBuyer && o.status === 'pending_payment' && (
                      <>
                        <button type="button" className="btn btn--primary btn--block" onClick={pay} disabled={busy === 'pay'}>
                          {busy === 'pay' ? <><Spinner /> 正在跳转</> : '在线支付'}
                        </button>
                        <button type="button" className="btn btn--ghost btn--block" onClick={() => act('cancel', () => post(`/shop/orders/${id}/cancel`), '订单已取消')} disabled={busy === 'cancel'}>
                          取消订单
                        </button>
                      </>
                    )}
                    {isBuyer && o.status === 'shipped' && (
                      <button type="button" className="btn btn--primary btn--block" onClick={() => act('receive', () => post(`/shop/orders/${id}/receive`), '已确认收货')} disabled={busy === 'receive'}>
                        确认收货
                      </button>
                    )}
                    {isBuyer && ['paid', 'shipped', 'completed'].includes(o.status) && (
                      <button type="button" className="btn btn--ghost btn--block" onClick={() => setRefundOpen(true)}>申请售后</button>
                    )}
                    {isBuyer && o.status === 'completed' && !data.review && (
                      <button type="button" className="btn btn--ghost btn--block" onClick={() => setReviewOpen(true)}>评价商品</button>
                    )}
                    {isMerchant && o.status === 'pending_payment' && (
                      <button type="button" className="btn btn--primary btn--block" onClick={() => act('offline', () => post(`/shop/orders/${id}/confirm-offline`), '已确认收款')} disabled={busy === 'offline'}>
                        确认线下收款
                      </button>
                    )}
                    {isMerchant && o.status === 'paid' && (
                      <button type="button" className="btn btn--primary btn--block" onClick={() => setShipOpen(true)}>填写运单并发货</button>
                    )}
                    <Link to="/messages" className="btn btn--quiet btn--block">联系{isMerchant ? '买家' : '商家'}</Link>
                  </div>

                  {payHint && (
                    <div className="notice notice--warn mt-16">
                      <div className="small">
                        {payHint}
                        <div style={{ marginTop: 8 }}>可选择与商家协商线下结算，由商家在后台确认收款后进入发货流程。</div>
                      </div>
                    </div>
                  )}

                  {data.payment && !data.payment.configured && o.status === 'pending_payment' && !payHint && (
                    <p className="field__hint mt-12">当前环境未配置在线支付，可在与商家沟通后选择线下结算。</p>
                  )}

                  <div className="info-list mt-16" style={{ borderTop: '1px solid var(--line-soft)', paddingTop: 14 }}>
                    <div className="info-list__row"><dt>商家</dt><dd>{o.shop_name || '商家'}</dd></div>
                    <div className="info-list__row"><dt>支付时间</dt><dd>{o.paid_at ? dateTime(o.paid_at) : '—'}</dd></div>
                    <div className="info-list__row"><dt>发货时间</dt><dd>{o.shipped_at ? dateTime(o.shipped_at) : '—'}</dd></div>
                    <div className="info-list__row"><dt>完成时间</dt><dd>{o.completed_at ? dateTime(o.completed_at) : '—'}</dd></div>
                  </div>
                </div>

                {data.review && (
                  <div className="side-card">
                    <div className="row between">
                      <span className="side-card__title" style={{ marginBottom: 0 }}>我的评价</span>
                      <Stars value={data.review.rating} readOnly />
                    </div>
                    <p className="small mt-8">{data.review.content || '未填写文字评价'}</p>
                  </div>
                )}

                <div className="notice notice--plain" style={{ marginTop: 16 }}>
                  <div className="small">
                    支付结果以服务端验签通知或主动查询为准。请勿相信任何要求站外转账的私信。
                  </div>
                </div>
              </div>
            </aside>
          </div>
        </div>
      </section>

      <Modal
        open={shipOpen}
        onClose={() => setShipOpen(false)}
        title="填写发货信息"
        footer={
          <>
            <button type="button" className="btn btn--ghost btn--sm" onClick={() => setShipOpen(false)}>取消</button>
            <button type="button" className="btn btn--primary btn--sm" onClick={ship} disabled={busy === 'ship'}>确认发货</button>
          </>
        }
      >
        <div className="stack gap-16">
          <div className="notice notice--plain small">请填写真实物流公司与运单号。平台不生成虚构物流轨迹，买家可在订单详情查看。</div>
          <label className="field">
            <span className="field__label">物流公司<span className="req">*</span></span>
            <input className="input" value={company} onChange={(e) => setCompany(e.target.value)} placeholder="例如：顺丰速运 / 中通快递 / 自有配送" />
          </label>
          <label className="field">
            <span className="field__label">运单号<span className="req">*</span></span>
            <input className="input" value={trackingNo} onChange={(e) => setTrackingNo(e.target.value)} placeholder="请输入真实运单号" />
          </label>
        </div>
      </Modal>

      <Modal
        open={refundOpen}
        onClose={() => setRefundOpen(false)}
        title="申请售后"
        footer={
          <>
            <button type="button" className="btn btn--ghost btn--sm" onClick={() => setRefundOpen(false)}>取消</button>
            <button type="button" className="btn btn--primary btn--sm" onClick={submitRefund} disabled={busy === 'refund'}>提交申请</button>
          </>
        }
      >
        <div className="stack gap-16">
          <div className="notice notice--plain small">商家与平台会看到该申请。若已在线支付，批准后会尝试原路退款；线下支付由平台记录退款结果。</div>
          <label className="field">
            <span className="field__label">退款金额（不超过 {money(o.total)}）</span>
            <input className="input" type="number" min="0" step="0.01" value={refundAmount} onChange={(e) => setRefundAmount(e.target.value)} />
          </label>
          <label className="field">
            <span className="field__label">售后原因<span className="req">*</span></span>
            <textarea className="textarea" value={refundReason} onChange={(e) => setRefundReason(e.target.value)} placeholder="例如：到货破损 3 袋、规格与页面不符等。" />
          </label>
        </div>
      </Modal>

      <Modal
        open={reviewOpen}
        onClose={() => setReviewOpen(false)}
        title="评价商品"
        footer={
          <>
            <button type="button" className="btn btn--ghost btn--sm" onClick={() => setReviewOpen(false)}>取消</button>
            <button type="button" className="btn btn--primary btn--sm" onClick={submitReview} disabled={busy === 'review'}>提交评价</button>
          </>
        }
      >
        <div className="stack gap-16">
          <div>
            <span className="field__label">评分</span>
            <div className="mt-8"><Stars value={rating} onChange={setRating} /></div>
          </div>
          <label className="field">
            <span className="field__label">评价内容</span>
            <textarea className="textarea" value={reviewText} onChange={(e) => setReviewText(e.target.value)} maxLength={500} placeholder="商品质量、包装、发货速度等。" />
          </label>
        </div>
      </Modal>
    </>
  );
}
