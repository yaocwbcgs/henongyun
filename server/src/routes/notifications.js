import { Router } from 'express';
import { getDb } from '../db/index.js';
import { requireAuth } from '../middleware/auth.js';
import { asyncHandler } from '../middleware/error.js';
import { parsePagination } from '../lib/validate.js';
import { unreadCounts } from '../services/notify.js';
import { notFound } from '../lib/errors.js';

const router = Router();
router.use(requireAuth);

router.get(
  '/',
  asyncHandler(async (req, res) => {
    const { page, pageSize, offset } = parsePagination(req.query, 20, 50);
    const db = getDb();
    const total = db.prepare('SELECT COUNT(*) c FROM notifications WHERE user_id = ?').get(req.user.id).c;
    const rows = db
      .prepare('SELECT * FROM notifications WHERE user_id = ? ORDER BY id DESC LIMIT ? OFFSET ?')
      .all(req.user.id, pageSize, offset);
    res.json({ items: rows, total, page, pageSize, counts: unreadCounts(req.user.id) });
  }),
);

router.get('/unread-count', (req, res) => {
  res.json(unreadCounts(req.user.id));
});

router.post(
  '/:id/read',
  asyncHandler(async (req, res) => {
    const db = getDb();
    const row = db.prepare('SELECT * FROM notifications WHERE id = ? AND user_id = ?').get(req.params.id, req.user.id);
    if (!row) throw notFound('通知不存在');
    db.prepare("UPDATE notifications SET read_at = datetime('now','localtime') WHERE id = ?").run(row.id);
    res.json({ ok: true, counts: unreadCounts(req.user.id) });
  }),
);

router.post('/read-all', (req, res) => {
  const db = getDb();
  db.prepare("UPDATE notifications SET read_at = datetime('now','localtime') WHERE user_id = ? AND read_at IS NULL").run(req.user.id);
  res.json({ ok: true, counts: unreadCounts(req.user.id) });
});

export default router;
