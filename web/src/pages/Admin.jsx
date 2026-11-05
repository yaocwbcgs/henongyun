import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { get, patch, post, put } from '../lib/api.js';
import { useAsync, useTitle } from '../lib/hooks.js';
import { useAuth } from '../lib/auth.jsx';
import { useToast } from '../lib/toast.jsx';
import PageHead from '../components/PageHead.jsx';
import { Empty, ErrorState, Loading, Modal, Spinner, StatusTag } from '../components/ui.jsx';
import { date, dateTime, money, num, statusText, statusTone } from '../lib/format.js';

const TABS = [
  ['overview', '概览'],
  ['users', '用户与角色'],
  ['merchants', '商家入驻'],
  ['posts', '供需审核'],
  ['products', '商品与库存'],
  ['machinery', '农机资源'],
  ['orders', '订单与支付'],
  ['refunds', '退款售后'],
  ['advisories', '农技工单'],
  ['knowledge', '知识库'],
  ['market', '行情采集'],
  ['complaints', '投诉处理'],
  ['integrations', '服务接入'],
  ['logs', '操作日志'],
  ['reports', '经营报表'],
];

function Table({ head, children, empty }) {
  if (empty) return <Empty title={empty} />;
  return (
    <div className="table-wrap">
      <table className="table">
        <thead><tr>{head.map((h) => <th key={h}>{h}</th>)}</tr></thead>
        <tbody>{children}</tbody>
      </table>
    </div>
  );
}

function ReviewModal({ open, onClose, title, onConfirm, requireNote, actionLabel = '确认' }) {
  const [note, setNote] = useState('');
  useEffect(() => { if (open) setNote(''); }, [open]);
  return (
    <Modal
      open={open}
      onClose={onClose}
      title={title}
      footer={
        <>
          <button type="button" className="btn btn--ghost btn--sm" onClick={onClose}>取消</button>
          <button type="button" className="btn btn--primary btn--sm" onClick={() => onConfirm(note)} disabled={requireNote && note.trim().length < 2}>{actionLabel}</button>
        </>
      }
    >
      <label className="field">
        <span className="field__label">{requireNote ? '原因（必填）' : '备注（选填）'}</span>
        <textarea className="textarea" value={note} onChange={(e) => setNote(e.target.value)} maxLength={300} />
      </label>
    </Modal>
  );
}

function Overview() {
  const stats = useAsync(() => get('/admin/stats'), []);
  const reports = useAsync(() => get('/admin/reports'), []);
  const s = stats.data;
  return (
    <>
      {stats.loading && <Loading rows={2} height={100} />}
      {stats.error && <ErrorState error={stats.error} onRetry={stats.reload} />}
      {s && (
        <>
          <div className="stat-grid">
            {[
              ['注册用户', s.users, `商家中 ${s.merchants} 家`],
              ['累计成交额', `¥${num(s.gmv, 2)}`, `${s.orders} 个订单`],
              ['待审核', s.pendingPosts + s.pendingMerchants + s.pendingPrices, `供需 ${s.pendingPosts} · 商家 ${s.pendingMerchants} · 行情 ${s.pendingPrices}`],
              ['待处理', s.openAdvisories + s.openComplaints + s.pendingRefunds, `工单 ${s.openAdvisories} · 投诉 ${s.openComplaints} · 售后 ${s.pendingRefunds}`],
            ].map(([label, value, foot]) => (
              <div key={label} className="stat-cell">
                <div className="stat-cell__label">{label}</div>
                <div className="stat-cell__value" style={{ fontSize: typeof value === 'string' ? 23 : undefined }}>{value}</div>
                <div className="stat-cell__foot">{foot}</div>
              </div>
            ))}
          </div>

          <div className="panel mt-24">
            <div className="row between" style={{ marginBottom: 16 }}>
              <h3 className="h4">近 7 天业务量</h3>
              <span className="small muted">数据来自订单、供需与识别记录</span>
            </div>
            <div className="row gap-16" style={{ alignItems: 'flex-end', height: 140 }}>
              {(s.trend || []).map((d) => {
                const max = Math.max(1, ...s.trend.map((x) => x.orders + x.posts + x.diagnoses));
                const h = Math.max(4, ((d.orders + d.posts + d.diagnoses) / max) * 120);
                return (
                  <div key={d.date} style={{ flex: 1, textAlign: 'center' }}>
                    <div title={`订单 ${d.orders} · 供需 ${d.posts} · 识别 ${d.diagnoses}`} style={{ height: 120, display: 'flex', alignItems: 'flex-end', justifyContent: 'center' }}>
                      <div style={{ width: '62%', height: h, background: 'var(--olive-soft)', borderRadius: '2px 2px 0 0' }} />
                    </div>
                    <div className="field__hint" style={{ marginTop: 6 }}>{String(d.date).slice(5)}</div>
                  </div>
                );
              })}
            </div>
          </div>

          <div className="grid12 mt-16" style={{ gap: 16 }}>
            <div className="panel" style={{ gridColumn: 'span 6' }}>
              <h3 className="h4" style={{ marginBottom: 10 }}>品类销售</h3>
              {(reports.data?.byCategory || []).length === 0 && <p className="small muted">暂无成交数据。</p>}
              {(reports.data?.byCategory || []).map((c) => (
                <div key={c.category} className="row between small" style={{ padding: '6px 0', borderBottom: '1px solid var(--line-soft)' }}>
                  <span>{c.category}</span>
                  <span className="muted">{c.sold} 件</span>
                  <span className="tabular">{money(c.amount)}</span>
                </div>
              ))}
            </div>
            <div className="panel" style={{ gridColumn: 'span 6' }}>
              <h3 className="h4" style={{ marginBottom: 10 }}>识别任务分布</h3>
              {(reports.data?.diagnosisByCrop || []).length === 0 && <p className="small muted">暂无识别记录。</p>}
              {(reports.data?.diagnosisByCrop || []).map((c) => (
                <div key={c.crop} className="row between small" style={{ padding: '6px 0', borderBottom: '1px solid var(--line-soft)' }}>
                  <span>{c.crop}</span>
                  <span className="muted">{c.completed}/{c.total} 完成</span>
                </div>
              ))}
            </div>
          </div>
        </>
      )}
    </>
  );
}

