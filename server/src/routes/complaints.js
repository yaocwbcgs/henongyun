import { Router } from 'express';
import { z } from 'zod';
import { getDb } from '../db/index.js';
import { parse } from '../lib/validate.js';
import { requireAuth } from '../middleware/auth.js';
import { asyncHandler } from '../middleware/error.js';
import { notify } from '../services/notify.js';

const router = Router();

router.post(
  '/',
  requireAuth,
  asyncHandler(async (req, res) => {
    const body = parse(
      z.object({
        targetType: z.enum(['post', 'product', 'machinery', 'user', 'other']),
        targetId: z.number().int().positive().nullable().optional(),
        reason: z.string().trim().min(5, '请说明问题').max(120),
        detail: z.string().trim().max(800).optional(),
      }),
      req.body,
    );
    const db = getDb();
    const info = db
      .prepare('INSERT INTO complaints (user_id, target_type, target_id, reason, detail) VALUES (?,?,?,?,?)')
      .run(req.user.id, body.targetType, body.targetId ?? null, body.reason, body.detail || null);
    for (const a of db.prepare("SELECT id FROM users WHERE role='admin'").all()) {
      notify(a.id, { type: 'complaint', title: '收到新的用户投诉', body: body.reason, link: '/admin/complaints' });
    }
    res.status(201).json({ id: Number(info.lastInsertRowid), status: 'open' });
  }),
);

router.get(
  '/mine',
  requireAuth,
  asyncHandler(async (req, res) => {
    const rows = getDb().prepare('SELECT * FROM complaints WHERE user_id=? ORDER BY id DESC').all(req.user.id);
    res.json({ items: rows });
  }),
);

export default router;
