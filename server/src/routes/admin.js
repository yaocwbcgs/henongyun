import { Router } from 'express';
import { z } from 'zod';
import { getDb } from '../db/index.js';
import { parse } from '../lib/validate.js';
import { badRequest, conflict, notFound, serviceUnavailable } from '../lib/errors.js';
import { requireRole } from '../middleware/auth.js';
import { asyncHandler } from '../middleware/error.js';
import { notify } from '../services/notify.js';
import { hub } from '../realtime/hub.js';
import { verifyTransport, mailerReady } from '../services/mailer.js';
import { recognitionStatus, healthyCheck } from '../services/recognition.js';
import { paymentStatus, refundPayment } from '../services/payments.js';
import { syncMarketSource } from '../jobs/marketSync.js';
import config from '../config.js';
import { logger } from '../lib/logger.js';

const router = Router();
router.use(requireRole('admin'));

function audit(req, action, targetType, targetId, detail) {
  getDb()
    .prepare('INSERT INTO audit_logs (actor_id, action, target_type, target_id, detail, ip) VALUES (?,?,?,?,?,?)')
    .run(req.user.id, action, targetType, String(targetId ?? ''), typeof detail === 'string' ? detail : JSON.stringify(detail || {}), req.ip);
}

/* ---------------- 概览 ---------------- */
router.get(
  '/stats',
  asyncHandler(async (_req, res) => {
    const db = getDb();
    const one = (sql, ...args) => db.prepare(sql).get(...args)?.c ?? 0;
    const gmv = db.prepare("SELECT COALESCE(SUM(total),0) s FROM orders WHERE status IN ('paid','shipped','completed')").get().s;
    const trend = [];
    for (let i = 6; i >= 0; i--) {
      const offset = `-${i} days`;
      const day = db
        .prepare(
          `SELECT date('now','localtime', ?) AS d,
            (SELECT COUNT(*) FROM orders WHERE date(created_at)=date('now','localtime', ?)) AS orders,
            (SELECT COALESCE(SUM(total),0) FROM orders WHERE date(created_at)=date('now','localtime', ?) AND status IN ('paid','shipped','completed')) AS gmv,
            (SELECT COUNT(*) FROM posts WHERE date(created_at)=date('now','localtime', ?)) AS posts,
            (SELECT COUNT(*) FROM diagnoses WHERE date(created_at)=date('now','localtime', ?)) AS diagnoses`,
        )
        .get(offset, offset, offset, offset, offset);
      trend.push({ date: day.d, orders: day.orders, gmv: day.gmv, posts: day.posts, diagnoses: day.diagnoses });
    }
    res.json({
      users: one('SELECT COUNT(*) c FROM users'),
      merchants: one("SELECT COUNT(*) c FROM merchant_profiles WHERE status='approved'"),
      pendingMerchants: one("SELECT COUNT(*) c FROM merchant_profiles WHERE status='pending'"),
      pendingPosts: one("SELECT COUNT(*) c FROM posts WHERE status='pending'"),
      pendingPrices: one("SELECT COUNT(*) c FROM market_prices WHERE status='pending'"),
      openAdvisories: one("SELECT COUNT(*) c FROM advisories WHERE status IN ('open','accepted')"),
      openComplaints: one("SELECT COUNT(*) c FROM complaints WHERE status='open'"),
      pendingRefunds: one("SELECT COUNT(*) c FROM refunds WHERE status='requested'"),
      orders: one('SELECT COUNT(*) c FROM orders'),
      gmv: Math.round(gmv * 100) / 100,
      bookings: one('SELECT COUNT(*) c FROM bookings'),
      diagnoses: one('SELECT COUNT(*) c FROM diagnoses'),
      trend,
      integrations: integrationState(),
    });
  }),
);

function integrationState() {
  return {
    email: { configured: config.integrations.email, provider: 'SMTP', required: ['SMTP_HOST', 'SMTP_USER', 'SMTP_PASS'] },
    recognition: { configured: config.integrations.recognition, provider: 'Plant.id v3', required: ['PLANTID_API_KEY'] },
    payment: { configured: config.integrations.payment, provider: 'Stripe Checkout', required: ['STRIPE_SECRET_KEY', 'STRIPE_WEBHOOK_SECRET'] },
    marketApi: { configured: config.integrations.marketApi, provider: config.market.apiUrl ? '自定义行情 API' : '未配置', required: ['MARKET_API_URL', 'MARKET_API_KEY'] },
    storage: { configured: true, provider: '本地磁盘（可切换对象存储）' },
  };
}

