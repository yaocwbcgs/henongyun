import crypto from 'node:crypto';

const levels = { debug: 10, info: 20, warn: 30, error: 40 };
const threshold = levels[process.env.LOG_LEVEL || 'info'] || 20;
const redactKeys = new Set(['password', 'passwordHash', 'token', 'accessToken', 'refreshToken', 'code', 'authorization', 'apiKey', 'secret']);

function redact(value, depth = 0) {
  if (depth > 4 || value === null || typeof value !== 'object') return value;
  if (Array.isArray(value)) return value.map((v) => redact(v, depth + 1));
  const out = {};
  for (const [k, v] of Object.entries(value)) {
    out[k] = redactKeys.has(k) ? '[REDACTED]' : redact(v, depth + 1);
  }
  return out;
}

function write(level, message, meta = {}) {
  if (levels[level] < threshold) return;
  const entry = {
    ts: new Date().toISOString(),
    level,
    msg: message,
    ...redact(meta),
  };
  const line = JSON.stringify(entry);
  if (level === 'error') console.error(line);
  else if (level === 'warn') console.warn(line);
  else console.log(line);
}

export const logger = {
  debug: (msg, meta) => write('debug', msg, meta),
  info: (msg, meta) => write('info', msg, meta),
  warn: (msg, meta) => write('warn', msg, meta),
  error: (msg, meta) => write('error', msg, meta),
  child(bindings) {
    return {
      debug: (m, meta) => write('debug', m, { ...bindings, ...meta }),
      info: (m, meta) => write('info', m, { ...bindings, ...meta }),
      warn: (m, meta) => write('warn', m, { ...bindings, ...meta }),
      error: (m, meta) => write('error', m, { ...bindings, ...meta }),
    };
  },
};

export function requestLogger(req, res, next) {
  const start = Date.now();
  req.requestId = req.headers['x-request-id'] || crypto.randomUUID();
  res.setHeader('x-request-id', req.requestId);
  res.on('finish', () => {
    const meta = {
      requestId: req.requestId,
      method: req.method,
      path: req.originalUrl.split('?')[0],
      status: res.statusCode,
      ms: Date.now() - start,
      userId: req.user?.id,
      ip: req.ip,
    };
    if (res.statusCode >= 500) logger.error('request.failed', meta);
    else if (res.statusCode >= 400) logger.warn('request.rejected', meta);
    else logger.info('request.done', meta);
  });
  next();
}
