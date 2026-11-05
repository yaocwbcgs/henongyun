import Database from 'better-sqlite3';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import config from '../config.js';
import { logger } from '../lib/logger.js';

const here = path.dirname(fileURLToPath(import.meta.url));

let db;

export function getDb() {
  if (!db) throw new Error('数据库尚未初始化');
  return db;
}

export function initDb() {
  if (db) return db;
  fs.mkdirSync(path.dirname(config.dbPath), { recursive: true });
  db = new Database(config.dbPath);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  db.pragma('busy_timeout = 5000');
  migrate(db);
  logger.info('db.ready', { path: config.dbPath });
  return db;
}

function migrate(conn) {
  conn.exec(`CREATE TABLE IF NOT EXISTS schema_migrations (
    id TEXT PRIMARY KEY,
    applied_at TEXT NOT NULL DEFAULT (datetime('now','localtime'))
  )`);
  const applied = new Set(conn.prepare('SELECT id FROM schema_migrations').all().map((r) => r.id));
  const files = [];
  const migrationsDir = path.join(here, 'migrations');
  if (fs.existsSync(migrationsDir)) {
    for (const f of fs.readdirSync(migrationsDir).filter((f) => f.endsWith('.sql')).sort()) {
      files.push({ id: f.replace(/\.sql$/, ''), file: path.join(migrationsDir, f) });
    }
  }
  if (!applied.has('001_init')) {
    files.unshift({ id: '001_init', file: path.join(here, 'schema.sql') });
  }
  for (const m of files) {
    if (applied.has(m.id)) continue;
    const sql = fs.readFileSync(m.file, 'utf8');
    const run = conn.transaction(() => {
      conn.exec(sql);
      conn.prepare('INSERT INTO schema_migrations (id) VALUES (?)').run(m.id);
    });
    run();
    logger.info('db.migrated', { id: m.id });
  }
}

export function tx(fn) {
  return getDb().transaction(fn)();
}

export function closeDb() {
  if (db) {
    db.close();
    db = null;
  }
}
