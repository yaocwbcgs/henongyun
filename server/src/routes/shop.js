import { Router } from 'express';
import { z } from 'zod';
import { getDb } from '../db/index.js';
import { parse, parsePagination, likeParam } from '../lib/validate.js';
import { badRequest, conflict, forbidden, notFound, serviceUnavailable } from '../lib/errors.js';
import { requireAuth, requireMerchant, optionalAuth } from '../middleware/auth.js';
import { asyncHandler } from '../middleware/error.js';
import { notify } from '../services/notify.js';
import { hub } from '../realtime/hub.js';
import { createCheckout, paymentStatus } from '../services/payments.js';
import config from '../config.js';
import { logger } from '../lib/logger.js';

const router = Router();
const CATEGORIES = ['种子种苗', '肥料', '农药', '农膜农机具', '饲料', '其他'];
const SHIPPING_FEE = 12;
const FREE_SHIPPING_THRESHOLD = 199;

const money = (n) => Math.round(n * 100) / 100;
const orderNo = () => `HN${Date.now().toString().slice(-11)}${Math.floor(Math.random() * 900 + 100)}`;

function productRow(row) {
  return {
    id: row.id,
    merchantId: row.merchant_id,
    merchantName: row.merchant_name,
    shopName: row.shop_name,
    name: row.name,
    category: row.category,
    spec: row.spec,
    unit: row.unit,
    price: row.price,
    stock: row.stock,
    description: row.description,
    applicable: row.applicable,
    sourceNote: row.source_note,
    status: row.status,
    coverUrl: row.cover_key ? `/uploads/${row.cover_key.split('\\').join('/')}` : null,
    imageUrls: row.image_keys ? row.image_keys.split(',').filter(Boolean).map((k) => `/uploads/${k.split('\\').join('/')}`) : [],
    sales: row.sales ?? 0,
    rating: row.rating ?? null,
  };
}

const productSql = `SELECT p.*, u.name AS merchant_name, mp.shop_name,
  (SELECT COUNT(*) FROM order_items oi JOIN orders o ON o.id=oi.order_id WHERE oi.product_id=p.id AND o.status IN ('paid','shipped','completed')) AS sales,
  (SELECT ROUND(AVG(r.rating),1) FROM reviews r WHERE r.target_type='product' AND r.target_id=p.id) AS rating,
  (SELECT storage_key FROM uploads up JOIN product_images pi ON pi.upload_id=up.id WHERE pi.product_id=p.id ORDER BY pi.sort LIMIT 1) AS cover_key
  FROM products p JOIN users u ON u.id=p.merchant_id
  LEFT JOIN merchant_profiles mp ON mp.user_id=p.merchant_id`;

router.get(
  '/products',
  asyncHandler(async (req, res) => {
    const { page, pageSize, offset } = parsePagination(req.query, 12);
    const { category, q, minPrice, maxPrice, sort, merchantId } = req.query;
    const where = ["p.status='active'", "u.status='active'"];
    const args = [];
    if (category) {
      where.push('p.category=?');
      args.push(category);
    }
    if (merchantId) {
      where.push('p.merchant_id=?');
      args.push(Number(merchantId));
    }
    if (minPrice) {
      where.push('p.price>=?');
      args.push(Number(minPrice));
    }
    if (maxPrice) {
      where.push('p.price<=?');
      args.push(Number(maxPrice));
    }
    if (q) {
      where.push("(p.name LIKE ? ESCAPE '\\' OR p.description LIKE ? ESCAPE '\\' OR p.applicable LIKE ? ESCAPE '\\')");
      const like = likeParam(q);
      args.push(like, like, like);
    }
    const order = sort === 'price_asc' ? 'p.price ASC' : sort === 'price_desc' ? 'p.price DESC' : sort === 'sales' ? 'sales DESC, p.id DESC' : 'p.id DESC';
    const db = getDb();
    const total = db.prepare(`SELECT COUNT(*) c FROM products p JOIN users u ON u.id=p.merchant_id WHERE ${where.join(' AND ')}`).get(...args).c;
    const rows = db.prepare(`${productSql} WHERE ${where.join(' AND ')} ORDER BY ${order} LIMIT ? OFFSET ?`).all(...args, pageSize, offset);
    res.json({ items: rows.map(productRow), total, page, pageSize, totalPages: Math.ceil(total / pageSize), categories: CATEGORIES });
  }),
);

