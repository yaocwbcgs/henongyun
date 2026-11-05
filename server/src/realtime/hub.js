import { logger } from '../lib/logger.js';

/**
 * 站内实时推送（SSE）。
 * - 单进程内存连接池；多实例部署需替换为 Redis Pub/Sub 适配器（见 docs/deploy.md）。
 * - 25s 心跳注释，避免反向代理 60s 超时断连。
 * - 每个连接带递增 event id，客户端断线重连后可据此提示补拉。
 */
class Hub {
  constructor() {
    this.clients = new Map(); // userId -> Set<res>
    this.seq = 0;
    this.heartbeat = null;
  }

  start() {
    if (this.heartbeat) return;
    this.heartbeat = setInterval(() => {
      for (const set of this.clients.values()) {
        for (const res of set) {
          try {
            res.write(`: ping ${Date.now()}\n\n`);
          } catch {
            /* ignore */
          }
        }
      }
    }, 25_000);
    this.heartbeat.unref?.();
  }

  add(userId, res) {
    let set = this.clients.get(userId);
    if (!set) {
      set = new Set();
      this.clients.set(userId, set);
    }
    set.add(res);
    res.write('retry: 3000\n\n');
    this.emitTo(userId, 'connected', { at: new Date().toISOString(), connections: set.size }, res);
    logger.debug('sse.connected', { userId, total: set.size });
  }

  remove(userId, res) {
    const set = this.clients.get(userId);
    if (!set) return;
    set.delete(res);
    if (set.size === 0) this.clients.delete(userId);
  }

  onlineCount(userId) {
    return this.clients.get(userId)?.size || 0;
  }

  emitTo(userId, event, data, onlyRes) {
    const payload = `id: ${++this.seq}\nevent: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
    const targets = onlyRes ? [onlyRes] : [...(this.clients.get(String(userId)) || [])];
    for (const res of targets) {
      try {
        res.write(payload);
      } catch (err) {
        logger.warn('sse.write_failed', { userId, message: err.message });
      }
    }
    return targets.length;
  }

  send(userId, event, data) {
    return this.emitTo(userId, event, data);
  }
}

export const hub = new Hub();
