import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { get, post } from '../lib/api.js';
import { useAsync, useTitle } from '../lib/hooks.js';
import { useAuth } from '../lib/auth.jsx';
import { useToast } from '../lib/toast.jsx';
import PageHead from '../components/PageHead.jsx';
import { ErrorState, Loading, Modal, StatusTag, Avatar, Spinner, Empty } from '../components/ui.jsx';
import { date, dateTime, money, num, relative, statusText, statusTone, UNITS } from '../lib/format.js';
import { categoryImage } from '../lib/images.js';

export default function TradeDetail() {
  const { id } = useParams();
  const { user } = useAuth();
  const navigate = useNavigate();
  const toast = useToast();
  const { data, loading, error, reload } = useAsync(() => get(`/posts/${id}`), [id]);
  const [active, setActive] = useState(0);
  const [askOpen, setAskOpen] = useState(false);
  const [kind, setKind] = useState('inquiry');
  const [price, setPrice] = useState('');
  const [quantity, setQuantity] = useState('');
  const [message, setMessage] = useState('');
  const [sending, setSending] = useState(false);
  const [favorited, setFavorited] = useState(false);
  const [reportOpen, setReportOpen] = useState(false);
  const [reportReason, setReportReason] = useState('');
  const p = data?.post;
  useTitle(p?.title);

  useEffect(() => {
    if (data?.post) setFavorited(Boolean(data.post.favorited));
  }, [data?.post?.id, data?.post?.favorited]);

  const openAsk = () => {
    if (!user) return navigate(`/login?redirect=/trade/${id}`);
    setKind(p.type === 'demand' ? 'quote' : 'inquiry');
    setAskOpen(true);
  };

  const submitAsk = async () => {
    if (message.trim().length < 5) return toast.error('请说明你的需求或报价条件');
    if (kind === 'quote' && !Number(price)) return toast.error('报价请填写单价');
    setSending(true);
    try {
      const r = await post(`/posts/${id}/inquiries`, {
        kind,
        price: price ? Number(price) : undefined,
        quantity: quantity ? Number(quantity) : undefined,
        unit: p.unit,
        message: message.trim(),
      });
      toast.ok('已发送，正在打开会话');
      setAskOpen(false);
      navigate(`/messages?conversation=${r.conversationId}`);
    } catch (err) {
      toast.error(err.message || '提交失败');
    } finally {
      setSending(false);
    }
  };

  const toggleFav = async () => {
    if (!user) return toast.error('登录后可以收藏');
    try {
      const r = await post('/users/me/favorites', { targetType: 'post', targetId: Number(id) });
      setFavorited(r.favorited);
      toast.ok(r.favorited ? '已收藏' : '已取消收藏');
    } catch (err) {
      toast.error(err.message);
    }
  };

  const respond = async (inquiryId, action) => {
    try {
      await post(`/posts/inquiries/${inquiryId}/respond`, { action });
      toast.ok(action === 'accept' ? '已接受，建议继续在消息中确认交付细节' : action === 'decline' ? '已婉拒' : '已关闭');
      reload();
    } catch (err) {
      toast.error(err.message || '操作失败');
    }
  };

  const closePost = async () => {
    try {
      await post(`/posts/${id}/close`);
      toast.ok('信息已关闭');
      reload();
    } catch (err) {
      toast.error(err.message);
    }
  };

  const report = async () => {
    if (reportReason.trim().length < 5) return toast.error('请填写至少 5 个字的问题描述');
    try {
      await post('/complaints', { targetType: 'post', targetId: Number(id), reason: reportReason.trim() });
      toast.ok('已提交，平台会核实处理');
      setReportOpen(false);
      setReportReason('');
    } catch (err) {
      toast.error(err.message || '提交失败');
    }
  };

  if (loading) return <div className="container" style={{ padding: '60px 32px' }}><Loading rows={4} height={100} /></div>;
  if (error) return <div className="container" style={{ padding: '60px 32px' }}><ErrorState error={error} onRetry={reload} /></div>;
  if (!p) return null;

  const images = p.imageUrls?.length ? p.imageUrls : p.coverUrl ? [p.coverUrl] : [];
  const isOwner = p.isOwner || p.owner?.id === user?.id;
  const expired = new Date(`${p.validUntil}T23:59:59`) < new Date();

  return (
    <>
      <PageHead
        items={[{ label: '首页', to: '/' }, { label: p.type === 'supply' ? '供应大厅' : '采购大厅', to: `/${p.type}` }, { label: p.title }]}
        title={p.title}
        desc={`${p.category}${p.variety ? ` · ${p.variety}` : ''}${p.spec ? ` · ${p.spec}` : ''} · ${p.province}${p.city}`}
        actions={
          <>
            <StatusTag status={p.status} text={statusText(p.status)} tone={statusTone(p.status)} />
            {isOwner && <span className="tag tag--olive">我发布的信息</span>}
          </>
        }
      />

      <section className="section" style={{ paddingTop: 24 }}>
        <div className="container">
          <div className="detail-grid">
            <div>
              {images.length > 0 ? (
                <>
                  <figure className="detail-figure" style={{ marginTop: 0 }}>
                    <img src={images[active]} alt={`${p.title} 图片 ${active + 1}`} />
                  </figure>
                  {images.length > 1 && (
                    <div className="thumb-row" style={{ marginBottom: 24 }}>
                      {images.map((src, i) => (
                        <button
                          key={src}
                          type="button"
                          className="thumb"
                          onClick={() => setActive(i)}
                          style={{ borderColor: i === active ? 'var(--olive)' : 'var(--line)', borderWidth: i === active ? 2 : 1, padding: 0, background: 'none' }}
                          aria-label={`查看第 ${i + 1} 张图片`}
                        >
                          <img src={src} alt="" />
                        </button>
                      ))}
                    </div>
                  )}
                </>
              ) : (
                <figure className="detail-figure" style={{ marginTop: 0, position: 'relative' }}>
                  <img src={categoryImage(p.category)} alt={`${p.category}品类示意图`} style={{ aspectRatio: '16/9', objectFit: 'cover' }} />
                  <span className="img-note">品类示意图 · 发布者未上传实拍图</span>
                </figure>
              )}

              <div className="spec-board">
                <div>
                  <div className="spec-board__label">数量</div>
                  <div className="spec-board__value">{num(p.quantity, 2)} <small>{p.unit}</small></div>
                </div>
                <div>
                  <div className="spec-board__label">{p.type === 'supply' ? '供应价格' : '目标价格'}</div>
                  <div className="spec-board__value">
                    {p.priceType === 'negotiable' ? '面议' : <>{money(p.price)}<small>/{p.unit}</small></>}
                  </div>
                </div>
                <div>
                  <div className="spec-board__label">有效期至</div>
                  <div className="spec-board__value" style={{ fontSize: 17 }}>{date(p.validUntil)}</div>
                </div>
              </div>

              <div className="mt-24">
                <div className="eyebrow" style={{ marginBottom: 10 }}>详细说明</div>
                <p className="prose" style={{ whiteSpace: 'pre-wrap' }}>{p.description || '发布者未补充说明。可在站内消息中就包装、运输与结算方式进一步沟通。'}</p>
              </div>

              <div className="mt-32">
                <div className="eyebrow" style={{ marginBottom: 10 }}>交易提示</div>
                <div className="notice notice--plain">
                  <div className="small" style={{ lineHeight: 1.95 }}>
                    · 平台不代收货款，建议先小批量验货，再签长期订单；<br />
                    · 线下交易请签订书面合同，明确规格、数量、交付时间与验收标准；<br />
                    · 遇到虚假信息或违规行为，可点击右侧「举报」提交给平台处理。
                  </div>
                </div>
              </div>

              {isOwner && (
                <div className="mt-32">
                  <div className="row between" style={{ marginBottom: 12 }}>
                    <h3 className="h4">收到的询价与报价</h3>
                    <span className="small muted">{data.inquiries?.length || 0} 条</span>
                  </div>
                  {!data.inquiries?.length && <Empty title="还没有收到询价" desc="信息越具体，越容易收到有效报价。" />}
                  <div className="stack gap-12">
                    {(data.inquiries || []).map((q) => (
                      <div key={q.id} className="panel" style={{ padding: 18 }}>
                        <div className="row between" style={{ marginBottom: 8 }}>
                          <div className="row gap-8">
                            <Avatar name={q.from_name} />
                            <div>
                              <div style={{ fontSize: 14 }}>{q.from_name}</div>
                              <div className="small muted">{dateTime(q.created_at)} · {q.kind === 'quote' ? '报价' : '询价'}</div>
                            </div>
                          </div>
                          <StatusTag status={q.status} text={statusText(q.status)} tone={statusTone(q.status)} />
                        </div>
                        <p className="small" style={{ whiteSpace: 'pre-wrap', lineHeight: 1.8 }}>{q.message}</p>
                        {(q.price || q.quantity) && (
                          <div className="small muted mt-8">
                            {q.price ? `报价 ¥${num(q.price, 2)}/${q.unit || p.unit}` : ''}
                            {q.quantity ? ` · 数量 ${num(q.quantity, 2)}${q.unit || p.unit}` : ''}
                          </div>
                        )}
                        {q.status === 'pending' && (
                          <div className="row gap-8 mt-16">
                            <button type="button" className="btn btn--primary btn--sm" onClick={() => respond(q.id, 'accept')}>接受并继续沟通</button>
                            <button type="button" className="btn btn--ghost btn--sm" onClick={() => respond(q.id, 'decline')}>婉拒</button>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            <aside>
              <div className="side-sticky">
                <div className="side-card">
                  <div className="side-price">
                    {p.priceType === 'negotiable' ? '价格面议' : <>{money(p.price)}<small> /{p.unit}</small></>}
                  </div>
                  <div className="small muted" style={{ marginTop: 8 }}>
                    {expired ? '已超过有效期，信息可能仍可协商' : `有效期至 ${date(p.validUntil)}`}
                  </div>

                  <div className="owner-line" style={{ marginTop: 16 }}>
                    <Avatar name={p.owner?.shopName || p.owner?.name} />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div className="owner-line__name">{p.owner?.shopName || p.owner?.name}</div>
                      <div className="owner-line__sub">{p.owner?.role === 'merchant' ? '认证商家' : '个人用户'} · {p.province}{p.city}</div>
                    </div>
                  </div>

                  {!isOwner ? (
                    <>
                      <button type="button" className="btn btn--primary btn--block mt-16" onClick={openAsk}>
                        {p.type === 'supply' ? '发起询价' : '提交报价'}
                      </button>
                      <Link to={data.conversationId ? `/messages?conversation=${data.conversationId}` : '/messages'} className="btn btn--ghost btn--block mt-8">站内消息沟通</Link>
                      <div className="row gap-8 mt-8">
                        <button type="button" className="btn btn--quiet btn--sm" style={{ flex: 1 }} onClick={toggleFav}>{favorited ? '已收藏' : '收藏'}</button>
                        <button type="button" className="btn btn--quiet btn--sm" style={{ flex: 1 }} onClick={() => setReportOpen(true)}>举报</button>
                      </div>
                    </>
                  ) : (
                    <>
                      <Link to={`/trade/publish?id=${p.id}`} className="btn btn--primary btn--block mt-16">编辑信息</Link>
                      {p.status === 'active' && (
                        <button type="button" className="btn btn--ghost btn--block mt-8" onClick={closePost}>关闭信息</button>
                      )}
                    </>
                  )}

                  <div className="info-list mt-16" style={{ borderTop: '1px solid var(--line-soft)', paddingTop: 14 }}>
                    <div className="info-list__row"><dt>信息类型</dt><dd>{p.type === 'supply' ? '供应' : '采购'}</dd></div>
                    <div className="info-list__row"><dt>品类</dt><dd>{p.category}</dd></div>
                    <div className="info-list__row"><dt>浏览</dt><dd>{p.viewCount} 次</dd></div>
                    <div className="info-list__row"><dt>发布</dt><dd>{relative(p.createdAt)}</dd></div>
                  </div>
                </div>

                <div className="notice notice--plain" style={{ marginTop: 16 }}>
                  <div className="small">
                    平台不对交易结果提供担保。请在确认样品与交付条件后再支付定金。
                  </div>
                </div>
              </div>
            </aside>
          </div>
        </div>
      </section>

      <Modal
        open={askOpen}
        onClose={() => setAskOpen(false)}
        title={p.type === 'supply' ? '发起询价' : '提交报价'}
        footer={
          <>
            <button type="button" className="btn btn--ghost btn--sm" onClick={() => setAskOpen(false)}>取消</button>
            <button type="button" className="btn btn--primary btn--sm" onClick={submitAsk} disabled={sending}>
              {sending ? <><Spinner /> 发送中</> : '发送并打开会话'}
            </button>
          </>
        }
      >
        <div className="stack gap-16">
          <div className="notice notice--plain">
            <div className="small">这条消息会同时写入站内会话，对方会收到实时提醒。请说明可接受的价格、数量与交付时间。</div>
          </div>
          {p.type === 'demand' && (
            <label className="field">
              <span className="field__label">报价单价（元/{p.unit}）<span className="req">*</span></span>
              <input className="input" type="number" min="0" step="0.01" value={price} onChange={(e) => setPrice(e.target.value)} />
            </label>
          )}
          <label className="field">
            <span className="field__label">意向数量（{p.unit}）</span>
            <input className="input" type="number" min="0" step="0.01" value={quantity} onChange={(e) => setQuantity(e.target.value)} />
          </label>
          <label className="field">
            <span className="field__label">说明<span className="req">*</span></span>
            <textarea
              className="textarea"
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              placeholder={p.type === 'supply' ? '例如：需要 5 吨，希望 3 天内发货，可否提供农残检测报告？' : '例如：可供 200 吨，规格符合要求，可提供质检报告，价格可小议。'}
            />
          </label>
        </div>
      </Modal>

      <Modal
        open={reportOpen}
        onClose={() => setReportOpen(false)}
        title="举报这条信息"
        footer={
          <>
            <button type="button" className="btn btn--ghost btn--sm" onClick={() => setReportOpen(false)}>取消</button>
            <button type="button" className="btn btn--primary btn--sm" onClick={report}>提交举报</button>
          </>
        }
      >
        <label className="field">
          <span className="field__label">问题描述<span className="req">*</span></span>
          <textarea className="textarea" value={reportReason} onChange={(e) => setReportReason(e.target.value)} placeholder="请说明具体问题，例如价格与实际不符、要求站外付款、疑似虚假信息等。" />
        </label>
      </Modal>
    </>
  );
}
