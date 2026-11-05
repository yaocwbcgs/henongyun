import { Router } from 'express';
import { z } from 'zod';
import { getDb } from '../db/index.js';
import { parse, parsePagination } from '../lib/validate.js';
import { badRequest, notFound, conflict } from '../lib/errors.js';
import { requireAuth } from '../middleware/auth.js';
import { asyncHandler } from '../middleware/error.js';
import config from '../config.js';

const router = Router();

const orderKey = 'market, spec, collected_at';

router.get(
  '/meta',
  asyncHandler(async (_req, res) => {
    const db = getDb();
    const crops = db.prepare("SELECT DISTINCT crop FROM market_prices WHERE status='approved' ORDER BY crop").all().map((r) => r.crop);
    const provinces = db.prepare("SELECT DISTINCT province FROM market_prices WHERE status='approved' ORDER BY province").all().map((r) => r.province);
    const markets = db.prepare("SELECT DISTINCT market, province FROM market_prices WHERE status='approved' ORDER BY market").all();
    const specs = db.prepare("SELECT DISTINCT spec FROM market_prices WHERE status='approved' AND spec IS NOT NULL ORDER BY spec").all().map((r) => r.spec);
    const latest = db.prepare("SELECT MAX(collected_at) m FROM market_prices WHERE status='approved'").get()?.m || null;
    const sources = db.prepare("SELECT id, code, name, kind, url, note, status, last_run_at, last_status FROM market_sources ORDER BY id").all();
    res.json({ crops, provinces, markets, specs, latestCollectedAt: latest, sources, configured: { api: config.integrations.marketApi } });
  }),
);

/** 首页/行情概览：按作物取最新已审核记录，仅在同口径内比较涨跌 */
router.get(
  '/overview',
  asyncHandler(async (_req, res) => {
    const db = getDb();
    const crops = db.prepare("SELECT DISTINCT crop FROM market_prices WHERE status='approved'").all();
    const items = [];
    for (const { crop } of crops) {
      const latest = db
        .prepare(
          `SELECT p.*, s.name AS source_name FROM market_prices p JOIN market_sources s ON s.id=p.source_id
           WHERE p.status='approved' AND p.crop=? ORDER BY p.collected_at DESC, p.id DESC LIMIT 1`,
        )
        .get(crop);
      if (!latest) continue;
      const prev = db
        .prepare(
          `SELECT price, collected_at FROM market_prices
           WHERE status='approved' AND crop=? AND market=? AND spec IS ? AND collected_at < ?
           ORDER BY collected_at DESC LIMIT 1`,
        )
        .get(crop, latest.market, latest.spec, latest.collected_at);
      const change = prev ? Math.round((latest.price - prev.price) * 100) / 100 : null;
      const changePct = prev && prev.price ? Math.round(((latest.price - prev.price) / prev.price) * 10000) / 100 : null;
      items.push({
        crop: latest.crop,
        variety: latest.variety,
        spec: latest.spec,
        grade: latest.grade,
        market: latest.market,
        province: latest.province,
        price: latest.price,
        unit: latest.unit,
        currency: latest.currency,
        quoteBasis: latest.quote_basis,
        collectedAt: latest.collected_at,
        sourceName: latest.source_name,
        change,
        changePct,
        comparable: Boolean(prev),
      });
    }
    const lastRun = db.prepare("SELECT MAX(ran_at) t FROM job_runs WHERE job='market_sync'").get()?.t || null;
    res.json({ items, lastSyncAt: lastRun, sourceCount: db.prepare("SELECT COUNT(*) c FROM market_sources WHERE status='active'").get().c });
  }),
);

router.get(
  '/prices',
  asyncHandler(async (req, res) => {
    const { page, pageSize, offset } = parsePagination(req.query, 20, 100);
    const { crop, province, market, spec, from, to } = req.query;
    const where = ["p.status='approved'"];
    const args = [];
    for (const [key, col] of [
      ['crop', 'p.crop'],
      ['province', 'p.province'],
      ['market', 'p.market'],
      ['spec', 'p.spec'],
    ]) {
      const val = req.query[key];
      if (val) {
        where.push(`${col} = ?`);
        args.push(val);
      }
    }
    if (from) {
      where.push('p.collected_at >= ?');
      args.push(from);
    }
    if (to) {
      where.push('p.collected_at <= ?');
      args.push(`${to} 23:59:59`);
    }
    const db = getDb();
    const total = db.prepare(`SELECT COUNT(*) c FROM market_prices p WHERE ${where.join(' AND ')}`).get(...args).c;
    const rows = db
      .prepare(
        `SELECT p.*, s.name AS source_name, s.url AS source_url FROM market_prices p JOIN market_sources s ON s.id=p.source_id
         WHERE ${where.join(' AND ')} ORDER BY p.collected_at DESC, p.id DESC LIMIT ? OFFSET ?`,
      )
      .all(...args, pageSize, offset);
    res.json({ items: rows, total, page, pageSize, totalPages: Math.ceil(total / pageSize) });
  }),
);