router.get(
  '/products/:id',
  optionalAuth,
  asyncHandler(async (req, res) => {
    const db = getDb();
    const row = db.prepare(`${productSql} WHERE p.id=?`).get(req.params.id);
    if (!row) throw notFound('商品不存在');
    if (row.status !== 'active' && row.merchant_id !== req.user?.id) throw forbidden('商品已下架');
    const imageKeys = db
      .prepare('SELECT u.storage_key FROM product_images pi JOIN uploads u ON u.id=pi.upload_id WHERE pi.product_id=? ORDER BY pi.sort')
      .all(row.id)
      .map((r) => r.storage_key);
    const reviews = db
      .prepare(`SELECT r.*, u.name AS user_name FROM reviews r JOIN users u ON u.id=r.user_id WHERE r.target_type='product' AND r.target_id=? ORDER BY r.id DESC LIMIT 20`)
      .all(row.id);
    res.json({ product: productRow({ ...row, image_keys: imageKeys.join(',') }), reviews, shipping: { fee: SHIPPING_FEE, freeThreshold: FREE_SHIPPING_THRESHOLD } });
  }),
);

const productSchema = z.object({
  name: z.string().trim().min(3).max(80),
  category: z.enum(CATEGORIES),
  spec: z.string().trim().min(2, '请填写规格').max(80),
  unit: z.string().trim().min(1).max(10),
  price: z.number().positive().max(1_000_000),
  stock: z.number().int().min(0).max(1_000_000),
  description: z.string().trim().max(2000).optional(),
  applicable: z.string().trim().max(300).optional(),
  sourceNote: z.string().trim().max(300).optional(),
  status: z.enum(['active', 'inactive']).optional(),
  imageIds: z.array(z.number().int().positive()).max(6).optional(),
});

function attachProductImages(id, ids, merchantId) {
  if (!ids) return;
  const db = getDb();
  db.prepare('DELETE FROM product_images WHERE product_id=?').run(id);
  ids.forEach((uid, i) => {
    if (db.prepare('SELECT id FROM uploads WHERE id=? AND user_id=?').get(uid, merchantId)) {
      db.prepare('INSERT OR IGNORE INTO product_images (product_id, upload_id, sort) VALUES (?,?,?)').run(id, uid, i);
    }
  });
}

router.post(
  '/products',
  requireAuth,
  requireMerchant,
  asyncHandler(async (req, res) => {
    const body = parse(productSchema, req.body);
    const db = getDb();
    const id = db.transaction(() => {
      const info = db
        .prepare(
          `INSERT INTO products (merchant_id, name, category, spec, unit, price, stock, description, applicable, source_note, status)
           VALUES (?,?,?,?,?,?,?,?,?,?,?)`,
        )
        .run(req.user.id, body.name, body.category, body.spec, body.unit, body.price, body.stock, body.description || null, body.applicable || null, body.sourceNote || null, body.status || 'active');
      const newId = Number(info.lastInsertRowid);
      attachProductImages(newId, body.imageIds, req.user.id);
      return newId;
    })();
    res.status(201).json({ id });
  }),
);

router.put(
  '/products/:id',
  requireAuth,
  requireMerchant,
  asyncHandler(async (req, res) => {
    const body = parse(productSchema, req.body);
    const db = getDb();
    const row = db.prepare('SELECT * FROM products WHERE id=?').get(req.params.id);
    if (!row) throw notFound('商品不存在');
    if (row.merchant_id !== req.user.id) throw forbidden('只能管理自己的商品');
    db.transaction(() => {
      db.prepare(
        `UPDATE products SET name=?, category=?, spec=?, unit=?, price=?, stock=?, description=?, applicable=?, source_note=?,
         status=?, updated_at=datetime('now','localtime') WHERE id=?`,
      ).run(body.name, body.category, body.spec, body.unit, body.price, body.stock, body.description || null, body.applicable || null, body.sourceNote || null, body.status || row.status, row.id);
      attachProductImages(row.id, body.imageIds, req.user.id);
    })();
    res.json({ ok: true });
  }),
);

