import { getDb } from '../db/index.js';
import { notify } from './notify.js';
import { hub } from '../realtime/hub.js';
import { logger } from '../lib/logger.js';

/**
 * 支付成功入账。幂等：同一 provider_ref 只入账一次，库存已于下单时预扣，支付不再扣减。
 */
export function fulfillPayment({ orderId, providerRef, amount, provider, raw }) {
  const db = getDb();
  return db.transaction(() => {
    const order = db.prepare('SELECT * FROM orders WHERE id=?').get(orderId);
    if (!order) return { ok: false, reason: 'order_not_found' };
    if (['paid', 'shipped', 'completed', 'refunding', 'refunded'].includes(order.status)) {
      return { ok: true, already: true, status: order.status };
    }
    if (order.status !== 'pending_payment') return { ok: false, reason: `unexpected_status:${order.status}` };

    const existing = providerRef
      ? db.prepare('SELECT * FROM payments WHERE provider_ref=?').get(providerRef)
      : null;
    if (existing?.status === 'succeeded') return { ok: true, already: true, status: 'paid' };

    if (existing) {
      db.prepare("UPDATE payments SET status='succeeded', paid_at=datetime('now','localtime'), raw=? WHERE id=?").run(
        raw ? JSON.stringify(raw) : null,
        existing.id,
      );
    } else {
      db.prepare(
        "INSERT INTO payments (order_id, provider, provider_ref, amount, status, paid_at, raw) VALUES (?,?,?,?,'succeeded',datetime('now','localtime'),?)",
      ).run(order.id, provider, providerRef || null, amount ?? order.total, raw ? JSON.stringify(raw) : null);
    }
    db.prepare("UPDATE orders SET status='paid', paid_at=datetime('now','localtime'), updated_at=datetime('now','localtime') WHERE id=?").run(order.id);
    return { ok: true, order, already: false };
  })();
}

export function afterPaid(order) {
  if (!order) return;
  notify(order.user_id, {
    type: 'order',
    title: '支付成功',
    body: `订单 ${order.order_no} 已支付 ¥${Number(order.total).toFixed(2)}，等待商家发货。`,
    link: `/orders/${order.id}`,
  });
  notify(order.merchant_id, {
    type: 'order',
    title: '订单已支付',
    body: `订单 ${order.order_no} 已收到货款，请及时发货。`,
    link: '/merchant/orders',
  });
  hub.send(order.user_id, 'order', { id: order.id, status: 'paid' });
  hub.send(order.merchant_id, 'order', { id: order.id, status: 'paid' });
  logger.info('order.paid', { orderId: order.id, orderNo: order.order_no });
}

/** 超时未支付订单自动取消并回补库存（后台任务调用） */
export function cancelStaleOrders(minutes = 30) {
  const db = getDb();
  const rows = db
    .prepare(
      `SELECT * FROM orders WHERE status='pending_payment'
       AND created_at < datetime('now','localtime', ?)`,
    )
    .all(`-${minutes} minutes`);
  let count = 0;
  for (const order of rows) {
    db.transaction(() => {
      const guard = db
        .prepare("UPDATE orders SET status='cancelled', cancelled_at=datetime('now','localtime'), updated_at=datetime('now','localtime') WHERE id=? AND status='pending_payment'")
        .run(order.id);
      if (guard.changes === 0) return;
      const items = db.prepare('SELECT * FROM order_items WHERE order_id=?').all(order.id);
      const back = db.prepare("UPDATE products SET stock=stock+?, updated_at=datetime('now','localtime') WHERE id=?");
      for (const it of items) back.run(it.quantity, it.product_id);
      count++;
    })();
  }
  return count;
}