/** 历史趋势：必须同市场、同规格、同报价口径，否则不连线 */
router.get(
  '/series',
  asyncHandler(async (req, res) => {
    const { crop, market, spec, province, days } = req.query;
    if (!crop || !market) throw badRequest('请选择作物与市场，趋势仅在同口径内计算');
    const db = getDb();
    const params = [crop, market];
    let sql = `SELECT p.collected_at, p.price, p.unit, p.currency, p.quote_basis, p.spec, p.grade, s.name AS source_name
      FROM market_prices p JOIN market_sources s ON s.id=p.source_id
      WHERE p.status='approved' AND p.crop=? AND p.market=?`;
    if (spec) {
      sql += ' AND p.spec IS ?';
      params.push(spec);
    } else {
      sql += ' AND p.spec IS NULL';
    }
    if (province) {
      sql += ' AND p.province=?';
      params.push(province);
    }
    const limitDays = Math.min(365, Math.max(7, Number(days) || 90));
    sql += ` AND p.collected_at >= datetime('now','localtime', ?) ORDER BY p.collected_at ASC LIMIT 500`;
    params.push(`-${limitDays} days`);
    const rows = db.prepare(sql).all(...params);
    const units = [...new Set(rows.map((r) => `${r.currency}/${r.unit}`))];
    res.json({
      points: rows,
      consistent: units.length <= 1,
      unit: units[0] || null,
      note: units.length > 1 ? '所选口径存在多种计价单位，已按原始记录展示，暂不计算涨跌。' : null,
    });
  }),
);

/* ---------- 关注与提醒 ---------- */
router.get(
  '/watchlist',
  requireAuth,
  asyncHandler(async (req, res) => {
    const db = getDb();
    const items = db.prepare('SELECT * FROM watchlist WHERE user_id=? ORDER BY id DESC').all(req.user.id);
    const withPrice = items.map((w) => {
      const latest = db
        .prepare(
          `SELECT price, unit, collected_at, market FROM market_prices
           WHERE status='approved' AND crop=? ${w.province ? 'AND province=?' : ''} ORDER BY collected_at DESC LIMIT 1`,
        )
        .get(...(w.province ? [w.crop, w.province] : [w.crop]));
      return { ...w, latest: latest || null };
    });
    res.json({ items: withPrice });
  }),
);

router.post(
  '/watchlist',
  requireAuth,
  asyncHandler(async (req, res) => {
    const body = parse(z.object({ crop: z.string().trim().min(1).max(20), province: z.string().trim().max(30).optional() }), req.body);
    const db = getDb();
    const exists = db
      .prepare('SELECT id FROM watchlist WHERE user_id=? AND crop=? AND province IS ?')
      .get(req.user.id, body.crop, body.province || null);
    if (exists) throw conflict('已在关注列表中');
    const info = db.prepare('INSERT INTO watchlist (user_id, crop, province) VALUES (?,?,?)').run(req.user.id, body.crop, body.province || null);
    res.status(201).json({ id: Number(info.lastInsertRowid) });
  }),
);

router.delete(
  '/watchlist/:id',
  requireAuth,
  asyncHandler(async (req, res) => {
    const info = getDb().prepare('DELETE FROM watchlist WHERE id=? AND user_id=?').run(req.params.id, req.user.id);
    if (info.changes === 0) throw notFound('关注记录不存在');
    res.json({ ok: true });
  }),
);

router.get(
  '/alerts',
  requireAuth,
  asyncHandler(async (req, res) => {
    const rows = getDb().prepare('SELECT * FROM price_alerts WHERE user_id=? ORDER BY id DESC').all(req.user.id);
    res.json({ items: rows });
  }),
);

router.post(
  '/alerts',
  requireAuth,
  asyncHandler(async (req, res) => {
    const body = parse(
      z.object({
        crop: z.string().trim().min(1).max(20),
        province: z.string().trim().max(30).optional(),
        direction: z.enum(['above', 'below']),
        threshold: z.number().positive().max(1_000_000),
      }),
      req.body,
    );
    const db = getDb();
    const active = db.prepare('SELECT COUNT(*) c FROM price_alerts WHERE user_id=? AND active=1').get(req.user.id).c;
    if (active >= 10) throw badRequest('最多同时设置 10 条价格提醒');
    const info = db
      .prepare('INSERT INTO price_alerts (user_id, crop, province, direction, threshold) VALUES (?,?,?,?,?)')
      .run(req.user.id, body.crop, body.province || null, body.direction, body.threshold);
    res.status(201).json({ id: Number(info.lastInsertRowid) });
  }),
);

router.patch(
  '/alerts/:id',
  requireAuth,
  asyncHandler(async (req, res) => {
    const body = parse(z.object({ active: z.boolean() }), req.body);
    const db = getDb();
    const row = db.prepare('SELECT * FROM price_alerts WHERE id=? AND user_id=?').get(req.params.id, req.user.id);
    if (!row) throw notFound('提醒不存在');
    db.prepare('UPDATE price_alerts SET active=? WHERE id=?').run(body.active ? 1 : 0, row.id);
    res.json({ ok: true });
  }),
);

router.delete(
  '/alerts/:id',
  requireAuth,
  asyncHandler(async (req, res) => {
    const info = getDb().prepare('DELETE FROM price_alerts WHERE id=? AND user_id=?').run(req.params.id, req.user.id);
    if (info.changes === 0) throw notFound('提醒不存在');
    res.json({ ok: true });
  }),
);

export default router;
