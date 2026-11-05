import { useCallback, useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { get } from '../lib/api.js';
import { useAsync, useTitle } from '../lib/hooks.js';
import { useAuth } from '../lib/auth.jsx';
import { useRealtimeEvent } from '../lib/realtime.jsx';
import PageHead from '../components/PageHead.jsx';
import { Empty, ErrorState, Loading, StatusTag, Tabs } from '../components/ui.jsx';
import { dateTime, money, statusText, statusTone } from '../lib/format.js';

const BUYER_TABS = [
  { value: 'all', label: '全部' },
  { value: 'pending_payment', label: '待付款' },
  { value: 'paid', label: '待发货' },
  { value: 'shipped', label: '待收货' },
  { value: 'completed', label: '已完成' },
  { value: 'after_sale', label: '售后' },
];

export default function Orders() {
  useTitle('我的订单');
  const { user } = useAuth();
  const [params, setParams] = useSearchParams();
  const role = params.get('role') === 'merchant' ? 'merchant' : 'buyer';
  const status = params.get('status') || 'all';
  const { data, loading, error, reload } = useAsync(
    () => (user ? get('/shop/orders', { role, status }) : Promise.resolve({ items: [] })),
    [user?.id, role, status],
  );

  useRealtimeEvent('order', useCallback(() => reload(), [reload]));

  useEffect(() => { reload(); }, [role, status, reload]);

  const setParam = (k, v) => {
    const next = new URLSearchParams(params);
    if (v) next.set(k, v); else next.delete(k);
    setParams(next);
  };

  const items = data?.items || [];

  return (
    <>
      <PageHead
        items={[{ label: '首页', to: '/' }, { label: '我的订单' }]}
        title={role === 'merchant' ? '店铺订单' : '我的订单'}
        desc="订单状态由服务端数据驱动，支付结果以支付服务通知或主动查询为准。"
        actions={
          (user?.role === 'merchant' || user?.role === 'admin') ? (
            <div className="filter-tabs">
              <button type="button" aria-pressed={role === 'buyer'} onClick={() => setParam('role', '')}>我买到的</button>
              <button type="button" aria-pressed={role === 'merchant'} onClick={() => setParam('role', 'merchant')}>我卖出的</button>
            </div>
          ) : null
        }
      />

      <section className="section" style={{ paddingTop: 24 }}>
        <div className="container">
          {role === 'buyer' ? (
            <Tabs tabs={BUYER_TABS} value={status} onChange={(v) => setParam('status', v)} ariaLabel="订单状态" />
          ) : (
            <Tabs
              tabs={[
                { value: 'all', label: '全部' },
                { value: 'pending_payment', label: '待付款' },
                { value: 'paid', label: '待发货' },
                { value: 'shipped', label: '已发货' },
                { value: 'completed', label: '已完成' },
                { value: 'after_sale', label: '售后' },
              ]}
              value={status}
              onChange={(v) => setParam('status', v)}
              ariaLabel="订单状态"
            />
          )}

          <div className="mt-24">
            {loading && <Loading rows={4} height={96} />}
            {error && <ErrorState error={error} onRetry={reload} />}
            {!loading && !error && items.length === 0 && (
              <Empty
                title={role === 'merchant' ? '还没有收到订单' : '还没有订单'}
                desc={role === 'merchant' ? '商品上架并在商城展示后，买家下单会出现在这里。' : '去农资商城挑选需要的商品。'}
                action={<Link to={role === 'merchant' ? '/merchant?tab=products' : '/shop'} className="btn btn--primary btn--sm">{role === 'merchant' ? '管理商品' : '逛商城'}</Link>}
              />
            )}

            {!loading && !error && items.length > 0 && (
              <div className="stack gap-12">
                {items.map((o) => (
                  <div key={o.id} className="panel" style={{ padding: 20, background: 'var(--paper-soft)' }}>
                    <div className="row between" style={{ marginBottom: 12, flexWrap: 'wrap', gap: 8 }}>
                      <div className="small muted">
                        订单号 {o.order_no} · {dateTime(o.created_at)}
                        {role === 'merchant' && o.buyer_name ? ` · 买家 ${o.buyer_name}` : ''}
                        {role === 'buyer' && o.shop_name ? ` · ${o.shop_name}` : ''}
                      </div>
                      <StatusTag status={o.status} text={statusText(o.status)} tone={statusTone(o.status)} />
                    </div>
                    <div className="row between" style={{ flexWrap: 'wrap', gap: 14 }}>
                      <div>
                        <div style={{ fontSize: 15 }}>{o.first_item || '订单商品'}{o.item_count > 1 ? ` 等 ${o.item_count} 件` : ''}</div>
                        <div className="small muted">
                          {o.status === 'shipped' && o.tracking_no ? `运单：${o.tracking_company} ${o.tracking_no}` : `含运费 ¥${Number(o.shipping_fee).toFixed(2)}`}
                        </div>
                      </div>
                      <div className="row gap-16">
                        <span className="price">{money(o.total)}</span>
                        <Link to={`/orders/${o.id}`} className="btn btn--ghost btn--sm">查看详情</Link>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </section>
    </>
  );
}
