/**
 * 禾农云端到端验收脚本（真实 HTTP 调用，不 mock）
 * 覆盖：认证、供需发布与审核、询价与实时消息、识别任务（无密钥时的真实失败路径）、
 *      并发预约唯一性、商城完整订单链、权限越权、行情录入审核与提醒任务。
 *
 * 用法：node test/e2e.mjs   （需先启动服务，默认 http://localhost:3001）
 */
import assert from 'node:assert/strict';

const BASE = process.env.E2E_BASE || 'http://localhost:3001';
const stamp = Date.now().toString().slice(-7);
const results = [];
let failures = 0;

function log(step, ok, detail = '') {
  results.push({ step, ok, detail });
  const mark = ok ? 'PASS' : 'FAIL';
  console.log(`${mark}  ${step}${detail ? ` — ${detail}` : ''}`);
}

async function run(step, fn) {
  try {
    const detail = await fn();
    log(step, true, typeof detail === 'string' ? detail : '');
    return { ok: true, detail };
  } catch (err) {
    failures++;
    log(step, false, err.message);
    return { ok: false, error: err };
  }
}

class Client {
  constructor(name) {
    this.name = name;
    this.cookie = '';
    this.token = null;
    this.user = null;
  }

  async call(path, { method = 'GET', body, form, headers = {}, raw = false } = {}) {
    const h = { ...headers };
    if (this.token) h.Authorization = `Bearer ${this.token}`;
    if (body !== undefined) h['Content-Type'] = 'application/json';
    if (this.cookie) h.Cookie = this.cookie;
    const res = await fetch(`${BASE}/api${path}`, {
      method,
      headers: h,
      body: form || (body !== undefined ? JSON.stringify(body) : undefined),
    });
    const setCookie = res.headers.getSetCookie?.() || [];
    if (setCookie.length) this.cookie = setCookie.map((c) => c.split(';')[0]).join('; ');
    const text = await res.text();
    let data = null;
    try {
      data = text ? JSON.parse(text) : null;
    } catch {
      data = { raw: text };
    }
    if (raw) return { status: res.status, data, headers: res.headers };
    return { status: res.status, data };
  }

  expect(status) {
    return (res) => {
      assert.equal(res.status, status, `期望 HTTP ${status}，实际 ${res.status}：${JSON.stringify(res.data).slice(0, 200)}`);
      return res.data;
    };
  }

  async register(email, name, password = 'Test@12345') {
    const res = await this.call('/auth/register', { method: 'POST', body: { email, password, name } });
    if (res.status !== 201) throw new Error(`注册失败 ${res.status} ${JSON.stringify(res.data)}`);
    this.user = res.data.user;
    this.token = res.data.user.accessToken;
    return this.user;
  }

  async login(email, password) {
    const res = await this.call('/auth/login', { method: 'POST', body: { email, password } });
    if (res.status !== 200) throw new Error(`登录失败 ${res.status} ${JSON.stringify(res.data)}`);
    this.user = res.data.user;
    this.token = res.data.user.accessToken;
    return this.user;
  }
}

async function uploadImage(client) {
  const png = Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
    'base64',
  );
  const bigger = await makeLargePng();
  const fd = new FormData();
  fd.append('file', new Blob([bigger], { type: 'image/png' }), 'test-leaf.png');
  fd.append('purpose', 'diagnosis');
  const res = await client.call('/uploads', { method: 'POST', form: fd });
  assert.equal(res.status, 201, `上传失败：${JSON.stringify(res.data)}`);
  return res.data.upload;
}

