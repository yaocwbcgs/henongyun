import { getDb } from '../db/index.js';
import { logger } from '../lib/logger.js';
import { notify } from '../services/notify.js';
import { cancelStaleOrders } from '../services/orders.js';
import config from '../config.js';
import { syncMarketSource } from './marketSync.js';

function record(job, status, detail) {
  try {
    getDb().prepare('INSERT INTO job_runs (job, status, detail) VALUES (?,?,?)').run(job, status, JSON.stringify(detail || {}));
  } catch (err) {
    logger.warn('job.record_failed', { job, message: err.message });
  }
}

/** 价格提醒：仅在最新已审核价格满足条件且与上次触发价不同（或超过 12 小时）时通知 */
export function runPriceAlerts() {
  const db = getDb();
  const alerts = db.prepare('SELECT * FROM price_alerts WHERE active=1').all();
  let triggered = 0;
  for (const alert of alerts) {
    const latest = db
      .prepare(
        `SELECT price, unit, province, market, collected_at FROM market_prices
         WHERE status='approved' AND crop=? ${alert.province ? 'AND province=?' : ''}
         ORDER BY collected_at DESC, id DESC LIMIT 1`,
      )
      .get(...(alert.province ? [alert.crop, alert.province] : [alert.crop]));
    if (!latest) continue;
    const hit = alert.direction === 'above' ? latest.price >= alert.threshold : latest.price <= alert.threshold;
    if (!hit) continue;
    const recentlySent =
      alert.last_triggered_at &&
      Date.now() - new Date(alert.last_triggered_at.replace(' ', 'T')).getTime() < 12 * 3600 * 1000;
    if (alert.last_price === latest.price && recentlySent) continue;
    notify(alert.user_id, {
      type: 'price_alert',
      title: `价格提醒：${alert.crop}${alert.direction === 'above' ? '已达到' : '已低于'} ¥${alert.threshold}`,
      body: `${latest.market} 最新报价 ¥${latest.price}/${latest.unit}（采集于 ${latest.collected_at}）`,
      link: '/prices',
    });
    db.prepare("UPDATE price_alerts SET last_triggered_at=datetime('now','localtime'), last_price=? WHERE id=?").run(latest.price, alert.id);
    triggered++;
  }
  if (alerts.length) record('price_alerts', 'success', { checked: alerts.length, triggered });
  return { checked: alerts.length, triggered };
}

export function expirePosts() {
  const db = getDb();
  const info = db
    .prepare(
      "UPDATE posts SET status='expired', updated_at=datetime('now','localtime') WHERE status='active' AND date(valid_until) < date('now','localtime')",
    )
    .run();
  if (info.changes) record('expire_posts', 'success', { expired: info.changes });
  return info.changes;
}

function runStaleOrders() {
  const count = cancelStaleOrders(30);
  if (count) record('cancel_stale_orders', 'success', { cancelled: count });
  return count;
}

async function runMarketSync() {
  const db = getDb();
  if (!config.integrations.marketApi) return { skipped: true };
  const sources = db.prepare("SELECT * FROM market_sources WHERE kind='api' AND status='active'").all();
  const results = [];
  for (const s of sources) {
    try {
      results.push({ code: s.code, ...(await syncMarketSource(s)) });
    } catch (err) {
      results.push({ code: s.code, error: err.message });
    }
  }
  record('market_sync_cycle', 'done', results);
  return results;
}

let timers = [];

export function startJobs() {
  timers.push(setInterval(() => {
    try {
      runPriceAlerts();
    } catch (err) {
      logger.error('job.price_alerts_failed', { message: err.message });
      record('price_alerts', 'failed', { error: err.message });
    }
  }, 60_000));

  timers.push(setInterval(() => {
    try {
      expirePosts();
      runStaleOrders();
    } catch (err) {
      logger.error('job.maintenance_failed', { message: err.message });
    }
  }, 5 * 60_000));

  timers.push(setInterval(() => {
    runMarketSync().catch((err) => logger.error('job.market_sync_failed', { message: err.message }));
  }, 60 * 60_000));

  for (const t of timers) t.unref?.();
  logger.info('jobs.started', { jobs: ['price_alerts/60s', 'maintenance/5m', 'market_sync/1h'] });
  // 启动后延迟执行一次，避免阻塞服务启动
  setTimeout(() => {
    try {
      expirePosts();
      runPriceAlerts();
    } catch { /* ignore */ }
  }, 4000).unref?.();
}

export function stopJobs() {
  for (const t of timers) clearInterval(t);
  timers = [];
}
