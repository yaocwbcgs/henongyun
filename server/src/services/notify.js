import { getDb } from '../db/index.js';
import { hub } from '../realtime/hub.js';
import { logger } from '../lib/logger.js';

export function unreadCounts(userId) {
  const db = getDb();
  const notif = db
    .prepare('SELECT COUNT(*) c FROM notifications WHERE user_id = ? AND read_at IS NULL')
    .get(userId).c;
  const msg = db
    .prepare(
      `SELECT COUNT(*) c FROM messages m
       JOIN conversations c ON c.id = m.conversation_id
       WHERE (c.buyer_id = ? OR c.seller_id = ?) AND m.sender_id <> ? AND m.read_at IS NULL`,
    )
    .get(userId, userId, userId).c;
  return { notifications: notif, messages: msg };
}

export function pushCounts(userId) {
  hub.send(userId, 'unread', unreadCounts(userId));
}

/**
 * 创建持久化通知并实时推送。调用方负责业务事务；通知本身独立提交，失败不影响主流程。
 */
export function notify(userId, { type, title, body, link }) {
  try {
    const db = getDb();
    const info = db
      .prepare('INSERT INTO notifications (user_id, type, title, body, link) VALUES (?,?,?,?,?)')
      .run(userId, type, title, body || null, link || null);
    const row = db.prepare('SELECT * FROM notifications WHERE id = ?').get(info.lastInsertRowid);
    hub.send(userId, 'notification', { notification: row, counts: unreadCounts(userId) });
    return row;
  } catch (err) {
    logger.error('notify.failed', { userId, type, message: err.message });
    return null;
  }
}

export function notifyMany(userIds, payload) {
  for (const id of new Set(userIds)) notify(id, payload);
}
