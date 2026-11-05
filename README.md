# 禾农云 · 农业综合服务平台

面向种植户、合作社与农业经营主体的综合服务网站，包含病虫害识别与防控、产销对接、农机服务、农资商城、大宗作物行情五大板块，以及用户中心、商家工作台与管理后台。

前端为米白纸感 + 墨绿油墨的杂志式设计，后端为 Node.js + SQLite 的真实业务实现，含服务端鉴权、文件存储、SSE 实时推送与后台定时任务。

**代码仓库**：https://github.com/yaocwbcgs/henongyun

---

## 快速开始

环境要求：Node.js ≥ 20.11（开发环境使用 Node 22）。

```bash
# 1. 安装依赖
npm --prefix server install
npm --prefix web install

# 2. 配置环境变量（复制后按需填写）
cp server/.env.example server/.env
#   不填任何第三方密钥也能启动，未接入的服务会明确提示，不会伪造结果

# 3. 启动后端（含数据库迁移与演示数据）
npm --prefix server run dev        # http://localhost:3001

# 4. 启动前端（开发模式）
npm --prefix web run dev           # http://localhost:5173
```

生产模式（后端直接托管前端构建产物）：

```bash
npm --prefix web run build
npm --prefix server start          # http://localhost:3001
```

健康检查：`GET /health`、`GET /ready`；集成状态：`GET /api/system/info`。

### 演示账号

仅在 `DEMO_SEED=true` 时写入，页面顶部会显示演示数据横幅。

| 角色 | 邮箱 | 密码 |
| --- | --- | --- |
| 管理员 | `admin@henongyun.cn` | `Admin@12345` |
| 农技人员 | `agri@henongyun.cn` | `Admin@12345` |
| 商家（建国农场） | `merchant@demo.henongyun.local` | `Demo@12345` |
| 商家（秀兰农资） | `merchant2@demo.henongyun.local` | `Demo@12345` |
| 普通用户 | `farmer@demo.henongyun.local` | `Demo@12345` |
| 普通用户 | `buyer@demo.henongyun.local` | `Demo@12345` |

> 生产部署请设置 `DEMO_SEED=false` 并修改上述密码。演示店铺名与商品说明均带「演示」标识。

---

## 功能范围

### 已实现并通过端到端验证

- **账号与权限**：邮箱注册、登录、退出、找回密码（SMTP 真实发送，未配置时明确拒绝）、资料与密码修改；四类角色（用户 / 商家 / 农技人员 / 管理员）由服务端校验；商家入驻申请与审核。
- **病虫害识别**：上传 / 拍摄预览与替换、服务端真实图像质量检测（分辨率、亮度、对比度、清晰度）、异步识别任务、结果与候选病害、防控建议、转农技咨询工单、历史记录持久化。
- **防控知识库**：按作物与分类检索、来源与审核信息、相关文章、收藏。
- **产销对接**：草稿 / 提交审核 / 通过 / 驳回 / 下架 / 关闭全状态流转；搜索、组合筛选、排序、分页、收藏；询价与报价、站内会话、未读提示；合作状态由接收方确认。
- **农机服务**：设备与可预约时段管理、按地区 / 类型 / 日期 / 价格筛选、费用试算、预约提交、确认 / 拒绝 / 取消 / 改期 / 开始 / 完成 / 评价；**同一设备同一小时通过数据库唯一索引保证不重复预约**。
- **农资商城**：商品与库存管理、分类与搜索、购物车、收货地址、结算拆单、库存并发扣减、订单状态机、线下收款确认、发货与运单、确认收货、售后申请与处理、评价。
- **大宗行情**：行情来源管理、人工录入与 CSV 批量导入、逐条审核、按作物 / 地区 / 市场 / 规格 / 时间筛选、同口径历史趋势、关注列表、价格提醒（后台任务判断阈值并去重）。
- **实时推送（SSE）**：一次性票据鉴权、25s 心跳、断线自动重连；消息、通知、订单、预约、识别结果、询价、入驻审核状态实时到达。
- **管理后台**：用户与角色、商家入驻、供需审核、商品与库存、农机资源、订单与支付、退款售后、农技工单、知识库、行情采集、投诉处理、服务接入状态、操作日志、经营报表；关键操作写入审计日志。
- **工程能力**：环境变量集中校验、类型化错误、结构化 JSON 日志 + 请求 ID、限流、CORS 白名单、安全头、文件类型与大小校验并重新编码、优雅停机、数据库迁移。

### 待接入外部服务（代码已就绪，缺密钥）

