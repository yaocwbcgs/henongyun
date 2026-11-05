import { AppError } from '../lib/errors.js';
import { logger } from '../lib/logger.js';

export const asyncHandler = (fn) => (req, res, next) => {
  Promise.resolve(fn(req, res, next)).catch(next);
};

export function notFoundHandler(req, res) {
  res.status(404).json({ error: { code: 'NOT_FOUND', message: '接口不存在' } });
}

export function errorHandler(err, req, res, _next) {
  if (err instanceof AppError) {
    return res.status(err.status).json({
      error: { code: err.code, message: err.message, details: err.details },
    });
  }
  if (err?.code === 'SQLITE_CONSTRAINT_UNIQUE') {
    return res.status(409).json({ error: { code: 'CONFLICT', message: '该记录已存在，请勿重复提交' } });
  }
  if (err?.code === 'LIMIT_FILE_SIZE') {
    return res.status(413).json({ error: { code: 'FILE_TOO_LARGE', message: '文件超出大小限制' } });
  }
  logger.error('unhandled.error', {
    requestId: req.requestId,
    message: err?.message,
    stack: err?.stack?.split('\n').slice(0, 6).join(' | '),
  });
  res.status(500).json({ error: { code: 'INTERNAL', message: '服务暂时不可用，请稍后重试' } });
}
