import { Router } from 'express';
import { z } from 'zod';
import { getDb } from '../db/index.js';
import { parse, parsePagination, likeParam } from '../lib/validate.js';
import { badRequest, conflict, forbidden, notFound } from '../lib/errors.js';
import { requireAuth, requireMerchant, optionalAuth } from '../middleware/auth.js';
import { asyncHandler } from '../middleware/error.js';
import { notify } from '../services/notify.js';
import { hub } from '../realtime/hub.js';

const router = Router();
const WORK_START = 6;
const WORK_END = 19; // 6:00 - 18:59 可作业

const TYPES = ['拖拉机', '收割机', '植保无人机', '播种机', '插秧机', '烘干设备', '运输车辆', '其他'];

function money(n) {
  return Math.round(n * 100) / 100;
}

function feeFor(machine, { area, startHour, endHour }) {
  const hours = endHour - startHour;
  if (machine.pricing_type === 'per_mu') {
    if (!area) throw badRequest('按亩计价需填写作业面积');
    return money(machine.price * area);
  }
  if (machine.pricing_type === 'per_hour') return money(machine.price * hours);
  return money(machine.price);
}

function mapMachine(row) {
  return {
    id: row.id,
    merchantId: row.merchant_id,
    merchantName: row.merchant_name,
    shopName: row.shop_name,
    name: row.name,
    type: row.type,
    brand: row.brand,
    model: row.model,
    power: row.power,
    province: row.province,
    city: row.city,
    serviceArea: row.service_area,
    pricingType: row.pricing_type,
    price: row.price,
    description: row.description,
    status: row.status,
    coverUrl: row.cover_key ? `/uploads/${row.cover_key.split('\\').join('/')}` : null,
    imageUrls: row.image_keys ? row.image_keys.split(',').filter(Boolean).map((k) => `/uploads/${k.split('\\').join('/')}`) : [],
    rating: row.rating ?? null,
    reviewCount: row.review_count ?? 0,
    createdAt: row.created_at,
  };
}

const baseSql = `SELECT m.*, u.name AS merchant_name, mp.shop_name,
  (SELECT COUNT(*) FROM reviews r WHERE r.target_type='machinery' AND r.target_id=m.id) AS review_count,
  (SELECT ROUND(AVG(r.rating),1) FROM reviews r WHERE r.target_type='machinery' AND r.target_id=m.id) AS rating,
  (SELECT storage_key FROM uploads up JOIN machinery_images mi ON mi.upload_id=up.id
    WHERE mi.machinery_id=m.id ORDER BY mi.sort LIMIT 1) AS cover_key
  FROM machinery m JOIN users u ON u.id=m.merchant_id
  LEFT JOIN merchant_profiles mp ON mp.user_id=m.merchant_id`;

router.get(
  '/',
  asyncHandler(async (req, res) => {
    const { page, pageSize, offset } = parsePagination(req.query, 9);
    const { province, city, type, q, minPrice, maxPrice, sort, date } = req.query;
    const where = ["m.status = 'active'", "u.status = 'active'"];
    const args = [];
    if (province) {
      where.push('m.province = ?');
      args.push(province);
    }
    if (city) {
      where.push('m.city = ?');
      args.push(city);
    }
    if (type) {
      where.push('m.type = ?');
      args.push(type);
    }
    if (minPrice) {
      where.push('m.price >= ?');
      args.push(Number(minPrice));
    }
    if (maxPrice) {
      where.push('m.price <= ?');
      args.push(Number(maxPrice));
    }
    if (q) {
      where.push("(m.name LIKE ? ESCAPE '\\' OR m.service_area LIKE ? ESCAPE '\\' OR m.brand LIKE ? ESCAPE '\\')");
      const like = likeParam(q);
      args.push(like, like, like);
    }
    const order = sort === 'price_asc' ? 'm.price ASC, m.id DESC' : sort === 'price_desc' ? 'm.price DESC, m.id DESC' : 'm.id DESC';
    const db = getDb();
    const total = db
      .prepare(`SELECT COUNT(*) c FROM machinery m JOIN users u ON u.id=m.merchant_id WHERE ${where.join(' AND ')}`)
      .get(...args).c;
    const rows = db.prepare(`${baseSql} WHERE ${where.join(' AND ')} ORDER BY ${order} LIMIT ? OFFSET ?`).all(...args, pageSize, offset);
    const withAvailability = rows.map((r) => {
      if (!date) return mapMachine(r);
      const booked = db.prepare('SELECT COUNT(*) c FROM booking_slots WHERE machinery_id=? AND date=?').get(r.id, date).c;
      const blocked = db.prepare("SELECT COUNT(*) c FROM machinery_slots WHERE machinery_id=? AND date=? AND status='blocked'").get(r.id, date).c;
      return { ...mapMachine(r), availableHours: Math.max(0, WORK_END - WORK_START - booked - blocked) };
    });
    const items = date ? withAvailability.filter((m) => m.availableHours > 0) : withAvailability;
    res.json({ items, total: date ? items.length : total, page, pageSize, totalPages: date ? 1 : Math.ceil(total / pageSize), types: TYPES });
  }),
);

