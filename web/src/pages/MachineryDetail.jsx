import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { get } from '../lib/api.js';
import { useAsync, useTitle } from '../lib/hooks.js';
import { useAuth } from '../lib/auth.jsx';
import { useToast } from '../lib/toast.jsx';
import PageHead from '../components/PageHead.jsx';
import { ErrorState, Loading, Stars, Empty, Avatar } from '../components/ui.jsx';
import { PRICING_LABEL, dateTime, num } from '../lib/format.js';

const days = Array.from({ length: 14 }).map((_, i) => {
  const d = new Date(Date.now() + i * 86400000);
  return {
    value: d.toISOString().slice(0, 10),
    day: d.getDate(),
    month: d.getMonth() + 1,
    week: ['日', '一', '二', '三', '四', '五', '六'][d.getDay()],
  };
});

export default function MachineryDetail() {
  const { id } = useParams();
  const { user } = useAuth();
  const navigate = useNavigate();
  const toast = useToast();
  const { data, loading, error, reload } = useAsync(() => get(`/machinery/${id}`), [id]);
  const [active, setActive] = useState(0);
  const [date, setDate] = useState(days[0].value);
  const [slots, setSlots] = useState(null);
  const [slotLoading, setSlotLoading] = useState(false);
  const [start, setStart] = useState(null);
  const [end, setEnd] = useState(null);
  const [area, setArea] = useState('');
  const m = data?.machinery;
  useTitle(m?.name);

  useEffect(() => {
    let alive = true;
    setSlotLoading(true);
    setStart(null);
    setEnd(null);
    get(`/machinery/${id}/availability`, { date })
      .then((r) => alive && setSlots(r.slots))
      .catch(() => alive && setSlots([]))
      .finally(() => alive && setSlotLoading(false));
    return () => {
      alive = false;
    };
  }, [id, date]);

  const fee = useMemo(() => {
    if (!m || start == null || end == null) return null;
    const hours = end - start;
    if (m.pricingType === 'per_mu') return area ? Math.round(Number(area) * m.price * 100) / 100 : null;
    if (m.pricingType === 'per_hour') return Math.round(hours * m.price * 100) / 100;
    return m.price;
  }, [m, start, end, area]);

  const clickSlot = (h, status) => {
    if (status !== 'open') return;
    if (start == null || (start != null && end != null)) {
      setStart(h);
      setEnd(h + 1);
      return;
    }
    if (h < start) {
      setStart(h);
      setEnd(h + 1);
      return;
    }
    if (h === start) {
      setStart(h);
      setEnd(h + 1);
      return;
    }
    setEnd(h + 1);
  };

  const goConfirm = () => {
    if (!user) return navigate(`/login?redirect=${encodeURIComponent(`/machinery/${id}`)}`);
    if (start == null || end == null) return toast.error('请先选择作业时段');
    if (m.pricingType === 'per_mu' && (!area || Number(area) <= 0)) return toast.error('按亩计价需要填写作业面积');
    navigate(`/bookings/confirm?machineryId=${id}&date=${date}&start=${start}&end=${end}${area ? `&area=${area}` : ''}`);
  };

  if (loading) return <div className="container" style={{ padding: '60px 32px' }}><Loading rows={4} height={100} /></div>;
  if (error) return <div className="container" style={{ padding: '60px 32px' }}><ErrorState error={error} onRetry={reload} /></div>;
  if (!m) return null;

  const images = m.imageUrls?.length ? m.imageUrls : m.coverUrl ? [m.coverUrl] : [];

  return (
    <>
      <PageHead
        items={[{ label: '首页', to: '/' }, { label: '农机服务', to: '/machinery' }, { label: m.name }]}
        title={m.name}
        desc={`${m.type}${m.brand ? ` · ${m.brand}` : ''}${m.model ? ` ${m.model}` : ''}${m.power ? ` · ${m.power}` : ''}`}
        actions={<Link to="/machinery" className="btn btn--ghost btn--sm">返回列表</Link>}
      />

      <section className="section" style={{ paddingTop: 24 }}>
        <div className="container">
          <div className="detail-grid">
            <div>
              <figure className="detail-figure" style={{ marginTop: 0 }}>
                {images.length ? <img src={images[active]} alt={`${m.name} 图片 ${active + 1}`} /> : <div style={{ height: 300, display: 'grid', placeItems: 'center', color: 'var(--muted)' }}>暂无设备图片</div>}
              </figure>
              {images.length > 1 && (
                <div className="thumb-row" style={{ marginBottom: 24 }}>
                  {images.map((src, i) => (
                    <button key={src} type="button" className="thumb" onClick={() => setActive(i)} style={{ borderColor: i === active ? 'var(--olive)' : 'var(--line)', padding: 0, background: 'none' }} aria-label={`第 ${i + 1} 张`}>
                      <img src={src} alt="" />
                    </button>
                  ))}
                </div>
              )}

              <div className="spec-board">
                <div>
                  <div className="spec-board__label">计价方式</div>
                  <div className="spec-board__value" style={{ fontSize: 18 }}>{PRICING_LABEL[m.pricingType]}</div>
                </div>
                <div>
                  <div className="spec-board__label">单价</div>
                  <div className="spec-board__value">¥{num(m.price, 0)}<small> {PRICING_LABEL[m.pricingType]?.replace('元', '/')}</small></div>
                </div>
                <div>
                  <div className="spec-board__label">服务区域</div>
                  <div className="spec-board__value" style={{ fontSize: 15, lineHeight: 1.6 }}>{m.serviceArea}</div>
                </div>
              </div>

              <div className="mt-24">
                <div className="eyebrow" style={{ marginBottom: 10 }}>设备说明</div>
                <p className="prose" style={{ whiteSpace: 'pre-wrap' }}>{m.description || '机手暂未补充设备说明，可在站内消息中询问车况、配套农具与作业经验。'}</p>
              </div>

              <div className="mt-32">
                <div className="row between" style={{ marginBottom: 12 }}>
                  <h3 className="h4">作业评价</h3>
                  <span className="small muted">{m.reviewCount ? `${m.reviewCount} 条 · 平均 ${m.rating}` : '暂无评价'}</span>
                </div>
                {!(data.reviews || []).length && <Empty title="还没有作业评价" desc="完成作业并确认后，下单用户可以对本次服务评价。" />}
                <div className="stack">
                  {(data.reviews || []).map((r) => (
                    <div key={r.id} style={{ padding: '14px 0', borderBottom: '1px solid var(--line-soft)' }}>
                      <div className="row between" style={{ marginBottom: 6 }}>
                        <span className="row gap-8"><Avatar name={r.user_name} /><span style={{ fontSize: 13.5 }}>{r.user_name}</span></span>
                        <Stars value={r.rating} readOnly />
                      </div>
                      <p className="small" style={{ lineHeight: 1.8 }}>{r.content || '未填写文字评价'}</p>
                      <div className="field__hint mt-8">{dateTime(r.created_at)}</div>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            <aside>
              <div className="side-sticky">
                <div className="side-card">
                  <div className="row between" style={{ marginBottom: 4 }}>
                    <span className="eyebrow eyebrow--olive">预约作业</span>
                    <span className="small muted">提前 1 天可约</span>
                  </div>
                  <div style={{ overflowX: 'auto', paddingBottom: 4 }}>
                    <div className="row gap-8" style={{ minWidth: 'max-content' }}>
                      {days.map((d) => (
                        <button
                          key={d.value}
                          type="button"
                          onClick={() => setDate(d.value)}
                          aria-pressed={date === d.value}
                          style={{
                            width: 54, padding: '7px 0', borderRadius: 6, cursor: 'pointer',
                            border: `1px solid ${date === d.value ? 'var(--olive)' : 'var(--line)'}`,
                            background: date === d.value ? 'var(--olive)' : 'var(--white)',
                            color: date === d.value ? 'var(--paper)' : 'var(--ink-soft)',
                          }}
                        >
                          <div style={{ fontSize: 10.5, opacity: 0.8 }}>周{d.week}</div>
                          <div style={{ fontSize: 15, fontVariantNumeric: 'tabular-nums' }}>{d.month}/{d.day}</div>
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="mt-16">
                    <div className="row between" style={{ marginBottom: 8 }}>
                      <span className="field__label">作业时段</span>
                      <span className="small muted">{slotLoading ? '读取中…' : '06:00 - 19:00'}</span>
                    </div>
                    {slots && (
                      <div className="slot-grid">
                        {slots.map((s) => {
                          const selected = start != null && end != null && s.hour >= start && s.hour < end;
                          return (
                            <button
                              key={s.hour}
                              type="button"
                              className={`slot ${selected ? 'is-selected' : ''}`}
                              disabled={s.status !== 'open'}
                              onClick={() => clickSlot(s.hour, s.status)}
                              title={s.status === 'booked' ? '已被预约' : s.status === 'blocked' ? '机手设为不可约' : '可预约'}
                            >
                              {String(s.hour).padStart(2, '0')}
                            </button>
                          );
                        })}
                      </div>
                    )}
                    <p className="field__hint mt-8">点击起始小时后再点结束小时；划线表示不可选。</p>
                  </div>

                  {m.pricingType === 'per_mu' && (
                    <label className="field mt-16">
                      <span className="field__label">作业面积（亩）<span className="req">*</span></span>
                      <input className="input" type="number" min="0" step="0.1" value={area} onChange={(e) => setArea(e.target.value)} placeholder="例如：12.5" />
                    </label>
                  )}

                  <div className="rule" style={{ margin: '16px 0' }} />
                  <div className="row between" style={{ marginBottom: 6 }}>
                    <span className="small muted">预计费用</span>
                    <span style={{ fontFamily: 'var(--font-serif)', fontSize: 22 }}>
                      {fee != null ? `¥${num(fee, 2)}` : '—'}
                    </span>
                  </div>
                  <div className="field__hint">
                    {start != null && end != null
                      ? `${date} ${String(start).padStart(2, '0')}:00 - ${String(end).padStart(2, '0')}:00 · ${PRICING_LABEL[m.pricingType]}`
                      : '选择时段后显示预计费用'}
                    {m.pricingType === 'per_day' ? '（按天计价，与时段长度无关）' : ''}
                  </div>

                  <button type="button" className="btn btn--primary btn--block mt-16" onClick={goConfirm}>去确认预约</button>
                  <p className="field__hint mt-8">提交后由机手确认；同一时段只会确认一单，未确认前不锁定时段以外的日期。</p>

                  <div className="owner-line" style={{ marginTop: 16 }}>
                    <Avatar name={m.shopName || m.merchantName} />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div className="owner-line__name">{m.shopName || m.merchantName}</div>
                      <div className="owner-line__sub">服务区域 {m.province} · {m.city}</div>
                    </div>
                  </div>
                </div>

                <div className="notice notice--plain" style={{ marginTop: 16 }}>
                  <div className="small">
                    平台不代收作业费用。作业完成并确认后，费用按与机手约定的方式结算；如遇纠纷可提交投诉由平台介入。
                  </div>
                </div>
              </div>
            </aside>
          </div>
        </div>
      </section>
    </>
  );
}
