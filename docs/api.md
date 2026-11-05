# 接口说明

## 通用约定

- 基础路径：`/api`
- 请求体：`application/json`（文件上传除外）
- 鉴权：`Authorization: Bearer <accessToken>`；刷新令牌通过 HttpOnly Cookie 自动携带
- 分页：`?page=1&pageSize=12`，响应含 `total`、`page`、`pageSize`、`totalPages`
- 时间：`YYYY-MM-DD HH:mm:ss`（服务器本地时区）
- 金额：数字，单位元

成功响应直接返回数据对象；错误统一为：

```json
{ "error": { "code": "BAD_REQUEST", "message": "提交的信息不完整或格式不正确", "details": [{ "field": "title", "message": "标题至少 6 个字" }] } }
```

| 状态码 | 含义 |
| --- | --- |
| 400 | 参数校验失败 |
| 401 | 未登录或登录失效 |
| 403 | 无权限 |
| 404 | 资源不存在 |
| 409 | 冲突（重复提交、时段被占用、库存不足） |
| 413 | 文件过大 |
| 422 | 文件类型不支持等语义错误 |
| 429 | 触发限流 |
| 503 | 外部服务未配置或不可用（消息中说明原因） |

---

## 认证 `/api/auth`

| 方法 | 路径 | 权限 | 说明 |
| --- | --- | --- | --- |
| POST | `/register` | 公开 | 姓名、邮箱、密码、可选手机号；返回用户与访问令牌 |
| POST | `/login` | 公开 | 邮箱 + 密码；限流 12 次/分钟 |
| POST | `/refresh` | Cookie | 轮换刷新令牌，返回新访问令牌与用户 |
| POST | `/logout` | 登录 | 撤销当前刷新令牌 |
| POST | `/password/forgot` | 公开 | 发送 6 位验证码（SMTP 未配置返回 503） |
| POST | `/password/reset` | 公开 | 邮箱 + 验证码 + 新密码；成功后撤销全部会话 |
| GET | `/me` | 登录 | 当前用户、商家状态与未读数 |

## 用户 `/api/users`

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| PATCH | `/me` | 修改称呼、手机号、地区、简介、头像 |
| POST | `/me/password` | 修改密码，撤销其他会话 |
| GET/POST | `/me/addresses` | 地址列表 / 新增（首个地址自动设为默认） |
| PUT/DELETE | `/me/addresses/:id` | 编辑 / 删除（删除默认地址后自动顺延） |
| GET/POST | `/me/favorites` | 收藏列表 / 切换收藏（`targetType`: post、product、machinery、knowledge） |
| GET | `/me/overview` | 发布、识别、预约、订单、收藏、咨询、未读消息计数 |

## 文件 `/api/uploads`

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| POST | `/` | `multipart/form-data`，字段 `file`、`purpose`；仅 JPG/PNG/WebP，≤8MB；服务端重新编码并生成缩略图，返回 `{ id, url, thumbUrl, width, height, quality }` |
| DELETE | `/:id` | 删除本人上传 |

## 病虫害识别 `/api/diagnoses`

| 方法 | 路径 | 权限 | 说明 |
| --- | --- | --- | --- |
| GET | `/meta` | 公开 | 识别服务状态与支持作物 |
| POST | `/` | 登录 | `{ uploadId, crop, symptoms?, growthStage? }`，返回 202 与任务；异步执行 |
| GET | `/` | 登录 | 本人识别记录（分页） |
| GET | `/:id` | 本人/农技/管理员 | 任务详情、图像质量、结果、关联工单 |
| POST | `/:id/retry` | 本人 | 重新提交识别 |
| POST | `/:id/advisory` | 本人 | 转农技咨询，生成工单并通知农技人员 |
| GET | `/advisories/mine` | 登录 | 我的咨询工单 |
| GET | `/advisories/list` | 农技/管理员 | 工单列表 |
| POST | `/advisories/:id/reply` | 农技/管理员 | 回复工单并通知用户 |

识别结果为 `status`：`queued` / `processing` / `completed` / `needs_review` / `failed`。失败时 `failureReason` 说明原因，不返回候选病害。

## 知识库 `/api/knowledge`

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| GET | `/` | `crop`、`category`、`q`、分页；仅返回已发布 |
| GET | `/:slug` | 文章详情、来源与审核信息、相关文章 |