router.get(
  '/:id',
  optionalAuth,
  asyncHandler(async (req, res) => {
    const db = getDb();
    const row = db.prepare(`${baseSql} WHERE m.id = ?`).get(req.params.id);
    if (!row) throw notFound('设备不存在');
    if (row.status !== 'active' && row.merchant_id !== req.user?.id && req.user?.role !== 'admin') throw forbidden('该设备当前不可见');
    const imageKeys = db
      .prepare('SELECT u.storage_key FROM machinery_images mi JOIN uploads u ON u.id=mi.upload_id WHERE mi.machinery_id=? ORDER BY mi.sort')
      .all(row.id)
      .map((r) => r.storage_key);
    const reviews = db
      .prepare(
        `SELECT r.*, u.name AS user_name FROM reviews r JOIN users u ON u.id=r.user_id
         WHERE r.target_type='machinery' AND r.target_id=? ORDER BY r.id DESC LIMIT 20`,
      )
      .all(row.id);
    res.json({ machinery: mapMachine({ ...row, image_keys: imageKeys.join(',') }), reviews });
  }),
);

router.get(
  '/:id/availability',
  asyncHandler(async (req, res) => {
    const date = String(req.query.date || '');
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw badRequest('请提供日期（YYYY-MM-DD）');
    const db = getDb();
    const machine = db.prepare('SELECT * FROM machinery WHERE id = ?').get(req.params.id);
    if (!machine) throw notFound('设备不存在');
    const blocked = new Map(
      db.prepare('SELECT hour, status FROM machinery_slots WHERE machinery_id=? AND date=?').all(machine.id, date).map((r) => [r.hour, r.status]),
    );
    const booked = new Set(
      db.prepare('SELECT hour FROM booking_slots WHERE machinery_id=? AND date=?').all(machine.id, date).map((r) => r.hour),
    );
    const slots = [];
    for (let h = WORK_START; h < WORK_END; h++) {
      const status = booked.has(h) ? 'booked' : blocked.get(h) === 'blocked' ? 'blocked' : 'open';
      slots.push({ hour: h, label: `${String(h).padStart(2, '0')}:00`, status });
    }
    res.json({ date, slots, workStart: WORK_START, workEnd: WORK_END, pricingType: machine.pricing_type, price: machine.price });
  }),
);

const machineSchema = z.object({
  name: z.string().trim().min(3).max(60),
  type: z.enum(TYPES),
  brand: z.string().trim().max(30).optional(),
  model: z.string().trim().max(40).optional(),
  power: z.string().trim().max(30).optional(),
  province: z.string().trim().min(2).max(30),
  city: z.string().trim().min(2).max(30),
  serviceArea: z.string().trim().min(3, '请说明服务范围').max(120),
  pricingType: z.enum(['per_mu', 'per_hour', 'per_day']),
  price: z.number().positive().max(1_000_000),
  description: z.string().trim().max(1500).optional(),
  status: z.enum(['active', 'inactive']).optional(),
  imageIds: z.array(z.number().int().positive()).max(6).optional(),
});