/* ---------------- 购物车 ---------------- */
router.get(
  '/cart',
  requireAuth,
  asyncHandler(async (req, res) => {
    const db = getDb();
    const rows = db
      .prepare(
        `SELECT c.id, c.quantity, p.id AS product_id, p.name, p.spec, p.unit, p.price, p.stock, p.status,
          u.name AS merchant_name, mp.shop_name,
          (SELECT storage_key FROM uploads up JOIN product_images pi ON pi.upload_id=up.id WHERE pi.product_id=p.id ORDER BY pi.sort LIMIT 1) AS cover_key
         FROM cart_items c JOIN products p ON p.id=c.product_id JOIN users u ON u.id=p.merchant_id
         LEFT JOIN merchant_profiles mp ON mp.user_id=u.id
         WHERE c.user_id=? ORDER BY c.id DESC`,
      )
      .all(req.user.id);
    const items = rows.map((r) => ({
      id: r.id,
      productId: r.product_id,
      name: r.name,
      spec: r.spec,
      unit: r.unit,
      price: r.price,
      stock: r.stock,
      quantity: r.quantity,
      status: r.status,
      merchantName: r.shop_name || r.merchant_name,
      coverUrl: r.cover_key ? `/uploads/${r.cover_key.split('\\').join('/')}` : null,
      subtotal: money(r.price * r.quantity),
    }));
    const total = money(items.filter((i) => i.status === 'active').reduce((s, i) => s + i.subtotal, 0));
    res.json({ items, total, shipping: { fee: SHIPPING_FEE, freeThreshold: FREE_SHIPPING_THRESHOLD } });
  }),
);

router.post(
  '/cart',
  requireAuth,
  asyncHandler(async (req, res) => {
    const body = parse(z.object({ productId: z.number().int().positive(), quantity: z.number().int().min(1).max(999) }), req.body);
    const db = getDb();
    const product = db.prepare("SELECT * FROM products WHERE id=? AND status='active'").get(body.productId);
    if (!product) throw notFound('商品不存在或已下架');
    if (product.stock < body.quantity) throw badRequest(`库存不足，当前仅剩 ${product.stock}${product.unit}`);
    db.prepare(
      `INSERT INTO cart_items (user_id, product_id, quantity) VALUES (?,?,?)
       ON CONFLICT(user_id, product_id) DO UPDATE SET quantity = MIN(quantity + excluded.quantity, 999)`,
    ).run(req.user.id, body.productId, body.quantity);
    const count = db.prepare('SELECT COUNT(*) c FROM cart_items WHERE user_id=?').get(req.user.id).c;
    res.status(201).json({ ok: true, cartCount: count });
  }),
);

router.patch(
  '/cart/:id',
  requireAuth,
  asyncHandler(async (req, res) => {
    const body = parse(z.object({ quantity: z.number().int().min(1).max(999) }), req.body);
    const db = getDb();
    const item = db
      .prepare('SELECT c.*, p.stock, p.unit FROM cart_items c JOIN products p ON p.id=c.product_id WHERE c.id=? AND c.user_id=?')
      .get(req.params.id, req.user.id);
    if (!item) throw notFound('购物车条目不存在');
    if (item.stock < body.quantity) throw badRequest(`库存不足，当前仅剩 ${item.stock}${item.unit}`);
    db.prepare('UPDATE cart_items SET quantity=? WHERE id=?').run(body.quantity, item.id);
    res.json({ ok: true });
  }),
);

router.delete(
  '/cart/:id',
  requireAuth,
  asyncHandler(async (req, res) => {
    const info = getDb().prepare('DELETE FROM cart_items WHERE id=? AND user_id=?').run(req.params.id, req.user.id);
    if (info.changes === 0) throw notFound('购物车条目不存在');
    res.json({ ok: true });
  }),
);

