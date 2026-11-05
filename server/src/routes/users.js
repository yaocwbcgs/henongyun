import { Router } from 'express';
import { z } from 'zod';
import { getDb } from '../db/index.js';
import { parse } from '../lib/validate.js';
import { badRequest, forbidden, notFound } from '../lib/errors.js';
import { requireAuth } from '../middleware/auth.js';
import { asyncHandler } from '../middleware/error.js';
import { hashPassword, verifyPassword } from '../lib/security.js';
import { signAccessToken } from '../lib/security.js';

const router = Router();
router.use(requireAuth);

router.patch(
  '/me',
  asyncHandler(async (req, res) => {
    const body = parse(
      z.object({
        name: z.string().trim().min(2).max(30).optional(),
        phone: z.string().trim().regex(/^1[3-9]\d{9}$/, '手机号格式不正确').nullable().optional(),
        region: z.string().trim().max(60).nullable().optional(),
        bio: z.string().trim().max(300).nullable().optional(),
        avatarUploadId: z.number().int().positive().nullable().optional(),
      }),
      req.body,
    );
    const db = getDb();
    const current = db.prepare('SELECT * FROM users WHERE id = ?').get(req.user.id);
    if (body.phone && body.phone !== current.phone) {
      const exists = db.prepare('SELECT id FROM users WHERE phone = ? AND id <> ?').get(body.phone, req.user.id);
      if (exists) throw badRequest('该手机号已被其他账号使用');
    }
    let avatarUrl = current.avatar_url;
    if (body.avatarUploadId) {
      const up = db.prepare('SELECT * FROM uploads WHERE id = ? AND user_id = ?').get(body.avatarUploadId, req.user.id);
      if (!up) throw badRequest('头像文件不存在');
      avatarUrl = `/uploads/${up.storage_key.split('\\').join('/')}`;
    }
    db.prepare(
      `UPDATE users SET name = ?, phone = ?, region = ?, bio = ?, avatar_url = ?, updated_at = datetime('now','localtime') WHERE id = ?`,
    ).run(
      body.name ?? current.name,
      body.phone === undefined ? current.phone : body.phone,
      body.region === undefined ? current.region : body.region,
      body.bio === undefined ? current.bio : body.bio,
      avatarUrl,
      req.user.id,
    );
    const user = db.prepare('SELECT id, name, email, phone, role, avatar_url, region, bio FROM users WHERE id = ?').get(req.user.id);
    res.json({ user: { ...user, avatarUrl: user.avatar_url } });
  }),
);

router.post(
  '/me/password',
  asyncHandler(async (req, res) => {
    const body = parse(
      z.object({
        currentPassword: z.string().min(1),
        newPassword: z.string().min(8).max(72).regex(/[A-Za-z]/).regex(/\d/, '新密码需包含字母和数字'),
      }),
      req.body,
    );
    const db = getDb();
    const user = db.prepare('SELECT * FROM users WHERE id = ?').get(req.user.id);
    if (!verifyPassword(body.currentPassword, user.password_hash)) throw badRequest('当前密码不正确');
    db.prepare("UPDATE users SET password_hash = ?, updated_at = datetime('now','localtime') WHERE id = ?").run(
      hashPassword(body.newPassword),
      user.id,
    );
    db.prepare("UPDATE refresh_tokens SET revoked_at = datetime('now','localtime') WHERE user_id = ? AND revoked_at IS NULL").run(user.id);
    res.json({ ok: true, accessToken: signAccessToken(user) });
  }),
);

/* ---------- 收货地址 ---------- */
const addressSchema = z.object({
  receiver: z.string().trim().min(2, '请填写收货人').max(30),
  phone: z.string().trim().regex(/^1[3-9]\d{9}$/, '手机号格式不正确'),
  province: z.string().trim().min(2).max(30),
  city: z.string().trim().min(2).max(30),
  district: z.string().trim().min(2).max(30),
  detail: z.string().trim().min(5, '详细地址至少 5 个字').max(160),
  isDefault: z.boolean().optional(),
});

router.get('/me/addresses', (req, res) => {
  const rows = getDb()
    .prepare('SELECT * FROM addresses WHERE user_id = ? ORDER BY is_default DESC, id DESC')
    .all(req.user.id);
  res.json({ items: rows.map((r) => ({ ...r, isDefault: Boolean(r.is_default) })) });
});

router.post(
  '/me/addresses',
  asyncHandler(async (req, res) => {
    const body = parse(addressSchema, req.body);
    const db = getDb();
    const count = db.prepare('SELECT COUNT(*) c FROM addresses WHERE user_id = ?').get(req.user.id).c;
    const makeDefault = body.isDefault || count === 0;
    const id = db.transaction(() => {
      if (makeDefault) db.prepare('UPDATE addresses SET is_default = 0 WHERE user_id = ?').run(req.user.id);
      const info = db
        .prepare(
          'INSERT INTO addresses (user_id, receiver, phone, province, city, district, detail, is_default) VALUES (?,?,?,?,?,?,?,?)',
        )
        .run(req.user.id, body.receiver, body.phone, body.province, body.city, body.district, body.detail, makeDefault ? 1 : 0);
      return Number(info.lastInsertRowid);
    })();
    res.status(201).json({ id });
  }),
);

