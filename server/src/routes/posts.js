import { Router } from 'express';
import { z } from 'zod';
import { getDb } from '../db/index.js';
import { parse, parsePagination, likeParam } from '../lib/validate.js';
import { badRequest, conflict, forbidden, notFound } from '../lib/errors.js';
import { requireAuth, requireRole, optionalAuth } from '../middleware/auth.js';
import { asyncHandler } from '../middleware/error.js';
import { notify } from '../services/notify.js';
import { hub } from '../realtime/hub.js';

const router = Router();
const CATEGORIES = ['蔬菜', '水果', '粮食', '油料', '茶叶', '中药材', '畜禽', '水产', '其他'];
const UNITS = ['吨', '公斤', '斤', '件', '箱', '亩'];

const postSchema = z.object({
  type: z.enum(['supply', 'demand']),
  title: z.string().trim().min(6, '标题至少 6 个字').max(60),
  category: z.enum(CATEGORIES),
  variety: z.string().trim().max(40).optional(),
  spec: z.string().trim().max(80).optional(),
  quantity: z.number().positive('数量必须大于 0').max(1_000_000),
  unit: z.enum(UNITS),
  priceType: z.enum(['fixed', 'negotiable']),
  price: z.number().positive('价格必须大于 0').max(1_000_000).nullable().optional(),
  province: z.string().trim().min(2).max(30),
  city: z.string().trim().min(2).max(30),
  validUntil: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, '请选择有效期'),
  description: z.string().trim().max(1200).optional(),
  imageIds: z.array(z.number().int().positive()).max(6).optional(),
});

function mapPost(row, extra = {}) {
  return {
    id: row.id,
    type: row.type,
    title: row.title,
    category: row.category,
    variety: row.variety,
    spec: row.spec,
    quantity: row.quantity,
    unit: row.unit,
    priceType: row.price_type,
    price: row.price,
    province: row.province,
    city: row.city,
    validUntil: row.valid_until,
    description: row.description,
    status: row.status,
    rejectReason: row.reject_reason,
    viewCount: row.view_count,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    owner: row.owner_name
      ? { id: row.user_id, name: row.owner_name, shopName: row.shop_name || null, role: row.owner_role }
      : undefined,
    coverUrl: row.cover_key ? `/uploads/${row.cover_key.split('\\').join('/')}` : null,
    imageUrls: row.image_keys
      ? row.image_keys.split(',').filter(Boolean).map((k) => `/uploads/${k.split('\\').join('/')}`)
      : [],
    inquiryCount: row.inquiry_count ?? undefined,
    ...extra,
  };
}

const listSql = `SELECT p.*, u.name AS owner_name, u.role AS owner_role, mp.shop_name,
    (SELECT storage_key FROM uploads up JOIN post_images pi ON pi.upload_id = up.id
      WHERE pi.post_id = p.id ORDER BY pi.sort LIMIT 1) AS cover_key
  FROM posts p JOIN users u ON u.id = p.user_id
  LEFT JOIN merchant_profiles mp ON mp.user_id = u.id`;

router.get(
  '/',
  asyncHandler(async (req, res) => {
    const { page, pageSize, offset } = parsePagination(req.query, 12);
    const { type, category, province, q, priceType, sort } = req.query;
    if (type && !['supply', 'demand'].includes(type)) throw badRequest('类型参数不正确');
    const where = ["p.status = 'active'"];
    const args = [];
    if (type) {
      where.push('p.type = ?');
      args.push(type);
    }
    if (category) {
      where.push('p.category = ?');
      args.push(category);
    }
    if (province) {
      where.push('p.province = ?');
      args.push(province);
    }
    if (priceType) {
      where.push('p.price_type = ?');
      args.push(priceType);
    }
    if (q) {
      where.push("(p.title LIKE ? ESCAPE '\\' OR p.variety LIKE ? ESCAPE '\\' OR p.description LIKE ? ESCAPE '\\')");
      const like = likeParam(q);
      args.push(like, like, like);
    }
    const order =
      sort === 'price_asc'
        ? 'CASE WHEN p.price IS NULL THEN 1 ELSE 0 END, p.price ASC, p.id DESC'
        : sort === 'price_desc'
          ? 'p.price IS NULL, p.price DESC, p.id DESC'
          : sort === 'deadline'
            ? 'p.valid_until ASC, p.id DESC'
            : 'p.id DESC';
    const db = getDb();
    const total = db.prepare(`SELECT COUNT(*) c FROM posts p WHERE ${where.join(' AND ')}`).get(...args).c;
    const rows = db
      .prepare(`${listSql} WHERE ${where.join(' AND ')} ORDER BY ${order} LIMIT ? OFFSET ?`)
      .all(...args, pageSize, offset);
    res.json({ items: rows.map((r) => mapPost(r)), total, page, pageSize, totalPages: Math.ceil(total / pageSize) });
  }),
);

