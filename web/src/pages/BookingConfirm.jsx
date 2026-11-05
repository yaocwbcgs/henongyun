import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { get, post } from '../lib/api.js';
import { useAsync, useTitle } from '../lib/hooks.js';
import { useAuth } from '../lib/auth.jsx';
import { useToast } from '../lib/toast.jsx';
import PageHead from '../components/PageHead.jsx';
import { ErrorState, Loading, Spinner } from '../components/ui.jsx';
import { PRICING_LABEL, num } from '../lib/format.js';

export default function BookingConfirm() {
  useTitle('确认预约');
  const [params] = useSearchParams();
  const { user, booting } = useAuth();
  const navigate = useNavigate();
  const toast = useToast();

  const machineryId = Number(params.get('machineryId'));
  const date = params.get('date') || '';
  const start = Number(params.get('start'));
  const end = Number(params.get('end'));
  const areaParam = params.get('area') || '';

  const { data, loading, error } = useAsync(() => get(`/machinery/${machineryId}`), [machineryId]);
  const [area, setArea] = useState(areaParam);
  const [location, setLocation] = useState(user?.region ? `${user.region}` : '');
  const [contactName, setContactName] = useState(user?.name || '');
  const [contactPhone, setContactPhone] = useState(user?.phone || '');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [conflict, setConflict] = useState('');
  const [errors, setErrors] = useState({});

  useEffect(() => {
    if (!booting && !user) navigate(`/login?redirect=${encodeURIComponent(location.pathname + location.search)}`);
  }, [user, booting, navigate]);

  const m = data?.machinery;
  const fee = useMemo(() => {
    if (!m) return null;
    const hours = end - start;
    if (m.pricingType === 'per_mu') return area ? Math.round(Number(area) * m.price * 100) / 100 : null;
    if (m.pricingType === 'per_hour') return Math.round(hours * m.price * 100) / 100;
    return m.price;
  }, [m, area, start, end]);

  const validate = () => {
    const e = {};
    if (location.trim().length < 5) e.location = '请填写详细作业位置，至少 5 个字';
    if (!/^1[3-9]\d{9}$/.test(contactPhone)) e.contactPhone = '请输入有效的手机号';
    if (contactName.trim().length < 2) e.contactName = '请填写联系人';
    if (m?.pricingType === 'per_mu' && (!area || Number(area) <= 0)) e.area = '请填写作业面积';
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const submit = async () => {
    setConflict('');
    if (!validate()) return;
    setBusy(true);
    try {
      const r = await post('/machinery/bookings', {
        machineryId,
        date,
        startHour: start,
        endHour: end,
        area: area ? Number(area) : null,
        location: location.trim(),
        contactName: contactName.trim(),
        contactPhone,
        note: note.trim() || undefined,
      });
      toast.ok('预约已提交，等待机手确认');
      navigate(`/bookings/${r.booking.id}`, { replace: true });
    } catch (err) {
      if (err.status === 409) setConflict(err.message);
      else toast.error(err.message || '提交失败');
    } finally {
      setBusy(false);
    }
  };

  if (loading) return <div className="container" style={{ padding: '60px 32px' }}><Loading rows={3} /></div>;
  if (error) return <div className="container" style={{ padding: '60px 32px' }}><ErrorState error={error} /></div>;
  if (!m) return null;

  const invalidRange = !(start >= 6 && end <= 19 && end > start);

  return (
    <>
      <PageHead
        items={[{ label: '首页', to: '/' }, { label: '农机服务', to: '/machinery' }, { label: '确认预约' }]}
        title="确认预约信息"
        desc="提交前请核对作业地点、面积与时段。提交后机手会收到实时通知，确认结果可在「我的预约」查看。"
      />

      <section className="section" style={{ paddingTop: 28 }}>
        <div className="container">
          <div className="checkout-grid">
            <div>
              <div className="panel panel--white" style={{ padding: 28 }}>
                <h2 className="h4" style={{ marginBottom: 16 }}>作业信息</h2>
                <div className="form-grid">
                  <label className="field span-2">
                    <span className="field__label">作业位置<span className="req">*</span></span>
                    <input className="input" value={location} onChange={(e) => { setLocation(e.target.value); setErrors((x) => ({ ...x, location: undefined })); }} placeholder="省 / 市 / 县 / 乡镇 / 村，越具体越好" aria-invalid={Boolean(errors.location)} />
                    {errors.location && <span className="field__error">{errors.location}</span>}
                  </label>

                  {m.pricingType === 'per_mu' && (
                    <label className="field">
                      <span className="field__label">作业面积（亩）<span className="req">*</span></span>
                      <input className="input" type="number" min="0" step="0.1" value={area} onChange={(e) => { setArea(e.target.value); setErrors((x) => ({ ...x, area: undefined })); }} aria-invalid={Boolean(errors.area)} />
                      {errors.area && <span className="field__error">{errors.area}</span>}
                    </label>
                  )}

                  <label className="field">
                    <span className="field__label">联系人<span className="req">*</span></span>
                    <input className="input" value={contactName} onChange={(e) => setContactName(e.target.value)} aria-invalid={Boolean(errors.contactName)} />
                    {errors.contactName && <span className="field__error">{errors.contactName}</span>}
                  </label>

                  <label className="field">
                    <span className="field__label">联系电话<span className="req">*</span></span>
                    <input className="input" value={contactPhone} onChange={(e) => setContactPhone(e.target.value)} placeholder="11 位手机号" inputMode="numeric" aria-invalid={Boolean(errors.contactPhone)} />
                    {errors.contactPhone && <span className="field__error">{errors.contactPhone}</span>}
                  </label>

                  <label className="field span-2">
                    <span className="field__label">补充说明</span>
                    <textarea className="textarea" value={note} onChange={(e) => setNote(e.target.value)} maxLength={500} placeholder="地块条件、作物高度、是否需要配套农具、进场路线等。" style={{ minHeight: 90 }} />
                  </label>
                </div>

                {conflict && (
                  <div className="notice notice--danger mt-16">
                    <div>
                      <div className="notice__title">该时段刚刚被占用</div>
                      <div className="small">{conflict}。请返回选择其他时段，或联系机手协商。</div>
                      <Link to={`/machinery/${machineryId}`} className="btn btn--ghost btn--sm mt-16">重新选择时段</Link>
                    </div>
                  </div>
                )}

                <div className="row between mt-24">
                  <Link to={`/machinery/${machineryId}`} className="btn btn--quiet btn--sm">返回修改时段</Link>
                  <button type="button" className="btn btn--primary" onClick={submit} disabled={busy || invalidRange || fee == null}>
                    {busy ? <><Spinner /> 提交中…</> : '提交预约'}
                  </button>
                </div>
                {invalidRange && <p className="field__error mt-8">预约时段无效，请返回设备页重新选择。</p>}
              </div>
            </div>

            <aside>
              <div className="side-sticky">
                <div className="side-card">
                  <div className="row between" style={{ marginBottom: 12 }}>
                    <span className="eyebrow eyebrow--olive">预约摘要</span>
                    <span className="tag tag--muted">待机手确认</span>
                  </div>
                  <div style={{ fontFamily: 'var(--font-serif)', fontSize: 19, lineHeight: 1.5 }}>{m.name}</div>
                  <div className="small muted">{m.type} · {m.shopName || m.merchantName}</div>

                  <div className="info-list mt-16" style={{ borderTop: '1px solid var(--line-soft)', paddingTop: 14 }}>
                    <div className="info-list__row"><dt>作业日期</dt><dd>{date}</dd></div>
                    <div className="info-list__row"><dt>作业时段</dt><dd>{String(start).padStart(2, '0')}:00 - {String(end).padStart(2, '0')}:00</dd></div>
                    <div className="info-list__row"><dt>时长</dt><dd>{end - start} 小时</dd></div>
                    {area && <div className="info-list__row"><dt>面积</dt><dd>{area} 亩</dd></div>}
                    <div className="info-list__row"><dt>计价</dt><dd>¥{num(m.price, 0)} {PRICING_LABEL[m.pricingType]}</dd></div>
                  </div>

                  <div className="rule" style={{ margin: '14px 0' }} />
                  <div className="row between">
                    <span className="small muted">预计费用</span>
                    <span style={{ fontFamily: 'var(--font-serif)', fontSize: 26 }}>{fee != null ? `¥${num(fee, 2)}` : '—'}</span>
                  </div>
                  <p className="field__hint mt-8">最终费用以实际作业面积或时长核算，确认前可与机手沟通。</p>
                </div>

                <div className="notice notice--plain" style={{ marginTop: 16 }}>
                  <div className="small">
                    预约提交后，该时段即被占用，其他用户无法重复预约。若机手拒绝或双方取消，时段会自动释放。
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
