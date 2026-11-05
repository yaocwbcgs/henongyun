import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import rateLimit from 'express-rate-limit';
import config from './config.js';
import { requestLogger, logger } from './lib/logger.js';
import { notFoundHandler, errorHandler } from './middleware/error.js';
import { optionalAuth } from './middleware/auth.js';
import { getDb } from './db/index.js';
import { hub } from './realtime/hub.js';
import { paymentStatus } from './services/payments.js';
import { recognitionStatus } from './services/recognition.js';

import authRoutes from './routes/auth.js';
import userRoutes from './routes/users.js';
import uploadRoutes from './routes/uploads.js';
import diagnoseRoutes from './routes/diagnose.js';
import knowledgeRoutes from './routes/knowledge.js';
import postRoutes from './routes/posts.js';
import messageRoutes from './routes/messages.js';
import notificationRoutes from './routes/notifications.js';
import eventRoutes from './routes/events.js';
import machineryRoutes from './routes/machinery.js';
import shopRoutes from './routes/shop.js';
import marketRoutes from './routes/market.js';
import merchantRoutes from './routes/merchant.js';
import adminRoutes from './routes/admin.js';
import complaintRoutes from './routes/complaints.js';
import paymentRoutes from './routes/payments.js';

export function createApp() {
  const app = express();
  app.set('trust proxy', 1);
  app.disable('x-powered-by');

  app.use(
    helmet({
      contentSecurityPolicy: false,
      crossOriginResourcePolicy: { policy: 'cross-origin' },
    }),
  );
  app.use(
    cors({
      origin(origin, cb) {
        if (!origin || config.webOrigins.includes(origin)) return cb(null, true);
        cb(new Error('来源不被允许'));
      },
      credentials: true,
    }),
  );
  app.use(requestLogger);

  // webhook 需要原始 body，必须在 express.json 之前挂载
  app.use('/api/payments', paymentRoutes);

  app.use(express.json({ limit: '1mb' }));
  app.use(express.urlencoded({ extended: false }));
  app.use(cookieParser());

  const globalLimiter = rateLimit({
    windowMs: config.rateLimit.windowMs,
    max: config.rateLimit.max,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: { code: 'RATE_LIMITED', message: '请求过于频繁，请稍后再试' } },
  });
  app.use('/api', globalLimiter);
  // 解析可选的登录态：公开接口也能识别当前用户（收藏状态、卖家视角等）
  app.use('/api', optionalAuth);

  app.use('/uploads', express.static(config.uploadDir, { maxAge: '7d', fallthrough: true }));

  app.get('/health', (_req, res) => res.json({ status: 'ok', uptime: process.uptime() }));
  app.get('/ready', (_req, res) => {
    try {
      getDb().prepare('SELECT 1').get();
      res.json({ status: 'ready' });
    } catch {
      res.status(503).json({ status: 'not_ready' });
    }
  });

  app.use('/api/auth', authRoutes);
  app.use('/api/users', userRoutes);
  app.use('/api/uploads', uploadRoutes);
  app.use('/api/diagnoses', diagnoseRoutes);
  app.use('/api/knowledge', knowledgeRoutes);
  app.use('/api/posts', postRoutes);
  app.use('/api/conversations', messageRoutes);
  app.use('/api/notifications', notificationRoutes);
  app.use('/api/events', eventRoutes);
  app.use('/api/machinery', machineryRoutes);
  app.use('/api/shop', shopRoutes);
  app.use('/api/market', marketRoutes);
  app.use('/api/merchant', merchantRoutes);
  app.use('/api/admin', adminRoutes);
  app.use('/api/complaints', complaintRoutes);

  app.get('/api/system/info', (_req, res) => {
    res.json({
      name: '禾农云',
      demoMode: config.demoSeed,
      env: config.env,
      integrations: {
        recognition: config.integrations.recognition,
        payment: config.integrations.payment,
        email: config.integrations.email,
        marketApi: config.integrations.marketApi,
      },
      recognition: recognitionStatus(),
      payment: paymentStatus(),
    });
  });

  // 生产：托管前端构建产物
  const webDist = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../web/dist');
  if (fs.existsSync(webDist)) {
    app.use(express.static(webDist, { index: false, maxAge: '1h' }));
    app.get(/^(?!\/api|\/uploads|\/health|\/ready).*/, (req, res, next) => {
      if (req.method !== 'GET') return next();
      res.sendFile(path.join(webDist, 'index.html'));
    });
  }

  app.use('/api', notFoundHandler);
  app.use(errorHandler);

  hub.start();
  logger.info('app.created', { env: config.env });
  return app;
}