/* ---------------- 下单 ---------------- */
function addressSnapshot(db, addressId, userId) {
  const addr = db.prepare('SELECT * FROM addresses WHERE id=? AND user_id=?').get(addressId, userId);
  if (!addr) throw badRequest('请选择有效的收货地址');
  return {
    receiver: addr.receiver,
    phone: addr.phone,
    province: addr.province,
    city: addr.city,
    district: addr.district,
    detail: addr.detail,
  };
}

router.post(
  '/orders',
  requireAuth,
  asyncHandler(async (req, res) => {
    const body = parse(
      z.object({
        addressId: z.number().int().positive(),
        remark: z.string().trim().max(300).optional(),
        items: z.array(z.object({ productId: z.number().int().positive(), quantity: z.number().int().min(1).max(999) })).min(1, '请选择商品').max(30),
        fromCart: z.boolean().optional(),
      }),
      req.body,
    );
    const db = getDb();
    // 合并同一商品
    const merged = new Map();
    for (const it of body.items) merged.set(it.productId, (merged.get(it.productId) || 0) + it.quantity);

    const address = addressSnapshot(db, body.addressId, req.user.id);
    const created = db.transaction(() => {
      const groups = new Map(); // merchantId -> items
      for (const [productId, qty] of merged) {
        const p = db.prepare("SELECT p.*, u.status AS merchant_status FROM products p JOIN users u ON u.id=p.merchant_id WHERE p.id=?").get(productId);
        if (!p) throw badRequest('商品不存在');
        if (p.status !== 'active') throw badRequest(`${p.name} 已下架`);
        if (p.merchant_status !== 'active') throw badRequest(`${p.name} 所属商家已停用`);
        const dec = db.prepare("UPDATE products SET stock = stock - ?, updated_at=datetime('now','localtime') WHERE id=? AND stock >= ?").run(qty, productId, qty);
        if (dec.changes === 0) throw conflict(`${p.name} 库存不足，当前仅剩 ${p.stock}${p.unit}`);
        if (!groups.has(p.merchant_id)) groups.set(p.merchant_id, []);
        groups.get(p.merchant_id).push({ p, qty });
      }
      const orders = [];
      for (const [merchantId, items] of groups) {
        const goodsTotal = money(items.reduce((s, { p, qty }) => s + p.price * qty, 0));
        const shipping = goodsTotal >= FREE_SHIPPING_THRESHOLD ? 0 : SHIPPING_FEE;
        const total = money(goodsTotal + shipping);
        const no = orderNo();
        const info = db
          .prepare(
            `INSERT INTO orders (order_no, user_id, merchant_id, goods_total, shipping_fee, total, address_json, remark)
             VALUES (?,?,?,?,?,?,?,?)`,
          )
          .run(no, req.user.id, merchantId, goodsTotal, shipping, total, JSON.stringify(address), body.remark || null);
        const orderId = Number(info.lastInsertRowid);
        const stmt = db.prepare(
          'INSERT INTO order_items (order_id, product_id, name, spec, unit, price, quantity, subtotal) VALUES (?,?,?,?,?,?,?,?)',
        );
        for (const { p, qty } of items) stmt.run(orderId, p.id, p.name, p.spec, p.unit, p.price, qty, money(p.price * qty));
        orders.push({ id: orderId, orderNo: no, total });
        notify(merchantId, { type: 'order', title: '收到新订单', body: `订单 ${no}，金额 ¥${total.toFixed(2)}`, link: `/merchant/orders` });
        hub.send(merchantId, 'order', { id: orderId, status: 'pending_payment', orderNo: no });
      }
      if (body.fromCart) {
        const del = db.prepare('DELETE FROM cart_items WHERE user_id=? AND product_id=?');
        for (const productId of merged.keys()) del.run(req.user.id, productId);
      }
      return orders;
    })();

    res.status(201).json({ orders: created, payment: paymentStatus() });
  }),
);

