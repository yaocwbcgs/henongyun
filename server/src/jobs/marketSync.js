import { getDb } from '../db/index.js';
import config from '../config.js';
import { logger } from '../lib/logger.js';

/**
 * 从已配置的行情 API 拉取数据。约定响应为 { items: [{crop, variety, spec, grade, province, market, price, unit, quoteBasis, collectedAt}] }。
 * 未配置时由上层明确拒绝，不生成任何占位数据。
 */
export async function syncMarketSource(source) {
  const db = getDb();
  const startedAt = new Date().toISOString();
  if (!config.integrations.marketApi) {
    throw Object.assign(new Error('行情 API 未配置'), { status: 503 });
  }
  try {
    const url = new URL(config.market.apiUrl);
    url.searchParams.set('source', source.code);
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${config.market.apiKey}`, Accept: 'application/json' },
      signal: AbortSignal.timeout(25_000),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const payload = await res.json();
    const items = Array.isArray(payload?.items) ? payload.items : Array.isArray(payload) ? payload : [];
    if (!items.length) throw new Error('接口未返回任何行情记录');
    let inserted = 0;
    const stmt = db.prepare(
      `INSERT INTO market_prices (source_id, crop, variety, spec, grade, province, market, price, unit, quote_basis, collected_at, status)
       VALUES (?,?,?,?,?,?,?,?,?,?,?, 'pending')
       ON CONFLICT(source_id, crop, market, spec, collected_at) DO NOTHING`,
    );
    db.transaction(() => {
      for (const it of items) {
        const r = stmt.run(
          source.id,
          it.crop,
          it.variety || null,
          it.spec || null,
          it.grade || null,
          it.province,
          it.market,
          Number(it.price),
          it.unit,
          it.quoteBasis,
          it.collectedAt,
        );
        if (r.changes) inserted++;
      }
    })();
    db.prepare("UPDATE market_sources SET last_run_at=datetime('now','localtime'), last_status=? WHERE id=?").run(
      `ok: ${inserted}/${items.length} 新增`,
      source.id,
    );
    db.prepare("INSERT INTO job_runs (job, status, detail) VALUES ('market_sync','success',?)").run(
      JSON.stringify({ source: source.code, inserted, total: items.length, startedAt }),
    );
    return { ok: true, inserted, total: items.length, pendingReview: true };
  } catch (err) {
    logger.error('market.sync_failed', { source: source.code, message: err.message });
    db.prepare("UPDATE market_sources SET last_run_at=datetime('now','localtime'), last_status=? WHERE id=?").run(
      `failed: ${err.message.slice(0, 80)}`,
      source.id,
    );
    db.prepare("INSERT INTO job_runs (job, status, detail) VALUES ('market_sync','failed',?)").run(
      JSON.stringify({ source: source.code, error: err.message }),
    );
    throw err;
  }
}