router.get(
  '/integrations',
  asyncHandler(async (_req, res) => {
    res.json({
      integrations: integrationState(),
      recognition: recognitionStatus(),
      payment: paymentStatus(),
      mail: { configured: mailerReady() },
    });
  }),
);

router.post(
  '/integrations/test',
  asyncHandler(async (req, res) => {
    const { target } = parse(z.object({ target: z.enum(['email', 'recognition', 'payment']) }), req.body);
    if (target === 'email') {
      if (!mailerReady()) throw serviceUnavailable('SMTP 未配置，请先填写 SMTP_HOST / SMTP_USER / SMTP_PASS');
      const result = await verifyTransport();
      return res.json({ target, ...result });
    }
    if (target === 'recognition') {
      if (!config.integrations.recognition) throw serviceUnavailable('识别服务未配置，请填写 PLANTID_API_KEY');
      const result = await healthyCheck();
      return res.json({ target, ...result });
    }
    if (target === 'payment') {
      if (!config.integrations.payment) throw serviceUnavailable('支付服务未配置，请填写 STRIPE_SECRET_KEY');
      const r = await fetch('https://api.stripe.com/v1/balance', {
        headers: { Authorization: `Bearer ${config.payment.stripeSecret}` },
        signal: AbortSignal.timeout(15_000),
      });
      const body = await r.json().catch(() => ({}));
      return res.json({ target, ok: r.ok, status: r.status, livemode: body?.livemode ?? null });
    }
    throw badRequest('未知的检查目标');
  }),
);

/* ---------------- 用户与角色 ---------------- */
router.get(
  '/users',
  asyncHandler(async (req, res) => {
    const db = getDb();
    const q = req.query.q ? `%${String(req.query.q).replace(/[\\%_]/g, (c) => `\\${c}`)}%` : null;
    const role = req.query.role;
    const rows = db
      .prepare(
        `SELECT u.id, u.name, u.email, u.phone, u.role, u.status, u.region, u.created_at,
          (SELECT COUNT(*) FROM posts WHERE user_id=u.id) posts,
          (SELECT COUNT(*) FROM orders WHERE user_id=u.id) orders,
          mp.shop_name, mp.status AS merchant_status
         FROM users u LEFT JOIN merchant_profiles mp ON mp.user_id=u.id
         WHERE (? IS NULL OR u.name LIKE ? ESCAPE '\\' OR u.email LIKE ? ESCAPE '\\')
           AND (? IS NULL OR u.role=?)
         ORDER BY u.id DESC LIMIT 200`,
      )
      .all(q, q, q, role || null, role || null);
    res.json({ items: rows });
  }),
);

router.patch(
  '/users/:id',
  asyncHandler(async (req, res) => {
    const body = parse(
      z.object({ role: z.enum(['user', 'merchant', 'agronomist', 'admin']).optional(), status: z.enum(['active', 'disabled']).optional() }),
      req.body,
    );
    const db = getDb();
    const user = db.prepare('SELECT * FROM users WHERE id=?').get(req.params.id);
    if (!user) throw notFound('用户不存在');
    if (user.id === req.user.id && body.status === 'disabled') throw badRequest('不能停用自己的账号');
    if (user.id === req.user.id && body.role && body.role !== 'admin') throw badRequest('不能解除自己的管理员角色');
    db.transaction(() => {
      if (body.role) db.prepare('UPDATE users SET role=?, updated_at=datetime(\'now\',\'localtime\') WHERE id=?').run(body.role, user.id);
      if (body.status) db.prepare('UPDATE users SET status=?, updated_at=datetime(\'now\',\'localtime\') WHERE id=?').run(body.status, user.id);
      if (body.status === 'disabled') db.prepare("UPDATE refresh_tokens SET revoked_at=datetime('now','localtime') WHERE user_id=? AND revoked_at IS NULL").run(user.id);
    })();
    audit(req, 'user.update', 'user', user.id, body);
    res.json({ ok: true });
  }),
);

/* ---------------- 商家审核 ---------------- */
router.get(
  '/merchants',
  asyncHandler(async (_req, res) => {
    const rows = getDb()
      .prepare(
        `SELECT mp.*, u.name, u.email, u.phone AS user_phone, u.role FROM merchant_profiles mp JOIN users u ON u.id=mp.user_id
         ORDER BY CASE mp.status WHEN 'pending' THEN 0 ELSE 1 END, mp.applied_at DESC LIMIT 200`,
      )
      .all();
    res.json({ items: rows });
  }),
);

