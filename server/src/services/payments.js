import crypto from 'node:crypto';
import config from '../config.js';
import { logger } from '../lib/logger.js';
import { serviceUnavailable, badRequest } from '../lib/errors.js';

const API = 'https://api.stripe.com/v1';

export function paymentStatus() {
  return {
    provider: 'stripe',
    configured: config.integrations.payment,
    mode: config.payment.stripeSecret?.startsWith('sk_live') ? 'live' : config.integrations.payment ? 'test' : 'none',
    currency: config.payment.currency,
    webhookConfigured: Boolean(config.payment.stripeWebhookSecret),
    note: config.integrations.payment
      ? '在线支付由 Stripe Checkout 托管，支付结果以服务端 webhook 验签或主动查询为准。'
      : '未配置 STRIPE_SECRET_KEY，商城下单后可选择“线下结算”，由商家在后台确认收款。',
  };
}

async function stripeRequest(path, params, method = 'POST') {
  if (!config.integrations.payment) throw serviceUnavailable('在线支付服务尚未配置');
  const res = await fetch(`${API}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${config.payment.stripeSecret}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: params ? new URLSearchParams(params).toString() : undefined,
    signal: AbortSignal.timeout(20_000),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    logger.error('stripe.error', { status: res.status, message: data?.error?.message });
    throw badRequest(data?.error?.message || '支付服务调用失败');
  }
  return data;
}

export async function createCheckout({ order, user, successUrl, cancelUrl }) {
  const params = {
    mode: 'payment',
    success_url: successUrl,
    cancel_url: cancelUrl,
    client_reference_id: order.order_no,
    'metadata[order_id]': String(order.id),
    'metadata[order_no]': order.order_no,
    customer_email: user.email || undefined,
    'line_items[0][quantity]': '1',
    'line_items[0][price_data][currency]': config.payment.currency,
    'line_items[0][price_data][unit_amount]': String(Math.round(order.total * 100)),
    'line_items[0][price_data][product_data][name]': `禾农云订单 ${order.order_no}`,
  };
  Object.keys(params).forEach((k) => params[k] === undefined && delete params[k]);
  const session = await stripeRequest('/checkout/sessions', params);
  return { id: session.id, url: session.url, paymentIntent: session.payment_intent };
}

export async function retrieveSession(sessionId) {
  return stripeRequest(`/checkout/sessions/${encodeURIComponent(sessionId)}`, null, 'GET');
}

export async function refundPayment(paymentIntentId, amount) {
  if (!paymentIntentId) throw badRequest('该支付记录缺少支付流水号，无法自动退款');
  return stripeRequest('/refunds', {
    payment_intent: paymentIntentId,
    amount: String(Math.round(amount * 100)),
  });
}

/** Stripe webhook 签名校验：HMAC-SHA256(`${t}.${rawBody}`) */
export function verifyStripeSignature(rawBody, signatureHeader) {
  if (!config.payment.stripeWebhookSecret) {
    return { ok: false, reason: '未配置 STRIPE_WEBHOOK_SECRET' };
  }
  if (!signatureHeader) return { ok: false, reason: '缺少 Stripe-Signature 头' };
  const parts = Object.fromEntries(
    signatureHeader.split(',').map((p) => {
      const idx = p.indexOf('=');
      return [p.slice(0, idx), p.slice(idx + 1)];
    }),
  );
  const timestamp = parts.t;
  if (!timestamp || !parts.v1) return { ok: false, reason: '签名格式不正确' };
  if (Math.abs(Date.now() / 1000 - Number(timestamp)) > 300) return { ok: false, reason: '签名时间戳超出容忍范围' };
  const expected = crypto
    .createHmac('sha256', config.payment.stripeWebhookSecret)
    .update(`${timestamp}.${rawBody}`)
    .digest('hex');
  const a = Buffer.from(expected);
  const b = Buffer.from(parts.v1);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return { ok: false, reason: '签名校验失败' };
  return { ok: true };
}