/* ---------------- 订单 ---------------- */
router.get(
  '/orders',
  requireAuth,
  asyncHandler(async (req, res) => {
    const role = req.query.role === 'merchant' ? 'merchant' : 'buyer';
    const status = req.query.status;
    const db = getDb();
    const where = [role === 'merchant' ? 'o.merchant_id = ?' : 'o.user_id = ?'];
    const args = [req.user.id];
    if (status && status !== 'all') {
      if (status === 'after_sale') {
        where.push("o.status IN ('refunding','refunded')");
      } else {
        where.push('o.status = ?');
        args.push(status);
      }
    }
    const rows = db
      .prepare(
        `SELECT o.*, u.name AS buyer_name, mp.shop_name,
          (SELECT COUNT(*) FROM order_items oi WHERE oi.order_id=o.id) AS item_count,
          (SELECT name FROM order_items oi WHERE oi.order_id=o.id LIMIT 1) AS first_item
         FROM orders o JOIN users u ON u.id=o.user_id LEFT JOIN merchant_profiles mp ON mp.user_id=o.merchant_id
         WHERE ${where.join(' AND ')} ORDER BY o.id DESC LIMIT 100`,
      )
      .all(...args);
    res.json({ items: rows });
  }),
);

router.get(
  '/orders/:id',
  requireAuth,
  asyncHandler(async (req, res) => {
    const db = getDb();
    const order = db.prepare('SELECT * FROM orders WHERE id=?').get(req.params.id);
    if (!order) throw notFound('订单不存在');
    const isBuyer = order.user_id === req.user.id;
    const isMerchant = order.merchant_id === req.user.id;
    if (!isBuyer && !isMerchant && req.user.role !== 'admin') throw forbidden('无权查看该订单');
    const items = db.prepare('SELECT * FROM order_items WHERE order_id=?').all(order.id);
    const payments = db.prepare('SELECT id, provider, provider_ref, amount, status, created_at, paid_at FROM payments WHERE order_id=? ORDER BY id DESC').all(order.id);
    const refunds = db.prepare('SELECT * FROM refunds WHERE order_id=? ORDER BY id DESC').all(order.id);
    const review = db.prepare("SELECT * FROM reviews WHERE order_id=?").get(order.id) || null;
    res.json({ order, items, payments, refunds, review, role: isBuyer ? 'buyer' : isMerchant ? 'merchant' : 'admin', payment: paymentStatus() });
  }),
);

router.post(
  '/orders/:id/pay',
  requireAuth,
  asyncHandler(async (req, res) => {
    const db = getDb();
    const order = db.prepare('SELECT * FROM orders WHERE id=?').get(req.params.id);
    if (!order) throw notFound('订单不存在');
    if (order.user_id !== req.user.id) throw forbidden('无权支付该订单');
    if (order.status !== 'pending_payment') throw badRequest('订单当前状态不可支付');
    if (!config.integrations.payment) {
      throw serviceUnavailable('在线支付尚未接入（未配置 Stripe 密钥）。可选择线下结算，由商家确认收款。', {
        fallback: 'offline',
      });
    }
    const session = await createCheckout({
      order,
      user: req.user,
      successUrl: `${config.publicBaseUrl}/orders/${order.id}?paid=1`,
      cancelUrl: `${config.publicBaseUrl}/orders/${order.id}?cancelled=1`,
    });
    db.prepare("INSERT INTO payments (order_id, provider, provider_ref, amount, status, checkout_url, raw) VALUES (?, 'stripe', ?, ?, 'pending', ?, ?)").run(
      order.id,
      session.id,
      order.total,
      session.url,
      JSON.stringify({ payment_intent: session.paymentIntent }),
    );
    res.json({ checkoutUrl: session.url, provider: 'stripe' });
  }),
);