| 能力 | 提供方 | 所需配置 | 未配置时的行为 |
| --- | --- | --- | --- |
| 病虫害识别 | Plant.id v3 | `PLANTID_API_KEY` | 任务标记失败并提示「识别服务尚未接入」，可转人工复核；不返回编造结果 |
| 在线支付 | Stripe Checkout | `STRIPE_SECRET_KEY`、`STRIPE_WEBHOOK_SECRET` | 下单后可选线下结算，由商家确认收款；不会伪造支付成功 |
| 找回密码邮件 | 任意 SMTP | `SMTP_HOST`、`SMTP_USER`、`SMTP_PASS` | 接口返回 503 并说明原因，不假装发送 |
| 行情自动采集 | 合作行情 API | `MARKET_API_URL`、`MARKET_API_KEY` | 仅支持人工录入 + CSV 导入，逐条审核后展示 |

> 沙箱或测试环境的支付通过，不代表生产支付已开通。上线前需替换为生产密钥并完成真实小额验证。

**如何免费接入**：邮件可用 QQ 邮箱 SMTP（完全免费），识别注册即送 100 次额度，支付与行情没有免费的真实通道（详见 [零成本接入指南](docs/free-setup.md)）。

### 明确未实现

- 微信支付 / 支付宝（当前适配器为 Stripe，国内商户需替换 `server/src/services/payments.js`）。
- 短信验证码（未接入短信服务商，仅支持邮箱验证与密码登录）。
- 物流轨迹查询（只展示商家录入的真实运单号，不生成轨迹）。
- 多实例部署下的 SSE 广播（单进程内存 Hub，多实例需替换为 Redis Pub/Sub）。

---

## 目录结构

```
.
├─ server/                     # 后端（Express + better-sqlite3）
│  ├─ src/
│  │  ├─ config.js             # 环境变量集中校验
│  │  ├─ app.js                # 中间件与路由装配
│  │  ├─ index.js              # 启动、任务、优雅停机
│  │  ├─ db/                   # 迁移、schema、种子数据
│  │  ├─ middleware/           # 鉴权、错误处理
│  │  ├─ lib/                  # 日志、校验、加密、错误类型
│  │  ├─ realtime/hub.js       # SSE 连接池与事件广播
│  │  ├─ services/             # 存储、邮件、识别、支付、订单、通知
│  │  ├─ routes/               # 按业务域拆分的接口
│  │  └─ jobs/                 # 价格提醒、过期下架、超时取消、行情采集
│  ├─ data/                    # SQLite 数据库文件（不提交）
│  ├─ uploads/                 # 上传文件（不提交）
│  └─ test/e2e.mjs             # 端到端验收脚本
├─ web/                        # 前端（React + Vite）
│  ├─ src/
│  │  ├─ styles/               # 设计令牌与页面样式
│  │  ├─ lib/                  # API 客户端、鉴权、SSE、格式化
│  │  ├─ components/           # 布局、表单、图表等通用组件
│  │  └─ pages/                # 首页与各业务页面
│  └─ public/images/           # 农业摄影素材
└─ docs/                       # 部署、接口与验收文档
```

---

## 关键设计说明

**鉴权**：访问令牌 15 分钟，仅存于内存；刷新令牌 7 天，存于 HttpOnly + SameSite=Lax Cookie（路径限定 `/api/auth`），服务端只保存其 SHA-256 哈希，刷新时轮换并撤销旧令牌。不写入 localStorage，不放入 URL。

**SSE 鉴权**：`EventSource` 无法自定义请求头，因此先通过 `POST /api/events/ticket` 获取 60 秒有效的一次性票据，再建立连接；票据使用后立即失效。

**并发预约**：`booking_slots(machinery_id, date, hour)` 上建立唯一索引，预约在事务内插入全部小时槽位，冲突即回滚。取消或拒绝时删除槽位释放时段。

**库存**：下单时 `UPDATE products SET stock = stock - ? WHERE id = ? AND stock >= ?`，受影响行数为 0 即判定库存不足；支付成功不重复扣减，取消 / 超时回补。重复支付回调由 `payments.provider_ref` 唯一约束与订单状态双重幂等。

**行情口径**：涨跌与趋势只在「作物 + 市场 + 规格 + 报价口径」一致时计算，单位不一致时只展示原始记录并提示，不做插值或随机补齐。

**识别诚实性**：概率字段直接来自识别服务，平台不做二次换算；服务未配置或调用失败时任务状态为失败并给出原因，界面不显示任何模拟候选或准确率。

---

## 文档

- [零成本接入指南](docs/free-setup.md) — 四项外部服务的免费额度、精确参数与验证方法
- [部署与配置](docs/deploy.md)
- [接口说明](docs/api.md)
- [验收与测试报告](docs/test-report.md)

## 持续集成

仓库内置 GitHub Actions（`.github/workflows/ci.yml`），每次 push 与 PR 自动执行：安装依赖 → 构建前端 → 启动服务 → 运行 30 项端到端验收。CI 使用独立的测试密钥与测试数据库，不接触生产配置。

本地复现同等校验：

```bash
npm --prefix server install && npm --prefix web install
npm --prefix web run build
npm --prefix server start          # 另开终端
npm --prefix server run test:e2e   # 30 项验收
```

## 许可

本项目为定制交付代码，未附带开源许可。第三方依赖遵循各自许可证。