router.get(
  '/:id',
  optionalAuth,
  asyncHandler(async (req, res) => {
    const db = getDb();
    const row = db.prepare(`${listSql} WHERE p.id = ?`).get(req.params.id);
    if (!row) throw notFound('供需信息不存在');
    const isOwner = req.user?.id === row.user_id;
    const isAdmin = req.user?.role === 'admin';
    if (row.status !== 'active' && !isOwner && !isAdmin) throw forbidden('该信息当前不可见');
    if (!isOwner) db.prepare('UPDATE posts SET view_count = view_count + 1 WHERE id = ?').run(row.id);
    const imageRows = db
      .prepare('SELECT u.id, u.storage_key FROM post_images pi JOIN uploads u ON u.id = pi.upload_id WHERE pi.post_id = ? ORDER BY pi.sort')
      .all(row.id);
    const imageKeys = imageRows.map((r) => r.storage_key);
    const favorited = req.user
      ? Boolean(db.prepare("SELECT 1 FROM favorites WHERE user_id = ? AND target_type = 'post' AND target_id = ?").get(req.user.id, row.id))
      : false;
    const inquiries = isOwner || isAdmin
      ? db
          .prepare(
            `SELECT i.*, u.name AS from_name FROM inquiries i JOIN users u ON u.id = i.from_user_id
             WHERE i.post_id = ? ORDER BY i.id DESC`,
          )
          .all(row.id)
      : [];
    res.json({
      post: mapPost({ ...row, image_keys: imageKeys.join(',') }, {
        favorited,
        isOwner,
        images: imageRows.map((r) => ({ id: r.id, url: `/uploads/${r.storage_key.split('\\').join('/')}` })),
      }),
      inquiries,
      conversationId: req.user
        ? db
            .prepare('SELECT id FROM conversations WHERE post_id = ? AND buyer_id = ? AND seller_id = ?')
            .get(row.id, row.type === 'supply' ? req.user.id : row.user_id, row.type === 'supply' ? row.user_id : req.user.id)?.id || null
        : null,
    });
  }),
);

