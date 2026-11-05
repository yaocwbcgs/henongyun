PRAGMA foreign_keys = ON;

-- ============ 用户与权限 ============
CREATE TABLE IF NOT EXISTS users (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  phone         TEXT UNIQUE,
  email         TEXT UNIQUE,
  password_hash TEXT NOT NULL,
  name          TEXT NOT NULL,
  role          TEXT NOT NULL DEFAULT 'user' CHECK (role IN ('user','merchant','agronomist','admin')),
  status        TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','disabled')),
  avatar_url    TEXT,
  region        TEXT,
  bio           TEXT,
  created_at    TEXT NOT NULL DEFAULT (datetime('now','localtime')),
  updated_at    TEXT NOT NULL DEFAULT (datetime('now','localtime'))
);

CREATE TABLE IF NOT EXISTS refresh_tokens (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash TEXT NOT NULL UNIQUE,
  expires_at TEXT NOT NULL,
  revoked_at TEXT,
  user_agent TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now','localtime'))
);
CREATE INDEX IF NOT EXISTS idx_refresh_user ON refresh_tokens(user_id);

-- 一次性验证码（邮箱验证 / 找回密码），仅存哈希
CREATE TABLE IF NOT EXISTS verification_codes (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  identifier TEXT NOT NULL,
  purpose    TEXT NOT NULL CHECK (purpose IN ('reset_password','verify_email')),
  code_hash  TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  consumed_at TEXT,
  attempts   INTEGER NOT NULL DEFAULT 0,
  sent_at    TEXT NOT NULL DEFAULT (datetime('now','localtime'))
);
CREATE INDEX IF NOT EXISTS idx_codes_lookup ON verification_codes(identifier, purpose);

CREATE TABLE IF NOT EXISTS addresses (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  receiver   TEXT NOT NULL,
  phone      TEXT NOT NULL,
  province   TEXT NOT NULL,
  city       TEXT NOT NULL,
  district   TEXT NOT NULL,
  detail     TEXT NOT NULL,
  is_default INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now','localtime'))
);
CREATE INDEX IF NOT EXISTS idx_addr_user ON addresses(user_id);

CREATE TABLE IF NOT EXISTS merchant_profiles (
  user_id      INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  shop_name    TEXT NOT NULL,
  contact_name TEXT NOT NULL,
  contact_phone TEXT NOT NULL,
  region       TEXT NOT NULL,
  business_type TEXT NOT NULL,
  license_no   TEXT,
  intro        TEXT,
  status       TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','rejected')),
  review_note  TEXT,
  reviewed_by  INTEGER REFERENCES users(id),
  applied_at   TEXT NOT NULL DEFAULT (datetime('now','localtime')),
  reviewed_at  TEXT
);

CREATE TABLE IF NOT EXISTS favorites (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  target_type TEXT NOT NULL CHECK (target_type IN ('post','product','machinery','knowledge')),
  target_id   INTEGER NOT NULL,
  created_at  TEXT NOT NULL DEFAULT (datetime('now','localtime')),
  UNIQUE (user_id, target_type, target_id)
);

-- ============ 文件 ============
CREATE TABLE IF NOT EXISTS uploads (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id       INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  storage_key   TEXT NOT NULL,
  original_name TEXT NOT NULL,
  mime          TEXT NOT NULL,
  size          INTEGER NOT NULL,
  width         INTEGER,
  height        INTEGER,
  purpose       TEXT NOT NULL DEFAULT 'general',
  created_at    TEXT NOT NULL DEFAULT (datetime('now','localtime'))
);

-- ============ 病虫害识别 ============
CREATE TABLE IF NOT EXISTS diagnoses (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id        INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  crop           TEXT NOT NULL,
  symptoms       TEXT,
  growth_stage   TEXT,
  image_upload_id INTEGER REFERENCES uploads(id),
  status         TEXT NOT NULL DEFAULT 'queued'
                 CHECK (status IN ('queued','processing','completed','failed','out_of_scope','needs_review')),
  provider       TEXT,
  provider_ref   TEXT,
  quality_json   TEXT,
  result_json    TEXT,
  failure_reason TEXT,
  created_at     TEXT NOT NULL DEFAULT (datetime('now','localtime')),
  completed_at   TEXT
);
CREATE INDEX IF NOT EXISTS idx_diag_user ON diagnoses(user_id, created_at DESC);

