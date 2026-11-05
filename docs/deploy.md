# 部署与配置

## 1. 环境要求

| 项 | 要求 |
| --- | --- |
| Node.js | ≥ 20.11（推荐 22 LTS） |
| 内存 | ≥ 512MB（含 sharp 图片处理） |
| 磁盘 | 代码 + 数据库；上传文件按业务量预留 |
| 反向代理 | Nginx / Caddy（生产必须启用 HTTPS） |

数据库使用 SQLite（WAL 模式），单机部署无需额外数据库服务。数据文件默认在 `server/data/henongyun.db`。

---

## 2. 首次部署

```bash
git clone <repo> henongyun && cd henongyun
npm --prefix server ci        # 或 install
npm --prefix web ci

cp server/.env.example server/.env
# 编辑 server/.env，至少设置 NODE_ENV=production、JWT_SECRET、PUBLIC_BASE_URL、WEB_ORIGIN

npm --prefix web run build
npm --prefix server start
```

首次启动会自动执行数据库迁移（`schema_migrations` 表记录版本）。设置 `DEMO_SEED=true` 时会写入演示数据与账号。

验证：

```bash
curl http://127.0.0.1:3001/health     # {"status":"ok"}
curl http://127.0.0.1:3001/ready      # {"status":"ready"}
```

---

## 3. 环境变量

| 变量 | 必填 | 说明 |
| --- | --- | --- |
| `NODE_ENV` | 是 | `production` 时启用安全 Cookie、强制校验 JWT_SECRET |
| `PORT` | 否 | 默认 3001 |
| `PUBLIC_BASE_URL` | 是 | 对外访问地址，用于支付回跳链接 |
| `WEB_ORIGIN` | 是 | CORS 白名单，逗号分隔；生产禁止 `*` |
| `DATA_DIR` / `UPLOAD_DIR` / `DB_PATH` | 否 | 数据与上传目录，默认 `./data`、`./uploads` |
| `JWT_SECRET` | 生产必填 | ≥ 32 位随机字符串：`openssl rand -hex 32`。未设置时开发环境生成临时密钥，重启后登录态失效 |
| `ACCESS_TOKEN_TTL` | 否 | 访问令牌秒数，默认 900 |
| `REFRESH_TOKEN_TTL` | 否 | 刷新令牌秒数，默认 604800 |
| `SMTP_HOST` / `SMTP_PORT` / `SMTP_SECURE` / `SMTP_USER` / `SMTP_PASS` / `MAIL_FROM` | 否 | 找回密码邮件。未配置时接口返回 503 |
| `PLANTID_API_KEY` / `PLANTID_BASE_URL` | 否 | 病虫害识别。未配置时识别任务如实失败 |
| `STRIPE_SECRET_KEY` / `STRIPE_WEBHOOK_SECRET` / `PAYMENT_CURRENCY` | 否 | 在线支付。未配置时仅支持线下结算 |
| `MARKET_API_URL` / `MARKET_API_KEY` | 否 | 行情自动采集。未配置时仅人工录入 |
| `RATE_LIMIT_WINDOW_MS` / `RATE_LIMIT_MAX` / `AUTH_RATE_LIMIT_MAX` | 否 | 全局限流与认证限流 |
| `DEMO_SEED` | 否 | 是否写入演示数据，生产设为 `false` |
| `LOG_LEVEL` | 否 | `debug` / `info` / `warn` / `error` |

> 生产环境若未设置 `JWT_SECRET` 或 `WEB_ORIGIN` 含通配符，服务会拒绝启动并输出具体原因。

---

## 4. 进程守护

### systemd

```ini
# /etc/systemd/system/henongyun.service
[Unit]
Description=Henongyun Server
After=network.target

[Service]
Type=simple
WorkingDirectory=/srv/henongyun/server
EnvironmentFile=/srv/henongyun/server/.env
ExecStart=/usr/bin/node src/index.js
Restart=always
RestartSec=3
User=www-data
LimitNOFILE=65535

[Install]
WantedBy=multi-user.target
```

```bash
systemctl daemon-reload && systemctl enable --now henongyun
journalctl -u henongyun -f
```

### PM2

```bash
pm2 start server/src/index.js --name henongyun --time
pm2 save && pm2 startup
```

服务收到 `SIGTERM` / `SIGINT` 会停止定时任务、关闭 HTTP 服务与数据库后退出，最长等待 10 秒。

---

## 5. Nginx 反向代理

```nginx
server {
    listen 443 ssl http2;
    server_name example.com;

    ssl_certificate     /etc/letsencrypt/live/example.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/example.com/privkey.pem;

    client_max_body_size 12m;

    location / {
        proxy_pass http://127.0.0.1:3001;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    # SSE：必须关闭缓冲并延长超时，否则实时推送会被截断
    location /api/events {
        proxy_pass http://127.0.0.1:3001;
        proxy_http_version 1.1;
        proxy_set_header Connection '';
        proxy_set_header Host $host;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_buffering off;
        proxy_cache off;
        chunked_transfer_encoding off;
        proxy_read_timeout 3600s;
        proxy_send_timeout 3600s;
    }
}

server {
    listen 80;
    server_name example.com;
    return 301 https://$host$request_uri;
}
```

