import dotenv from 'dotenv';
import path from 'node:path';
import fs from 'node:fs';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

// 以 server/ 目录为基准，保证从任意工作目录启动时数据与上传路径一致
const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');
dotenv.config({ path: path.join(root, '.env') });
const env = process.env.NODE_ENV || 'development';
const isProd = env === 'production';

const bool = (v, d = false) => (v === undefined ? d : ['1', 'true', 'yes', 'on'].includes(String(v).toLowerCase()));
const int = (v, d) => (v === undefined || v === '' ? d : Number.parseInt(v, 10));

const config = {
  env,
  isProd,
  port: int(process.env.PORT, 3001),
  appName: '禾农云',
  publicBaseUrl: process.env.PUBLIC_BASE_URL || `http://localhost:${int(process.env.PORT, 3001)}`,
  webOrigins: (process.env.WEB_ORIGIN || 'http://localhost:5173,http://localhost:3001')
    .split(',').map((s) => s.trim()).filter(Boolean),
  dataDir: path.resolve(root, process.env.DATA_DIR || './data'),
  uploadDir: path.resolve(root, process.env.UPLOAD_DIR || './uploads'),
  dbPath: path.resolve(root, process.env.DB_PATH || './data/henongyun.db'),
  jwt: {
    secret: process.env.JWT_SECRET || '',
    accessTtl: int(process.env.ACCESS_TOKEN_TTL, 900), // 15 min
    refreshTtl: int(process.env.REFRESH_TOKEN_TTL, 60 * 60 * 24 * 7),
  },
  mail: {
    host: process.env.SMTP_HOST || '',
    port: int(process.env.SMTP_PORT, 465),
    secure: bool(process.env.SMTP_SECURE, true),
    user: process.env.SMTP_USER || '',
    pass: process.env.SMTP_PASS || '',
    from: process.env.MAIL_FROM || '',
  },
  recognition: {
    provider: process.env.RECOGNITION_PROVIDER || 'plantid',
    apiKey: process.env.PLANTID_API_KEY || '',
    baseUrl: process.env.PLANTID_BASE_URL || 'https://api.plant.id/v3',
    detailUrl: process.env.UNSPLASH_DETAIL_URL || '',
  },
  payment: {
    provider: process.env.PAYMENT_PROVIDER || 'stripe',
    stripeSecret: process.env.STRIPE_SECRET_KEY || '',
    stripeWebhookSecret: process.env.STRIPE_WEBHOOK_SECRET || '',
    currency: (process.env.PAYMENT_CURRENCY || 'cny').toLowerCase(),
    enabled: Boolean(process.env.STRIPE_SECRET_KEY),
  },
  market: {
    apiUrl: process.env.MARKET_API_URL || '',
    apiKey: process.env.MARKET_API_KEY || '',
  },
  rateLimit: {
    windowMs: int(process.env.RATE_LIMIT_WINDOW_MS, 60_000),
    max: int(process.env.RATE_LIMIT_MAX, 300),
    authMax: int(process.env.AUTH_RATE_LIMIT_MAX, 12),
  },
  demoSeed: bool(process.env.DEMO_SEED, true),
};

export function loadConfig() {
  const problems = [];
  if (isProd && (!config.jwt.secret || config.jwt.secret.length < 32)) {
    problems.push('生产环境必须设置至少 32 位的 JWT_SECRET');
  }
  if (!config.jwt.secret) {
    config.jwt.secret = crypto.randomBytes(48).toString('hex');
    config.jwt.secretGenerated = true;
  }
  if (isProd && config.webOrigins.includes('*')) problems.push('生产环境 CORS 不允许通配符来源');
  for (const dir of [config.dataDir, config.uploadDir]) {
    fs.mkdirSync(dir, { recursive: true });
  }
  config.integrations = {
    email: Boolean(config.mail.host && config.mail.user && config.mail.pass),
    recognition: Boolean(config.recognition.apiKey),
    payment: config.payment.enabled,
    marketApi: Boolean(config.market.apiUrl && config.market.apiKey),
  };
  if (problems.length) {
    const err = new Error(`配置校验失败：\n- ${problems.join('\n- ')}`);
    err.code = 'CONFIG_INVALID';
    throw err;
  }
  return config;
}

export default config;