function attachMachineImages(id, ids, merchantId) {
  if (!ids) return;
  const db = getDb();
  db.prepare('DELETE FROM machinery_images WHERE machinery_id = ?').run(id);
  ids.forEach((uid, i) => {
    if (db.prepare('SELECT id FROM uploads WHERE id=? AND user_id=?').get(uid, merchantId)) {
      db.prepare('INSERT OR IGNORE INTO machinery_images (machinery_id, upload_id, sort) VALUES (?,?,?)').run(id, uid, i);
    }
  });
}

router.post(
  '/',
  requireAuth,
  requireMerchant,
  asyncHandler(async (req, res) => {
    const body = parse(machineSchema, req.body);
    const db = getDb();
    const id = db.transaction(() => {
      const info = db
        .prepare(
          `INSERT INTO machinery (merchant_id, name, type, brand, model, power, province, city, service_area, pricing_type, price, description, status)
           VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`,
        )
        .run(
          req.user.id,
          body.name,
          body.type,
          body.brand || null,
          body.model || null,
          body.power || null,
          body.province,
          body.city,
          body.serviceArea,
          body.pricingType,
          body.price,
          body.description || null,
          body.status || 'active',
        );
      const newId = Number(info.lastInsertRowid);
      attachMachineImages(newId, body.imageIds, req.user.id);
      return newId;
    })();
    res.status(201).json({ id });
  }),
);

router.put(
  '/:id',
  requireAuth,
  requireMerchant,
  asyncHandler(async (req, res) => {
    const body = parse(machineSchema, req.body);
    const db = getDb();
    const row = db.prepare('SELECT * FROM machinery WHERE id = ?').get(req.params.id);
    if (!row) throw notFound('设备不存在');
    if (row.merchant_id !== req.user.id) throw forbidden('只能管理自己的设备');
    db.transaction(() => {
      db.prepare(
        `UPDATE machinery SET name=?, type=?, brand=?, model=?, power=?, province=?, city=?, service_area=?,
         pricing_type=?, price=?, description=?, status=?, updated_at=datetime('now','localtime') WHERE id=?`,
      ).run(
        body.name,
        body.type,
        body.brand || null,
        body.model || null,
        body.power || null,
        body.province,
        body.city,
        body.serviceArea,
        body.pricingType,
        body.price,
        body.description || null,
        body.status || row.status,
        row.id,
      );
      attachMachineImages(row.id, body.imageIds, req.user.id);
    })();
    res.json({ ok: true });
  }),
);

router.post(
  '/:id/slots',
  requireAuth,
  requireMerchant,
  asyncHandler(async (req, res) => {
    const body = parse(
      z.object({ date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), hours: z.array(z.number().int().min(0).max(23)).max(24), status: z.enum(['open', 'blocked']) }),
      req.body,
    );
    const db = getDb();
    const row = db.prepare('SELECT * FROM machinery WHERE id = ?').get(req.params.id);
    if (!row) throw notFound('设备不存在');
    if (row.merchant_id !== req.user.id) throw forbidden('只能管理自己的设备');
    const occupied = db
      .prepare('SELECT hour FROM booking_slots WHERE machinery_id=? AND date=?')
      .all(row.id, body.date)
      .map((r) => r.hour);
    const tx = db.transaction(() => {
      for (const h of body.hours) {
        if (occupied.includes(h)) throw conflict(`${String(h).padStart(2, '0')}:00 已有预约，无法修改`);
        if (body.status === 'open') {
          db.prepare('DELETE FROM machinery_slots WHERE machinery_id=? AND date=? AND hour=?').run(row.id, body.date, h);
        } else {
          db.prepare(
            `INSERT INTO machinery_slots (machinery_id, date, hour, status) VALUES (?,?,?, 'blocked')
             ON CONFLICT(machinery_id, date, hour) DO UPDATE SET status='blocked'`,
          ).run(row.id, body.date, h);
        }
      }
    });
    tx();
    res.json({ ok: true });
  }),
);