router.post(
  '/merchants/:id/review',
  asyncHandler(async (req, res) => {
    const body = parse(z.object({ action: z.enum(['approve', 'reject']), note: z.string().trim().max(300).optional() }), req.body);
    const db = getDb();
    const profile = db.prepare('SELECT * FROM merchant_profiles WHERE user_id=?').get(req.params.id);
    if (!profile) throw notFound('入驻申请不存在');
    if (profile.status !== 'pending') throw badRequest('该申请已处理');
    const status = body.action === 'approve' ? 'approved' : 'rejected';
    db.transaction(() => {
      db.prepare("UPDATE merchant_profiles SET status=?, review_note=?, reviewed_by=?, reviewed_at=datetime('now','localtime') WHERE user_id=?").run(
        status,
        body.note || null,
        req.user.id,
        profile.user_id,
      );
      if (body.action === 'approve') db.prepare("UPDATE users SET role='merchant' WHERE id=? AND role='user'").run(profile.user_id);
      else db.prepare("UPDATE users SET role='user' WHERE id=? AND role='merchant'").run(profile.user_id);
    })();
    notify(profile.user_id, {
      type: 'merchant',
      title: body.action === 'approve' ? '商家入驻已通过' : '商家入驻未通过',
      body: body.action === 'approve' ? '你现在可以发布商品、管理农机并处理订单。' : body.note || '请补充资质材料后重新提交',
      link: '/merchant',
    });
    hub.send(profile.user_id, 'merchant', { status });
    audit(req, `merchant.${body.action}`, 'merchant', profile.user_id, body.note);
    res.json({ ok: true, status });
  }),
);

/* ---------------- 供需审核 ---------------- */
router.get(
  '/posts',
  asyncHandler(async (req, res) => {
    const status = req.query.status;
    const rows = getDb()
      .prepare(
        `SELECT p.*, u.name AS owner_name, mp.shop_name
         FROM posts p JOIN users u ON u.id=p.user_id LEFT JOIN merchant_profiles mp ON mp.user_id=u.id
         WHERE (? IS NULL OR p.status=?) ORDER BY CASE p.status WHEN 'pending' THEN 0 ELSE 1 END, p.id DESC LIMIT 200`,
      )
      .all(status || null, status || null);
    res.json({ items: rows });
  }),
);

router.post(
  '/posts/:id/review',
  asyncHandler(async (req, res) => {
    const body = parse(z.object({ action: z.enum(['approve', 'reject']), reason: z.string().trim().max(300).optional() }), req.body);
    const db = getDb();
    const post = db.prepare('SELECT * FROM posts WHERE id=?').get(req.params.id);
    if (!post) throw notFound('信息不存在');
    if (post.status !== 'pending') throw badRequest('该信息不在待审核状态');
    if (body.action === 'reject' && !body.reason) throw badRequest('驳回需填写原因');
    const status = body.action === 'approve' ? 'active' : 'rejected';
    db.prepare("UPDATE posts SET status=?, reject_reason=?, updated_at=datetime('now','localtime') WHERE id=?").run(status, body.reason || null, post.id);
    notify(post.user_id, {
      type: 'review',
      title: body.action === 'approve' ? '供需信息已通过审核' : '供需信息未通过审核',
      body: body.action === 'approve' ? post.title : body.reason,
      link: body.action === 'approve' ? `/market/${post.id}` : '/me/posts',
    });
    audit(req, `post.${body.action}`, 'post', post.id, body.reason);
    res.json({ ok: true, status });
  }),
);

/* ---------------- 商品 / 农机资源 ---------------- */
router.get(
  '/products',
  asyncHandler(async (_req, res) => {
    const rows = getDb()
      .prepare(
        `SELECT p.*, mp.shop_name FROM products p LEFT JOIN merchant_profiles mp ON mp.user_id=p.merchant_id ORDER BY p.id DESC LIMIT 300`,
      )
      .all();
    res.json({ items: rows });
  }),
);

router.patch(
  '/products/:id',
  asyncHandler(async (req, res) => {
    const body = parse(z.object({ status: z.enum(['active', 'inactive']).optional(), stock: z.number().int().min(0).max(1_000_000).optional() }), req.body);
    const db = getDb();
    const p = db.prepare('SELECT * FROM products WHERE id=?').get(req.params.id);
    if (!p) throw notFound('商品不存在');
    db.prepare("UPDATE products SET status=COALESCE(?,status), stock=COALESCE(?,stock), updated_at=datetime('now','localtime') WHERE id=?").run(
      body.status || null,
      body.stock ?? null,
      p.id,
    );
    if (body.status && body.status !== p.status) {
      notify(p.merchant_id, { type: 'review', title: body.status === 'active' ? '商品已恢复上架' : '商品已被下架', body: p.name, link: '/merchant/products' });
    }
    audit(req, 'product.update', 'product', p.id, body);
    res.json({ ok: true });
  }),
);

