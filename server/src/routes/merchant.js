import { Router } from 'express';
import { z } from 'zod';
import { getDb } from '../db/index.js';
import { parse } from '../lib/validate.js';
import { badRequest, conflict, notFound } from '../lib/errors.js';
import { requireAuth, requireMerchant } from '../middleware/auth.js';
import { asyncHandler } from '../middleware/error.js';
import { notify } from '../services/notify.js';

const router = Router();

router.get(
  '/profile',
  requireAuth,
  asyncHandler(async (req, res) => {
    const db = getDb();
    const profile = db.prepare('SELECT * FROM merchant_profiles WHERE user_id=?').get(req.user.id) || null;
    res.json({ profile, role: req.user.role });
  }),
);

router.post(
  '/apply',
  requireAuth,
  asyncHandler(async (req, res) => {
    const body = parse(
      z.object({
        shopName: z.string().trim().min(3, '店铺名称至少 3 个字').max(40),
        contactName: z.string().trim().min(2).max(30),
        contactPhone: z.string().trim().regex(/^1[3-9]\d{9}$/, '手机号格式不正确'),
        region: z.string().trim().min(2).max(60),
        businessType: z.enum(['农资经销', '农产品经纪', '农机服务', '合作社', '其他']),
        licenseNo: z.string().trim().max(40).optional(),
        intro: z.string().trim().max(500).optional(),
      }),
      req.body,
    );
    const db = getDb();
    const exists = db.prepare('SELECT * FROM merchant_profiles WHERE user_id=?').get(req.user.id);
    if (exists && exists.status === 'pending') throw conflict('入驻申请正在审核中，请耐心等待');
    if (exists && exists.status === 'approved') throw conflict('你已是认证商家');
    db.transaction(() => {
      if (exists) {
        db.prepare(
          `UPDATE merchant_profiles SET shop_name=?, contact_name=?, contact_phone=?, region=?, business_type=?, license_no=?, intro=?,
           status='pending', review_note=NULL, applied_at=datetime('now','localtime') WHERE user_id=?`,
        ).run(body.shopName, body.contactName, body.contactPhone, body.region, body.businessType, body.licenseNo || null, body.intro || null, req.user.id);
      } else {
        db.prepare(
          `INSERT INTO merchant_profiles (user_id, shop_name, contact_name, contact_phone, region, business_type, license_no, intro)
           VALUES (?,?,?,?,?,?,?,?)`,
        ).run(req.user.id, body.shopName, body.contactName, body.contactPhone, body.region, body.businessType, body.licenseNo || null, body.intro || null);
      }
      db.prepare("UPDATE users SET role='merchant' WHERE id=? AND role='user'").run(req.user.id);
    })();
    for (const a of db.prepare("SELECT id FROM users WHERE role='admin'").all()) {
      notify(a.id, { type: 'review', title: '新的商家入驻申请', body: `${body.shopName} · ${body.region}`, link: '/admin/merchants' });
    }
    res.status(201).json({ ok: true, status: 'pending' });
  }),
);

router.get(
  '/dashboard',
  requireAuth,
  requireMerchant,
  asyncHandler(async (req, res) => {
    const db = getDb();
    const uid = req.user.id;
    const one = (sql, ...args) => db.prepare(sql).get(...args)?.c ?? 0;
    const pendingOrders = one("SELECT COUNT(*) c FROM orders WHERE merchant_id=? AND status='paid'", uid);
    const pendingBookings = one("SELECT COUNT(*) c FROM bookings WHERE merchant_id=? AND status='pending'", uid);
    const activeProducts = one("SELECT COUNT(*) c FROM products WHERE merchant_id=? AND status='active'", uid);
    const activeMachinery = one("SELECT COUNT(*) c FROM machinery WHERE merchant_id=? AND status='active'", uid);
    const revenue = db
      .prepare("SELECT COALESCE(SUM(total),0) s FROM orders WHERE merchant_id=? AND status IN ('paid','shipped','completed')")
      .get(uid).s;
    const recentOrders = db
      .prepare('SELECT id, order_no, total, status, created_at FROM orders WHERE merchant_id=? ORDER BY id DESC LIMIT 5')
      .all(uid);
    const recentBookings = db
      .prepare(
        `SELECT b.id, b.order_no, b.date, b.start_hour, b.end_hour, b.status, m.name
         FROM bookings b JOIN machinery m ON m.id=b.machinery_id WHERE b.merchant_id=? ORDER BY b.id DESC LIMIT 5`,
      )
      .all(uid);
    const lowStock = db.prepare('SELECT id, name, spec, stock, unit FROM products WHERE merchant_id=? AND stock < 10 AND status=\'active\' ORDER BY stock ASC LIMIT 8').all(uid);
    res.json({ pendingOrders, pendingBookings, activeProducts, activeMachinery, revenue, recentOrders, recentBookings, lowStock });
  }),
);

export default router;