router.get(
  '/merchant/list',
  requireAuth,
  requireMerchant,
  asyncHandler(async (req, res) => {
    const db = getDb();
    const rows = db.prepare(`${baseSql} WHERE m.merchant_id = ? ORDER BY m.id DESC`).all(req.user.id);
    const imgStmt = db.prepare(
      'SELECT u.id, u.storage_key FROM machinery_images mi JOIN uploads u ON u.id=mi.upload_id WHERE mi.machinery_id=? ORDER BY mi.sort',
    );
    res.json({
      items: rows.map((r) => ({
        ...mapMachine(r),
        images: imgStmt.all(r.id).map((i) => ({ id: i.id, url: `/uploads/${i.storage_key.split('\\').join('/')}` })),
      })),
    });
  }),
);

/* ---------------- 预约 ---------------- */
const bookingSchema = z.object({
  machineryId: z.number().int().positive(),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, '请选择作业日期'),
  startHour: z.number().int().min(0).max(23),
  endHour: z.number().int().min(1).max(24),
  area: z.number().positive().max(100000).nullable().optional(),
  location: z.string().trim().min(5, '请填写详细作业位置').max(160),
  contactName: z.string().trim().min(2).max(30),
  contactPhone: z.string().trim().regex(/^1[3-9]\d{9}$/, '手机号格式不正确'),
  note: z.string().trim().max(500).optional(),
});

router.post(
  '/bookings',
  requireAuth,
  asyncHandler(async (req, res) => {
    const body = parse(bookingSchema, req.body);
    if (body.endHour <= body.startHour) throw badRequest('结束时间需晚于开始时间');
    if (body.endHour > WORK_END || body.startHour < WORK_START) throw badRequest(`可预约时段为 ${WORK_START}:00 - ${WORK_END}:00`);
    const db = getDb();
    const machine = db.prepare("SELECT m.*, u.name AS merchant_name FROM machinery m JOIN users u ON u.id=m.merchant_id WHERE m.id=? AND m.status='active'").get(body.machineryId);
    if (!machine) throw notFound('设备不存在或已下架');
    if (machine.merchant_id === req.user.id) throw badRequest('不能预约自己的设备');
    const today = new Date().toISOString().slice(0, 10);
    if (body.date < today) throw badRequest('不能预约过去的日期');
    const fee = feeFor(machine, body);

    const bookingId = db.transaction(() => {
      const blocked = db
        .prepare("SELECT hour FROM machinery_slots WHERE machinery_id=? AND date=? AND status='blocked'")
        .all(machine.id, body.date)
        .map((r) => r.hour);
      const hours = [];
      for (let h = body.startHour; h < body.endHour; h++) {
        if (blocked.includes(h)) throw conflict(`${String(h).padStart(2, '0')}:00 商家已设为不可预约`);
        hours.push(h);
      }
      const orderNo = `NJ${Date.now().toString().slice(-10)}${Math.floor(Math.random() * 900 + 100)}`;
      const info = db
        .prepare(
          `INSERT INTO bookings (order_no, machinery_id, user_id, merchant_id, date, start_hour, end_hour, area, location,
            contact_name, contact_phone, fee, note, status)
           VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?, 'pending')`,
        )
        .run(orderNo, machine.id, req.user.id, machine.merchant_id, body.date, body.startHour, body.endHour, body.area ?? null, body.location, body.contactName, body.contactPhone, fee, body.note || null);
      const id = Number(info.lastInsertRowid);
      const slotStmt = db.prepare('INSERT INTO booking_slots (booking_id, machinery_id, date, hour) VALUES (?,?,?,?)');
      for (const h of hours) slotStmt.run(id, machine.id, body.date, h); // 唯一索引保证并发安全
      return id;
    })();

    const booking = db.prepare('SELECT * FROM bookings WHERE id = ?').get(bookingId);
    notify(machine.merchant_id, {
      type: 'booking',
      title: '收到新的农机预约',
      body: `${machine.name} · ${body.date} ${String(body.startHour).padStart(2, '0')}:00-${String(body.endHour).padStart(2, '0')}:00`,
      link: `/merchant/bookings`,
    });
    hub.send(machine.merchant_id, 'booking', { booking });
    res.status(201).json({ booking });
  }),
);