router.get(
  '/machinery',
  asyncHandler(async (_req, res) => {
    const rows = getDb()
      .prepare(
        `SELECT m.*, mp.shop_name FROM machinery m LEFT JOIN merchant_profiles mp ON mp.user_id=m.merchant_id ORDER BY m.id DESC LIMIT 300`,
      )
      .all();
    res.json({ items: rows });
  }),
);

router.patch(
  '/machinery/:id',
  asyncHandler(async (req, res) => {
    const body = parse(z.object({ status: z.enum(['active', 'inactive']) }), req.body);
    const db = getDb();
    const m = db.prepare('SELECT * FROM machinery WHERE id=?').get(req.params.id);
    if (!m) throw notFound('设备不存在');
    db.prepare("UPDATE machinery SET status=?, updated_at=datetime('now','localtime') WHERE id=?").run(body.status, m.id);
    audit(req, 'machinery.status', 'machinery', m.id, body);
    res.json({ ok: true });
  }),
);

/* ---------------- 预约 / 订单 / 支付 ---------------- */
router.get(
  '/bookings',
  asyncHandler(async (_req, res) => {
    const rows = getDb()
      .prepare(
        `SELECT b.*, m.name AS machinery_name, u.name AS user_name, mu.name AS merchant_name
         FROM bookings b JOIN machinery m ON m.id=b.machinery_id JOIN users u ON u.id=b.user_id JOIN users mu ON mu.id=b.merchant_id
         ORDER BY b.id DESC LIMIT 300`,
      )
      .all();
    res.json({ items: rows });
  }),
);

router.get(
  '/orders',
  asyncHandler(async (_req, res) => {
    const rows = getDb()
      .prepare(
        `SELECT o.*, u.name AS buyer_name, mp.shop_name,
          (SELECT COUNT(*) FROM order_items oi WHERE oi.order_id=o.id) item_count
         FROM orders o JOIN users u ON u.id=o.user_id LEFT JOIN merchant_profiles mp ON mp.user_id=o.merchant_id
         ORDER BY o.id DESC LIMIT 300`,
      )
      .all();
    res.json({ items: rows });
  }),
);

router.get(
  '/payments',
  asyncHandler(async (_req, res) => {
    const rows = getDb()
      .prepare(
        `SELECT p.*, o.order_no, u.name AS buyer_name FROM payments p
         JOIN orders o ON o.id=p.order_id JOIN users u ON u.id=o.user_id ORDER BY p.id DESC LIMIT 300`,
      )
      .all();
    res.json({ items: rows });
  }),
);

router.get(
  '/refunds',
  asyncHandler(async (_req, res) => {
    const rows = getDb()
      .prepare(
        `SELECT r.*, o.order_no, o.total AS order_total, u.name AS buyer_name, mp.shop_name
         FROM refunds r JOIN orders o ON o.id=r.order_id JOIN users u ON u.id=o.user_id
         LEFT JOIN merchant_profiles mp ON mp.user_id=o.merchant_id ORDER BY r.id DESC LIMIT 200`,
      )
      .all();
    res.json({ items: rows });
  }),
);