function Users() {
  const toast = useToast();
  const [q, setQ] = useState('');
  const [role, setRole] = useState('');
  const users = useAsync(() => get('/admin/users', { q, role }), [q, role]);
  const update = async (u, payload) => {
    try {
      await patch(`/admin/users/${u.id}`, payload);
      toast.ok('已更新');
      users.reload();
    } catch (err) {
      toast.error(err.message);
    }
  };
  return (
    <>
      <div className="filter-bar" style={{ marginBottom: 14 }}>
        <input className="input filter-bar__grow" placeholder="搜索姓名或邮箱" value={q} onChange={(e) => setQ(e.target.value)} />
        <select className="select" style={{ width: 150 }} value={role} onChange={(e) => setRole(e.target.value)}>
          <option value="">全部角色</option>
          <option value="user">普通用户</option>
          <option value="merchant">商家</option>
          <option value="agronomist">农技人员</option>
          <option value="admin">管理员</option>
        </select>
      </div>
      {users.loading ? <Loading rows={3} height={60} /> : (
        <Table head={['用户', '角色', '状态', '业务', '注册时间', '操作']} empty={(users.data?.items || []).length === 0 ? '没有匹配的用户' : null}>
          {(users.data?.items || []).map((u) => (
            <tr key={u.id}>
              <td>
                <div style={{ fontSize: 13.5 }}>{u.name}{u.shop_name ? ` · ${u.shop_name}` : ''}</div>
                <div className="small muted">{u.email}{u.phone ? ` · ${u.phone}` : ''}</div>
              </td>
              <td>
                <select className="select select--sm" value={u.role} onChange={(e) => update(u, { role: e.target.value })} aria-label="角色">
                  <option value="user">普通用户</option>
                  <option value="merchant">商家</option>
                  <option value="agronomist">农技人员</option>
                  <option value="admin">管理员</option>
                </select>
              </td>
              <td><StatusTag status={u.status} text={u.status === 'active' ? '正常' : '已停用'} tone={u.status === 'active' ? 'olive' : 'danger'} /></td>
              <td className="small muted">{u.posts} 发布 · {u.orders} 订单</td>
              <td className="small muted">{date(u.created_at)}</td>
              <td>
                <button type="button" className="btn btn--quiet btn--sm" onClick={() => update(u, { status: u.status === 'active' ? 'disabled' : 'active' })}>
                  {u.status === 'active' ? '停用' : '启用'}
                </button>
              </td>
            </tr>
          ))}
        </Table>
      )}
    </>
  );
}