router.get(
  '/bookings/mine',
  requireAuth,
  asyncHandler(async (req, res) => {
    const rows = getDb()
      .prepare(
        `SELECT b.*, m.name AS machinery_name, m.type AS machinery_type, u.name AS merchant_name,
          (SELECT r.rating FROM reviews r WHERE r.booking_id=b.id LIMIT 1) AS my_rating
         FROM bookings b JOIN machinery m ON m.id=b.machinery_id JOIN users u ON u.id=b.merchant_id
         WHERE b.user_id=? ORDER BY b.id DESC LIMIT 100`,
      )
      .all(req.user.id);
    res.json({ items: rows });
  }),
);

router.get(
  '/bookings/merchant',
  requireAuth,
  requireMerchant,
  asyncHandler(async (req, res) => {
    const rows = getDb()
      .prepare(
        `SELECT b.*, m.name AS machinery_name, m.type AS machinery_type, u.name AS user_name, u.phone AS user_phone
         FROM bookings b JOIN machinery m ON m.id=b.machinery_id JOIN users u ON u.id=b.user_id
         WHERE b.merchant_id=? ORDER BY b.id DESC LIMIT 100`,
      )
      .all(req.user.id);
    res.json({ items: rows });
  }),
);

router.get(
  '/bookings/:id',
  requireAuth,
  asyncHandler(async (req, res) => {
    const db = getDb();
    const row = db
      .prepare(
        `SELECT b.*, m.name AS machinery_name, m.type AS machinery_type, m.pricing_type, m.price,
          u.name AS merchant_name, mp.shop_name, buyer.name AS user_name
         FROM bookings b JOIN machinery m ON m.id=b.machinery_id
         JOIN users u ON u.id=b.merchant_id LEFT JOIN merchant_profiles mp ON mp.user_id=u.id
         JOIN users buyer ON buyer.id=b.user_id WHERE b.id=?`,
      )
      .get(req.params.id);
    if (!row) throw notFound('预约不存在');
    if (![row.user_id, row.merchant_id].includes(req.user.id) && req.user.role !== 'admin') throw forbidden('无权查看该预约');
    const review = db.prepare('SELECT * FROM reviews WHERE booking_id=?').get(row.id) || null;
    res.json({ booking: row, review, role: req.user.role === 'admin' ? 'admin' : row.user_id === req.user.id ? 'buyer' : 'merchant' });
  }),
);

const transitions = {
  confirm: { from: ['pending'], to: 'confirmed', by: 'merchant', title: '预约已确认', body: '商家已确认你的农机作业预约' },
  reject: { from: ['pending'], to: 'rejected', by: 'merchant', title: '预约未通过', body: '商家拒绝了本次预约，请选择其他时段' },
  start: { from: ['confirmed'], to: 'in_progress', by: 'merchant', title: '作业已开始', body: '农机已进场作业' },
  complete: { from: ['in_progress', 'confirmed'], to: 'completed', by: 'merchant', title: '作业已完成', body: '请确认作业结果并评价' },
};

