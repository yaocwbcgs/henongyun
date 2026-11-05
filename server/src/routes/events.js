import { Router } from 'express';
import crypto from 'node:crypto';
import { requireAuth } from '../middleware/auth.js';
import { hub } from '../realtime/hub.js';
import { getDb } from '../db/index.js';
import { unreadCounts } from '../services/notify.js';
import { logger } from '../lib/logger.js';

const router = Router();
const tickets = new Map(); // ticket -> { userId, exp }
const TTL = 60_000;

setInterval(() => {
  const now = Date.now();
  for (const [k, v] of tickets) if (v.exp < now) tickets.delete(k);
}, 30_000).unref?.();

router.post('/ticket', requireAuth, (req, res) => {
  const ticket = crypto.randomBytes(24).toString('base64url');
  tickets.set(ticket, { userId: req.user.id, exp: Date.now() + TTL });
  res.json({ ticket, expiresIn: TTL / 1000 });
});

router.get('/', (req, res) => {
  const { ticket } = req.query;
  const rec = ticket ? tickets.get(String(ticket)) : null;
  if (!rec || rec.exp < Date.now()) {
    return res.status(401).json({ error: { code: 'UNAUTHORIZED', message: '实时连接凭证无效，请重新连接' } });
  }
  tickets.delete(String(ticket)); // 一次性使用

  const user = getDb().prepare('SELECT id, name FROM users WHERE id = ?').get(rec.userId);
  if (!user) return res.status(401).json({ error: { code: 'UNAUTHORIZED', message: '账号不可用' } });

  res.writeHead(200, {
    'Content-Type': 'text/event-stream; charset=utf-8',
    'Cache-Control': 'no-cache, no-transform',
    Connection: 'keep-alive',
    'X-Accel-Buffering': 'no',
  });
  res.flushHeaders?.();
  hub.add(user.id, res);
  hub.send(user.id, 'ready', { userId: user.id, counts: unreadCounts(user.id) });

  const close = () => {
    hub.remove(user.id, res);
    logger.debug('sse.closed', { userId: user.id });
  };
  req.on('close', close);
  req.on('error', close);
});

export default router;