router.post(
  '/orders/:id/confirm-offline',
  requireAuth,
  asyncHandler(async (req, res) => {
    const db = getDb();
    const order = db.prepare('SELECT * FROM orders WHERE id=?').get(req.params.id);
    if (!order) throw notFound('订单不存在');
    if (order.merchant_id !== req.user.id && req.user.role !== 'admin') throw forbidden('只有商家可以确认收款');
    if (order.status !== 'pending_payment') throw badRequest('订单当前状态不可确认收款');
    db.transaction(() => {
      db.prepare("UPDATE orders SET status='paid', paid_at=datetime('now','localtime'), updated_at=datetime('now','localtime') WHERE id=?").run(order.id);
      db.prepare("INSERT INTO payments (order_id, provider, amount, status, paid_at, raw) VALUES (?, 'offline', ?, 'succeeded', datetime('now','localtime'), ?)").run(
        order.id,
        order.total,
        JSON.stringify({ confirmedBy: req.user.id, note: '线下收款确认' }),
      );
    })();
    notify(order.user_id, { type: 'order', title: '订单已确认收款', body: `订单 ${order.order_no} 已进入备货流程`, link: `/orders/${order.id}` });
    hub.send(order.user_id, 'order', { id: order.id, status: 'paid' });
    res.json({ ok: true, status: 'paid' });
  }),
);

router.post(
  '/orders/:id/ship',
  requireAuth,
  asyncHandler(async (req, res) => {
    const body = parse(
      z.object({
        trackingCompany: z.string().trim().min(2, '请填写物流公司').max(40),
        trackingNo: z.string().trim().min(6, '请填写真实运单号').max(40),
      }),
      req.body,
    );
    const db = getDb();
    const order = db.prepare('SELECT * FROM orders WHERE id=?').get(req.params.id);
    if (!order) throw notFound('订单不存在');
    if (order.merchant_id !== req.user.id) throw forbidden('只有商家可以发货');
    if (order.status !== 'paid') throw badRequest('订单需在收款后才能发货');
    db.prepare(
      "UPDATE orders SET status='shipped', tracking_company=?, tracking_no=?, shipped_at=datetime('now','localtime'), updated_at=datetime('now','localtime') WHERE id=?",
    ).run(body.trackingCompany, body.trackingNo, order.id);
    notify(order.user_id, { type: 'order', title: '商家已发货', body: `${body.trackingCompany} ${body.trackingNo}`, link: `/orders/${order.id}` });
    hub.send(order.user_id, 'order', { id: order.id, status: 'shipped' });
    res.json({ ok: true, status: 'shipped' });
  }),
);

router.post(
  '/orders/:id/receive',
  requireAuth,
  asyncHandler(async (req, res) => {
    const db = getDb();
    const order = db.prepare('SELECT * FROM orders WHERE id=?').get(req.params.id);
    if (!order) throw notFound('订单不存在');
    if (order.user_id !== req.user.id) throw forbidden('无权操作该订单');
    if (order.status !== 'shipped') throw badRequest('订单尚未发货');
    db.prepare("UPDATE orders SET status='completed', completed_at=datetime('now','localtime'), updated_at=datetime('now','localtime') WHERE id=?").run(order.id);
    notify(order.merchant_id, { type: 'order', title: '买家已确认收货', body: `订单 ${order.order_no} 已完成`, link: `/merchant/orders` });
    hub.send(order.merchant_id, 'order', { id: order.id, status: 'completed' });
    res.json({ ok: true, status: 'completed' });
  }),
);

router.post(
  '/orders/:id/cancel',
  requireAuth,
  asyncHandler(async (req, res) => {
    const db = getDb();
    const order = db.prepare('SELECT * FROM orders WHERE id=?').get(req.params.id);
    if (!order) throw notFound('订单不存在');
    if (order.user_id !== req.user.id && order.merchant_id !== req.user.id && req.user.role !== 'admin') throw forbidden('无权取消该订单');
    if (order.status !== 'pending_payment') throw badRequest('仅未支付订单可取消');
    db.transaction(() => {
      db.prepare("UPDATE orders SET status='cancelled', cancelled_at=datetime('now','localtime'), updated_at=datetime('now','localtime') WHERE id=?").run(order.id);
      const items = db.prepare('SELECT * FROM order_items WHERE order_id=?').all(order.id);
      const back = db.prepare("UPDATE products SET stock=stock+?, updated_at=datetime('now','localtime') WHERE id=?");
      for (const it of items) back.run(it.quantity, it.product_id);
    })();
    res.json({ ok: true, status: 'cancelled' });
  }),
);