router.post(
  '/refunds/:id/process',
  asyncHandler(async (req, res) => {
    const body = parse(z.object({ action: z.enum(['approve', 'reject', 'mark_refunded']), note: z.string().trim().max(300).optional() }), req.body);
    const db = getDb();
    const refund = db.prepare('SELECT * FROM refunds WHERE id=?').get(req.params.id);
    if (!refund) throw notFound('售后申请不存在');
    const order = db.prepare('SELECT * FROM orders WHERE id=?').get(refund.order_id);

    if (body.action === 'reject') {
      if (refund.status !== 'requested') throw badRequest('该申请已处理');
      db.transaction(() => {
        db.prepare("UPDATE refunds SET status='rejected', admin_note=?, updated_at=datetime('now','localtime') WHERE id=?").run(body.note || null, refund.id);
        db.prepare("UPDATE orders SET status='paid', updated_at=datetime('now','localtime') WHERE id=?").run(order.id);
      })();
      notify(order.user_id, { type: 'refund', title: '售后申请未通过', body: body.note || '如有疑问请联系平台客服', link: `/orders/${order.id}` });
      audit(req, 'refund.reject', 'refund', refund.id, body.note);
      return res.json({ ok: true, status: 'rejected' });
    }

    if (body.action === 'mark_refunded') {
      if (refund.status === 'refunded') return res.json({ ok: true, status: 'refunded' });
      db.transaction(() => {
        db.prepare("UPDATE refunds SET status='refunded', admin_note=?, updated_at=datetime('now','localtime') WHERE id=?").run(body.note || '线下退款已完成', refund.id);
        db.prepare("UPDATE orders SET status='refunded', updated_at=datetime('now','localtime') WHERE id=?").run(order.id);
        if (refund.payment_id) db.prepare("UPDATE payments SET status='refunded' WHERE id=?").run(refund.payment_id);
      })();
      notify(order.user_id, { type: 'refund', title: '退款已完成', body: `订单 ${order.order_no} 退款 ¥${refund.amount.toFixed(2)}`, link: `/orders/${order.id}` });
      audit(req, 'refund.mark_refunded', 'refund', refund.id, body.note);
      return res.json({ ok: true, status: 'refunded' });
    }

    // approve：优先调用支付服务原路退款
    if (refund.status !== 'requested') throw badRequest('该申请已处理');
    const payment = refund.payment_id ? db.prepare('SELECT * FROM payments WHERE id=?').get(refund.payment_id) : null;
    let autoRefund = null;
    if (payment?.provider === 'stripe' && config.integrations.payment) {
      try {
        const raw = payment.raw ? JSON.parse(payment.raw) : {};
        if (raw.payment_intent) {
          autoRefund = await refundPayment(raw.payment_intent, refund.amount);
        }
      } catch (err) {
        logger.error('refund.stripe_failed', { refundId: refund.id, message: err.message });
      }
    }
    const finalStatus = autoRefund ? 'refunded' : 'approved';
    db.transaction(() => {
      db.prepare("UPDATE refunds SET status=?, admin_note=?, updated_at=datetime('now','localtime') WHERE id=?").run(
        finalStatus,
        body.note || (autoRefund ? `Stripe 退款 ${autoRefund.id}` : '已批准，待财务执行退款'),
        refund.id,
      );
      if (autoRefund) {
        db.prepare("UPDATE orders SET status='refunded', updated_at=datetime('now','localtime') WHERE id=?").run(order.id);
        if (refund.payment_id) db.prepare("UPDATE payments SET status='refunded' WHERE id=?").run(refund.payment_id);
      }
    })();
    notify(order.user_id, {
      type: 'refund',
      title: autoRefund ? '退款已原路退回' : '退款申请已批准',
      body: autoRefund ? `¥${refund.amount.toFixed(2)} 已提交至支付渠道` : '财务将在 1-3 个工作日处理',
      link: `/orders/${order.id}`,
    });
    audit(req, 'refund.approve', 'refund', refund.id, { auto: Boolean(autoRefund) });
    res.json({ ok: true, status: finalStatus, autoRefund: Boolean(autoRefund) });
  }),
);

/* ---------------- 识别 / 知识库 ---------------- */
router.get(
  '/diagnoses',
  asyncHandler(async (req, res) => {
    const rows = getDb()
      .prepare(
        `SELECT d.id, d.crop, d.status, d.provider, d.created_at, d.failure_reason, u.name AS user_name,
          (SELECT COUNT(*) FROM advisories a WHERE a.diagnosis_id=d.id) advisories
         FROM diagnoses d JOIN users u ON u.id=d.user_id ORDER BY d.id DESC LIMIT 200`,
      )
      .all();
    res.json({ items: rows, recognition: recognitionStatus() });
  }),
);

router.get(
  '/knowledge',
  asyncHandler(async (_req, res) => {
    const rows = getDb().prepare('SELECT * FROM knowledge_articles ORDER BY id DESC').all();
    res.json({ items: rows });
  }),
);

const knowledgeSchema = z.object({
  title: z.string().trim().min(4).max(80),
  slug: z.string().trim().regex(/^[a-z0-9-]{3,80}$/, 'slug 仅支持小写字母、数字和连字符').optional(),
  crop: z.string().trim().min(1).max(20),
  category: z.string().trim().min(2).max(30),
  summary: z.string().trim().min(10).max(300),
  content: z.string().trim().min(50, '正文至少 50 个字'),
  symptoms: z.string().trim().max(1000).optional(),
  conditions: z.string().trim().max(1000).optional(),
  sourceName: z.string().trim().min(2, '必须注明资料来源').max(120),
  sourceUrl: z.string().trim().url('来源链接格式不正确').optional().or(z.literal('')),
  coverUrl: z.string().trim().max(300).optional(),
  status: z.enum(['draft', 'published', 'archived']).optional(),
});

