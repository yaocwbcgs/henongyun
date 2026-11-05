import { ZodError } from 'zod';
import { badRequest } from './errors.js';

export function parse(schema, data) {
  try {
    return schema.parse(data);
  } catch (err) {
    if (err instanceof ZodError) {
      const details = err.issues.map((i) => ({ field: i.path.join('.'), message: i.message }));
      throw badRequest('提交的信息不完整或格式不正确', details);
    }
    throw err;
  }
}

export const pageSchema = (max = 50) => ({
  page: 1,
  pageSize: 12,
  max,
});

export function parsePagination(query, defaultSize = 12, maxSize = 50) {
  const page = Math.max(1, Number.parseInt(query.page, 10) || 1);
  const pageSize = Math.min(maxSize, Math.max(1, Number.parseInt(query.pageSize, 10) || defaultSize));
  return { page, pageSize, offset: (page - 1) * pageSize };
}

export function toInt(value, fallback = null) {
  const n = Number.parseInt(value, 10);
  return Number.isFinite(n) ? n : fallback;
}

/** 防 LIKE 注入的通配符转义 */
export function likeParam(q) {
  return `%${String(q).replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
}
