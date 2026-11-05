import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import sharp from 'sharp';
import config from '../config.js';
import { getDb } from '../db/index.js';
import { badRequest, unprocessable } from '../lib/errors.js';

const ALLOWED = new Set(['image/jpeg', 'image/png', 'image/webp']);
const MAX_BYTES = 8 * 1024 * 1024;
const MIN_EDGE = 640;

export const ALLOWED_MIME = ALLOWED;

export function assertImage(file) {
  if (!file) throw badRequest('请选择要上传的图片');
  if (!ALLOWED.has(file.mimetype)) throw unprocessable('仅支持 JPG、PNG、WebP 格式的图片');
  if (file.size > MAX_BYTES) throw unprocessable('图片不能超过 8MB');
}

/**
 * 真实图像质量评估：使用 sharp 读取实际像素，计算分辨率、亮度、对比度与清晰度。
 * 这些指标来自图像本身，不是编造的置信度。
 */
export async function inspectImage(buffer) {
  const image = sharp(buffer, { failOn: 'error' });
  const meta = await image.metadata();
  const { data, info } = await image
    .clone()
    .resize({ width: 320, height: 320, fit: 'inside' })
    .greyscale()
    .raw()
    .toBuffer({ resolveWithObject: true });

  let sum = 0;
  let sumSq = 0;
  for (let i = 0; i < data.length; i++) {
    sum += data[i];
    sumSq += data[i] * data[i];
  }
  const n = data.length;
  const mean = sum / n;
  const variance = Math.max(0, sumSq / n - mean * mean);
  const contrast = Math.sqrt(variance);

  // Laplacian 方差近似清晰度
  const w = info.width;
  const h = info.height;
  let lapSum = 0;
  let lapSq = 0;
  let count = 0;
  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      const i = y * w + x;
      const v = 4 * data[i] - data[i - 1] - data[i + 1] - data[i - w] - data[i + w];
      lapSum += v;
      lapSq += v * v;
      count++;
    }
  }
  const sharpness = count ? Math.max(0, lapSq / count - (lapSum / count) ** 2) : 0;

  const shortEdge = Math.min(meta.width || 0, meta.height || 0);
  const issues = [];
  if (shortEdge < MIN_EDGE) issues.push(`图片短边仅 ${shortEdge}px，建议不低于 ${MIN_EDGE}px`);
  if (mean < 45) issues.push('画面偏暗，可能影响病斑细节判断');
  if (mean > 225) issues.push('画面过曝，细节可能丢失');
  if (contrast < 22) issues.push('画面对比度偏低');
  if (sharpness < 18) issues.push('画面可能失焦或抖动');

  return {
    width: meta.width,
    height: meta.height,
    format: meta.format,
    meanBrightness: Number(mean.toFixed(1)),
    contrast: Number(contrast.toFixed(1)),
    sharpnessScore: Number(sharpness.toFixed(1)),
    issues,
    acceptable: issues.length === 0,
  };
}

export async function storeImage(file, userId, purpose = 'general') {
  assertImage(file);
  const quality = await inspectImage(file.buffer).catch(() => {
    throw unprocessable('图片无法解析，请更换图片后重试');
  });

  const now = new Date();
  const dir = path.join(config.uploadDir, String(now.getFullYear()), String(now.getMonth() + 1).padStart(2, '0'));
  await fs.mkdir(dir, { recursive: true });
  const id = crypto.randomUUID();
  const key = path.join(String(now.getFullYear()), String(now.getMonth() + 1).padStart(2, '0'), `${id}.jpg`);
  const abs = path.join(config.uploadDir, key);
  const thumbKey = key.replace(/\.jpg$/, '-thumb.jpg');

  // 重新编码，剥离 EXIF 与潜在恶意载荷
  await sharp(file.buffer)
    .rotate()
    .resize({ width: 2000, height: 2000, fit: 'inside', withoutEnlargement: true })
    .jpeg({ quality: 88, mozjpeg: true })
    .toFile(abs);
  await sharp(file.buffer)
    .rotate()
    .resize({ width: 520, height: 520, fit: 'cover' })
    .jpeg({ quality: 80, mozjpeg: true })
    .toFile(path.join(config.uploadDir, thumbKey));

  const info = await sharp(abs).metadata();
  const stat = await fs.stat(abs);
  const db = getDb();
  const res = db
    .prepare(
      `INSERT INTO uploads (user_id, storage_key, original_name, mime, size, width, height, purpose)
       VALUES (?,?,?,?,?,?,?,?)`,
    )
    .run(userId, key, file.originalname?.slice(0, 200) || 'image.jpg', 'image/jpeg', stat.size, info.width, info.height, purpose);

  return {
    id: Number(res.lastInsertRowid),
    url: `/uploads/${key.split(path.sep).join('/')}`,
    thumbUrl: `/uploads/${thumbKey.split(path.sep).join('/')}`,
    width: info.width,
    height: info.height,
    size: stat.size,
    quality,
  };
}

export function deleteImage(uploadId, userId) {
  const db = getDb();
  const row = db.prepare('SELECT * FROM uploads WHERE id = ?').get(uploadId);
  if (!row || (userId && row.user_id !== userId)) return false;
  fs.rm(path.join(config.uploadDir, row.storage_key), { force: true }).catch(() => {});
  fs.rm(path.join(config.uploadDir, row.storage_key.replace(/\.jpg$/, '-thumb.jpg')), { force: true }).catch(() => {});
  db.prepare('DELETE FROM uploads WHERE id = ?').run(uploadId);
  return true;
}

export function imageUrl(uploadId) {
  if (!uploadId) return null;
  const row = getDb().prepare('SELECT storage_key FROM uploads WHERE id = ?').get(uploadId);
  return row ? `/uploads/${row.storage_key.split(path.sep).join('/')}` : null;
}