function slugify(title) {
  return `kb-${Date.now().toString(36)}`;
}

router.post(
  '/knowledge',
  asyncHandler(async (req, res) => {
    const body = parse(knowledgeSchema, req.body);
    const db = getDb();
    const slug = body.slug || slugify(body.title);
    const info = db
      .prepare(
        `INSERT INTO knowledge_articles (slug, title, crop, category, summary, content, symptoms, conditions, source_name, source_url, cover_url, status, reviewed_by, reviewed_at)
         VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?, CASE WHEN ?='published' THEN datetime('now','localtime') END)`,
      )
      .run(slug, body.title, body.crop, body.category, body.summary, body.content, body.symptoms || null, body.conditions || null, body.sourceName, body.sourceUrl || null, body.coverUrl || null, body.status || 'draft', req.user.id, body.status || 'draft');
    audit(req, 'knowledge.create', 'knowledge', info.lastInsertRowid, { title: body.title, source: body.sourceName });
    res.status(201).json({ id: Number(info.lastInsertRowid), slug });
  }),
);

router.put(
  '/knowledge/:id',
  asyncHandler(async (req, res) => {
    const body = parse(knowledgeSchema, req.body);
    const db = getDb();
    const row = db.prepare('SELECT * FROM knowledge_articles WHERE id=?').get(req.params.id);
    if (!row) throw notFound('文章不存在');
    db.prepare(
      `UPDATE knowledge_articles SET title=?, crop=?, category=?, summary=?, content=?, symptoms=?, conditions=?, source_name=?, source_url=?, cover_url=?, status=?,
       reviewed_by=?, reviewed_at=CASE WHEN ?='published' THEN datetime('now','localtime') ELSE reviewed_at END WHERE id=?`,
    ).run(body.title, body.crop, body.category, body.summary, body.content, body.symptoms || null, body.conditions || null, body.sourceName, body.sourceUrl || null, body.coverUrl || null, body.status || row.status, req.user.id, body.status || row.status, row.id);
    audit(req, 'knowledge.update', 'knowledge', row.id, { title: body.title });
    res.json({ ok: true });
  }),
);

/* ---------------- 行情 ---------------- */
router.get(
  '/market/sources',
  asyncHandler(async (_req, res) => {
    res.json({ items: getDb().prepare('SELECT * FROM market_sources ORDER BY id').all() });
  }),
);

router.post(
  '/market/sources',
  asyncHandler(async (req, res) => {
    const body = parse(
      z.object({
        name: z.string().trim().min(2).max(60),
        code: z.string().trim().regex(/^[a-z0-9_-]{2,40}$/),
        kind: z.enum(['manual', 'api']),
        url: z.string().trim().url().optional().or(z.literal('')),
        note: z.string().trim().max(300).optional(),
      }),
      req.body,
    );
    const db = getDb();
    if (db.prepare('SELECT id FROM market_sources WHERE code=?').get(body.code)) throw conflict('来源编码已存在');
    const info = db
      .prepare('INSERT INTO market_sources (code, name, kind, url, note) VALUES (?,?,?,?,?)')
      .run(body.code, body.name, body.kind, body.url || null, body.note || null);
    audit(req, 'market.source_create', 'market_source', info.lastInsertRowid, body);
    res.status(201).json({ id: Number(info.lastInsertRowid) });
  }),
);

router.post(
  '/market/sync',
  asyncHandler(async (req, res) => {
    const body = parse(z.object({ sourceId: z.number().int().positive() }), req.body);
    const db = getDb();
    const source = db.prepare('SELECT * FROM market_sources WHERE id=?').get(body.sourceId);
    if (!source) throw notFound('行情来源不存在');
    if (source.kind !== 'api') throw badRequest('该来源为人工导入，请使用录入或 CSV 导入');
    if (!config.integrations.marketApi) {
      throw serviceUnavailable('行情 API 尚未配置（MARKET_API_URL / MARKET_API_KEY），可先使用人工导入并审核。');
    }
    const result = await syncMarketSource(source);
    res.json(result);
  }),
);

