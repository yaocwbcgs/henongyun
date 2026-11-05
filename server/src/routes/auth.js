import { Router } from 'express';
import { z } from 'zod';
import rateLimit from 'express-rate-limit';
import config from '../config.js';
import { getDb } from '../db/index.js';
import { parse } from '../lib/validate.js';
import { badRequest, unauthorized, conflict, tooMany } from '../lib/errors.js';
import { hashPassword, verifyPassword, sha256, randomToken, randomNumericCode, signAccessToken } from '../lib/security.js';
import { requireAuth } from '../middleware/auth.js';
import { asyncHandler } from '../middleware/error.js';
import { sendVerificationCode, mailerReady } from '../services/mailer.js';
import { unreadCounts } from '../services/notify.js';
import { logger } from '../lib/logger.js';

const router = Router();

const COOKIE = 'hn_refresh';
const cookieOpts = {
  httpOnly: true,
  sameSite: 'lax',
  secure: config.isProd,
  path: '/api/auth',
  maxAge: config.jwt.refreshTtl * 1000,
};

const authLimiter = rateLimit({
  windowMs: 60_000,
  max: config.rateLimit.authMax,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: { code: 'RATE_LIMITED', message: '尝试次数过多，请 1 分钟后再试' } },
});

const emailSchema = z.string().trim().toLowerCase().email('请输入有效的邮箱地址').max(160);
const passwordSchema = z
  .string()
  .min(8, '密码至少 8 位')
  .max(72, '密码最多 72 位')
  .regex(/[A-Za-z]/, '密码需包含字母')
  .regex(/\d/, '密码需包含数字');

function publicUser(row) {
  if (!row) return null;
  const db = getDb();
  const merchant = db.prepare('SELECT shop_name, status FROM merchant_profiles WHERE user_id = ?').get(row.id);
  return {
    id: row.id,
    name: row.name,
    email: row.email,
    phone: row.phone,
    role: row.role,
    avatarUrl: row.avatar_url,
    region: row.region,
    bio: row.bio,
    status: row.status,
    merchant: merchant ? { shopName: merchant.shop_name, status: merchant.status } : null,
    createdAt: row.created_at,
  };
}

function issueSession(user, req, res) {
  const db = getDb();
  const raw = randomToken(48);
  const expiresAt = new Date(Date.now() + config.jwt.refreshTtl * 1000);
  db.prepare(
    'INSERT INTO refresh_tokens (user_id, token_hash, expires_at, user_agent) VALUES (?,?,?,?)',
  ).run(user.id, sha256(raw), expiresAt.toISOString(), (req.headers['user-agent'] || '').slice(0, 240));
  res.cookie(COOKIE, raw, cookieOpts);
  return { ...publicUser(user), accessToken: signAccessToken(user) };
}


router.post(
  '/register',
  authLimiter,
  asyncHandler(async (req, res) => {
    const body = parse(
      z.object({
        name: z.string().trim().min(2, '请填写真实称呼').max(30),
        email: emailSchema,
        password: passwordSchema,
        phone: z.string().trim().regex(/^1[3-9]\d{9}$/, '手机号格式不正确').optional().or(z.literal('')),
        region: z.string().trim().max(60).optional(),
      }),
      req.body,
    );
    const db = getDb();
    if (db.prepare('SELECT id FROM users WHERE email = ?').get(body.email)) {
      throw conflict('该邮箱已注册，请直接登录');
    }
    if (body.phone && db.prepare('SELECT id FROM users WHERE phone = ?').get(body.phone)) {
      throw conflict('该手机号已被使用');
    }
    const info = db
      .prepare('INSERT INTO users (email, phone, password_hash, name, region) VALUES (?,?,?,?,?)')
      .run(body.email, body.phone || null, hashPassword(body.password), body.name, body.region || null);
    const user = db.prepare('SELECT * FROM users WHERE id = ?').get(info.lastInsertRowid);
    logger.info('auth.registered', { userId: user.id });
    res.status(201).json({ user: issueSession(user, req, res) });
  }),
);

router.post(
  '/login',
  authLimiter,
  asyncHandler(async (req, res) => {
    const body = parse(
      z.object({ email: emailSchema, password: z.string().min(1, '请输入密码') }),
      req.body,
    );
    const db = getDb();
    const user = db.prepare('SELECT * FROM users WHERE email = ?').get(body.email);
    if (!user || !verifyPassword(body.password, user.password_hash)) {
      throw unauthorized('邮箱或密码不正确');
    }
    if (user.status !== 'active') throw unauthorized('账号已被停用，请联系平台');
    res.json({ user: issueSession(user, req, res) });
  }),
);