CREATE TABLE IF NOT EXISTS knowledge_articles (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  slug        TEXT NOT NULL UNIQUE,
  title       TEXT NOT NULL,
  crop        TEXT NOT NULL,
  category    TEXT NOT NULL,
  summary     TEXT NOT NULL,
  content     TEXT NOT NULL,
  symptoms    TEXT,
  conditions  TEXT,
  source_name TEXT NOT NULL,
  source_url  TEXT,
  cover_url   TEXT,
  status      TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','published','archived')),
  reviewed_by INTEGER REFERENCES users(id),
  reviewed_at TEXT,
  created_at  TEXT NOT NULL DEFAULT (datetime('now','localtime'))
);
CREATE INDEX IF NOT EXISTS idx_knowledge_crop ON knowledge_articles(crop, status);

CREATE TABLE IF NOT EXISTS advisories (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id      INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  diagnosis_id INTEGER REFERENCES diagnoses(id),
  subject      TEXT NOT NULL,
  content      TEXT NOT NULL,
  contact      TEXT,
  status       TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open','accepted','replied','closed')),
  assigned_to  INTEGER REFERENCES users(id),
  reply        TEXT,
  replied_at   TEXT,
  created_at   TEXT NOT NULL DEFAULT (datetime('now','localtime'))
);
CREATE INDEX IF NOT EXISTS idx_adv_status ON advisories(status, created_at DESC);

