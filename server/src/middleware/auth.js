import { getDb } from '../db/index.js';
import { unauthorized, forbidden } from '../lib/errors.js';
import { verifyAccessToken } from '../lib/security.js';

function resolveUser(req) {
  const header = req.headers.authorization || '';
  if (!header.startsWith('Bearer ')) return null;
  try {
    const payload = verifyAccessToken(header.slice(7));
    const user = getDb()
      .prepare('SELECT id, name, role, status, email, phone, avatar_url FROM users WHERE id = ?')
      .get(Number(payload.sub));
    if (!user || user.status !== 'active') return null;
    return user;
  } catch {
    return null;
  }
}

export function optionalAuth(req, _res, next) {
  req.user = resolveUser(req);
  next();
}

export function requireAuth(req, _res, next) {
  const user = resolveUser(req);
  if (!user) return next(unauthorized('登录状态已失效，请重新登录'));
  req.user = user;
  next();
}

export function requireRole(...roles) {
  return (req, _res, next) => {
    if (!req.user) return next(unauthorized());
    if (!roles.includes(req.user.role)) return next(forbidden('当前账号无权执行此操作'));
    next();
  };
}

export function requireMerchant(req, _res, next) {
  if (!req.user) return next(unauthorized());
  if (req.user.role === 'admin') return next();
  if (req.user.role !== 'merchant') return next(forbidden('请先完成商家入驻并通过审核'));
  const profile = getDb()
    .prepare('SELECT status FROM merchant_profiles WHERE user_id = ?')
    .get(req.user.id);
  if (!profile || profile.status !== 'approved') return next(forbidden('商家资质尚未通过审核'));
  next();
}

export function isAdmin(user) {
  return user?.role === 'admin';
}