router.post(
  '/refresh',
  asyncHandler(async (req, res) => {
    const raw = req.cookies?.[COOKIE];
    if (!raw) throw unauthorized('登录状态已失效，请重新登录');
    const db = getDb();
    const row = db
      .prepare('SELECT * FROM refresh_tokens WHERE token_hash = ? AND revoked_at IS NULL')
      .get(sha256(raw));
    if (!row) throw unauthorized('登录状态已失效，请重新登录');
    if (new Date(row.expires_at).getTime() < Date.now()) {
      db.prepare('UPDATE refresh_tokens SET revoked_at = datetime(\'now\',\'localtime\') WHERE id = ?').run(row.id);
      throw unauthorized('登录已过期，请重新登录');
    }
    const user = db.prepare('SELECT * FROM users WHERE id = ?').get(row.user_id);
    if (!user || user.status !== 'active') throw unauthorized('账号不可用');
    // 旋转刷新令牌
    db.prepare('UPDATE refresh_tokens SET revoked_at = datetime(\'now\',\'localtime\') WHERE id = ?').run(row.id);
    res.json({ user: issueSession(user, req, res) });
  }),
);

router.post(
  '/logout',
  asyncHandler(async (req, res) => {
    const raw = req.cookies?.[COOKIE];
    if (raw) {
      getDb()
        .prepare('UPDATE refresh_tokens SET revoked_at = datetime(\'now\',\'localtime\') WHERE token_hash = ?')
        .run(sha256(raw));
    }
    res.clearCookie(COOKIE, { ...cookieOpts, maxAge: undefined });
    res.json({ ok: true });
  }),
);

router.post(
  '/password/forgot',
  authLimiter,
  asyncHandler(async (req, res) => {
    const { email } = parse(z.object({ email: emailSchema }), req.body);
    if (!mailerReady()) {
      return res.status(503).json({
        error: {
          code: 'EMAIL_NOT_CONFIGURED',
          message: '邮件服务尚未配置，暂时无法发送重置验证码。请联系平台管理员在服务端配置 SMTP 后重试。',
        },
      });
    }
    const db = getDb();
    const user = db.prepare('SELECT id, name FROM users WHERE email = ?').get(email);
    // 无论账号是否存在都返回相同结果，避免邮箱枚举
    if (user) {
      const code = randomNumericCode(6);
      db.prepare(
        `INSERT INTO verification_codes (identifier, purpose, code_hash, expires_at)
         VALUES (?, 'reset_password', ?, datetime('now','localtime','+10 minutes'))`,
      ).run(email, sha256(code));
      await sendVerificationCode(email, code, 'reset_password');
      logger.info('auth.reset_code_sent', { userId: user.id });
    }
    res.json({ ok: true, message: '如果该邮箱已注册，验证码将在几分钟内送达' });
  }),
);

router.post(
  '/password/reset',
  authLimiter,
  asyncHandler(async (req, res) => {
    const body = parse(
      z.object({ email: emailSchema, code: z.string().length(6, '请输入 6 位验证码'), password: passwordSchema }),
      req.body,
    );
    const db = getDb();
    const record = db
      .prepare(
        `SELECT * FROM verification_codes
         WHERE identifier = ? AND purpose = 'reset_password' AND consumed_at IS NULL
         ORDER BY id DESC LIMIT 1`,
      )
      .get(body.email);
    if (!record) throw badRequest('请先获取验证码');
    if (new Date(record.expires_at.replace(' ', 'T')).getTime() < Date.now()) throw badRequest('验证码已过期，请重新获取');
    if (record.attempts >= 5) throw tooMany('验证码尝试次数过多，请重新获取');
    if (record.code_hash !== sha256(body.code)) {
      db.prepare('UPDATE verification_codes SET attempts = attempts + 1 WHERE id = ?').run(record.id);
      throw badRequest('验证码不正确');
    }
    const user = db.prepare('SELECT id FROM users WHERE email = ?').get(body.email);
    if (!user) throw badRequest('账号不存在');
    db.transaction(() => {
      db.prepare("UPDATE verification_codes SET consumed_at = datetime('now','localtime') WHERE id = ?").run(record.id);
      db.prepare("UPDATE users SET password_hash = ?, updated_at = datetime('now','localtime') WHERE id = ?").run(
        hashPassword(body.password),
        user.id,
      );
      db.prepare(
        "UPDATE refresh_tokens SET revoked_at = datetime('now','localtime') WHERE user_id = ? AND revoked_at IS NULL",
      ).run(user.id);
    })();
    res.clearCookie(COOKIE, { ...cookieOpts, maxAge: undefined });
    logger.info('auth.password_reset', { userId: user.id });
    res.json({ ok: true, message: '密码已重置，请使用新密码登录' });
  }),
);

router.get('/me', requireAuth, (req, res) => {
  const db = getDb();
  const row = db.prepare('SELECT * FROM users WHERE id = ?').get(req.user.id);
  res.json({ user: publicUser(row), counts: unreadCounts(req.user.id) });
});

export default router;
