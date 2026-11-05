import http from 'node:http';
import config, { loadConfig } from './config.js';
import { logger } from './lib/logger.js';
import { initDb, closeDb, getDb } from './db/index.js';
import { seed } from './db/seed.js';
import { createApp } from './app.js';
import { startJobs, stopJobs } from './jobs/index.js';

async function main() {
  loadConfig();
  initDb();

  if (config.demoSeed) {
    const result = seed();
    if (!result.skipped) {
      logger.warn('seed.demo_created', {
        note: '演示账号仅用于本地验证，生产环境请设置 DEMO_SEED=false',
        accounts: result.users.map((u) => u.email),
      });
    }
  }

  const app = createApp();
  const server = http.createServer(app);
  server.headersTimeout = 65_000;
  server.requestTimeout = 30_000;
  server.keepAliveTimeout = 62_000;

  server.listen(config.port, () => {
    logger.info('server.listening', {
      port: config.port,
      env: config.env,
      baseUrl: config.publicBaseUrl,
      integrations: config.integrations,
    });
    if (config.jwt.secretGenerated) {
      logger.warn('config.jwt_secret_ephemeral', { note: '未设置 JWT_SECRET，已生成临时密钥；重启后所有登录会话失效' });
    }
  });

  startJobs();

  let shuttingDown = false;
  const shutdown = (signal) => {
    if (shuttingDown) return;
    shuttingDown = true;
    logger.info('server.shutdown', { signal });
    stopJobs();
    server.close(() => {
      try {
        closeDb();
      } catch (err) {
        logger.error('db.close_failed', { message: err.message });
      }
      logger.info('server.closed');
      process.exit(0);
    });
    setTimeout(() => process.exit(1), 10_000).unref();
  };
  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('unhandledRejection', (reason) => {
    logger.error('process.unhandled_rejection', { message: reason?.message || String(reason) });
  });
}

main().catch((err) => {
  logger.error('server.boot_failed', { message: err.message, stack: err.stack?.split('\n').slice(0, 5).join(' | ') });
  process.exit(1);
});