/** 用 canvas 不可用，直接构造一个 800x800 的纯色 PNG（zlib 编码） */
async function makeLargePng() {
  const zlib = await import('node:zlib');
  const width = 800;
  const height = 800;
  const raw = Buffer.alloc((width * 3 + 1) * height);
  for (let y = 0; y < height; y++) {
    const row = y * (width * 3 + 1);
    raw[row] = 0;
    for (let x = 0; x < width; x++) {
      const i = row + 1 + x * 3;
      const v = 90 + ((x * 7 + y * 13) % 60);
      raw[i] = v;
      raw[i + 1] = 120 + ((x * 3) % 40);
      raw[i + 2] = 70 + ((y * 5) % 30);
    }
  }
  const idat = zlib.deflateSync(raw);
  const chunk = (type, data) => {
    const len = Buffer.alloc(4);
    len.writeUInt32BE(data.length);
    const body = Buffer.concat([Buffer.from(type), data]);
    const crcTable = makeCrcTable();
    let c = 0xffffffff;
    for (const b of body) c = crcTable[(c ^ b) & 0xff] ^ (c >>> 8);
    const crc = Buffer.alloc(4);
    crc.writeUInt32BE((c ^ 0xffffffff) >>> 0);
    return Buffer.concat([len, body, crc]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;
  ihdr[9] = 2;
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', idat),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}
function makeCrcTable() {
  const table = new Int32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c;
  }
  return table;
}

async function main() {
  console.log(`\n=== 禾农云端到端验收 (${BASE}) ===\n`);

  const admin = new Client('admin');
  const merchant = new Client('merchant');
  const buyer = new Client('buyer');
  const rival = new Client('rival');

  await run('管理员登录', async () => {
    const u = await admin.login('admin@henongyun.cn', 'Admin@12345');
    assert.equal(u.role, 'admin');
    return u.name;
  });

  await run('新用户注册（含密码强度校验）', async () => {
    const weak = await buyer.call('/auth/register', { method: 'POST', body: { email: `weak${stamp}@test.local`, password: '123', name: '测试' } });
    assert.equal(weak.status, 400);
    const u = await buyer.register(`farmer${stamp}@test.local`, `测试农户${stamp}`);
    assert.equal(u.role, 'user');
    return u.email;
  });

  await run('第二个用户注册', async () => {
    const u = await rival.register(`rival${stamp}@test.local`, `竞品农户${stamp}`);
    return u.email;
  });

  await run('商家账号登录', async () => {
    const u = await merchant.login('merchant@demo.henongyun.local', 'Demo@12345');
    assert.equal(u.role, 'merchant');
    return u.merchant?.shopName || '';
  });

  let postId;
  await run('发布供应信息并提交审核', async () => {
    const res = await buyer.call('/posts?submit=1', {
      method: 'POST',
      body: {
        type: 'supply',
        title: `验收测试 大棚番茄 ${stamp} 供应`,
        category: '蔬菜',
        variety: '硬粉番茄',
        spec: '单果 180-220g',
        quantity: 12,
        unit: '吨',
        priceType: 'fixed',
        price: 4.5,
        province: '山东省',
        city: '潍坊市',
        validUntil: new Date(Date.now() + 10 * 86400000).toISOString().slice(0, 10),
        description: '验收脚本创建的测试供应信息。',
      },
    });
    assert.equal(res.status, 201, JSON.stringify(res.data));
    postId = res.data.id;
    assert.equal(res.data.status, 'pending');
    return `postId=${postId}`;
  });

  await run('未审核信息不出现在公开列表', async () => {
    const res = await rival.call(`/posts?q=验收测试`);
    assert.equal(res.status, 200);
    assert.equal(res.data.items.filter((i) => i.id === postId).length, 0, '待审核信息不应公开');
  });

  await run('管理员审核通过后公开可见', async () => {
    const review = await admin.call(`/admin/posts/${postId}/review`, { method: 'POST', body: { action: 'approve' } });
    assert.equal(review.status, 200);
    const list = await rival.call(`/posts?q=${encodeURIComponent('验收测试')}`);
    assert.equal(list.data.items.some((i) => i.id === postId), true);
    return '已公开';
  });

  let conversationId;
  await run('另一账号发起询价并生成站内会话', async () => {
    const res = await rival.call(`/posts/${postId}/inquiries`, {
      method: 'POST',
      body: { kind: 'inquiry', quantity: 5, unit: '吨', message: '验收测试：需要 5 吨，能否本周发货？' },
    });
    assert.equal(res.status, 201, JSON.stringify(res.data));
    conversationId = res.data.conversationId;
    assert.ok(conversationId);
    return `conversationId=${conversationId}`;
  });

  await run('发布方收到会话与未读消息', async () => {
    const convs = await buyer.call('/conversations');
    assert.equal(convs.status, 200);
    const target = convs.data.items.find((c) => c.id === conversationId);
    assert.ok(target, '应能看到会话');
    assert.ok(target.unread >= 1, '应有未读消息');
    return `unread=${target.unread}`;
  });

  await run('站内消息发送与持久化', async () => {
    const send = await buyer.call(`/conversations/${conversationId}/messages`, {
      method: 'POST',
      body: { body: '验收测试：可以，明天安排发货。' },
    });
    assert.equal(send.status, 201);
    const list = await rival.call(`/conversations/${conversationId}/messages`);
    assert.equal(list.data.items.length >= 2, true);
    const read = await rival.call(`/conversations/${conversationId}/read`, { method: 'POST' });
    assert.equal(read.status, 200);
    assert.ok(read.data.read >= 1);
    return `messages=${list.data.items.length}`;
  });

  await run('SSE 实时通道建立并收到 ready 事件', async () => {
    const ticketRes = await buyer.call('/events/ticket', { method: 'POST' });
    assert.equal(ticketRes.status, 200);
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 6000);
    const res = await fetch(`${BASE}/api/events?ticket=${encodeURIComponent(ticketRes.data.ticket)}`, {
      headers: { Accept: 'text/event-stream' },
      signal: controller.signal,
    });
    assert.equal(res.status, 200);
    const reader = res.body.getReader();
    const { value } = await reader.read();
    const chunk = Buffer.from(value).toString('utf8');
    clearTimeout(timer);
    controller.abort();
    assert.ok(chunk.includes('event: connected') || chunk.includes('retry:'), '应收到 SSE 初始帧');
    return '连接成功';
  });

  await run('上传图片（服务端质量检测）', async () => {
    const up = await uploadImage(buyer);
    assert.ok(up.id);
    assert.ok(up.quality && up.quality.width >= 640, '应返回真实图像指标');
    return `${up.quality.width}x${up.quality.height}`;
  });

  let diagnosisId;
  await run('提交识别任务（未配置识别服务时如实失败）', async () => {
    const up = await uploadImage(buyer);
    const res = await buyer.call('/diagnoses', { method: 'POST', body: { uploadId: up.id, crop: 'tomato', symptoms: '验收测试，叶片有褐色斑点' } });
    assert.equal(res.status, 202, JSON.stringify(res.data));
    diagnosisId = res.data.diagnosis.id;
    await new Promise((r) => setTimeout(r, 1200));
    const detail = await buyer.call(`/diagnoses/${diagnosisId}`);
    assert.equal(detail.status, 200);
    const d = detail.data.diagnosis;
    assert.ok(['failed', 'completed', 'needs_review'].includes(d.status), `状态异常：${d.status}`);
    if (!d.result) {
      assert.ok(d.failureReason, '失败时必须给出原因');
      return `status=${d.status}, reason=${d.failureReason}`;
    }
    return `status=${d.status}, provider=${d.result.source}`;
  });

  await run('识别记录可再次读取（历史持久化）', async () => {
    const list = await buyer.call('/diagnoses?pageSize=5');
    assert.equal(list.status, 200);
    assert.ok(list.data.items.some((i) => i.id === diagnosisId));
    return `total=${list.data.total}`;
  });

  let machineId;
  await run('商家创建设备并设置计价', async () => {
    const res = await merchant.call('/machinery', {
      method: 'POST',
      body: {
        name: `验收联合收割机 ${stamp}`,
        type: '收割机',
        brand: '久保田',
        model: 'PRO688Q',
        power: '68 马力',
        province: '山东省',
        city: '潍坊市',
        serviceArea: '潍坊市全域',
        pricingType: 'per_mu',
        price: 60,
        description: '验收测试设备',
      },
    });
    assert.equal(res.status, 201, JSON.stringify(res.data));
    machineId = res.data.id;
    return `machineryId=${machineId}`;
  });

  const bookDate = new Date(Date.now() + 3 * 86400000).toISOString().slice(0, 10);
  await run('并发预约同一设备同一时段（仅一单成功）', async () => {
    const payloadA = new FormData();
    const body = {
      machineryId: machineId,
      date: bookDate,
      startHour: 8,
      endHour: 12,
      area: 10,
      location: '山东省潍坊市寿光市验收村 1 号地块',
      contactName: '测试甲',
      contactPhone: '13800000011',
    };
    const [a, b] = await Promise.all([
      buyer.call('/machinery/bookings', { method: 'POST', body }),
      rival.call('/machinery/bookings', { method: 'POST', body: { ...body, contactName: '测试乙', contactPhone: '13800000012' } }),
    ]);
    const okCount = [a, b].filter((r) => r.status === 201).length;
    const conflictCount = [a, b].filter((r) => r.status === 409).length;
    assert.equal(okCount, 1, `应只有 1 单成功，实际成功 ${okCount}（状态码 ${a.status}/${b.status}）`);
    assert.equal(conflictCount, 1, '另一单应返回 409');
    return '1 成功 / 1 冲突';
  });

  await run('取消预约释放时段后可再次预约', async () => {
    const list = await buyer.call('/machinery/bookings/mine');
    const booking = list.data.items.find((b) => b.machinery_id === machineId);
    assert.ok(booking);
    const cancel = await buyer.call(`/machinery/bookings/${booking.id}/cancel`, { method: 'POST', body: { reason: '验收测试取消' } });
    assert.equal(cancel.status, 200);
    const retry = await rival.call('/machinery/bookings', {
      method: 'POST',
      body: {
        machineryId: machineId, date: bookDate, startHour: 8, endHour: 12, area: 8,
        location: '山东省潍坊市寿光市验收村 2 号地块', contactName: '测试丙', contactPhone: '13800000013',
      },
    });
    assert.equal(retry.status, 201, JSON.stringify(retry.data));
    return '时段已释放';
  });

  let productId;
  await run('商家创建商品（真实库存）', async () => {
    const res = await merchant.call('/shop/products', {
      method: 'POST',
      body: {
        name: `验收复合肥 ${stamp}`,
        category: '肥料',
        spec: '40kg/袋',
        unit: '袋',
        price: 120,
        stock: 20,
        description: '验收测试商品',
        applicable: '果蔬',
        sourceNote: '验收测试数据，不对应真实批次',
        imageIds: [],
      },
    });
    assert.equal(res.status, 201, JSON.stringify(res.data));
    productId = res.data.id;
    return `productId=${productId}`;
  });

  let orderId;
  await run('加入购物车并下单（扣减库存）', async () => {
    const cart = await buyer.call('/shop/cart', { method: 'POST', body: { productId, quantity: 3 } });
    assert.equal(cart.status, 201);
    const addr = await buyer.call('/users/me/addresses', {
      method: 'POST',
      body: { receiver: '测试收货人', phone: '13900000001', province: '山东省', city: '潍坊市', district: '寿光市', detail: '验收测试路 8 号', isDefault: true },
    });
    assert.equal(addr.status, 201);
    const res = await buyer.call('/shop/orders', {
      method: 'POST',
      body: { addressId: addr.data.id, items: [{ productId, quantity: 3 }], fromCart: true },
    });
    assert.equal(res.status, 201, JSON.stringify(res.data));
    orderId = res.data.orders[0].id;
    const detail = await buyer.call(`/shop/products/${productId}`);
    assert.equal(detail.data.product.stock, 17, `库存应扣减为 17，实际 ${detail.data.product.stock}`);
    return `orderId=${orderId}, stock=17`;
  });

  await run('订单支付接口在未配置支付时明确拒绝', async () => {
    const res = await buyer.call(`/shop/orders/${orderId}/pay`, { method: 'POST' });
    if (res.status === 200) return '已配置在线支付，返回收银台';
    assert.equal(res.status, 503);
    assert.ok(String(res.data.error?.message).includes('支付'));
    return '503 明确提示未接入';
  });

  await run('商家确认线下收款 → 发货 → 买家收货', async () => {
    const confirm = await merchant.call(`/shop/orders/${orderId}/confirm-offline`, { method: 'POST' });
    assert.equal(confirm.status, 200, JSON.stringify(confirm.data));
    const ship = await merchant.call(`/shop/orders/${orderId}/ship`, {
      method: 'POST',
      body: { trackingCompany: '顺丰速运', trackingNo: 'SF1234567890' },
    });
    assert.equal(ship.status, 200, JSON.stringify(ship.data));
    const receive = await buyer.call(`/shop/orders/${orderId}/receive`, { method: 'POST' });
    assert.equal(receive.status, 200);
    const detail = await buyer.call(`/shop/orders/${orderId}`);
    assert.equal(detail.data.order.status, 'completed');
    return 'completed';
  });

  await run('售后申请与管理员处理', async () => {
    const refund = await buyer.call(`/shop/orders/${orderId}/refund`, { method: 'POST', body: { reason: '验收测试：包装破损', amount: 60 } });
    assert.equal(refund.status, 201, JSON.stringify(refund.data));
    const list = await admin.call('/admin/refunds');
    const target = list.data.items.find((r) => r.order_id === orderId);
    assert.ok(target);
    const process = await admin.call(`/admin/refunds/${target.id}/process`, { method: 'POST', body: { action: 'reject', note: '验收测试：线下协商处理' } });
    assert.equal(process.status, 200);
    return '售后已处理';
  });

  await run('越权：普通用户访问管理接口被拒绝', async () => {
    const res = await buyer.call('/admin/stats');
    assert.equal(res.status, 403);
    return '403';
  });

  await run('越权：商家修改他人商品被拒绝', async () => {
    const res = await merchant.call(`/shop/products/1`, {
      method: 'PUT',
      body: { name: '篡改商品', category: '肥料', spec: '40kg/袋', unit: '袋', price: 1, stock: 1 },
    });
    assert.ok([403, 404].includes(res.status), `应拒绝，实际 ${res.status}`);
    return `${res.status}`;
  });

  let sourceId;
  await run('管理员创建行情来源并录入价格', async () => {
    const create = await admin.call('/admin/market/sources', {
      method: 'POST',
      body: { name: `验收行情源 ${stamp}`, code: `e2e${stamp}`, kind: 'manual' },
    });
    assert.equal(create.status, 201, JSON.stringify(create.data));
    sourceId = create.data.id;
    const price = await admin.call('/admin/market/prices', {
      method: 'POST',
      body: {
        sourceId,
        crop: '番茄',
        spec: '中等果',
        province: '山东省',
        market: '验收测试批发市场',
        price: 4.2,
        unit: '元/公斤',
        quoteBasis: '中等规格批发价',
        collectedAt: new Date().toISOString().slice(0, 19).replace('T', ' '),
      },
    });
    assert.equal(price.status, 201, JSON.stringify(price.data));
    return `sourceId=${sourceId}`;
  });

  await run('未审核行情不出现在前台，审核后出现且标注来源', async () => {
    const before = await buyer.call('/market/prices?crop=番茄');
    assert.equal(before.data.items.some((p) => p.market === '验收测试批发市场'), false, '未审核不应展示');
    const pending = await admin.call('/admin/market/prices?status=pending');
    const row = pending.data.items.find((p) => p.market === '验收测试批发市场');
    assert.ok(row, '待审核列表应包含记录');
    await admin.call(`/admin/market/prices/${row.id}/review`, { method: 'POST', body: { action: 'approve' } });
    const after = await buyer.call('/market/prices?crop=番茄');
    const found = after.data.items.find((p) => p.market === '验收测试批发市场');
    assert.ok(found, '审核后应展示');
    assert.ok(found.source_name && found.collected_at && found.quote_basis, '必须标注来源、采集时间与口径');
    return `source=${found.source_name}`;
  });

  await run('价格提醒创建与后台任务触发', async () => {
    const created = await buyer.call('/market/alerts', {
      method: 'POST',
      body: { crop: '番茄', direction: 'above', threshold: 1 },
    });
    assert.equal(created.status, 201, JSON.stringify(created.data));
    // 直接调用任务模块，验证真实判断逻辑（不等待 60 秒）
    const { runPriceAlerts } = await import('../src/jobs/index.js');
    const { initDb } = await import('../src/db/index.js');
    const { loadConfig } = await import('../src/config.js');
    loadConfig();
    initDb();
    const result = runPriceAlerts();
    assert.ok(result.triggered >= 1, `应至少触发 1 条提醒，实际 ${result.triggered}`);
    const notifs = await buyer.call('/notifications');
    assert.ok(notifs.data.items.some((n) => n.type === 'price_alert'), '应收到价格提醒通知');
    return `triggered=${result.triggered}`;
  });

  await run('认领农技工单并回复（角色校验）', async () => {
    const ticket = await buyer.call(`/diagnoses/${diagnosisId}/advisory`, {
      method: 'POST',
      body: { subject: '验收测试：识别结果复核', content: '叶片出现褐色斑点约 5 天，棚内湿度较大，请协助判断。' },
    });
    assert.equal(ticket.status, 201, JSON.stringify(ticket.data));
    const forbidden = await buyer.call(`/diagnoses/advisories/${ticket.data.id}/reply`, { method: 'POST', body: { reply: '普通用户不应能回复工单内容。' } });
    assert.equal(forbidden.status, 403);
    const agronomist = new Client('agri');
    await agronomist.login('agri@henongyun.cn', 'Admin@12345');
    const reply = await agronomist.call(`/diagnoses/advisories/${ticket.data.id}/reply`, {
      method: 'POST',
      body: { reply: '验收测试回复：建议先降低棚内湿度，摘除病叶，并联系当地植保站确认用药方案。' },
    });
    assert.equal(reply.status, 200, JSON.stringify(reply.data));
    const mine = await buyer.call('/diagnoses/advisories/mine');
    const found = mine.data.items.find((a) => a.id === ticket.data.id);
    assert.equal(found.status, 'replied');
    return '工单已回复';
  });

  await run('刷新会话（refresh token 轮换）', async () => {
    const res = await buyer.call('/auth/refresh', { method: 'POST' });
    assert.equal(res.status, 200);
    assert.ok(res.data.user.accessToken);
    buyer.token = res.data.user.accessToken;
    const me = await buyer.call('/auth/me');
    assert.equal(me.status, 200);
    return '会话可恢复';
  });

  await run('退出登录后刷新令牌失效', async () => {
    const tmp = new Client('tmp');
    await tmp.login(`farmer${stamp}@test.local`, 'Test@12345');
    await tmp.call('/auth/logout', { method: 'POST' });
    const res = await tmp.call('/auth/refresh', { method: 'POST' });
    assert.equal(res.status, 401);
    return '已撤销';
  });

  console.log(`\n=== 结果：${results.filter((r) => r.ok).length}/${results.length} 通过，${failures} 失败 ===\n`);
  console.table(results.map((r) => ({ 用例: r.step, 结果: r.ok ? 'PASS' : 'FAIL', 说明: (r.detail || '').slice(0, 70) })));
  process.exit(failures > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error('测试脚本异常：', err);
  process.exit(1);
});