-- ============ 产销对接 ============
CREATE TABLE IF NOT EXISTS posts (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  type         TEXT NOT NULL CHECK (type IN ('supply','demand')),
  user_id      INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title        TEXT NOT NULL,
  category     TEXT NOT NULL,
  variety      TEXT,
  spec         TEXT,
  quantity     REAL NOT NULL,
  unit         TEXT NOT NULL,
  price_type   TEXT NOT NULL DEFAULT 'negotiable' CHECK (price_type IN ('fixed','negotiable')),
  price        REAL,
  province     TEXT NOT NULL,
  city         TEXT NOT NULL,
  valid_until  TEXT NOT NULL,
  description  TEXT,
  status       TEXT NOT NULL DEFAULT 'draft'
               CHECK (status IN ('draft','pending','active','rejected','closed','expired')),
  reject_reason TEXT,
  view_count   INTEGER NOT NULL DEFAULT 0,
  created_at   TEXT NOT NULL DEFAULT (datetime('now','localtime')),
  updated_at   TEXT NOT NULL DEFAULT (datetime('now','localtime'))
);
CREATE INDEX IF NOT EXISTS idx_posts_list ON posts(type, status, province, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_posts_user ON posts(user_id, created_at DESC);

CREATE TABLE IF NOT EXISTS post_images (
  post_id   INTEGER NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
  upload_id INTEGER NOT NULL REFERENCES uploads(id) ON DELETE CASCADE,
  sort      INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (post_id, upload_id)
);

CREATE TABLE IF NOT EXISTS inquiries (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  post_id      INTEGER NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
  from_user_id INTEGER NOT NULL REFERENCES users(id),
  to_user_id   INTEGER NOT NULL REFERENCES users(id),
  kind         TEXT NOT NULL CHECK (kind IN ('inquiry','quote')),
  price        REAL,
  quantity     REAL,
  unit         TEXT,
  message      TEXT NOT NULL,
  status       TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','accepted','declined','closed')),
  created_at   TEXT NOT NULL DEFAULT (datetime('now','localtime')),
  updated_at   TEXT NOT NULL DEFAULT (datetime('now','localtime'))
);
CREATE INDEX IF NOT EXISTS idx_inq_post ON inquiries(post_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_inq_to ON inquiries(to_user_id, status);

CREATE TABLE IF NOT EXISTS conversations (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  post_id    INTEGER REFERENCES posts(id) ON DELETE SET NULL,
  buyer_id   INTEGER NOT NULL REFERENCES users(id),
  seller_id  INTEGER NOT NULL REFERENCES users(id),
  created_at TEXT NOT NULL DEFAULT (datetime('now','localtime')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now','localtime')),
  UNIQUE (post_id, buyer_id, seller_id)
);

CREATE TABLE IF NOT EXISTS messages (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  conversation_id INTEGER NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  sender_id       INTEGER NOT NULL REFERENCES users(id),
  body            TEXT NOT NULL,
  read_at         TEXT,
  created_at      TEXT NOT NULL DEFAULT (datetime('now','localtime'))
);
CREATE INDEX IF NOT EXISTS idx_msg_conv ON messages(conversation_id, id);

-- ============ 农机服务 ============
CREATE TABLE IF NOT EXISTS machinery (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  merchant_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name           TEXT NOT NULL,
  type           TEXT NOT NULL,
  brand          TEXT,
  model          TEXT,
  power          TEXT,
  province       TEXT NOT NULL,
  city           TEXT NOT NULL,
  service_area   TEXT NOT NULL,
  pricing_type   TEXT NOT NULL CHECK (pricing_type IN ('per_mu','per_hour','per_day')),
  price          REAL NOT NULL,
  description    TEXT,
  status         TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','inactive')),
  created_at     TEXT NOT NULL DEFAULT (datetime('now','localtime')),
  updated_at     TEXT NOT NULL DEFAULT (datetime('now','localtime'))
);
CREATE INDEX IF NOT EXISTS idx_mach_list ON machinery(status, province, type);

CREATE TABLE IF NOT EXISTS machinery_images (
  machinery_id INTEGER NOT NULL REFERENCES machinery(id) ON DELETE CASCADE,
  upload_id    INTEGER NOT NULL REFERENCES uploads(id) ON DELETE CASCADE,
  sort         INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (machinery_id, upload_id)
);

CREATE TABLE IF NOT EXISTS machinery_slots (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  machinery_id INTEGER NOT NULL REFERENCES machinery(id) ON DELETE CASCADE,
  date         TEXT NOT NULL,
  hour         INTEGER NOT NULL CHECK (hour BETWEEN 0 AND 23),
  status       TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open','blocked','booked')),
  UNIQUE (machinery_id, date, hour)
);

CREATE TABLE IF NOT EXISTS bookings (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  order_no      TEXT NOT NULL UNIQUE,
  machinery_id  INTEGER NOT NULL REFERENCES machinery(id),
  user_id       INTEGER NOT NULL REFERENCES users(id),
  merchant_id   INTEGER NOT NULL REFERENCES users(id),
  date          TEXT NOT NULL,
  start_hour    INTEGER NOT NULL,
  end_hour      INTEGER NOT NULL,
  area          REAL,
  location      TEXT NOT NULL,
  contact_name  TEXT NOT NULL,
  contact_phone TEXT NOT NULL,
  fee           REAL NOT NULL,
  note          TEXT,
  status        TEXT NOT NULL DEFAULT 'pending'
                CHECK (status IN ('pending','confirmed','rejected','in_progress','completed','cancelled')),
  cancel_reason TEXT,
  created_at    TEXT NOT NULL DEFAULT (datetime('now','localtime')),
  updated_at    TEXT NOT NULL DEFAULT (datetime('now','localtime'))
);
CREATE INDEX IF NOT EXISTS idx_booking_mach ON bookings(machinery_id, date);
CREATE INDEX IF NOT EXISTS idx_booking_merchant ON bookings(merchant_id, status);
CREATE INDEX IF NOT EXISTS idx_booking_user ON bookings(user_id, created_at DESC);

CREATE TABLE IF NOT EXISTS booking_slots (
  booking_id   INTEGER NOT NULL REFERENCES bookings(id) ON DELETE CASCADE,
  machinery_id INTEGER NOT NULL,
  date         TEXT NOT NULL,
  hour         INTEGER NOT NULL,
  PRIMARY KEY (booking_id, date, hour)
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_booking_slot ON booking_slots(machinery_id, date, hour);

-- ============ 农资商城 ============
CREATE TABLE IF NOT EXISTS products (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  merchant_id  INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name         TEXT NOT NULL,
  category     TEXT NOT NULL,
  spec         TEXT NOT NULL,
  unit         TEXT NOT NULL,
  price        REAL NOT NULL,
  stock        INTEGER NOT NULL DEFAULT 0,
  description  TEXT,
  applicable   TEXT,
  source_note  TEXT,
  status       TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','inactive')),
  created_at   TEXT NOT NULL DEFAULT (datetime('now','localtime')),
  updated_at   TEXT NOT NULL DEFAULT (datetime('now','localtime'))
);
CREATE INDEX IF NOT EXISTS idx_product_list ON products(status, category);

CREATE TABLE IF NOT EXISTS product_images (
  product_id INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  upload_id  INTEGER NOT NULL REFERENCES uploads(id) ON DELETE CASCADE,
  sort       INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (product_id, upload_id)
);

CREATE TABLE IF NOT EXISTS cart_items (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  product_id INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  quantity   INTEGER NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now','localtime')),
  UNIQUE (user_id, product_id)
);

CREATE TABLE IF NOT EXISTS orders (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  order_no      TEXT NOT NULL UNIQUE,
  user_id       INTEGER NOT NULL REFERENCES users(id),
  merchant_id   INTEGER NOT NULL REFERENCES users(id),
  status        TEXT NOT NULL DEFAULT 'pending_payment'
                CHECK (status IN ('pending_payment','paid','shipped','completed','cancelled','refunding','refunded')),
  goods_total   REAL NOT NULL,
  shipping_fee  REAL NOT NULL DEFAULT 0,
  total         REAL NOT NULL,
  address_json  TEXT NOT NULL,
  remark        TEXT,
  tracking_company TEXT,
  tracking_no   TEXT,
  paid_at       TEXT,
  shipped_at    TEXT,
  completed_at  TEXT,
  cancelled_at  TEXT,
  created_at    TEXT NOT NULL DEFAULT (datetime('now','localtime')),
  updated_at    TEXT NOT NULL DEFAULT (datetime('now','localtime'))
);
CREATE INDEX IF NOT EXISTS idx_order_user ON orders(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_order_merchant ON orders(merchant_id, status);

CREATE TABLE IF NOT EXISTS order_items (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  order_id   INTEGER NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  product_id INTEGER NOT NULL,
  name       TEXT NOT NULL,
  spec       TEXT NOT NULL,
  unit       TEXT NOT NULL,
  price      REAL NOT NULL,
  quantity   INTEGER NOT NULL,
  subtotal   REAL NOT NULL
);

CREATE TABLE IF NOT EXISTS payments (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  order_id     INTEGER NOT NULL REFERENCES orders(id),
  provider     TEXT NOT NULL,
  provider_ref TEXT UNIQUE,
  amount       REAL NOT NULL,
  status       TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','succeeded','failed','refunded')),
  checkout_url TEXT,
  raw          TEXT,
  created_at   TEXT NOT NULL DEFAULT (datetime('now','localtime')),
  paid_at      TEXT
);
CREATE INDEX IF NOT EXISTS idx_pay_order ON payments(order_id);

CREATE TABLE IF NOT EXISTS refunds (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  order_id   INTEGER NOT NULL REFERENCES orders(id),
  payment_id INTEGER REFERENCES payments(id),
  amount     REAL NOT NULL,
  reason     TEXT NOT NULL,
  status     TEXT NOT NULL DEFAULT 'requested' CHECK (status IN ('requested','approved','rejected','refunded')),
  admin_note TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now','localtime')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now','localtime'))
);

CREATE TABLE IF NOT EXISTS reviews (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id     INTEGER NOT NULL REFERENCES users(id),
  target_type TEXT NOT NULL CHECK (target_type IN ('machinery','product')),
  target_id   INTEGER NOT NULL,
  booking_id  INTEGER,
  order_id    INTEGER,
  rating      INTEGER NOT NULL CHECK (rating BETWEEN 1 AND 5),
  content     TEXT,
  created_at  TEXT NOT NULL DEFAULT (datetime('now','localtime')),
  UNIQUE (user_id, target_type, target_id, booking_id, order_id)
);

-- ============ 行情 ============
CREATE TABLE IF NOT EXISTS market_sources (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  code       TEXT NOT NULL UNIQUE,
  name       TEXT NOT NULL,
  kind       TEXT NOT NULL CHECK (kind IN ('manual','api')),
  url        TEXT,
  note       TEXT,
  status     TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','inactive')),
  last_run_at TEXT,
  last_status TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now','localtime'))
);

CREATE TABLE IF NOT EXISTS market_prices (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  source_id    INTEGER NOT NULL REFERENCES market_sources(id),
  crop         TEXT NOT NULL,
  variety      TEXT,
  spec         TEXT,
  grade        TEXT,
  province     TEXT NOT NULL,
  market       TEXT NOT NULL,
  price        REAL NOT NULL,
  currency     TEXT NOT NULL DEFAULT 'CNY',
  unit         TEXT NOT NULL,
  quote_basis  TEXT NOT NULL,
  collected_at TEXT NOT NULL,
  status       TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','rejected')),
  imported_by  INTEGER REFERENCES users(id),
  reviewed_by  INTEGER REFERENCES users(id),
  reviewed_at  TEXT,
  created_at   TEXT NOT NULL DEFAULT (datetime('now','localtime')),
  UNIQUE (source_id, crop, market, spec, collected_at)
);
CREATE INDEX IF NOT EXISTS idx_price_query ON market_prices(status, crop, province, collected_at DESC);

CREATE TABLE IF NOT EXISTS watchlist (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  crop       TEXT NOT NULL,
  province   TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now','localtime')),
  UNIQUE (user_id, crop, province)
);

CREATE TABLE IF NOT EXISTS price_alerts (
  id                INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id           INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  crop              TEXT NOT NULL,
  province          TEXT,
  direction         TEXT NOT NULL CHECK (direction IN ('above','below')),
  threshold         REAL NOT NULL,
  active            INTEGER NOT NULL DEFAULT 1,
  last_triggered_at TEXT,
  last_price        REAL,
  created_at        TEXT NOT NULL DEFAULT (datetime('now','localtime'))
);
CREATE INDEX IF NOT EXISTS idx_alert_active ON price_alerts(active, crop);

-- ============ 消息 / 通知 / 审计 ============
CREATE TABLE IF NOT EXISTS notifications (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  type       TEXT NOT NULL,
  title      TEXT NOT NULL,
  body       TEXT,
  link       TEXT,
  read_at    TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now','localtime'))
);
CREATE INDEX IF NOT EXISTS idx_notif_user ON notifications(user_id, read_at, created_at DESC);

CREATE TABLE IF NOT EXISTS complaints (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id     INTEGER NOT NULL REFERENCES users(id),
  target_type TEXT NOT NULL,
  target_id   INTEGER,
  reason      TEXT NOT NULL,
  detail      TEXT,
  status      TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open','resolved','rejected')),
  handled_by  INTEGER REFERENCES users(id),
  resolution  TEXT,
  created_at  TEXT NOT NULL DEFAULT (datetime('now','localtime')),
  updated_at  TEXT NOT NULL DEFAULT (datetime('now','localtime'))
);

CREATE TABLE IF NOT EXISTS audit_logs (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  actor_id    INTEGER REFERENCES users(id),
  action      TEXT NOT NULL,
  target_type TEXT,
  target_id   TEXT,
  detail      TEXT,
  ip          TEXT,
  created_at  TEXT NOT NULL DEFAULT (datetime('now','localtime'))
);
CREATE INDEX IF NOT EXISTS idx_audit_time ON audit_logs(created_at DESC);

CREATE TABLE IF NOT EXISTS job_runs (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  job        TEXT NOT NULL,
  status     TEXT NOT NULL,
  detail     TEXT,
  ran_at     TEXT NOT NULL DEFAULT (datetime('now','localtime'))
);