router.put(
  '/me/addresses/:id',
  asyncHandler(async (req, res) => {
    const body = parse(addressSchema, req.body);
    const db = getDb();
    const row = db.prepare('SELECT * FROM addresses WHERE id = ? AND user_id = ?').get(req.params.id, req.user.id);
    if (!row) throw notFound('地址不存在');
    db.transaction(() => {
      if (body.isDefault) db.prepare('UPDATE addresses SET is_default = 0 WHERE user_id = ?').run(req.user.id);
      db.prepare(
        'UPDATE addresses SET receiver=?, phone=?, province=?, city=?, district=?, detail=?, is_default=? WHERE id=?',
      ).run(
        body.receiver,
        body.phone,
        body.province,
        body.city,
        body.district,
        body.detail,
        body.isDefault ? 1 : row.is_default,
        row.id,
      );
    })();
    res.json({ ok: true });
  }),
);

router.delete(
  '/me/addresses/:id',
  asyncHandler(async (req, res) => {
    const db = getDb();
    const row = db.prepare('SELECT * FROM addresses WHERE id = ? AND user_id = ?').get(req.params.id, req.user.id);
    if (!row) throw notFound('地址不存在');
    db.prepare('DELETE FROM addresses WHERE id = ?').run(row.id);
    if (row.is_default) {
      const next = db.prepare('SELECT id FROM addresses WHERE user_id = ? ORDER BY id DESC LIMIT 1').get(req.user.id);
      if (next) db.prepare('UPDATE addresses SET is_default = 1 WHERE id = ?').run(next.id);
    }
    res.json({ ok: true });
  }),
);

/* ---------- 收藏 ---------- */
router.get('/me/favorites', (req, res) => {
  const db = getDb();
  const type = req.query.type;
  const rows = db
    .prepare('SELECT * FROM favorites WHERE user_id = ? ORDER BY id DESC')
    .all(req.user.id)
    .filter((r) => !type || r.target_type === type);
  const items = rows
    .map((r) => {
      let target = null;
      if (r.target_type === 'post') {
        target = db.prepare('SELECT id, title, type, category, price, price_type, province, city, status FROM posts WHERE id = ?').get(r.target_id);
      } else if (r.target_type === 'product') {
        target = db.prepare('SELECT id, name, price, spec, unit, stock, status FROM products WHERE id = ?').get(r.target_id);
      } else if (r.target_type === 'machinery') {
        target = db.prepare('SELECT id, name, type, price, pricing_type, province, city, status FROM machinery WHERE id = ?').get(r.target_id);
      } else if (r.target_type === 'knowledge') {
        target = db.prepare('SELECT id, slug, title, crop FROM knowledge_articles WHERE id = ?').get(r.target_id);
      }
      return target ? { id: r.id, type: r.target_type, createdAt: r.created_at, target } : null;
    })
    .filter(Boolean);
  res.json({ items });
});

router.post(
  '/me/favorites',
  asyncHandler(async (req, res) => {
    const body = parse(
      z.object({
        targetType: z.enum(['post', 'product', 'machinery', 'knowledge']),
        targetId: z.number().int().positive(),
      }),
      req.body,
    );
    const db = getDb();
    const exists = db
      .prepare('SELECT id FROM favorites WHERE user_id = ? AND target_type = ? AND target_id = ?')
      .get(req.user.id, body.targetType, body.targetId);
    if (exists) {
      db.prepare('DELETE FROM favorites WHERE id = ?').run(exists.id);
      return res.json({ favorited: false });
    }
    db.prepare('INSERT INTO favorites (user_id, target_type, target_id) VALUES (?,?,?)').run(
      req.user.id,
      body.targetType,
      body.targetId,
    );
    res.json({ favorited: true });
  }),
);

/* ---------- 我的业务数据 ---------- */
router.get('/me/overview', (req, res) => {
  const db = getDb();
  const uid = req.user.id;
  const one = (sql, ...args) => db.prepare(sql).get(...args)?.c ?? 0;
  res.json({
    posts: one('SELECT COUNT(*) c FROM posts WHERE user_id = ?', uid),
    diagnoses: one('SELECT COUNT(*) c FROM diagnoses WHERE user_id = ?', uid),
    bookings: one('SELECT COUNT(*) c FROM bookings WHERE user_id = ?', uid),
    orders: one('SELECT COUNT(*) c FROM orders WHERE user_id = ?', uid),
    favorites: one('SELECT COUNT(*) c FROM favorites WHERE user_id = ?', uid),
    advisories: one('SELECT COUNT(*) c FROM advisories WHERE user_id = ?', uid),
    unreadMessages: one(
      `SELECT COUNT(*) c FROM messages m JOIN conversations c ON c.id = m.conversation_id
       WHERE (c.buyer_id = ? OR c.seller_id = ?) AND m.sender_id <> ? AND m.read_at IS NULL`,
      uid,
      uid,
      uid,
    ),
  });
});

export default router;