router.post(
  '/bookings/:id/:action',
  requireAuth,
  asyncHandler(async (req, res) => {
    const { action } = req.params;
    const db = getDb();
    const booking = db.prepare('SELECT * FROM bookings WHERE id=?').get(req.params.id);
    if (!booking) throw notFound('预约不存在');
    const isMerchant = booking.merchant_id === req.user.id;
    const isBuyer = booking.user_id === req.user.id;

    if (action === 'cancel') {
      if (!isMerchant && !isBuyer && req.user.role !== 'admin') throw forbidden('无权取消');
      if (!['pending', 'confirmed'].includes(booking.status)) throw badRequest('当前状态不可取消');
      const reason = String(req.body?.reason || '').slice(0, 200) || null;
      db.transaction(() => {
        db.prepare("UPDATE bookings SET status='cancelled', cancel_reason=?, updated_at=datetime('now','localtime') WHERE id=?").run(reason, booking.id);
        db.prepare('DELETE FROM booking_slots WHERE booking_id=?').run(booking.id);
      })();
      const peer = isBuyer ? booking.merchant_id : booking.user_id;
      notify(peer, { type: 'booking', title: '预约已取消', body: `预约 ${booking.order_no} 已取消`, link: `/bookings/${booking.id}` });
      hub.send(peer, 'booking', { id: booking.id, status: 'cancelled' });
      return res.json({ ok: true, status: 'cancelled' });
    }

    if (action === 'reschedule') {
      if (!isBuyer && !isMerchant) throw forbidden('无权改期');
      const body = parse(
        z.object({
          date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
          startHour: z.number().int().min(0).max(23),
          endHour: z.number().int().min(1).max(24),
        }),
        req.body,
      );
      if (!['pending', 'confirmed'].includes(booking.status)) throw badRequest('当前状态不可改期');
      if (body.endHour <= body.startHour) throw badRequest('结束时间需晚于开始时间');
      const machine = db.prepare('SELECT * FROM machinery WHERE id=?').get(booking.machinery_id);
      const fee = feeFor(machine, { area: booking.area, startHour: body.startHour, endHour: body.endHour });
      db.transaction(() => {
        db.prepare('DELETE FROM booking_slots WHERE booking_id=?').run(booking.id);
        const stmt = db.prepare('INSERT INTO booking_slots (booking_id, machinery_id, date, hour) VALUES (?,?,?,?)');
        for (let h = body.startHour; h < body.endHour; h++) stmt.run(booking.id, booking.machinery_id, body.date, h);
        db.prepare(
          "UPDATE bookings SET date=?, start_hour=?, end_hour=?, fee=?, status='pending', updated_at=datetime('now','localtime') WHERE id=?",
        ).run(body.date, body.startHour, body.endHour, fee, booking.id);
      })();
      const peer = isBuyer ? booking.merchant_id : booking.user_id;
      notify(peer, { type: 'booking', title: '预约已改期', body: `新的作业时间：${body.date} ${body.startHour}:00-${body.endHour}:00`, link: `/bookings/${booking.id}` });
      hub.send(peer, 'booking', { id: booking.id, status: 'pending' });
      return res.json({ ok: true, status: 'pending', fee });
    }

    const t = transitions[action];
    if (!t) throw badRequest('不支持的操作');
    if (t.by === 'merchant' && !isMerchant && req.user.role !== 'admin') throw forbidden('该操作需由商家执行');
    if (!t.from.includes(booking.status)) throw badRequest('当前状态不允许该操作');
    db.prepare("UPDATE bookings SET status=?, updated_at=datetime('now','localtime') WHERE id=?").run(t.to, booking.id);
    const peer = isMerchant ? booking.user_id : booking.merchant_id;
    notify(peer, { type: 'booking', title: t.title, body: `${booking.order_no}：${t.body}`, link: `/bookings/${booking.id}` });
    hub.send(peer, 'booking', { id: booking.id, status: t.to });
    res.json({ ok: true, status: t.to });
  }),
);

router.post(
  '/bookings/:id/review',
  requireAuth,
  asyncHandler(async (req, res) => {
    const body = parse(z.object({ rating: z.number().int().min(1).max(5), content: z.string().trim().max(500).optional() }), req.body);
    const db = getDb();
    const booking = db.prepare('SELECT * FROM bookings WHERE id=?').get(req.params.id);
    if (!booking) throw notFound('预约不存在');
    if (booking.user_id !== req.user.id) throw forbidden('只有下单用户可以评价');
    if (booking.status !== 'completed') throw badRequest('作业完成后才能评价');
    if (db.prepare('SELECT id FROM reviews WHERE booking_id=?').get(booking.id)) throw conflict('该预约已评价');
    db.prepare(
      "INSERT INTO reviews (user_id, target_type, target_id, booking_id, rating, content) VALUES (?, 'machinery', ?, ?, ?, ?)",
    ).run(req.user.id, booking.machinery_id, booking.id, body.rating, body.content || null);
    res.status(201).json({ ok: true });
  }),
);

export default router;