router.post(
  '/orders/:id/refund',
  requireAuth,
  asyncHandler(async (req, res) => {
    const body = parse(z.object({ amount: z.number().positive().max(1_000_000).optional(), reason: z.string().trim().min(5, '请说明售后原因').max(300) }), req.body);
    const db = getDb();
    const order = db.prepare('SELECT * FROM orders WHERE id=?').get(req.params.id);
    if (!order) throw notFound('订单不存在');
    if (order.user_id !== req.user.id) throw forbidden('只有买家可以申请售后');
    if (!['paid', 'shipped', 'completed'].includes(order.status)) throw badRequest('当前订单状态不可申请售后');
    if (db.prepare("SELECT id FROM refunds WHERE order_id=? AND status IN ('requested','approved')").get(order.id)) throw conflict('该订单已有进行中的售后申请');
    const amount = money(body.amount || order.total);
    if (amount > order.total) throw badRequest('退款金额不能超过订单金额');
    const paid = db.prepare("SELECT * FROM payments WHERE order_id=? AND status='succeeded' ORDER BY id DESC LIMIT 1").get(order.id);
    db.transaction(() => {
      db.prepare('INSERT INTO refunds (order_id, payment_id, amount, reason) VALUES (?,?,?,?)').run(order.id, paid?.id ?? null, amount, body.reason);
      db.prepare("UPDATE orders SET status='refunding', updated_at=datetime('now','localtime') WHERE id=?").run(order.id);
    })();
    notify(order.merchant_id, { type: 'refund', title: '收到售后申请', body: `订单 ${order.order_no}：${body.reason.slice(0, 50)}`, link: '/merchant/orders' });
    for (const a of db.prepare("SELECT id FROM users WHERE role='admin'").all()) {
      notify(a.id, { type: 'refund', title: '售后申请待处理', body: `订单 ${order.order_no}`, link: '/admin/refunds' });
    }
    res.status(201).json({ ok: true, amount });
  }),
);

router.post(
  '/orders/:id/review',
  requireAuth,
  asyncHandler(async (req, res) => {
    const body = parse(z.object({ rating: z.number().int().min(1).max(5), content: z.string().trim().max(500).optional() }), req.body);
    const db = getDb();
    const order = db.prepare('SELECT * FROM orders WHERE id=?').get(req.params.id);
    if (!order) throw notFound('订单不存在');
    if (order.user_id !== req.user.id) throw forbidden('无权评价');
    if (order.status !== 'completed') throw badRequest('订单完成后才能评价');
    if (db.prepare('SELECT id FROM reviews WHERE order_id=?').get(order.id)) throw conflict('该订单已评价');
    const items = db.prepare('SELECT * FROM order_items WHERE order_id=?').all(order.id);
    if (!items.length) throw badRequest('订单无商品');
    db.prepare("INSERT INTO reviews (user_id, target_type, target_id, order_id, rating, content) VALUES (?, 'product', ?, ?, ?, ?)").run(
      req.user.id,
      items[0].product_id,
      order.id,
      body.rating,
      body.content || null,
    );
    res.status(201).json({ ok: true });
  }),
);

/* 商家工作台：商品与订单 */
router.get(
  '/merchant/products',
  requireAuth,
  requireMerchant,
  asyncHandler(async (req, res) => {
    const db = getDb();
    const rows = db.prepare(`${productSql} WHERE p.merchant_id=? ORDER BY p.id DESC`).all(req.user.id);
    const imgStmt = db.prepare(
      'SELECT u.id, u.storage_key FROM product_images pi JOIN uploads u ON u.id=pi.upload_id WHERE pi.product_id=? ORDER BY pi.sort',
    );
    res.json({
      items: rows.map((r) => ({
        ...productRow(r),
        images: imgStmt.all(r.id).map((i) => ({ id: i.id, url: `/uploads/${i.storage_key.split('\\').join('/')}` })),
      })),
    });
  }),
);

export default router;
export { productRow, CATEGORIES, FREE_SHIPPING_THRESHOLD, SHIPPING_FEE };
