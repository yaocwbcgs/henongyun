import { Router } from 'express';
import { z } from 'zod';
import { getDb } from '../db/index.js';
import { parse, parsePagination } from '../lib/validate.js';
import { badRequest, forbidden, notFound } from '../lib/errors.js';
import { requireAuth } from '../middleware/auth.js';
import { asyncHandler } from '../middleware/error.js';
import { hub } from '../realtime/hub.js';
import { unreadCounts, notify } from '../services/notify.js';

const router = Router();
router.use(requireAuth);

function assertMember(conv, userId) {
  if (conv.buyer_id !== userId && conv.seller_id !== userId) throw forbidden('无权访问该会话');
}

router.get(
  '/',
  asyncHandler(async (req, res) => {
    const db = getDb();
    const rows = db
      .prepare(
        `SELECT c.*, p.title AS post_title,
                buyer.name AS buyer_name, buyer.avatar_url AS buyer_avatar,
                seller.name AS seller_name, seller.avatar_url AS seller_avatar,
                (SELECT body FROM messages m WHERE m.conversation_id = c.id ORDER BY m.id DESC LIMIT 1) AS last_body,
                (SELECT created_at FROM messages m WHERE m.conversation_id = c.id ORDER BY m.id DESC LIMIT 1) AS last_at,
                (SELECT COUNT(*) FROM messages m WHERE m.conversation_id = c.id AND m.sender_id <> ? AND m.read_at IS NULL) AS unread
         FROM conversations c
         JOIN users buyer ON buyer.id = c.buyer_id
         JOIN users seller ON seller.id = c.seller_id
         LEFT JOIN posts p ON p.id = c.post_id
         WHERE c.buyer_id = ? OR c.seller_id = ?
         ORDER BY COALESCE(last_at, c.created_at) DESC LIMIT 100`,
      )
      .all(req.user.id, req.user.id, req.user.id);
    res.json({
      items: rows.map((r) => {
        const other = r.buyer_id === req.user.id ? { id: r.seller_id, name: r.seller_name, avatar: r.seller_avatar } : { id: r.buyer_id, name: r.buyer_name, avatar: r.buyer_avatar };
        return {
          id: r.id,
          postId: r.post_id,
          postTitle: r.post_title,
          other,
          lastMessage: r.last_body,
          lastAt: r.last_at || r.created_at,
          unread: r.unread,
        };
      }),
      counts: unreadCounts(req.user.id),
    });
  }),
);

router.post(
  '/',
  asyncHandler(async (req, res) => {
    const body = parse(z.object({ postId: z.number().int().positive().nullable().optional(), peerId: z.number().int().positive() }), req.body);
    const db = getDb();
    if (body.peerId === req.user.id) throw badRequest('不能与自己建立会话');
    const peer = db.prepare("SELECT id FROM users WHERE id = ? AND status = 'active'").get(body.peerId);
    if (!peer) throw notFound('对方账号不存在');
    let post = null;
    if (body.postId) {
      post = db.prepare('SELECT * FROM posts WHERE id = ?').get(body.postId);
      if (!post) throw notFound('关联的供需信息不存在');
    }
    const [buyerId, sellerId] = post
      ? post.type === 'supply'
        ? [req.user.id, post.user_id]
        : [post.user_id, req.user.id]
      : [req.user.id, body.peerId];
    let conv = db
      .prepare('SELECT * FROM conversations WHERE post_id IS ? AND buyer_id = ? AND seller_id = ?')
      .get(post?.id ?? null, buyerId, sellerId);
    if (!conv) {
      const info = db.prepare('INSERT INTO conversations (post_id, buyer_id, seller_id) VALUES (?,?,?)').run(post?.id ?? null, buyerId, sellerId);
      conv = db.prepare('SELECT * FROM conversations WHERE id = ?').get(info.lastInsertRowid);
    }
    res.json({ id: conv.id });
  }),
);

router.get(
  '/:id/messages',
  asyncHandler(async (req, res) => {
    const { page, pageSize } = parsePagination(req.query, 30, 100);
    const db = getDb();
    const conv = db.prepare('SELECT * FROM conversations WHERE id = ?').get(req.params.id);
    if (!conv) throw notFound('会话不存在');
    assertMember(conv, req.user.id);
    const total = db.prepare('SELECT COUNT(*) c FROM messages WHERE conversation_id = ?').get(conv.id).c;
    const rows = db
      .prepare(
        `SELECT m.*, u.name AS sender_name FROM messages m JOIN users u ON u.id = m.sender_id
         WHERE m.conversation_id = ? ORDER BY m.id DESC LIMIT ? OFFSET ?`,
      )
      .all(conv.id, pageSize, (page - 1) * pageSize);
    res.json({
      items: rows.reverse().map((m) => ({
        id: m.id,
        senderId: m.sender_id,
        senderName: m.sender_name,
        body: m.body,
        readAt: m.read_at,
        createdAt: m.created_at,
        mine: m.sender_id === req.user.id,
      })),
      total,
      page,
      pageSize,
      postId: conv.post_id,
    });
  }),
);

router.post(
  '/:id/messages',
  asyncHandler(async (req, res) => {
    const body = parse(z.object({ body: z.string().trim().min(1, '消息不能为空').max(1000) }), req.body);
    const db = getDb();
    const conv = db.prepare('SELECT * FROM conversations WHERE id = ?').get(req.params.id);
    if (!conv) throw notFound('会话不存在');
    assertMember(conv, req.user.id);
    const info = db
      .prepare('INSERT INTO messages (conversation_id, sender_id, body) VALUES (?,?,?)')
      .run(conv.id, req.user.id, body.body);
    db.prepare("UPDATE conversations SET updated_at = datetime('now','localtime') WHERE id = ?").run(conv.id);
    const message = db.prepare('SELECT * FROM messages WHERE id = ?').get(info.lastInsertRowid);
    const peerId = conv.buyer_id === req.user.id ? conv.seller_id : conv.buyer_id;
    const payload = {
      conversationId: conv.id,
      message: { ...message, mine: false, senderName: req.user.name },
    };
    hub.send(peerId, 'message', payload);
    hub.send(req.user.id, 'message', { ...payload, message: { ...message, mine: true } });
    // 离线用户靠未读计数兜底
    hub.send(peerId, 'unread', unreadCounts(peerId));
    res.status(201).json({ message: { ...message, mine: true } });
  }),
);

router.post(
  '/:id/read',
  asyncHandler(async (req, res) => {
    const db = getDb();
    const conv = db.prepare('SELECT * FROM conversations WHERE id = ?').get(req.params.id);
    if (!conv) throw notFound('会话不存在');
    assertMember(conv, req.user.id);
    const info = db
      .prepare("UPDATE messages SET read_at = datetime('now','localtime') WHERE conversation_id = ? AND sender_id <> ? AND read_at IS NULL")
      .run(conv.id, req.user.id);
    const peerId = conv.buyer_id === req.user.id ? conv.seller_id : conv.buyer_id;
    if (info.changes > 0) hub.send(peerId, 'read', { conversationId: conv.id, by: req.user.id });
    res.json({ ok: true, read: info.changes, counts: unreadCounts(req.user.id) });
  }),
);

export default router;