function Merchants() {
  const toast = useToast();
  const list = useAsync(() => get('/admin/merchants'), []);
  const [review, setReview] = useState(null);
  const act = async (m, action, note) => {
    try {
      await post(`/admin/merchants/${m.user_id}/review`, { action, note: note || undefined });
      toast.ok(action === 'approve' ? '已通过入驻' : '已驳回');
      setReview(null);
      list.reload();
    } catch (err) {
      toast.error(err.message);
    }
  };
  return (
    <>
      {list.loading ? <Loading rows={3} height={80} /> : (
        <div className="stack gap-12">
          {(list.data?.items || []).length === 0 && <Empty title="暂无入驻申请" />}
          {(list.data?.items || []).map((m) => (
            <div key={m.user_id} className="panel" style={{ padding: 18 }}>
              <div className="row between" style={{ flexWrap: 'wrap', gap: 10 }}>
                <div>
                  <div className="row gap-8" style={{ marginBottom: 4 }}>
                    <span style={{ fontSize: 15 }}>{m.shop_name}</span>
                    <StatusTag status={m.status} text={m.status === 'approved' ? '已通过' : m.status === 'pending' ? '待审核' : '已驳回'} tone={m.status === 'approved' ? 'olive' : m.status === 'pending' ? 'wheat' : 'danger'} />
                  </div>
                  <div className="small muted">{m.contact_name} · {m.contact_phone} · {m.region} · {m.business_type}</div>
                  <div className="small muted">申请人 {m.name}（{m.email}）· 执照 {m.license_no || '未填'} · 提交 {dateTime(m.applied_at)}</div>
                  {m.intro && <p className="small mt-8" style={{ maxWidth: 640 }}>{m.intro}</p>}
                  {m.review_note && <div className="small" style={{ color: 'var(--danger)', marginTop: 4 }}>审核意见：{m.review_note}</div>}
                </div>
                {m.status === 'pending' && (
                  <div className="row gap-8">
                    <button type="button" className="btn btn--primary btn--sm" onClick={() => act(m, 'approve')}>通过</button>
                    <button type="button" className="btn btn--ghost btn--sm" onClick={() => setReview({ m, action: 'reject' })}>驳回</button>
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
      <ReviewModal open={Boolean(review)} onClose={() => setReview(null)} title="驳回入驻申请" requireNote actionLabel="确认驳回" onConfirm={(note) => act(review.m, review.action, note)} />
    </>
  );
}

function Posts() {
  const toast = useToast();
  const [status, setStatus] = useState('pending');
  const list = useAsync(() => get('/admin/posts', { status }), [status]);
  const [reject, setReject] = useState(null);
  const act = async (p, action, reason) => {
    try {
      await post(`/admin/posts/${p.id}/review`, { action, reason: reason || undefined });
      toast.ok(action === 'approve' ? '已通过并发布' : '已驳回');
      setReject(null);
      list.reload();
    } catch (err) {
      toast.error(err.message);
    }
  };
  return (
    <>
      <div className="row gap-8" style={{ marginBottom: 14 }}>
        {['pending', 'active', 'rejected', 'closed', ''].map((v) => (
          <button key={v || 'all'} type="button" className="tag" style={{ cursor: 'pointer', background: status === v ? 'var(--olive)' : 'transparent', color: status === v ? 'var(--paper)' : 'var(--ink-soft)', borderColor: status === v ? 'var(--olive)' : 'var(--line-strong)' }} onClick={() => setStatus(v)}>
            {v === 'pending' ? '待审核' : v === 'active' ? '已发布' : v === 'rejected' ? '未通过' : v === 'closed' ? '已关闭' : '全部'}
          </button>
        ))}
      </div>
      {list.loading ? <Loading rows={3} height={60} /> : (
        <Table head={['信息', '类型', '发布人', '状态', '时间', '操作']} empty={(list.data?.items || []).length === 0 ? '该状态下没有信息' : null}>
          {(list.data?.items || []).map((p) => (
            <tr key={p.id}>
              <td>
                <Link to={`/trade/${p.id}`} style={{ fontSize: 13.5 }}>{p.title}</Link>
                <div className="small muted">{p.province}{p.city} · {num(p.quantity, 2)}{p.unit} · {p.price_type === 'fixed' ? money(p.price) : '面议'}</div>
              </td>
              <td className="small">{p.type === 'supply' ? '供应' : '采购'}</td>
              <td className="small">{p.shop_name || p.owner_name}</td>
              <td><StatusTag status={p.status} text={statusText(p.status)} tone={statusTone(p.status)} /></td>
              <td className="small muted">{dateTime(p.created_at)}</td>
              <td>
                {p.status === 'pending' ? (
                  <div className="row gap-8">
                    <button type="button" className="btn btn--primary btn--sm" onClick={() => act(p, 'approve')}>通过</button>
                    <button type="button" className="btn btn--ghost btn--sm" onClick={() => setReject(p)}>驳回</button>
                  </div>
                ) : <span className="small muted">—</span>}
              </td>
            </tr>
          ))}
        </Table>
      )}
      <ReviewModal open={Boolean(reject)} onClose={() => setReject(null)} title="驳回供需信息" requireNote actionLabel="确认驳回" onConfirm={(note) => act(reject, 'reject', note)} />
    </>
  );
}

function Products() {
  const toast = useToast();
  const list = useAsync(() => get('/admin/products'), []);
  const toggle = async (p) => {
    try {
      await patch(`/admin/products/${p.id}`, { status: p.status === 'active' ? 'inactive' : 'active' });
      toast.ok('已更新商品状态');
      list.reload();
    } catch (err) {
      toast.error(err.message);
    }
  };
  return list.loading ? <Loading rows={3} height={60} /> : (
    <Table head={['商品', '商家', '价格 / 库存', '状态', '操作']} empty={(list.data?.items || []).length === 0 ? '暂无商品' : null}>
      {(list.data?.items || []).map((p) => (
        <tr key={p.id}>
          <td><div style={{ fontSize: 13.5 }}>{p.name}</div><div className="small muted">{p.category} · {p.spec}</div></td>
          <td className="small">{p.shop_name || '—'}</td>
          <td className="small">{money(p.price)} / {num(p.stock)} {p.unit}</td>
          <td><StatusTag status={p.status} text={p.status === 'active' ? '在售' : '已下架'} tone={p.status === 'active' ? 'olive' : 'muted'} /></td>
          <td><button type="button" className="btn btn--quiet btn--sm" onClick={() => toggle(p)}>{p.status === 'active' ? '下架' : '上架'}</button></td>
        </tr>
      ))}
    </Table>
  );
}

function Machinery() {
  const toast = useToast();
  const list = useAsync(() => get('/admin/machinery'), []);
  const toggle = async (m) => {
    try {
      await patch(`/admin/machinery/${m.id}`, { status: m.status === 'active' ? 'inactive' : 'active' });
      toast.ok('已更新设备状态');
      list.reload();
    } catch (err) {
      toast.error(err.message);
    }
  };
  return list.loading ? <Loading rows={3} height={60} /> : (
    <Table head={['设备', '商家', '服务区域', '价格', '状态', '操作']} empty={(list.data?.items || []).length === 0 ? '暂无设备' : null}>
      {(list.data?.items || []).map((m) => (
        <tr key={m.id}>
          <td><div style={{ fontSize: 13.5 }}>{m.name}</div><div className="small muted">{m.type}</div></td>
          <td className="small">{m.shop_name || '—'}</td>
          <td className="small">{m.province}{m.city}<br /><span className="muted">{m.service_area}</span></td>
          <td className="small">{money(m.price)}</td>
          <td><StatusTag status={m.status} text={m.status === 'active' ? '可预约' : '已下架'} tone={m.status === 'active' ? 'olive' : 'muted'} /></td>
          <td><button type="button" className="btn btn--quiet btn--sm" onClick={() => toggle(m)}>{m.status === 'active' ? '下架' : '上架'}</button></td>
        </tr>
      ))}
    </Table>
  );
}

function Orders() {
  const orders = useAsync(() => get('/admin/orders'), []);
  const payments = useAsync(() => get('/admin/payments'), []);
  return (
    <>
      {orders.loading ? <Loading rows={2} height={60} /> : (
        <>
          <h3 className="h4" style={{ marginBottom: 10 }}>订单</h3>
          <Table head={['订单号', '买家', '商家', '金额', '状态', '时间']} empty={(orders.data?.items || []).length === 0 ? '暂无订单' : null}>
            {(orders.data?.items || []).map((o) => (
              <tr key={o.id}>
                <td><Link to={`/orders/${o.id}`} style={{ fontSize: 13 }}>{o.order_no}</Link></td>
                <td className="small">{o.buyer_name}</td>
                <td className="small">{o.shop_name || '—'}</td>
                <td className="num">{money(o.total)}</td>
                <td><StatusTag status={o.status} text={statusText(o.status)} tone={statusTone(o.status)} /></td>
                <td className="small muted">{dateTime(o.created_at)}</td>
              </tr>
            ))}
          </Table>
          <h3 className="h4" style={{ margin: '24px 0 10px' }}>支付记录</h3>
          <Table head={['订单号', '渠道', '金额', '状态', '时间']} empty={(payments.data?.items || []).length === 0 ? '暂无支付记录' : null}>
            {(payments.data?.items || []).map((p) => (
              <tr key={p.id}>
                <td className="small">{p.order_no}</td>
                <td className="small">{p.provider === 'stripe' ? 'Stripe' : '线下收款'}</td>
                <td className="num">{money(p.amount)}</td>
                <td className="small">{p.status === 'succeeded' ? '成功' : p.status === 'refunded' ? '已退款' : p.status}</td>
                <td className="small muted">{dateTime(p.paid_at || p.created_at)}</td>
              </tr>
            ))}
          </Table>
        </>
      )}
    </>
  );
}

function Refunds() {
  const toast = useToast();
  const list = useAsync(() => get('/admin/refunds'), []);
  const act = async (r, action) => {
    try {
      const res = await post(`/admin/refunds/${r.id}/process`, { action });
      toast.ok(action === 'reject' ? '已驳回' : res.status === 'refunded' ? '退款已完成' : '已批准，等待财务处理');
      list.reload();
    } catch (err) {
      toast.error(err.message);
    }
  };
  return list.loading ? <Loading rows={3} height={60} /> : (
    <Table head={['订单', '金额', '原因', '状态', '申请时间', '操作']} empty={(list.data?.items || []).length === 0 ? '暂无售后申请' : null}>
      {(list.data?.items || []).map((r) => (
        <tr key={r.id}>
          <td className="small">{r.order_no}<br /><span className="muted">{r.buyer_name}</span></td>
          <td className="num">{money(r.amount)}</td>
          <td className="small" style={{ maxWidth: 220 }}>{r.reason}</td>
          <td><StatusTag status={r.status} text={statusText(r.status)} tone={statusTone(r.status)} /></td>
          <td className="small muted">{dateTime(r.created_at)}</td>
          <td>
            {['requested', 'approved'].includes(r.status) ? (
              <div className="row gap-8">
                {r.status === 'requested' && <button type="button" className="btn btn--primary btn--sm" onClick={() => act(r, 'approve')}>批准退款</button>}
                {r.status === 'approved' && <button type="button" className="btn btn--primary btn--sm" onClick={() => act(r, 'mark_refunded')}>标记已退款</button>}
                {r.status === 'requested' && <button type="button" className="btn btn--ghost btn--sm" onClick={() => act(r, 'reject')}>驳回</button>}
              </div>
            ) : <span className="small muted">—</span>}
          </td>
        </tr>
      ))}
    </Table>
  );
}

function Advisories() {
  const toast = useToast();
  const list = useAsync(() => get('/diagnoses/advisories/list'), []);
  const [replyTo, setReplyTo] = useState(null);
  const [text, setText] = useState('');
  const reply = async () => {
    if (text.trim().length < 10) return toast.error('回复内容至少 10 个字');
    try {
      await post(`/diagnoses/advisories/${replyTo.id}/reply`, { reply: text.trim() });
      toast.ok('回复已发送');
      setReplyTo(null);
      setText('');
      list.reload();
    } catch (err) {
      toast.error(err.message);
    }
  };
  return (
    <>
      {list.loading ? <Loading rows={3} height={80} /> : (
        <div className="stack gap-12">
          {(list.data?.items || []).length === 0 && <Empty title="暂无农技咨询工单" />}
          {(list.data?.items || []).map((a) => (
            <div key={a.id} className="panel" style={{ padding: 18 }}>
              <div className="row between" style={{ flexWrap: 'wrap', gap: 10 }}>
                <div style={{ flex: 1, minWidth: 260 }}>
                  <div className="row gap-8" style={{ marginBottom: 4 }}>
                    <span style={{ fontSize: 14.5 }}>{a.subject}</span>
                    <StatusTag status={a.status} text={statusText(a.status)} tone={statusTone(a.status)} />
                  </div>
                  <div className="small muted">{a.user_name} · {a.crop || '未关联识别'} · {dateTime(a.created_at)}</div>
                  <p className="small mt-8" style={{ whiteSpace: 'pre-wrap', lineHeight: 1.8 }}>{a.content}</p>
                  {a.reply && <div className="notice mt-8"><div className="small"><strong>已回复：</strong>{a.reply}</div></div>}
                </div>
                {a.status !== 'replied' && <button type="button" className="btn btn--primary btn--sm" onClick={() => { setReplyTo(a); setText(a.reply || ''); }}>回复工单</button>}
              </div>
            </div>
          ))}
        </div>
      )}
      <Modal
        open={Boolean(replyTo)}
        onClose={() => setReplyTo(null)}
        title={`回复工单 · ${replyTo?.subject || ''}`}
        footer={
          <>
            <button type="button" className="btn btn--ghost btn--sm" onClick={() => setReplyTo(null)}>取消</button>
            <button type="button" className="btn btn--primary btn--sm" onClick={reply}>发送回复</button>
          </>
        }
      >
        <div className="notice notice--plain small" style={{ marginBottom: 12 }}>回复会以农技人员身份发送并通知用户，内容将长期保存。</div>
        <textarea className="textarea" value={text} onChange={(e) => setText(e.target.value)} style={{ minHeight: 150 }} maxLength={2000} />
      </Modal>
    </>
  );
}

const emptyKb = { title: '', crop: '番茄', category: '真菌性病害', summary: '', content: '', symptoms: '', conditions: '', sourceName: '', sourceUrl: '', status: 'published' };

function Knowledge() {
  const toast = useToast();
  const list = useAsync(() => get('/admin/knowledge'), []);
  const [form, setForm] = useState(null);
  const [busy, setBusy] = useState(false);

  const save = async () => {
    if (!form.title || form.title.trim().length < 4) return toast.error('标题至少 4 个字');
    if (!form.summary || form.summary.trim().length < 10) return toast.error('摘要至少 10 个字');
    if (!form.content || form.content.trim().length < 50) return toast.error('正文至少 50 个字');
    if (!form.sourceName || form.sourceName.trim().length < 2) return toast.error('必须填写资料来源');
    setBusy(true);
    try {
      const payload = { ...form, sourceUrl: form.sourceUrl || undefined };
      if (form.id) await put(`/admin/knowledge/${form.id}`, payload);
      else await post('/admin/knowledge', payload);
      toast.ok('已保存');
      setForm(null);
      list.reload();
    } catch (err) {
      toast.error(err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <div className="row between" style={{ marginBottom: 12 }}>
        <span className="small muted">发布前必须填写资料来源；保存为「已发布」时自动记录审核人与时间。</span>
        <button type="button" className="btn btn--primary btn--sm" onClick={() => setForm({ ...emptyKb })}>+ 新增文章</button>
      </div>
      {list.loading ? <Loading rows={3} height={60} /> : (
        <Table head={['标题', '作物 / 分类', '来源', '状态', '更新时间', '操作']} empty={(list.data?.items || []).length === 0 ? '暂无文章' : null}>
          {(list.data?.items || []).map((a) => (
            <tr key={a.id}>
              <td><Link to={`/knowledge/${a.slug}`} style={{ fontSize: 13.5 }}>{a.title}</Link></td>
              <td className="small">{a.crop} · {a.category}</td>
              <td className="small" style={{ maxWidth: 200 }}>{a.source_name}</td>
              <td><StatusTag status={a.status} text={a.status === 'published' ? '已发布' : a.status === 'draft' ? '草稿' : '归档'} tone={a.status === 'published' ? 'olive' : 'muted'} /></td>
              <td className="small muted">{date(a.reviewed_at || a.created_at)}</td>
              <td><button type="button" className="btn btn--quiet btn--sm" onClick={() => setForm({ id: a.id, title: a.title, crop: a.crop, category: a.category, summary: a.summary, content: a.content, symptoms: a.symptoms || '', conditions: a.conditions || '', sourceName: a.source_name, sourceUrl: a.source_url || '', status: a.status })}>编辑</button></td>
            </tr>
          ))}
        </Table>
      )}

      <Modal
        open={Boolean(form)}
        onClose={() => setForm(null)}
        title={form?.id ? '编辑文章' : '新增文章'}
        width={720}
        footer={
          <>
            <button type="button" className="btn btn--ghost btn--sm" onClick={() => setForm(null)}>取消</button>
            <button type="button" className="btn btn--primary btn--sm" onClick={save} disabled={busy}>{busy ? <><Spinner /> 保存中</> : '保存'}</button>
          </>
        }
      >
        {form && (
          <div className="form-grid">
            <label className="field span-2"><span className="field__label">标题</span><input className="input" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} /></label>
            <label className="field"><span className="field__label">作物</span><input className="input" value={form.crop} onChange={(e) => setForm({ ...form, crop: e.target.value })} /></label>
            <label className="field"><span className="field__label">分类</span><input className="input" value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })} /></label>
            <label className="field span-2"><span className="field__label">摘要</span><textarea className="textarea" value={form.summary} onChange={(e) => setForm({ ...form, summary: e.target.value })} style={{ minHeight: 70 }} /></label>
            <label className="field span-2"><span className="field__label">典型症状</span><textarea className="textarea" value={form.symptoms} onChange={(e) => setForm({ ...form, symptoms: e.target.value })} style={{ minHeight: 60 }} /></label>
            <label className="field span-2"><span className="field__label">易发条件</span><textarea className="textarea" value={form.conditions} onChange={(e) => setForm({ ...form, conditions: e.target.value })} style={{ minHeight: 60 }} /></label>
            <label className="field span-2"><span className="field__label">正文（支持 ## 标题、- 列表、**加粗**）</span><textarea className="textarea" value={form.content} onChange={(e) => setForm({ ...form, content: e.target.value })} style={{ minHeight: 200 }} /></label>
            <label className="field"><span className="field__label">资料来源<span className="req">*</span></span><input className="input" value={form.sourceName} onChange={(e) => setForm({ ...form, sourceName: e.target.value })} /></label>
            <label className="field"><span className="field__label">来源链接</span><input className="input" value={form.sourceUrl} onChange={(e) => setForm({ ...form, sourceUrl: e.target.value })} /></label>
            <label className="field"><span className="field__label">状态</span>
              <select className="select" value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })}>
                <option value="draft">草稿</option>
                <option value="published">已发布</option>
                <option value="archived">归档</option>
              </select>
            </label>
          </div>
        )}
      </Modal>
    </>
  );
}

function Market() {
  const toast = useToast();
  const sources = useAsync(() => get('/admin/market/sources'), []);
  const pending = useAsync(() => get('/admin/market/prices', { status: 'pending' }), []);
  const [srcForm, setSrcForm] = useState({ name: '', code: '', kind: 'manual', url: '', note: '' });
  const [entry, setEntry] = useState({ sourceId: '', crop: '', variety: '', spec: '', grade: '', province: '山东省', market: '', price: '', unit: '元/公斤', quoteBasis: '中等规格批发价', collectedAt: new Date().toISOString().slice(0, 16).replace('T', ' ') });
  const [csv, setCsv] = useState('');
  const [csvSource, setCsvSource] = useState('');
  const [busy, setBusy] = useState('');

  const addSource = async () => {
    if (!srcForm.name || !srcForm.code) return toast.error('请填写名称与编码');
    setBusy('source');
    try {
      await post('/admin/market/sources', { ...srcForm, url: srcForm.url || undefined, note: srcForm.note || undefined });
      toast.ok('来源已创建');
      setSrcForm({ name: '', code: '', kind: 'manual', url: '', note: '' });
      sources.reload();
    } catch (err) {
      toast.error(err.message);
    } finally {
      setBusy('');
    }
  };

  const addPrice = async () => {
    if (!entry.sourceId) return toast.error('请选择来源');
    if (!entry.crop || !entry.market || !entry.price) return toast.error('请填写作物、市场与价格');
    setBusy('price');
    try {
      await post('/admin/market/prices', {
        ...entry,
        sourceId: Number(entry.sourceId),
        price: Number(entry.price),
        collectedAt: entry.collectedAt.length === 16 ? `${entry.collectedAt}:00` : entry.collectedAt,
      });
      toast.ok('已录入，等待审核');
      setEntry({ ...entry, crop: '', market: '', price: '' });
      pending.reload();
    } catch (err) {
      toast.error(err.message);
    } finally {
      setBusy('');
    }
  };

  const importCsv = async () => {
    if (!csvSource) return toast.error('请选择来源');
    if (csv.trim().length < 10) return toast.error('请粘贴 CSV 内容');
    setBusy('csv');
    try {
      const r = await post('/admin/market/prices/import', { sourceId: Number(csvSource), csv });
      toast.ok(`导入完成：新增 ${r.inserted} 条，重复 ${r.duplicated} 条，格式有误 ${r.invalid} 条`);
      setCsv('');
      pending.reload();
    } catch (err) {
      toast.error(err.message);
    } finally {
      setBusy('');
    }
  };

  const review = async (row, action) => {
    try {
      await post(`/admin/market/prices/${row.id}/review`, { action });
      toast.ok(action === 'approve' ? '已通过，前台可见' : '已驳回');
      pending.reload();
    } catch (err) {
      toast.error(err.message);
    }
  };

  const sync = async (s) => {
    setBusy(`sync${s.id}`);
    try {
      const r = await post('/admin/market/sync', { sourceId: s.id });
      toast.ok(`同步完成，新增 ${r.inserted} 条待审核`);
      pending.reload();
      sources.reload();
    } catch (err) {
      toast.error(err.message);
    } finally {
      setBusy('');
    }
  };

  return (
    <>
      <div className="grid12" style={{ gap: 16 }}>
        <div className="panel" style={{ gridColumn: 'span 6' }}>
          <h3 className="h4" style={{ marginBottom: 10 }}>数据来源</h3>
          <p className="small muted" style={{ marginBottom: 12 }}>人工录入与 API 采集均需审核后才在前台展示。未配置 API 时不会生成任何数据。</p>
          {(sources.data?.items || []).map((s) => (
            <div key={s.id} style={{ padding: '10px 0', borderBottom: '1px solid var(--line-soft)' }}>
              <div className="row between">
                <span style={{ fontSize: 13.5 }}>{s.name}</span>
                <span className="tag tag--muted">{s.kind === 'api' ? 'API' : '人工'}</span>
              </div>
              <div className="small muted">{s.code} {s.url ? `· ${s.url}` : ''}</div>
              <div className="small muted">{s.last_run_at ? `最近：${dateTime(s.last_run_at)} ${s.last_status || ''}` : '尚未采集'}</div>
              {s.kind === 'api' && (
                <button type="button" className="btn btn--quiet btn--sm mt-8" onClick={() => sync(s)} disabled={busy === `sync${s.id}`}>立即采集</button>
              )}
            </div>
          ))}

          <div style={{ marginTop: 16 }}>
            <div className="eyebrow" style={{ marginBottom: 8 }}>新增来源</div>
            <div className="form-grid" style={{ gap: 10 }}>
              <input className="input input--sm" placeholder="名称" value={srcForm.name} onChange={(e) => setSrcForm({ ...srcForm, name: e.target.value })} />
              <input className="input input--sm" placeholder="编码（小写字母）" value={srcForm.code} onChange={(e) => setSrcForm({ ...srcForm, code: e.target.value })} />
              <select className="select select--sm" value={srcForm.kind} onChange={(e) => setSrcForm({ ...srcForm, kind: e.target.value })}>
                <option value="manual">人工录入</option>
                <option value="api">API 采集</option>
              </select>
              <input className="input input--sm" placeholder="来源网址（选填）" value={srcForm.url} onChange={(e) => setSrcForm({ ...srcForm, url: e.target.value })} />
            </div>
            <button type="button" className="btn btn--ghost btn--sm mt-8" onClick={addSource} disabled={busy === 'source'}>创建来源</button>
          </div>
        </div>

        <div className="panel" style={{ gridColumn: 'span 6' }}>
          <h3 className="h4" style={{ marginBottom: 10 }}>录入一条行情</h3>
          <div className="form-grid" style={{ gap: 10 }}>
            <select className="select select--sm" value={entry.sourceId} onChange={(e) => setEntry({ ...entry, sourceId: e.target.value })}>
              <option value="">选择来源</option>
              {(sources.data?.items || []).map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
            <input className="input input--sm" placeholder="作物" value={entry.crop} onChange={(e) => setEntry({ ...entry, crop: e.target.value })} />
            <input className="input input--sm" placeholder="规格" value={entry.spec} onChange={(e) => setEntry({ ...entry, spec: e.target.value })} />
            <input className="input input--sm" placeholder="等级" value={entry.grade} onChange={(e) => setEntry({ ...entry, grade: e.target.value })} />
            <input className="input input--sm" placeholder="省份" value={entry.province} onChange={(e) => setEntry({ ...entry, province: e.target.value })} />
            <input className="input input--sm" placeholder="市场" value={entry.market} onChange={(e) => setEntry({ ...entry, market: e.target.value })} />
            <input className="input input--sm" placeholder="价格" value={entry.price} onChange={(e) => setEntry({ ...entry, price: e.target.value })} />
            <input className="input input--sm" placeholder="单位（元/公斤）" value={entry.unit} onChange={(e) => setEntry({ ...entry, unit: e.target.value })} />
            <input className="input input--sm span-2" placeholder="报价口径" value={entry.quoteBasis} onChange={(e) => setEntry({ ...entry, quoteBasis: e.target.value })} />
            <input className="input input--sm span-2" placeholder="采集时间 YYYY-MM-DD HH:mm:ss" value={entry.collectedAt} onChange={(e) => setEntry({ ...entry, collectedAt: e.target.value })} />
          </div>
          <button type="button" className="btn btn--primary btn--sm mt-12" onClick={addPrice} disabled={busy === 'price'}>录入并提交审核</button>

          <div className="rule" style={{ margin: '18px 0' }} />
          <div className="eyebrow" style={{ marginBottom: 8 }}>CSV 批量导入</div>
          <p className="field__hint" style={{ marginBottom: 8 }}>
            列名：crop, variety, spec, grade, province, market, price, unit, quoteBasis, collectedAt
          </p>
          <select className="select select--sm" value={csvSource} onChange={(e) => setCsvSource(e.target.value)} style={{ marginBottom: 8 }}>
            <option value="">选择来源</option>
            {(sources.data?.items || []).map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
          <textarea className="textarea" value={csv} onChange={(e) => setCsv(e.target.value)} style={{ minHeight: 90, fontSize: 12 }} placeholder={'crop,province,market,price,unit,quoteBasis,collectedAt\n番茄,山东省,寿光农产品物流园,4.20,元/公斤,中等规格批发价,2026-11-05 08:00:00'} />
          <div className="row gap-8 mt-8">
            <button
              type="button"
              className="btn btn--quiet btn--sm"
              onClick={() => setCsv('crop,variety,spec,grade,province,market,price,unit,quoteBasis,collectedAt\n番茄,硬粉,中等果,一级,山东省,寿光农产品物流园,4.20,元/公斤,中等规格批发价,2026-11-05 08:00:00\n')}
            >
              填入示例格式
            </button>
            <button type="button" className="btn btn--ghost btn--sm" onClick={importCsv} disabled={busy === 'csv'}>导入 CSV</button>
          </div>
        </div>
      </div>

      <h3 className="h4" style={{ margin: '24px 0 10px' }}>待审核行情（{pending.data?.items?.length || 0}）</h3>
      {pending.loading ? <Loading rows={2} height={60} /> : (
        <Table head={['作物 / 规格', '市场', '价格', '口径', '采集时间', '来源', '操作']} empty="没有待审核的记录">
          {(pending.data?.items || []).map((p) => (
            <tr key={p.id}>
              <td className="small">{p.crop}<div className="muted">{p.spec || '—'} {p.grade || ''}</div></td>
              <td className="small">{p.market}<div className="muted">{p.province}</div></td>
              <td className="num">{num(p.price, 2)}<div className="small muted">{p.currency}/{p.unit}</div></td>
              <td className="small">{p.quote_basis}</td>
              <td className="small muted">{p.collected_at}</td>
              <td className="small">{p.source_name}</td>
              <td>
                <div className="row gap-8">
                  <button type="button" className="btn btn--primary btn--sm" onClick={() => review(p, 'approve')}>通过</button>
                  <button type="button" className="btn btn--ghost btn--sm" onClick={() => review(p, 'reject')}>驳回</button>
                </div>
              </td>
            </tr>
          ))}
        </Table>
      )}
    </>
  );
}

function Complaints() {
  const toast = useToast();
  const list = useAsync(() => get('/admin/complaints'), []);
  const [handle, setHandle] = useState(null);
  const [text, setText] = useState('');
  const [action, setAction] = useState('resolve');
  const submit = async () => {
    if (text.trim().length < 5) return toast.error('请填写处理结论');
    try {
      await post(`/admin/complaints/${handle.id}/handle`, { action, resolution: text.trim() });
      toast.ok('已处理');
      setHandle(null);
      setText('');
      list.reload();
    } catch (err) {
      toast.error(err.message);
    }
  };
  return (
    <>
      {list.loading ? <Loading rows={3} height={70} /> : (
        <div className="stack gap-12">
          {(list.data?.items || []).length === 0 && <Empty title="暂无投诉" />}
          {(list.data?.items || []).map((c) => (
            <div key={c.id} className="panel" style={{ padding: 18 }}>
              <div className="row between" style={{ flexWrap: 'wrap', gap: 10 }}>
                <div>
                  <div className="row gap-8" style={{ marginBottom: 4 }}>
                    <span style={{ fontSize: 14.5 }}>{c.reason}</span>
                    <StatusTag status={c.status} text={c.status === 'open' ? '待处理' : c.status === 'resolved' ? '已处理' : '已驳回'} tone={c.status === 'open' ? 'wheat' : 'olive'} />
                    <span className="tag tag--muted">{c.target_type}</span>
                  </div>
                  <div className="small muted">{c.user_name} · {dateTime(c.created_at)}</div>
                  {c.detail && <p className="small mt-8">{c.detail}</p>}
                  {c.resolution && <div className="notice notice--plain mt-8"><div className="small">处理结论：{c.resolution}</div></div>}
                </div>
                {c.status === 'open' && <button type="button" className="btn btn--primary btn--sm" onClick={() => setHandle(c)}>处理</button>}
              </div>
            </div>
          ))}
        </div>
      )}
      <Modal
        open={Boolean(handle)}
        onClose={() => setHandle(null)}
        title="处理投诉"
        footer={
          <>
            <button type="button" className="btn btn--ghost btn--sm" onClick={() => setHandle(null)}>取消</button>
            <button type="button" className="btn btn--primary btn--sm" onClick={submit}>提交处理</button>
          </>
        }
      >
        <div className="stack gap-16">
          <label className="field">
            <span className="field__label">处理方式</span>
            <select className="select" value={action} onChange={(e) => setAction(e.target.value)}>
              <option value="resolve">成立并处理</option>
              <option value="reject">不成立，驳回</option>
            </select>
          </label>
          <label className="field">
            <span className="field__label">处理结论<span className="req">*</span></span>
            <textarea className="textarea" value={text} onChange={(e) => setText(e.target.value)} style={{ minHeight: 110 }} />
          </label>
        </div>
      </Modal>
    </>
  );
}

const FREE_GUIDES = {
  email: {
    free: 'QQ 邮箱免费开启 SMTP：smtp.qq.com:465（SSL），用 16 位授权码代替密码，无任何费用。',
    url: 'https://help.mail.qq.com/detail/0/1087',
    label: '开启教程',
    env: 'SMTP_HOST=smtp.qq.com  SMTP_PORT=465  SMTP_SECURE=true  SMTP_USER=你的QQ邮箱  SMTP_PASS=16位授权码',
  },
  recognition: {
    free: 'Kindwise（Plant.id）注册即送 100 credits，1 次识别扣 1 credit，够联调与初期试用；用完后 €0.05/次。',
    url: 'https://admin.kindwise.com/signup',
    label: '免费注册',
    env: 'PLANTID_API_KEY=你的 API Key（Admin 面板 → API keys）',
  },
  payment: {
    free: '在线收款没有免费通道（通道费刚性）。零成本可先用「线下结算」跑通全流程；国内真实收款需营业执照开通支付宝/微信支付。',
    url: 'https://stripe.com/global',
    label: '支持地区',
    env: 'STRIPE_SECRET_KEY / STRIPE_WEBHOOK_SECRET（大陆主体不可直接开户）',
  },
  marketApi: {
    free: '农业农村部行情站未开放 API（直接请求返回 403）。免费合规方案是后台人工录入或 CSV 导入，逐条审核后展示。',
    url: 'https://pfsc.agri.cn/',
    label: '官方行情',
    env: 'MARKET_API_URL / MARKET_API_KEY（仅在你已获得授权接口时填写）',
  },
};

function Integrations() {
  const toast = useToast();
  const info = useAsync(() => get('/admin/integrations'), []);
  const [busy, setBusy] = useState('');
  const test = async (target) => {
    setBusy(target);
    try {
      const r = await post('/admin/integrations/test', { target });
      toast[r.ok === false ? 'error' : 'ok'](`${target} 检查结果：${JSON.stringify(r)}`);
    } catch (err) {
      toast.error(err.message);
    } finally {
      setBusy('');
    }
  };
  const labels = { email: '邮件（SMTP）', recognition: '病虫害识别（Plant.id）', payment: '在线支付（Stripe）', marketApi: '行情接口' };
  return (
    <>
      {info.loading && <Loading rows={3} height={70} />}
      {info.data && (
        <>
          <div className="notice notice--plain" style={{ marginBottom: 16 }}>
            <div className="small">
              配置项均来自服务端环境变量，密钥不会出现在前端。未配置的服务会明确返回「未接入」，不会用固定结果冒充成功。
            </div>
          </div>
          <div className="stack gap-12">
            {Object.entries(info.data.integrations).map(([key, v]) => (
              <div key={key} className="panel" style={{ padding: 16 }}>
                <div className="row between" style={{ flexWrap: 'wrap', gap: 10 }}>
                  <div>
                    <div className="row gap-8" style={{ marginBottom: 4 }}>
                      <span style={{ fontSize: 14.5 }}>{labels[key] || key}</span>
                      <StatusTag status={v.configured ? 'ok' : 'off'} text={v.configured ? '已配置' : '未配置'} tone={v.configured ? 'olive' : 'wheat'} />
                    </div>
                    <div className="small muted">提供方：{v.provider} · 需要变量：{v.required?.join('、')}</div>
                    {FREE_GUIDES[key] && (
                      <div style={{ marginTop: 10, paddingTop: 10, borderTop: '1px solid var(--line-soft)' }}>
                        <div className="small" style={{ lineHeight: 1.8, color: 'var(--ink-soft)' }}>
                          <span className="tag tag--olive" style={{ marginRight: 8 }}>免费方案</span>
                          {FREE_GUIDES[key].free}
                          {FREE_GUIDES[key].url && (
                            <a href={FREE_GUIDES[key].url} target="_blank" rel="noreferrer" style={{ marginLeft: 8, color: 'var(--olive)', whiteSpace: 'nowrap' }}>
                              {FREE_GUIDES[key].label} ↗
                            </a>
                          )}
                        </div>
                        <div className="field__hint" style={{ marginTop: 6, wordBreak: 'break-all' }}>{FREE_GUIDES[key].env}</div>
                      </div>
                    )}
                  </div>
                  {['email', 'recognition', 'payment'].includes(key) && (
                    <button type="button" className="btn btn--ghost btn--sm" onClick={() => test(key)} disabled={busy === key || !v.configured}>
                      {busy === key ? <><Spinner /> 检查中</> : '连通性检查'}
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
          <div className="panel mt-16">
            <h3 className="h4" style={{ marginBottom: 8 }}>识别服务范围</h3>
            <p className="small muted" style={{ lineHeight: 1.9 }}>{info.data.recognition.note}</p>
            <div className="row gap-8 wrap mt-8">
              {(info.data.recognition.supportedCrops || []).map((c) => <span key={c.value} className="tag tag--muted">{c.label}</span>)}
            </div>
          </div>
          <div className="panel mt-16">
            <h3 className="h4" style={{ marginBottom: 8 }}>支付</h3>
            <p className="small muted" style={{ lineHeight: 1.9 }}>{info.data.payment.note}</p>
            <div className="small muted">模式：{info.data.payment.mode} · 币种：{info.data.payment.currency} · Webhook：{info.data.payment.webhookConfigured ? '已配置' : '未配置'}</div>
          </div>
        </>
      )}
    </>
  );
}

function Logs() {
  const list = useAsync(() => get('/admin/audit-logs'), []);
  return list.loading ? <Loading rows={3} height={60} /> : (
    <Table head={['时间', '操作人', '动作', '对象', '详情', 'IP']} empty={(list.data?.items || []).length === 0 ? '暂无操作记录' : null}>
      {(list.data?.items || []).map((l) => (
        <tr key={l.id}>
          <td className="small muted">{dateTime(l.created_at)}</td>
          <td className="small">{l.actor_name || '系统'}</td>
          <td className="small">{l.action}</td>
          <td className="small muted">{l.target_type} {l.target_id}</td>
          <td className="small" style={{ maxWidth: 280, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{l.detail}</td>
          <td className="small muted">{l.ip}</td>
        </tr>
      ))}
    </Table>
  );
}

function Reports() {
  const r = useAsync(() => get('/admin/reports'), []);
  if (r.loading) return <Loading rows={3} height={80} />;
  return (
    <div className="grid12" style={{ gap: 16 }}>
      <div className="panel" style={{ gridColumn: 'span 6' }}>
        <h3 className="h4" style={{ marginBottom: 10 }}>品类成交</h3>
        {(r.data?.byCategory || []).map((c) => (
          <div key={c.category} className="row between small" style={{ padding: '7px 0', borderBottom: '1px solid var(--line-soft)' }}>
            <span>{c.category}</span><span className="muted">{c.products} 个商品 · {c.sold} 件</span><span className="tabular">{money(c.amount)}</span>
          </div>
        ))}
      </div>
      <div className="panel" style={{ gridColumn: 'span 6' }}>
        <h3 className="h4" style={{ marginBottom: 10 }}>地区供需</h3>
        {(r.data?.byRegion || []).map((x) => (
          <div key={x.province} className="row between small" style={{ padding: '7px 0', borderBottom: '1px solid var(--line-soft)' }}>
            <span>{x.province}</span><span className="muted">供 {x.supply} / 采 {x.demand}</span><span className="tabular">{x.posts}</span>
          </div>
        ))}
      </div>
      <div className="panel" style={{ gridColumn: 'span 6' }}>
        <h3 className="h4" style={{ marginBottom: 10 }}>预约状态分布</h3>
        {(r.data?.bookingByStatus || []).map((b) => (
          <div key={b.status} className="row between small" style={{ padding: '7px 0', borderBottom: '1px solid var(--line-soft)' }}>
            <span>{statusText(b.status)}</span><span className="tabular">{b.total}</span>
          </div>
        ))}
      </div>
      <div className="panel" style={{ gridColumn: 'span 6' }}>
        <h3 className="h4" style={{ marginBottom: 10 }}>识别任务</h3>
        {(r.data?.diagnosisByCrop || []).map((d) => (
          <div key={d.crop} className="row between small" style={{ padding: '7px 0', borderBottom: '1px solid var(--line-soft)' }}>
            <span>{d.crop}</span><span className="muted">完成 {d.completed}</span><span className="tabular">{d.total}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

export default function Admin() {
  useTitle('管理后台');
  const { user, booting } = useAuth();
  const [params, setParams] = useSearchParams();
  const tab = params.get('tab') || 'overview';

  useEffect(() => {
    if (booting) return;
    if (!user) window.location.replace('/login?redirect=/admin');
    else if (user.role !== 'admin') window.location.replace('/');
  }, [user, booting]);

  if (booting || !user || user.role !== 'admin') return <div className="container" style={{ padding: '60px 32px' }}><Loading rows={3} /></div>;

  const setTab = (v) => {
    const next = new URLSearchParams(params);
    if (v === 'overview') next.delete('tab'); else next.set('tab', v);
    setParams(next);
  };

  const current = TABS.find(([v]) => v === tab);

  return (
    <>
      <PageHead
        items={[{ label: '首页', to: '/' }, { label: '管理后台' }]}
        title="管理后台"
        desc="所有管理操作写入数据库并记录操作人、时间与内容，直接影响前台状态。"
        actions={<Link to="/" className="btn btn--ghost btn--sm">返回前台</Link>}
      />
      <div className="container">
        <div className="workbench">
          <aside className="wb-side">
            <div className="wb-side__head">
              <div className="wb-side__title">平台运营</div>
              <div className="wb-side__sub">{user.name} · 管理员</div>
            </div>
            <nav className="wb-nav" aria-label="管理后台导航">
              {TABS.map(([v, label]) => (
                <button key={v} type="button" aria-current={tab === v} onClick={() => setTab(v)}>{label}</button>
              ))}
            </nav>
          </aside>
          <div className="wb-body">
            <div className="wb-head"><div><h2>{current?.[1]}</h2></div></div>
            {tab === 'overview' && <Overview />}
            {tab === 'users' && <Users />}
            {tab === 'merchants' && <Merchants />}
            {tab === 'posts' && <Posts />}
            {tab === 'products' && <Products />}
            {tab === 'machinery' && <Machinery />}
            {tab === 'orders' && <Orders />}
            {tab === 'refunds' && <Refunds />}
            {tab === 'advisories' && <Advisories />}
            {tab === 'knowledge' && <Knowledge />}
            {tab === 'market' && <Market />}
            {tab === 'complaints' && <Complaints />}
            {tab === 'integrations' && <Integrations />}
            {tab === 'logs' && <Logs />}
            {tab === 'reports' && <Reports />}
          </div>
        </div>
      </div>
    </>
  );
}