router.post(
  '/',
  requireAuth,
  asyncHandler(async (req, res) => {
    const body = parse(postSchema, req.body);
    const db = getDb();
    const submit = req.query.submit === '1';
    if (body.priceType === 'fixed' && !body.price) throw badRequest('固定价格需填写具体金额');
    if (new Date(body.validUntil) <= new Date(new Date().toDateString())) throw badRequest('有效期需晚于今天');
    const id = db.transaction(() => {
      const info = db
        .prepare(
          `INSERT INTO posts (type, user_id, title, category, variety, spec, quantity, unit, price_type, price,
            province, city, valid_until, description, status)
           VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
        )
        .run(
          body.type,
          req.user.id,
          body.title,
          body.category,
          body.variety || null,
          body.spec || null,
          body.quantity,
          body.unit,
          body.priceType,
          body.priceType === 'fixed' ? body.price : null,
          body.province,
          body.city,
          body.validUntil,
          body.description || null,
          submit ? 'pending' : 'draft',
        );
      const postId = Number(info.lastInsertRowid);
      attachImages(postId, body.imageIds, req.user.id);
      return postId;
    })();
    if (submit) {
      const admins = db.prepare("SELECT id FROM users WHERE role = 'admin'").all();
      for (const a of admins) notify(a.id, { type: 'review', title: '新的供需信息待审核', body: body.title, link: '/admin/posts' });
    }
    res.status(201).json({ id, status: submit ? 'pending' : 'draft' });
  }),
);

function attachImages(postId, ids, userId) {
  if (!ids?.length) return;
  const db = getDb();
  db.prepare('DELETE FROM post_images WHERE post_id = ?').run(postId);
  ids.forEach((uid, i) => {
    const up = db.prepare('SELECT id FROM uploads WHERE id = ? AND user_id = ?').get(uid, userId);
    if (up) db.prepare('INSERT OR IGNORE INTO post_images (post_id, upload_id, sort) VALUES (?,?,?)').run(postId, uid, i);
  });
}

router.put(
  '/:id',
  requireAuth,
  asyncHandler(async (req, res) => {
    const body = parse(postSchema, req.body);
    const db = getDb();
    const row = db.prepare('SELECT * FROM posts WHERE id = ?').get(req.params.id);
    if (!row) throw notFound('供需信息不存在');
    if (row.user_id !== req.user.id && req.user.role !== 'admin') throw forbidden('只能编辑自己发布的信息');
    if (!['draft', 'rejected', 'active', 'pending'].includes(row.status)) throw badRequest('当前状态不允许编辑');
    if (body.priceType === 'fixed' && !body.price) throw badRequest('固定价格需填写具体金额');
    if (new Date(body.validUntil) <= new Date(new Date().toDateString())) throw badRequest('有效期需晚于今天');
    const submit = req.query.submit === '1';
    db.transaction(() => {
      db.prepare(
        `UPDATE posts SET title=?, category=?, variety=?, spec=?, quantity=?, unit=?, price_type=?, price=?,
         province=?, city=?, valid_until=?, description=?, status=?, reject_reason=NULL,
         updated_at=datetime('now','localtime') WHERE id=?`,
      ).run(
        body.title,
        body.category,
        body.variety || null,
        body.spec || null,
        body.quantity,
        body.unit,
        body.priceType,
        body.priceType === 'fixed' ? body.price : null,
        body.province,
        body.city,
        body.validUntil,
        body.description || null,
        submit ? 'pending' : 'draft',
        row.id,
      );
      attachImages(row.id, body.imageIds, req.user.id);
    })();
    res.json({ ok: true, status: submit ? 'pending' : 'draft' });
  }),
);

router.post(
  '/:id/submit',
  requireAuth,
  asyncHandler(async (req, res) => {
    const db = getDb();
    const row = db.prepare('SELECT * FROM posts WHERE id = ?').get(req.params.id);
    if (!row) throw notFound('供需信息不存在');
    if (row.user_id !== req.user.id) throw forbidden('只能提交自己的信息');
    if (!['draft', 'rejected'].includes(row.status)) throw badRequest('当前状态无需提交审核');
    db.prepare("UPDATE posts SET status='pending', reject_reason=NULL, updated_at=datetime('now','localtime') WHERE id=?").run(row.id);
    for (const a of db.prepare("SELECT id FROM users WHERE role='admin'").all()) {
      notify(a.id, { type: 'review', title: '新的供需信息待审核', body: row.title, link: '/admin/posts' });
    }
    res.json({ ok: true, status: 'pending' });
  }),
);

router.post(
  '/:id/close',
  requireAuth,
  asyncHandler(async (req, res) => {
    const db = getDb();
    const row = db.prepare('SELECT * FROM posts WHERE id = ?').get(req.params.id);
    if (!row) throw notFound('供需信息不存在');
    if (row.user_id !== req.user.id && req.user.role !== 'admin') throw forbidden('无权操作');
    if (row.status === 'closed') throw badRequest('信息已关闭');
    db.prepare("UPDATE posts SET status='closed', updated_at=datetime('now','localtime') WHERE id=?").run(row.id);
    res.json({ ok: true });
  }),
);

/* ---------- 询价 / 报价 ---------- */
router.post(
  '/:id/inquiries',
  requireAuth,
  asyncHandler(async (req, res) => {
    const body = parse(
      z.object({
        kind: z.enum(['inquiry', 'quote']),
        price: z.number().positive().max(1_000_000).nullable().optional(),
        quantity: z.number().positive().max(1_000_000).nullable().optional(),
        unit: z.string().trim().max(10).optional(),
        message: z.string().trim().min(5, '请说明你的需求或报价条件').max(600),
      }),
      req.body,
    );
    const db = getDb();
    const post = db.prepare('SELECT * FROM posts WHERE id = ?').get(req.params.id);
    if (!post) throw notFound('供需信息不存在');
    if (post.status !== 'active') throw badRequest('该信息当前不可发起询报价');
    if (post.user_id === req.user.id) throw badRequest('不能对自己发布的信息询价');
    if (body.kind === 'quote' && !body.price) throw badRequest('报价需填写单价');

    // 同一用户对同一信息 10 分钟内避免重复提交
    const recent = db
      .prepare("SELECT id FROM inquiries WHERE post_id=? AND from_user_id=? AND created_at > datetime('now','localtime','-10 minutes')")
      .get(post.id, req.user.id);
    if (recent) throw conflict('你刚刚已提交过询价，请等待对方回复');

    const toUserId = post.user_id;
    const result = db.transaction(() => {
      const info = db
        .prepare(
          `INSERT INTO inquiries (post_id, from_user_id, to_user_id, kind, price, quantity, unit, message)
           VALUES (?,?,?,?,?,?,?,?)`,
        )
        .run(post.id, req.user.id, toUserId, body.kind, body.price ?? null, body.quantity ?? null, body.unit || post.unit, body.message);
      const inquiryId = Number(info.lastInsertRowid);
      const buyerId = post.type === 'supply' ? req.user.id : toUserId;
      const sellerId = post.type === 'supply' ? toUserId : req.user.id;
      let conv = db
        .prepare('SELECT * FROM conversations WHERE post_id = ? AND buyer_id = ? AND seller_id = ?')
        .get(post.id, buyerId, sellerId);
      if (!conv) {
        const c = db
          .prepare('INSERT INTO conversations (post_id, buyer_id, seller_id) VALUES (?,?,?)')
          .run(post.id, buyerId, sellerId);
        conv = db.prepare('SELECT * FROM conversations WHERE id = ?').get(c.lastInsertRowid);
      }
      const text =
        body.kind === 'quote'
          ? `【报价】${body.price} 元/${body.unit || post.unit}${body.quantity ? `，可供 ${body.quantity}${body.unit || post.unit}` : ''}\n${body.message}`
          : `【询价】${body.message}${body.quantity ? `\n意向数量：${body.quantity}${body.unit || post.unit}` : ''}`;
      const m = db
        .prepare('INSERT INTO messages (conversation_id, sender_id, body) VALUES (?,?,?)')
        .run(conv.id, req.user.id, text);
      db.prepare("UPDATE conversations SET updated_at = datetime('now','localtime') WHERE id = ?").run(conv.id);
      return { inquiryId, conversationId: conv.id, messageId: Number(m.lastInsertRowid) };
    })();

    const row = db.prepare('SELECT * FROM inquiries WHERE id = ?').get(result.inquiryId);
    notify(toUserId, {
      type: 'inquiry',
      title: body.kind === 'quote' ? '收到新的报价' : '收到新的询价',
      body: `${post.title}：${body.message.slice(0, 60)}`,
      link: `/messages?conversation=${result.conversationId}`,
    });
    hub.send(toUserId, 'inquiry', { inquiry: row, postId: post.id });
    res.status(201).json(result);
  }),
);

router.get(
  '/inquiries/received',
  requireAuth,
  asyncHandler(async (req, res) => {
    const rows = getDb()
      .prepare(
        `SELECT i.*, p.title AS post_title, p.type AS post_type, u.name AS from_name, u.role AS from_role
         FROM inquiries i JOIN posts p ON p.id = i.post_id JOIN users u ON u.id = i.from_user_id
         WHERE i.to_user_id = ? ORDER BY i.id DESC LIMIT 100`,
      )
      .all(req.user.id);
    res.json({ items: rows });
  }),
);

router.get(
  '/inquiries/sent',
  requireAuth,
  asyncHandler(async (req, res) => {
    const rows = getDb()
      .prepare(
        `SELECT i.*, p.title AS post_title, p.type AS post_type, u.name AS to_name
         FROM inquiries i JOIN posts p ON p.id = i.post_id JOIN users u ON u.id = i.to_user_id
         WHERE i.from_user_id = ? ORDER BY i.id DESC LIMIT 100`,
      )
      .all(req.user.id);
    res.json({ items: rows });
  }),
);

router.post(
  '/inquiries/:id/respond',
  requireAuth,
  asyncHandler(async (req, res) => {
    const body = parse(z.object({ action: z.enum(['accept', 'decline', 'close']) }), req.body);
    const db = getDb();
    const inq = db.prepare('SELECT * FROM inquiries WHERE id = ?').get(req.params.id);
    if (!inq) throw notFound('询价记录不存在');
    if (inq.to_user_id !== req.user.id) throw forbidden('只有接收方可以处理该询价');
    if (['closed'].includes(inq.status)) throw badRequest('该询价已关闭');
    const next = body.action === 'accept' ? 'accepted' : body.action === 'decline' ? 'declined' : 'closed';
    db.prepare("UPDATE inquiries SET status=?, updated_at=datetime('now','localtime') WHERE id=?").run(next, inq.id);
    notify(inq.from_user_id, {
      type: 'inquiry',
      title: body.action === 'accept' ? '对方已接受询报价' : body.action === 'decline' ? '对方暂未接受' : '询价已关闭',
      body: '可进入消息中心继续沟通合作细节。',
      link: `/messages`,
    });
    hub.send(inq.from_user_id, 'inquiry', { id: inq.id, status: next });
    res.json({ ok: true, status: next });
  }),
);

/* 我的发布 */
router.get(
  '/mine/list',
  requireAuth,
  asyncHandler(async (req, res) => {
    const db = getDb();
    const rows = db
      .prepare(`${listSql} WHERE p.user_id = ? ORDER BY p.id DESC`)
      .all(req.user.id);
    res.json({ items: rows.map((r) => mapPost(r)) });
  }),
);

export default router;