## 产销对接 `/api/posts`

| 方法 | 路径 | 权限 | 说明 |
| --- | --- | --- | --- |
| GET | `/` | 公开 | `type`、`category`、`province`、`priceType`、`q`、`sort`（latest/price_asc/price_desc/deadline）、分页；仅返回 `active` |
| GET | `/:id` | 可选登录 | 详情、图片、收藏状态、会话 ID；发布者额外获得询价列表 |
| POST | `/` | 登录 | 创建；`?submit=1` 直接提交审核，否则存草稿 |
| PUT | `/:id` | 本人 | 编辑；`?submit=1` 重新提交审核 |
| POST | `/:id/submit` | 本人 | 草稿或驳回后重新提交 |
| POST | `/:id/close` | 本人/管理员 | 关闭信息 |
| POST | `/:id/inquiries` | 登录 | 询价或报价，自动创建会话并写入首条消息 |
| GET | `/inquiries/received` | 登录 | 收到的询价 |
| GET | `/inquiries/sent` | 登录 | 发出的询价 |
| POST | `/inquiries/:id/respond` | 接收方 | `accept` / `decline` / `close` |
| GET | `/mine/list` | 登录 | 我的全部发布（含草稿、驳回） |

## 会话与消息 `/api/conversations`

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| GET | `/` | 会话列表，含对方信息、最后一条消息与未读数 |
| POST | `/` | 按 `postId` 或 `peerId` 获取或创建会话 |
| GET | `/:id/messages` | 分页消息（按时间正序返回） |
| POST | `/:id/messages` | 发送消息，实时推送给双方 |
| POST | `/:id/read` | 标记对方消息已读并通知对方 |

## 通知 `/api/notifications`

`GET /`、`GET /unread-count`、`POST /:id/read`、`POST /read-all`。

## 实时推送 `/api/events`

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| POST | `/ticket` | 获取一次性票据（60 秒有效） |
| GET | `/?ticket=xxx` | `text/event-stream`；连接后先收到 `connected` 与 `ready`（含未读数） |

事件类型：`notification`、`message`、`unread`、`order`、`booking`、`diagnosis`、`inquiry`、`merchant`、`read`。每 25 秒发送心跳注释。

## 农机 `/api/machinery`

| 方法 | 路径 | 权限 | 说明 |
| --- | --- | --- | --- |
| GET | `/` | 公开 | `province`、`city`、`type`、`date`、`minPrice`、`maxPrice`、`q`、`sort`；带 `date` 时返回当日可约小时数并过滤无空档设备 |
| GET | `/:id` | 可选登录 | 详情与评价 |
| GET | `/:id/availability?date=` | 公开 | 06:00–19:00 每小时状态：`open` / `booked` / `blocked` |
| POST | `/` | 商家 | 新建设备 |
| PUT | `/:id` | 商家本人 | 编辑设备（含上下架） |
| POST | `/:id/slots` | 商家本人 | 设置某日时段为不可预约或恢复；已被预约的小时不可修改 |
| GET | `/merchant/list` | 商家 | 本人设备（含图片 ID） |
| POST | `/bookings` | 登录 | 提交预约；冲突返回 409 |
| GET | `/bookings/mine` | 登录 | 我的预约 |
| GET | `/bookings/merchant` | 商家 | 收到的预约 |
| GET | `/bookings/:id` | 双方/管理员 | 预约详情与角色 |
| POST | `/bookings/:id/confirm` | 商家 | 确认 |
| POST | `/bookings/:id/reject` | 商家 | 拒绝（释放时段） |
| POST | `/bookings/:id/start` | 商家 | 开始作业 |
| POST | `/bookings/:id/complete` | 商家 | 完成 |
| POST | `/bookings/:id/cancel` | 双方 | 取消（释放时段） |
| POST | `/bookings/:id/reschedule` | 双方 | 改期，重置为待确认 |
| POST | `/bookings/:id/review` | 买家 | 完成后评价（1–5 星，仅一次） |

计价：`per_mu × 面积`、`per_hour × 小时数`、`per_day × 1`。

## 商城 `/api/shop`