router.get(
  '/market/prices',
  asyncHandler(async (req, res) => {
    const status = req.query.status;
    const rows = getDb()
      .prepare(
        `SELECT p.*, s.name AS source_name, u.name AS importer FROM market_prices p
         JOIN market_sources s ON s.id=p.source_id LEFT JOIN users u ON u.id=p.imported_by
         WHERE (? IS NULL OR p.status=?) ORDER BY CASE p.status WHEN 'pending' THEN 0 ELSE 1 END, p.id DESC LIMIT 300`,
      )
      .all(status || null, status || null);
    res.json({ items: rows });
  }),
);

const priceSchema = z.object({
  sourceId: z.number().int().positive(),
  crop: z.string().trim().min(1).max(20),
  variety: z.string().trim().max(30).optional(),
  spec: z.string().trim().max(40).optional(),
  grade: z.string().trim().max(30).optional(),
  province: z.string().trim().min(2).max(30),
  market: z.string().trim().min(2).max(60),
  price: z.number().positive().max(1_000_000),
  unit: z.string().trim().min(1).max(10),
  quoteBasis: z.string().trim().min(2, '请填写报价口径，如“中等规格批发价”').max(60),
  collectedAt: z.string().trim().min(10).max(19),
});

router.post(
  '/market/prices',
  asyncHandler(async (req, res) => {
    const body = parse(priceSchema, req.body);
    const db = getDb();
    const source = db.prepare('SELECT * FROM market_sources WHERE id=?').get(body.sourceId);
    if (!source) throw notFound('行情来源不存在');
    const info = db
      .prepare(
        `INSERT INTO market_prices (source_id, crop, variety, spec, grade, province, market, price, unit, quote_basis, collected_at, status, imported_by)
         VALUES (?,?,?,?,?,?,?,?,?,?,?, 'pending', ?)`,
      )
      .run(body.sourceId, body.crop, body.variety || null, body.spec || null, body.grade || null, body.province, body.market, body.price, body.unit, body.quoteBasis, body.collectedAt, req.user.id);
    audit(req, 'market.price_create', 'market_price', info.lastInsertRowid, { crop: body.crop, price: body.price });
    res.status(201).json({ id: Number(info.lastInsertRowid), status: 'pending' });
  }),
);

router.post(
  '/market/prices/import',
  asyncHandler(async (req, res) => {
    const body = parse(
      z.object({ sourceId: z.number().int().positive(), csv: z.string().min(10).max(500_000) }),
      req.body,
    );
    const db = getDb();
    const source = db.prepare('SELECT * FROM market_sources WHERE id=?').get(body.sourceId);
    if (!source) throw notFound('行情来源不存在');
    const lines = body.csv.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
    const header = lines.shift();
    if (!header) throw badRequest('CSV 内容为空');
    const cols = header.split(',').map((c) => c.trim());
    const required = ['crop', 'province', 'market', 'price', 'unit', 'quoteBasis', 'collectedAt'];
    const missing = required.filter((c) => !cols.includes(c));
    if (missing.length) throw badRequest(`CSV 缺少列：${missing.join('、')}`);
    const rows = [];
    const errors = [];
    lines.forEach((line, idx) => {
      const values = line.split(',').map((v) => v.trim());
      const rec = Object.fromEntries(cols.map((c, i) => [c, values[i] ?? '']));
      const price = Number(rec.price);
      if (!rec.crop || !rec.province || !rec.market || !Number.isFinite(price) || price <= 0 || !rec.unit || !rec.quoteBasis || !rec.collectedAt) {
        errors.push({ line: idx + 2, reason: '字段缺失或价格无效' });
        return;
      }
      rows.push(rec);
    });
    let inserted = 0;
    let duplicated = 0;
    const stmt = db.prepare(
      `INSERT INTO market_prices (source_id, crop, variety, spec, grade, province, market, price, unit, quote_basis, collected_at, status, imported_by)
       VALUES (?,?,?,?,?,?,?,?,?,?,?, 'pending', ?)
       ON CONFLICT(source_id, crop, market, spec, collected_at) DO NOTHING`,
    );
    db.transaction(() => {
      for (const r of rows) {
        const res2 = stmt.run(
          body.sourceId,
          r.crop,
          r.variety || null,
          r.spec || null,
          r.grade || null,
          r.province,
          r.market,
          Number(r.price),
          r.unit,
          r.quoteBasis,
          r.collectedAt,
          req.user.id,
        );
        if (res2.changes) inserted++;
        else duplicated++;
      }
    })();
    audit(req, 'market.price_import', 'market_source', body.sourceId, { inserted, duplicated, invalid: errors.length });
    res.json({ inserted, duplicated, invalid: errors.length, errors: errors.slice(0, 20) });
  }),
);

