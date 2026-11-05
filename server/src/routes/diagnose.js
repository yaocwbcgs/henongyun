import { Router } from 'express';
import fs from 'node:fs/promises';
import path from 'node:path';
import multer from 'multer';
import { z } from 'zod';
import { getDb } from '../db/index.js';
import { requireAuth, requireRole } from '../middleware/auth.js';
import { asyncHandler } from '../middleware/error.js';
import { assertImage, inspectImage, storeImage } from '../services/storage.js';
import { identify, recognitionStatus, SUPPORTED_CROPS } from '../services/recognition.js';
import { parse, parsePagination } from '../lib/validate.js';
import { badRequest, forbidden, notFound } from '../lib/errors.js';
import { hub } from '../realtime/hub.js';
import { notify } from '../services/notify.js';
import { logger } from '../lib/logger.js';
import config from '../config.js';

const router = Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 8 * 1024 * 1024, files: 1 } });

const CROP_VALUES = SUPPORTED_CROPS.map((c) => c.value);

function shape(row) {
  if (!row) return null;
  return {
    id: row.id,
    crop: row.crop,
    cropLabel: SUPPORTED_CROPS.find((c) => c.value === row.crop)?.label || row.crop,
    symptoms: row.symptoms,
    growthStage: row.growth_stage,
    status: row.status,
    provider: row.provider,
    quality: row.quality_json ? JSON.parse(row.quality_json) : null,
    result: row.result_json ? JSON.parse(row.result_json) : null,
    failureReason: row.failure_reason,
    imageUrl: row.image_key ? `/uploads/${row.image_key.split('\\').join('/')}` : null,
    createdAt: row.created_at,
    completedAt: row.completed_at,
  };
}

const selectSql = `SELECT d.*, u.storage_key AS image_key
  FROM diagnoses d LEFT JOIN uploads u ON u.id = d.image_upload_id`;

router.get('/meta', (_req, res) => {
  res.json(recognitionStatus());
});

router.post(
  '/',
  requireAuth,
  upload.single('image'),
  asyncHandler(async (req, res) => {
    const db = getDb();
    const body = parse(
      z.object({
        crop: z.enum(CROP_VALUES),
        symptoms: z.string().trim().max(500).optional(),
        growthStage: z.string().trim().max(40).optional(),
        uploadId: z.coerce.number().int().positive().optional(),
      }),
      req.body,
    );
    let quality;
    let stored;
    if (req.file) {
      assertImage(req.file);
      quality = await inspectImage(req.file.buffer);
      stored = await storeImage(req.file, req.user.id, 'diagnosis');
    } else if (body.uploadId) {
      const up = db.prepare('SELECT * FROM uploads WHERE id = ? AND user_id = ?').get(body.uploadId, req.user.id);
      if (!up) throw badRequest('图片不存在或无权使用');
      const abs = path.join(config.uploadDir, up.storage_key);
      quality = await inspectImage(await fs.readFile(abs));
      stored = { id: up.id, quality };
    } else {
      throw badRequest('请先上传一张作物照片');
    }
    const info = db
      .prepare(
        `INSERT INTO diagnoses (user_id, crop, symptoms, growth_stage, image_upload_id, status, provider, quality_json)
         VALUES (?,?,?,?,?,?,?,?)`,
      )
      .run(
        req.user.id,
        body.crop,
        body.symptoms || null,
        body.growthStage || null,
        stored.id,
        'queued',
        'plantid',
        JSON.stringify(stored.quality),
      );
    const id = Number(info.lastInsertRowid);
    const row = db.prepare(`${selectSql} WHERE d.id = ?`).get(id);
    res.status(202).json({ diagnosis: shape(row) });
    // 异步执行，避免阻塞请求
    setImmediate(() => runDiagnosis(id).catch((e) => logger.error('diagnosis.run_failed', { id, message: e.message })));
  }),
);

