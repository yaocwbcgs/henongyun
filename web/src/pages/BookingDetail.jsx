import { useCallback, useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { get, post } from '../lib/api.js';
import { useAsync, useTitle } from '../lib/hooks.js';
import { useToast } from '../lib/toast.jsx';
import { useRealtimeEvent } from '../lib/realtime.jsx';
import PageHead from '../components/PageHead.jsx';
import { ErrorState, Loading, Modal, Spinner, Stars, StatusTag } from '../components/ui.jsx';
import { date, dateTime, num, statusText, statusTone } from '../lib/format.js';

const FLOW = ['pending', 'confirmed', 'in_progress', 'completed'];
const LABEL = { pending: '提交预约', confirmed: '机手确认', in_progress: '作业开始', completed: '作业完成' };

export default function BookingDetail() {
  const { id } = useParams();
  const toast = useToast();
  const { data, loading, error, reload } = useAsync(() => get(`/bookings/${id}`), [id]);
  const [busy, setBusy] = useState('');
  const [rescheduleOpen, setRescheduleOpen] = useState(false);
  const [reviewOpen, setReviewOpen] = useState(false);
  const [newDate, setNewDate] = useState('');
  const [newStart, setNewStart] = useState(8);
  const [newEnd, setNewEnd] = useState(12);
  const [rating, setRating] = useState(5);
  const [reviewText, setReviewText] = useState('');
  const b = data?.booking;
  useTitle(b ? `预约 ${b.order_no}` : '预约详情');

  useRealtimeEvent('booking', useCallback((p) => {
    if (p?.id === Number(id)) reload();
  }, [id, reload]));

  useEffect(() => {
    if (b) {
      setNewDate(b.date);
      setNewStart(b.start_hour);
      setNewEnd(b.end_hour);
    }
  }, [b?.id]);

  const act = async (action, payload) => {
    setBusy(action);
    try {
      await post(`/machinery/bookings/${id}/${action}`, payload);
      const map = { confirm: '已确认预约', reject: '已拒绝预约', start: '已标记为作业中', complete: '已标记完成', cancel: '已取消', reschedule: '改期申请已提交，等待对方确认' };
      toast.ok(map[action] || '操作成功');
      setRescheduleOpen(false);
      reload();
    } catch (err) {
      toast.error(err.message || '操作失败');
    } finally {
      setBusy('');
    }
  };

  const submitReview = async () => {
    setBusy('review');
    try {
      await post(`/machinery/bookings/${id}/review`, { rating, content: reviewText.trim() || undefined });
      toast.ok('评价已提交');
      setReviewOpen(false);
      reload();
    } catch (err) {
      toast.error(err.message || '提交失败');
    } finally {
      setBusy('');
    }
  };

  if (loading) return <div className="container" style={{ padding: '60px 32px' }}><Loading rows={3} /></div>;
  if (error) return <div className="container" style={{ padding: '60px 32px' }}><ErrorState error={error} onRetry={reload} /></div>;
  if (!b) return null;

  const isMerchant = data.role === 'merchant';
  const isBuyer = data.role === 'buyer';
  const flowIndex = FLOW.indexOf(b.status);
  const terminated = ['rejected', 'cancelled'].includes(b.status);

  return (
    <>
      <PageHead
        items={[{ label: '首页', to: '/' }, { label: '我的预约', to: '/bookings' }, { label: b.order_no }]}
        title={`预约 ${b.order_no}`}
        desc={`${b.machinery_name} · ${date(b.date)} ${String(b.start_hour).padStart(2, '0')}:00 - ${String(b.end_hour).padStart(2, '0')}:00`}
        actions={<StatusTag status={b.status} text={statusText(b.status)} tone={statusTone(b.status)} />}
      />

      <section className="section" style={{ paddingTop: 26 }}>
        <div className="container">
          <div className="checkout-grid">
            <div>
              {!terminated ? (
                <div className="steps">
                  {FLOW.map((s, i) => (
                    <div key={s} className={`step ${i < flowIndex ? 'is-done' : ''} ${i === flowIndex ? 'is-current' : ''}`}>{LABEL[s]}</div>
                  ))}
                </div>
              ) : (
                <div className="notice notice--danger" style={{ marginBottom: 20 }}>
                  <div>
                    <div className="notice__title">预约{statusText(b.status)}</div>
                    {b.cancel_reason && <div className="small">原因：{b.cancel_reason}</div>}
                  </div>
                </div>
              )}

              <div className="panel panel--white" style={{ padding: 26 }}>
                <h3 className="h4" style={{ marginBottom: 14 }}>作业信息</h3>
                <div className="info-list">
                  <div className="info-list__row"><dt>设备</dt><dd>{b.machinery_name}（{b.machinery_type}）</dd></div>
                  <div className="info-list__row"><dt>作业日期</dt><dd>{date(b.date)}</dd></div>
                  <div className="info-list__row"><dt>作业时段</dt><dd>{String(b.start_hour).padStart(2, '0')}:00 - {String(b.end_hour).padStart(2, '0')}:00</dd></div>
                  {b.area && <div className="info-list__row"><dt>作业面积</dt><dd>{b.area} 亩</dd></div>}
                  <div className="info-list__row"><dt>作业位置</dt><dd>{b.location}</dd></div>
                  <div className="info-list__row"><dt>联系人</dt><dd>{b.contact_name} · {b.contact_phone}</dd></div>
                  {b.note && <div className="info-list__row"><dt>补充说明</dt><dd style={{ maxWidth: 320, textAlign: 'right' }}>{b.note}</dd></div>}
                  <div className="info-list__row"><dt>提交时间</dt><dd>{dateTime(b.created_at)}</dd></div>
                </div>
              </div>

              {data.review && (
                <div className="panel mt-16">
                  <div className="row between">
                    <span className="h4">我的评价</span>
                    <Stars value={data.review.rating} readOnly />
                  </div>
                  <p className="small mt-8">{data.review.content || '未填写文字评价'}</p>
                </div>
              )}
            </div>

            <aside>
              <div className="side-sticky">
                <div className="side-card">
                  <div className="eyebrow eyebrow--olive">费用</div>
                  <div style={{ fontFamily: 'var(--font-serif)', fontSize: 30, marginTop: 6 }}>¥{num(b.fee, 2)}</div>
                  <div className="field__hint mt-8">按 {b.pricing_type === 'per_mu' ? '亩' : b.pricing_type === 'per_hour' ? '小时' : '天'}计价，作业完成后按实际核算。</div>

                  <div className="rule" style={{ margin: '16px 0' }} />
                  <div className="info-list">
                    <div className="info-list__row"><dt>机手 / 商家</dt><dd>{b.shop_name || b.merchant_name}</dd></div>
                    <div className="info-list__row"><dt>下单用户</dt><dd>{b.user_name}</dd></div>
                  </div>

                  <div className="stack gap-8 mt-16">
                    {isBuyer && ['pending', 'confirmed'].includes(b.status) && (
                      <>
                        <button type="button" className="btn btn--ghost btn--block" onClick={() => setRescheduleOpen(true)}>申请改期</button>
                        <button type="button" className="btn btn--danger btn--block" onClick={() => act('cancel', { reason: '用户取消' })} disabled={busy === 'cancel'}>
                          {busy === 'cancel' ? <><Spinner /> 处理中</> : '取消预约'}
                        </button>
                      </>
                    )}
                    {isBuyer && b.status === 'completed' && !data.review && (
                      <button type="button" className="btn btn--primary btn--block" onClick={() => setReviewOpen(true)}>评价本次作业</button>
                    )}
                    {isMerchant && b.status === 'pending' && (
                      <>
                        <button type="button" className="btn btn--primary btn--block" onClick={() => act('confirm')} disabled={busy === 'confirm'}>{busy === 'confirm' ? '处理中…' : '确认预约'}</button>
                        <button type="button" className="btn btn--ghost btn--block" onClick={() => act('reject')} disabled={busy === 'reject'}>拒绝预约</button>
                      </>
                    )}
                    {isMerchant && b.status === 'confirmed' && (
                      <>
                        <button type="button" className="btn btn--primary btn--block" onClick={() => act('start')}>开始作业</button>
                        <button type="button" className="btn btn--ghost btn--block" onClick={() => setRescheduleOpen(true)}>与用户改期</button>
                      </>
                    )}
                    {isMerchant && b.status === 'in_progress' && (
                      <button type="button" className="btn btn--primary btn--block" onClick={() => act('complete')}>标记作业完成</button>
                    )}
                    <Link to={`/messages`} className="btn btn--quiet btn--block">站内消息沟通</Link>
                  </div>
                </div>

                <div className="notice notice--plain" style={{ marginTop: 16 }}>
                  <div className="small">状态变更会实时通知对方。取消或拒绝后，占用的时段会自动释放，其他用户可以预约。</div>
                </div>
              </div>
            </aside>
          </div>
        </div>
      </section>

      <Modal
        open={rescheduleOpen}
        onClose={() => setRescheduleOpen(false)}
        title="申请改期"
        footer={
          <>
            <button type="button" className="btn btn--ghost btn--sm" onClick={() => setRescheduleOpen(false)}>取消</button>
            <button type="button" className="btn btn--primary btn--sm" onClick={() => act('reschedule', { date: newDate, startHour: Number(newStart), endHour: Number(newEnd) })} disabled={busy === 'reschedule'}>
              {busy === 'reschedule' ? <><Spinner /> 提交中</> : '提交改期'}
            </button>
          </>
        }
      >
        <div className="stack gap-16">
          <div className="notice notice--plain small">改期后预约会回到「待确认」状态，由机手重新确认；原时段将被释放。</div>
          <label className="field">
            <span className="field__label">新的作业日期</span>
            <input className="input" type="date" value={newDate} min={new Date().toISOString().slice(0, 10)} onChange={(e) => setNewDate(e.target.value)} />
          </label>
          <div className="form-grid">
            <label className="field">
              <span className="field__label">开始小时</span>
              <select className="select" value={newStart} onChange={(e) => setNewStart(e.target.value)}>
                {Array.from({ length: 14 }).map((_, i) => <option key={i} value={i + 6}>{String(i + 6).padStart(2, '0')}:00</option>)}
              </select>
            </label>
            <label className="field">
              <span className="field__label">结束小时</span>
              <select className="select" value={newEnd} onChange={(e) => setNewEnd(e.target.value)}>
                {Array.from({ length: 14 }).map((_, i) => <option key={i} value={i + 6}>{String(i + 6).padStart(2, '0')}:00</option>)}
              </select>
            </label>
          </div>
        </div>
      </Modal>

      <Modal
        open={reviewOpen}
        onClose={() => setReviewOpen(false)}
        title="评价本次作业"
        footer={
          <>
            <button type="button" className="btn btn--ghost btn--sm" onClick={() => setReviewOpen(false)}>取消</button>
            <button type="button" className="btn btn--primary btn--sm" onClick={submitReview} disabled={busy === 'review'}>提交评价</button>
          </>
        }
      >
        <div className="stack gap-16">
          <div>
            <span className="field__label">评分</span>
            <div className="mt-8"><Stars value={rating} onChange={setRating} /></div>
          </div>
          <label className="field">
            <span className="field__label">评价内容</span>
            <textarea className="textarea" value={reviewText} onChange={(e) => setReviewText(e.target.value)} maxLength={500} placeholder="作业质量、时效、沟通情况等。" />
          </label>
        </div>
      </Modal>
    </>
  );
}
