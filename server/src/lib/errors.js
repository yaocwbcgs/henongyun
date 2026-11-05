export class AppError extends Error {
  constructor(status, code, message, details) {
    super(message);
    this.status = status;
    this.code = code;
    this.details = details;
    this.expose = true;
  }
}

export const badRequest = (msg, details) => new AppError(400, 'BAD_REQUEST', msg, details);
export const unauthorized = (msg = '请先登录') => new AppError(401, 'UNAUTHORIZED', msg);
export const forbidden = (msg = '没有操作权限') => new AppError(403, 'FORBIDDEN', msg);
export const notFound = (msg = '资源不存在') => new AppError(404, 'NOT_FOUND', msg);
export const conflict = (msg, details) => new AppError(409, 'CONFLICT', msg, details);
export const tooMany = (msg = '操作过于频繁，请稍后再试') => new AppError(429, 'RATE_LIMITED', msg);
export const unprocessable = (msg, details) => new AppError(422, 'UNPROCESSABLE', msg, details);
export const serviceUnavailable = (msg, details) => new AppError(503, 'SERVICE_UNAVAILABLE', msg, details);