async function runDiagnosis(id) {
  const db = getDb();
  const row = db.prepare(`${selectSql} WHERE d.id = ?`).get(id);
  if (!row || ['completed', 'needs_review'].includes(row.status)) return;
  db.prepare("UPDATE diagnoses SET status = 'processing' WHERE id = ?").run(id);
  hub.send(row.user_id, 'diagnosis', { id, status: 'processing' });

  const out = await identify({ imageAbsPath: row.image_key, crop: row.crop });
  if (!out.ok) {
    db.prepare(
      "UPDATE diagnoses SET status = ?, failure_reason = ?, completed_at = datetime('now','localtime') WHERE id = ?",
    ).run(out.code === 'not_configured' ? 'failed' : 'failed', out.reason, id);
    hub.send(row.user_id, 'diagnosis', { id, status: 'failed', reason: out.reason });
    if (out.code !== 'not_configured') {
      notify(row.user_id, {
        type: 'diagnosis',
        title: '识别任务未完成',
        body: `${out.reason}，你可以重试或提交农技咨询。`,
        link: `/diagnose/result/${id}`,
      });
    }
    return;
  }

  const normalized = out.normalized;
  const status = normalized.uncertain ? 'needs_review' : 'completed';
  db.prepare(
    `UPDATE diagnoses SET status = ?, result_json = ?, completed_at = datetime('now','localtime'),
     provider_ref = ? WHERE id = ?`,
  ).run(status, JSON.stringify(normalized), out.raw?.access_token || null, id);
  hub.send(row.user_id, 'diagnosis', { id, status });
  notify(row.user_id, {
    type: 'diagnosis',
    title: status === 'needs_review' ? '识别结果已生成，建议人工复核' : '识别结果已生成',
    body: normalized.isHealthy ? '未发现明显病害特征，请结合田间观察判断。' : '已生成候选病害与防控建议。',
    link: `/diagnose/result/${id}`,
  });
}

router.get(
  '/',
  requireAuth,
  asyncHandler(async (req, res) => {
    const { page, pageSize, offset } = parsePagination(req.query, 10);
    const db = getDb();
    const total = db.prepare('SELECT COUNT(*) c FROM diagnoses WHERE user_id = ?').get(req.user.id).c;
    const rows = db
      .prepare(`${selectSql} WHERE d.user_id = ? ORDER BY d.id DESC LIMIT ? OFFSET ?`)
      .all(req.user.id, pageSize, offset);
    res.json({
      items: rows.map((r) => {
        const s = shape(r);
        return { id: s.id, crop: s.crop, cropLabel: s.cropLabel, status: s.status, createdAt: s.createdAt, imageUrl: s.imageUrl, top: s.result?.candidates?.[0]?.name || null };
      }),
      total,
      page,
      pageSize,
    });
  }),
);

router.get(
  '/:id',
  requireAuth,
  asyncHandler(async (req, res) => {
    const db = getDb();
    const row = db.prepare(`${selectSql} WHERE d.id = ?`).get(req.params.id);
    if (!row) throw notFound('识别记录不存在');
    if (row.user_id !== req.user.id && !['agronomist', 'admin'].includes(req.user.role)) {
      throw forbidden('无权查看该识别记录');
    }
    res.json({ diagnosis: shape(row), advisory: db.prepare('SELECT id, status, reply, replied_at FROM advisories WHERE diagnosis_id = ? ORDER BY id DESC LIMIT 1').get(row.id) || null });
  }),
);

router.post(
  '/:id/retry',
  requireAuth,
  asyncHandler(async (req, res) => {
    const db = getDb();
    const row = db.prepare('SELECT * FROM diagnoses WHERE id = ?').get(req.params.id);
    if (!row) throw notFound('识别记录不存在');
    if (row.user_id !== req.user.id) throw forbidden('无权操作该记录');
    if (!db.prepare('SELECT 1 FROM uploads WHERE id = ?').get(row.image_upload_id)) throw badRequest('原始图片已不存在，请重新上传');
    db.prepare("UPDATE diagnoses SET status = 'queued', failure_reason = NULL WHERE id = ?").run(row.id);
    hub.send(req.user.id, 'diagnosis', { id: row.id, status: 'queued' });
    res.status(202).json({ ok: true });
    setImmediate(() => runDiagnosis(row.id).catch(() => {}));
  }),
);

