import { Router } from 'express';
import { z } from 'zod';
import { getDb } from '../db/index.js';
import { parse, parsePagination, likeParam } from '../lib/validate.js';
import { notFound, forbidden } from '../lib/errors.js';
import { optionalAuth } from '../middleware/auth.js';
import { asyncHandler } from '../middleware/error.js';
import { getDb as db } from '../db/index.js';

const router = Router();

router.get(
  '/',
  asyncHandler(async (req, res) => {
    const { page, pageSize, offset } = parsePagination(req.query, 9);
    const { crop, category, q } = req.query;
    const where = ["status='published'"];
    const args = [];
    if (crop) {
      where.push('crop=?');
      args.push(crop);
    }
    if (category) {
      where.push('category=?');
      args.push(category);
    }
    if (q) {
      where.push("(title LIKE ? ESCAPE '\\' OR summary LIKE ? ESCAPE '\\' OR symptoms LIKE ? ESCAPE '\\')");
      const like = likeParam(q);
      args.push(like, like, like);
    }
    const database = getDb();
    const total = database.prepare(`SELECT COUNT(*) c FROM knowledge_articles WHERE ${where.join(' AND ')}`).get(...args).c;
    const rows = database
      .prepare(
        `SELECT id, slug, title, crop, category, summary, cover_url, source_name, reviewed_at
         FROM knowledge_articles WHERE ${where.join(' AND ')} ORDER BY id DESC LIMIT ? OFFSET ?`,
      )
      .all(...args, pageSize, offset);
    const crops = database.prepare("SELECT DISTINCT crop FROM knowledge_articles WHERE status='published' ORDER BY crop").all().map((r) => r.crop);
    const categories = database.prepare("SELECT DISTINCT category FROM knowledge_articles WHERE status='published' ORDER BY category").all().map((r) => r.category);
    res.json({ items: rows, total, page, pageSize, totalPages: Math.ceil(total / pageSize), crops, categories });
  }),
);

router.get(
  '/:slug',
  optionalAuth,
  asyncHandler(async (req, res) => {
    const database = db();
    const row = database
      .prepare(
        `SELECT a.*, u.name AS reviewer_name FROM knowledge_articles a LEFT JOIN users u ON u.id=a.reviewed_by
         WHERE a.slug=?`,
      )
      .get(req.params.slug);
    if (!row) throw notFound('文章不存在');
    if (row.status !== 'published') throw forbidden('文章尚未发布');
    // 相关阅读：优先同作物，其次同分类，最后回退到最新发布，避免侧栏长期为空
    let related = database
      .prepare(
        `SELECT id, slug, title, crop, summary FROM knowledge_articles
         WHERE status='published' AND crop=? AND id<>? ORDER BY id DESC LIMIT 4`,
      )
      .all(row.crop, row.id);
    if (!related.length) {
      related = database
        .prepare(
          `SELECT id, slug, title, crop, summary FROM knowledge_articles
           WHERE status='published' AND category=? AND id<>? ORDER BY id DESC LIMIT 4`,
        )
        .all(row.category, row.id);
    }
    if (!related.length) {
      related = database
        .prepare(
          `SELECT id, slug, title, crop, summary FROM knowledge_articles
           WHERE status='published' AND id<>? ORDER BY id DESC LIMIT 4`,
        )
        .all(row.id);
    }
    const favorited = req.user
      ? Boolean(
          database
            .prepare("SELECT 1 FROM favorites WHERE user_id=? AND target_type='knowledge' AND target_id=?")
            .get(req.user.id, row.id),
        )
      : false;
    res.json({ article: row, related, favorited });
  }),
);

export default router;
