import { Router } from 'express';
import express from 'express';
import { getDb } from '../db/index.js';
import { verifyStripeSignature, retrieveSession } from '../services/payments.js';
import { fulfillPayment, afterPaid } from '../services/orders.js';
import { requireAuth } from '../middleware/auth.js';
import { asyncHandler } from '../middleware/error.js';
import { forbidden, notFound } from '../lib/errors.js';
import { logger } from '../lib/logger.js';

const router = Router();

/** Stripe webhook：必须使用原始请求体验签 */
router.post(
  '/webhook/stripe',
  express.raw({ type: 'application/json', limit: '1mb' }),
  (req, res) => {
    const rawBody = Buffer.isBuffer(req.body) ? req.body.toString('utf8') : '';
    const check = verifyStripeSignature(rawBody, req.headers['stripe-signature']);
    if (!check.ok) {
      logger.warn('stripe.webhook_rejected', { reason: check.reason });
      return res.status(400).json({ error: { code: 'INVALID_SIGNATURE', message: check.reason } });
    }
    let event;
    try {
      event = JSON.parse(rawBody);
    } catch {
      return res.status(400).json({ error: { code: 'BAD_PAYLOAD', message: '无法解析事件内容' } });
    }
    const type = event.type;
    const obj = event.data?.object || {};
    if (!['checkout.session.completed', 'checkout.session.async_payment_succeeded'].includes(type)) {
      return res.json({ received: true, ignored: type });
    }
    const orderId = Number(obj.metadata?.order_id);
    if (!orderId) return res.json({ received: true, ignored: 'missing_order_id' });
    if (obj.payment_status && obj.payment_status !== 'paid') return res.json({ received: true, ignored: 'not_paid' });

    const result = fulfillPayment({
      orderId,
      providerRef: obj.id,
      amount: obj.amount_total ? obj.amount_total / 100 : undefined,
      provider: 'stripe',
      raw: { event_id: event.id, type, payment_intent: obj.payment_intent, payment_status: obj.payment_status },
    });
    if (result.ok && !result.already) afterPaid(result.order);
    logger.info('stripe.webhook_processed', { eventId: event.id, orderId, already: result.already });
    res.json({ received: true, already: Boolean(result.already) });
  },
);

/** 支付返回页主动核验：不依赖前端参数，直接向支付服务查询 */
router.post(
  '/orders/:id/verify',
  requireAuth,
  asyncHandler(async (req, res) => {
    const db = getDb();
    const order = db.prepare('SELECT * FROM orders WHERE id=?').get(req.params.id);
    if (!order) throw notFound('订单不存在');
    if (order.user_id !== req.user.id) throw forbidden('无权核验该订单');
    if (order.status !== 'pending_payment') return res.json({ status: order.status, changed: false });
    const payment = db
      .prepare("SELECT * FROM payments WHERE order_id=? AND provider='stripe' AND status='pending' ORDER BY id DESC LIMIT 1")
      .get(order.id);
    if (!payment) return res.json({ status: order.status, changed: false, reason: 'no_pending_payment' });
    let session;
    try {
      session = await retrieveSession(payment.provider_ref);
    } catch (err) {
      logger.warn('payment.verify_failed', { orderId: order.id, message: err.message });
      return res.json({ status: order.status, changed: false, reason: 'provider_unreachable' });
    }
    if (session.payment_status !== 'paid') return res.json({ status: order.status, changed: false, providerStatus: session.payment_status });
    const result = fulfillPayment({
      orderId: order.id,
      providerRef: session.id,
      amount: session.amount_total ? session.amount_total / 100 : order.total,
      provider: 'stripe',
      raw: { verified_by: 'server_query', payment_intent: session.payment_intent },
    });
    if (result.ok && !result.already) afterPaid(result.order);
    const fresh = db.prepare('SELECT status FROM orders WHERE id=?').get(order.id);
    res.json({ status: fresh.status, changed: !result.already });
  }),
);

export default router;