| 方法 | 路径 | 权限 | 说明 |
| --- | --- | --- | --- |
| GET | `/products` | 公开 | `category`、`q`、`minPrice`、`maxPrice`、`sort`、`merchantId`、分页 |
| GET | `/products/:id` | 可选登录 | 详情、评价、运费规则 |
| POST | `/products` | 商家 | 新建商品 |
| PUT | `/products/:id` | 商家本人 | 编辑（价格、库存、上下架、图片） |
| GET | `/merchant/products` | 商家 | 本人商品（含图片 ID） |
| GET | `/cart` | 登录 | 购物车与小计 |
| POST | `/cart` | 登录 | 加入购物车（校验库存） |
| PATCH | `/cart/:id` | 登录 | 修改数量 |
| DELETE | `/cart/:id` | 登录 | 移除 |
| POST | `/orders` | 登录 | 下单；按商家拆单，事务内扣减库存，冲突返回 409 |
| GET | `/orders?role=merchant&status=` | 登录 | 订单列表；`status=after_sale` 过滤售后 |
| GET | `/orders/:id` | 双方/管理员 | 订单、明细、支付与退款记录 |
| POST | `/orders/:id/pay` | 买家 | 创建 Stripe Checkout；未配置返回 503 |
| POST | `/orders/:id/confirm-offline` | 商家/管理员 | 确认线下收款 |
| POST | `/orders/:id/ship` | 商家 | 填写物流公司与运单号 |
| POST | `/orders/:id/receive` | 买家 | 确认收货 |
| POST | `/orders/:id/cancel` | 双方/管理员 | 取消未支付订单并回补库存 |
| POST | `/orders/:id/refund` | 买家 | 提交售后申请 |
| POST | `/orders/:id/review` | 买家 | 完成后评价 |

## 支付 `/api/payments`

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| POST | `/webhook/stripe` | 原始请求体验签；处理 `checkout.session.completed`、`checkout.session.async_payment_succeeded`；幂等 |
| POST | `/orders/:id/verify` | 买家主动核验：服务端向 Stripe 查询会话状态，已支付则入账 |

## 行情 `/api/market`

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| GET | `/meta` | 作物、地区、市场、规格、来源与最新采集时间 |
| GET | `/overview` | 各作物最新已审核报价与同口径涨跌 |
| GET | `/prices` | `crop`、`province`、`market`、`spec`、`from`、`to`、分页 |
| GET | `/series` | 必须提供 `crop` 与 `market`；返回同口径时间序列与单位一致性标记 |
| GET/POST | `/watchlist` | 关注列表 / 添加 |
| DELETE | `/watchlist/:id` | 取消关注 |
| GET/POST | `/alerts` | 价格提醒列表 / 创建（上限 10 条） |
| PATCH/DELETE | `/alerts/:id` | 启用停用 / 删除 |

## 商家 `/api/merchant`

`GET /profile`、`POST /apply`、`GET /dashboard`（待发货、待确认预约、成交额、低库存等）。

## 管理后台 `/api/admin`（仅管理员）

| 分组 | 端点 |
| --- | --- |
| 概览 | `GET /stats`、`GET /reports` |
| 用户 | `GET /users`、`PATCH /users/:id`（角色、启停） |
| 商家 | `GET /merchants`、`POST /merchants/:id/review` |
| 供需 | `GET /posts?status=`、`POST /posts/:id/review` |
| 商品 | `GET /products`、`PATCH /products/:id` |
| 农机 | `GET /machinery`、`PATCH /machinery/:id` |
| 订单 | `GET /orders`、`GET /payments` |
| 退款 | `GET /refunds`、`POST /refunds/:id/process`（approve / reject / mark_refunded） |
| 识别 | `GET /diagnoses` |
| 知识库 | `GET /knowledge`、`POST /knowledge`、`PUT /knowledge/:id` |
| 行情 | `GET /market/sources`、`POST /market/sources`、`POST /market/sync`、`GET /market/prices?status=`、`POST /market/prices`、`POST /market/prices/import`、`POST /market/prices/:id/review` |
| 投诉 | `GET /complaints`、`POST /complaints/:id/handle` |
| 接入 | `GET /integrations`、`POST /integrations/test`（email / recognition / payment） |
| 审计 | `GET /audit-logs` |

## 投诉 `/api/complaints`

`POST /`（提交）、`GET /mine`（我的投诉）。管理员处理见 `/api/admin/complaints/:id/handle`。

## 系统

`GET /api/system/info`：站点名、演示模式、各外部服务是否已配置、支持作物与支付模式。
