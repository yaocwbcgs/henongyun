import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { get } from '../lib/api.js';
import { useAsync, useTitle } from '../lib/hooks.js';
import PageHead from '../components/PageHead.jsx';
import ServiceBar from '../components/ServiceBar.jsx';
import { Empty, ErrorState, Loading, Pagination, Stars } from '../components/ui.jsx';
import { MACHINE_TYPES, PROVINCES, PRICING_LABEL, num } from '../lib/format.js';

const today = () => new Date().toISOString().slice(0, 10);

export default function MachineryList() {
  useTitle('农机服务');
  const [params, setParams] = useSearchParams();
  const [date, setDate] = useState(params.get('date') || '');
  const type = params.get('type') || '';
  const province = params.get('province') || '';
  const maxPrice = params.get('maxPrice') || '';
  const sort = params.get('sort') || 'latest';
  const page = Number(params.get('page') || 1);

  const setParam = (k, v) => {
    const next = new URLSearchParams(params);
    if (v) next.set(k, v); else next.delete(k);
    next.set('page', '1');
    setParams(next);
  };

  useEffect(() => {
    if ((params.get('date') || '') !== date) {
      const next = new URLSearchParams(params);
      if (date) next.set('date', date); else next.delete('date');
      setParams(next, { replace: true });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [date]);

  const { data, loading, error, reload } = useAsync(
    () => get('/machinery', { province, type, maxPrice, sort, date, page, pageSize: 9 }),
    [province, type, maxPrice, sort, date, page],
  );

  return (
    <>
      <PageHead
        items={[{ label: '首页', to: '/' }, { label: '农机服务' }]}
        title="农机服务"
        desc="按设备、地区与作业日期查找可用机具。计价方式与价格由机手维护，预约时段写入数据库并占用唯一档期，同一时段不会重复确认。"
        actions={<Link to="/bookings" className="btn btn--ghost btn--sm">我的预约</Link>}
      />
      <ServiceBar active="03" />

      <section className="section" style={{ paddingTop: 28 }}>
        <div className="container">
          <div className="filter-bar">
            <select className="select" style={{ width: 160 }} value={province} onChange={(e) => setParam('province', e.target.value)} aria-label="地区">
              <option value="">全部地区</option>
              {PROVINCES.map((p) => <option key={p} value={p}>{p}</option>)}
            </select>
            <select className="select" style={{ width: 150 }} value={type} onChange={(e) => setParam('type', e.target.value)} aria-label="设备类型">
              <option value="">全部类型</option>
              {MACHINE_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
            </select>
            <label className="row gap-8 small" style={{ marginLeft: 4 }}>
              作业日期
              <input
                type="date"
                className="input input--sm"
                style={{ width: 158 }}
                value={date}
                min={today()}
                onChange={(e) => setDate(e.target.value)}
                aria-label="按作业日期筛选"
              />
            </label>
            <select className="select" style={{ width: 150, marginLeft: 'auto' }} value={maxPrice} onChange={(e) => setParam('maxPrice', e.target.value)} aria-label="价格上限">
              <option value="">价格不限</option>
              <option value="50">≤ 50 元</option>
              <option value="100">≤ 100 元</option>
              <option value="200">≤ 200 元</option>
              <option value="400">≤ 400 元</option>
            </select>
            <select className="select" style={{ width: 140 }} value={sort} onChange={(e) => setParam('sort', e.target.value)} aria-label="排序">
              <option value="latest">最新上架</option>
              <option value="price_asc">价格从低到高</option>
              <option value="price_desc">价格从高到低</option>
            </select>
          </div>

          <div className="row between" style={{ padding: '12px 0 20px' }}>
            <span className="small muted">
              {loading ? '加载中…' : `共 ${data?.total ?? 0} 台设备`}
              {date ? ` · ${date} 有可预约时段` : ''}
            </span>
            <span className="small muted">价格口径以详情页为准</span>
          </div>

          {loading && <Loading rows={3} height={120} />}
          {error && <ErrorState error={error} onRetry={reload} />}
          {!loading && !error && (data?.items || []).length === 0 && (
            <Empty title={date ? '这一天没有可预约的设备' : '没有找到匹配的设备'} desc="可以换一天或放宽筛选条件。" />
          )}

          {!loading && !error && (data?.items || []).length > 0 && (
            <div className="machinery-grid">
              {data.items.map((m) => (
                <Link key={m.id} to={`/machinery/${m.id}`} style={{ display: 'block' }}>
                  <div style={{ aspectRatio: '4/3', borderRadius: 8, overflow: 'hidden', background: 'var(--paper-deep)', border: '1px solid var(--line-soft)', marginBottom: 12 }}>
                    {m.coverUrl ? (
                      <img src={m.coverUrl} alt={m.name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                    ) : (
                      <div style={{ display: 'grid', placeItems: 'center', height: '100%', color: 'var(--muted)', fontSize: 12 }}>{m.type}</div>
                    )}
                  </div>
                  <div className="row gap-8" style={{ marginBottom: 6 }}>
                    <span className="tag tag--muted">{m.type}</span>
                    {m.availableHours != null && <span className="tag tag--olive">{m.availableHours} 小时可约</span>}
                  </div>
                  <div style={{ fontFamily: 'var(--font-serif)', fontSize: 18, lineHeight: 1.45, marginBottom: 4 }}>{m.name}</div>
                  <div className="small muted">{m.province} · {m.city} · 服务 {m.serviceArea}</div>
                  <div className="row between mt-8">
                    <span style={{ fontFamily: 'var(--font-serif)', fontSize: 17 }}>¥{num(m.price, 0)}<span className="small muted" style={{ fontFamily: 'var(--font-sans)' }}> {PRICING_LABEL[m.pricingType]?.replace('元', '/')}</span></span>
                    <span className="small muted">{m.rating ? <span className="row gap-8"><Stars value={Math.round(m.rating)} readOnly /> {m.rating}</span> : '暂无评价'}</span>
                  </div>
                </Link>
              ))}
            </div>
          )}

          {!date && <Pagination page={page} totalPages={data?.totalPages} total={data?.total} onChange={(p) => setParam('page', String(p))} />}
        </div>
      </section>
    </>
  );
}