router.post(
  '/:id/advisory',
  requireAuth,
  asyncHandler(async (req, res) => {
    const body = parse(
      z.object({
        subject: z.string().trim().min(4, '请简要描述问题').max(80),
        content: z.string().trim().min(10, '请补充田间情况，至少 10 个字').max(1000),
        contact: z.string().trim().max(60).optional(),
      }),
      req.body,
    );
    const db = getDb();
    const diag = db.prepare('SELECT * FROM diagnoses WHERE id = ?').get(req.params.id);
    if (!diag) throw notFound('识别记录不存在');
    if (diag.user_id !== req.user.id) throw forbidden('无权操作该记录');
    const exists = db.prepare("SELECT id FROM advisories WHERE diagnosis_id = ? AND status IN ('open','accepted','replied')").get(diag.id);
    if (exists) throw badRequest('该识别记录已有进行中的咨询工单');
    const info = db
      .prepare('INSERT INTO advisories (user_id, diagnosis_id, subject, content, contact) VALUES (?,?,?,?,?)')
      .run(req.user.id, diag.id, body.subject, body.content, body.contact || null);
    const agronomists = db.prepare("SELECT id FROM users WHERE role IN ('agronomist','admin') AND status = 'active'").all();
    for (const a of agronomists) {
      notify(a.id, { type: 'advisory', title: '新的农技咨询工单', body: body.subject, link: '/admin/advisories' });
    }
    res.status(201).json({ id: Number(info.lastInsertRowid), status: 'open' });
  }),
);

/* 农技人员 / 管理员：工单处理 */
router.get(
  '/advisories/list',
  requireRole('agronomist', 'admin'),
  asyncHandler(async (req, res) => {
    const db = getDb();
    const status = req.query.status;
    const rows = db
      .prepare(
        `SELECT a.*, u.name AS user_name, u.phone AS user_phone, d.crop, d.symptoms
         FROM advisories a JOIN users u ON u.id = a.user_id
         LEFT JOIN diagnoses d ON d.id = a.diagnosis_id
         WHERE (? IS NULL OR a.status = ?) ORDER BY a.id DESC LIMIT 100`,
      )
      .all(status || null, status || null);
    res.json({ items: rows });
  }),
);

router.post(
  '/advisories/:id/reply',
  requireRole('agronomist', 'admin'),
  asyncHandler(async (req, res) => {
    const body = parse(z.object({ reply: z.string().trim().min(10, '回复内容至少 10 个字').max(2000) }), req.body);
    const db = getDb();
    const ticket = db.prepare('SELECT * FROM advisories WHERE id = ?').get(req.params.id);
    if (!ticket) throw notFound('工单不存在');
    if (ticket.status === 'closed') throw badRequest('工单已关闭');
    db.transaction(() => {
      db.prepare(
        "UPDATE advisories SET status = 'replied', reply = ?, replied_at = datetime('now','localtime'), assigned_to = ? WHERE id = ?",
      ).run(body.reply, req.user.id, ticket.id);
      db.prepare(
        `INSERT INTO audit_logs (actor_id, action, target_type, target_id, detail, ip)
         VALUES (?, 'advisory.reply', 'advisory', ?, ?, ?)`,
      ).run(req.user.id, String(ticket.id), body.reply.slice(0, 200), req.ip);
    })();
    notify(ticket.user_id, {
      type: 'advisory',
      title: '农技咨询已回复',
      body: ticket.subject,
      link: `/me/advisories`,
    });
    res.json({ ok: true });
  }),
);

router.get(
  '/advisories/mine',
  requireAuth,
  asyncHandler(async (req, res) => {
    const rows = getDb()
      .prepare(
        `SELECT a.*, u.name AS agronomist_name FROM advisories a
         LEFT JOIN users u ON u.id = a.assigned_to
         WHERE a.user_id = ? ORDER BY a.id DESC`,
      )
      .all(req.user.id);
    res.json({ items: rows });
  }),
);

export default router;