router.post(
  '/market/prices/:id/review',
  asyncHandler(async (req, res) => {
    const body = parse(z.object({ action: z.enum(['approve', 'reject']), note: z.string().trim().max(200).optional() }), req.body);
    const db = getDb();
    const row = db.prepare('SELECT * FROM market_prices WHERE id=?').get(req.params.id);
    if (!row) throw notFound('行情记录不存在');
    if (row.status !== 'pending') throw badRequest('该记录已审核');
    db.prepare("UPDATE market_prices SET status=?, reviewed_by=?, reviewed_at=datetime('now','localtime') WHERE id=?").run(
      body.action === 'approve' ? 'approved' : 'rejected',
      req.user.id,
      row.id,
    );
    audit(req, `market.price_${body.action}`, 'market_price', row.id, body.note);
    res.json({ ok: true, status: body.action === 'approve' ? 'approved' : 'rejected' });
  }),
);

/* ---------------- 投诉 ---------------- */
router.get(
  '/complaints',
  asyncHandler(async (_req, res) => {
    const rows = getDb()
      .prepare(
        `SELECT c.*, u.name AS user_name FROM complaints c JOIN users u ON u.id=c.user_id
         ORDER BY CASE c.status WHEN 'open' THEN 0 ELSE 1 END, c.id DESC LIMIT 200`,
      )
      .all();
    res.json({ items: rows });
  }),
);

router.post(
  '/complaints/:id/handle',
  asyncHandler(async (req, res) => {
    const body = parse(
      z.object({ action: z.enum(['resolve', 'reject']), resolution: z.string().trim().min(5, '请填写处理结论').max(500) }),
      req.body,
    );
    const db = getDb();
    const row = db.prepare('SELECT * FROM complaints WHERE id=?').get(req.params.id);
    if (!row) throw notFound('投诉不存在');
    db.prepare("UPDATE complaints SET status=?, handled_by=?, resolution=?, updated_at=datetime('now','localtime') WHERE id=?").run(
      body.action === 'resolve' ? 'resolved' : 'rejected',
      req.user.id,
      body.resolution,
      row.id,
    );
    notify(row.user_id, { type: 'complaint', title: '投诉已处理', body: body.resolution, link: '/me' });
    audit(req, 'complaint.handle', 'complaint', row.id, body);
    res.json({ ok: true });
  }),
);

/* ---------------- 审计日志 ---------------- */
router.get(
  '/audit-logs',
  asyncHandler(async (_req, res) => {
    const rows = getDb()
      .prepare(
        `SELECT a.*, u.name AS actor_name FROM audit_logs a LEFT JOIN users u ON u.id=a.actor_id ORDER BY a.id DESC LIMIT 300`,
      )
      .all();
    res.json({ items: rows });
  }),
);

/* 运营报表（真实数据聚合） */
router.get(
  '/reports',
  asyncHandler(async (_req, res) => {
    const db = getDb();
    const byCategory = db
      .prepare(
        `SELECT p.category, COUNT(DISTINCT p.id) products, COALESCE(SUM(oi.quantity),0) sold, COALESCE(SUM(oi.subtotal),0) amount
         FROM products p LEFT JOIN order_items oi ON oi.product_id=p.id
         LEFT JOIN orders o ON o.id=oi.order_id AND o.status IN ('paid','shipped','completed')
         GROUP BY p.category ORDER BY amount DESC`,
      )
      .all();
    const byRegion = db
      .prepare(
        `SELECT province, COUNT(*) posts, SUM(CASE WHEN type='supply' THEN 1 ELSE 0 END) supply, SUM(CASE WHEN type='demand' THEN 1 ELSE 0 END) demand
         FROM posts WHERE status='active' GROUP BY province ORDER BY posts DESC LIMIT 12`,
      )
      .all();
    const diagnosisByCrop = db
      .prepare("SELECT crop, COUNT(*) total, SUM(CASE WHEN status='completed' THEN 1 ELSE 0 END) completed FROM diagnoses GROUP BY crop ORDER BY total DESC")
      .all();
    const bookingByStatus = db.prepare('SELECT status, COUNT(*) total FROM bookings GROUP BY status').all();
    res.json({ byCategory, byRegion, diagnosisByCrop, bookingByStatus });
  }),
);

export default router;