若使用 CDN，必须对 `/api/events` 关闭缓存与响应缓冲，否则消息不会即时到达。

---

## 6. 外部服务接入

### 6.1 病虫害识别（Plant.id）

1. 在 https://plant.id 注册并获取 API Key（免费额度可用于联调）。
2. 写入 `PLANTID_API_KEY`，重启服务。
3. 后台「服务接入 → 病虫害识别 → 连通性检查」，返回 `ok: true` 即通过。
4. 前端上传一张真实病叶照片，确认识别结果中的「识别来源」与「模型版本」有值。

模型实际覆盖的作物以服务商文档为准。超出范围或低置信度时，系统会标记「建议复核」并引导人工咨询。

### 6.2 在线支付（Stripe）

1. 获取 `sk_test_...`（联调）或 `sk_live_...`（生产）。
2. 在 Stripe Dashboard 添加 Webhook：`https://example.com/api/payments/webhook/stripe`，订阅 `checkout.session.completed`、`checkout.session.async_payment_succeeded`。
3. 将签名密钥写入 `STRIPE_WEBHOOK_SECRET`。
4. 用测试卡走完「下单 → 支付 → 回调 → 发货」，并在 Stripe 后台确认事件投递成功。

注意：

- 金额以「分」为单位换算，币种由 `PAYMENT_CURRENCY` 控制（默认 `cny`）。
- 支付结果以服务端验签回调或主动查询为准，前端参数仅用于触发核验。
- 重复回调不会重复扣库存：库存于下单时预扣，`payments.provider_ref` 唯一约束保证只入账一次。
- 沙箱支付通过不代表生产支付已开通，需替换生产密钥后重新验证。

### 6.3 邮件（SMTP）

填写 `SMTP_HOST`、`SMTP_PORT`、`SMTP_SECURE`、`SMTP_USER`、`SMTP_PASS`、`MAIL_FROM`。后台「服务接入 → 邮件」执行连通性检查。未配置时用户点击「发送验证码」会收到明确的未配置提示。

### 6.4 行情接口（可选）

约定接口返回：

```json
{ "items": [
  { "crop": "番茄", "variety": "硬粉", "spec": "中等果", "grade": "一级",
    "province": "山东省", "market": "示例批发市场", "price": 4.2,
    "unit": "元/公斤", "quoteBasis": "中等规格批发价", "collectedAt": "2026-11-05 08:00:00" }
] }
```

请求携带 `Authorization: Bearer <MARKET_API_KEY>`。采集结果进入「待审核」，不会直接展示。未配置时后台「立即采集」返回 503 并说明原因。

---

## 7. 数据备份与恢复

数据库为单文件，建议每日备份并异地保存：

```bash
# 在线备份（WAL 模式下安全）
sqlite3 /srv/henongyun/server/data/henongyun.db ".backup '/backup/hny-$(date +%F).db'"
tar czf /backup/uploads-$(date +%F).tar.gz -C /srv/henongyun/server uploads
```

恢复：停止服务 → 替换数据库文件 → 启动。上传文件与数据库需保持同一时间点，否则图片会缺失。

---

## 8. 上线前安全清单

- [ ] `NODE_ENV=production`，`JWT_SECRET` 为随机 32 位以上
- [ ] `WEB_ORIGIN` 为真实域名，不含通配符
- [ ] 全站 HTTPS，Cookie 自动带 `Secure`
- [ ] `DEMO_SEED=false`，演示账号已删除或改密
- [ ] 修改默认管理员密码；按需删除测试数据
- [ ] 上传目录不可执行脚本（Nginx 不解析该目录）
- [ ] 数据库与上传目录加入备份计划
- [ ] 反向代理对 `/api/events` 关闭缓冲
- [ ] 关键外部服务完成连通性检查与真实小额验证

---

## 9. 升级与迁移

新增迁移文件放在 `server/src/db/migrations/NNN_name.sql`，服务启动时按文件名顺序执行，执行记录写入 `schema_migrations`。迁移在事务内完成，失败会回滚且不标记为已执行。

升级步骤：备份 → 拉取代码 → `npm --prefix server ci` → `npm --prefix web ci && npm --prefix web run build` → 重启。迁移在启动时自动执行。

> SQLite 的 `ALTER TABLE` 能力有限，涉及改列时建议新建表 + 数据搬迁的方式编写迁移。

---

## 10. 常见问题

**实时推送不工作**：检查反向代理是否对 `/api/events` 关闭了缓冲；确认浏览器控制台 EventSource 返回 200；未登录用户不会建立连接。

**登录后刷新页面掉登录**：确认 `PUBLIC_BASE_URL` 与访问域名一致，Cookie 域与路径未被代理改写；`JWT_SECRET` 变更会导致所有会话失效。

**图片 404**：确认 `UPLOAD_DIR` 与反向代理静态目录一致；容器部署需挂载持久卷。

**识别一直失败**：查看 `GET /api/system/info` 的 `integrations.recognition`；未配置密钥时属预期行为。

**行情没有数据**：平台不生成占位价格，需在后台录入并通过审核，或配置行情 API 后采集。
