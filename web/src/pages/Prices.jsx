import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { del, get, patch, post } from '../lib/api.js';
import { useAsync, useTitle } from '../lib/hooks.js';
import { useAuth } from '../lib/auth.jsx';
import { useToast } from '../lib/toast.jsx';
import PageHead from '../components/PageHead.jsx';
import ServiceBar from '../components/ServiceBar.jsx';
import { Empty, ErrorState, Loading, PriceChart, Spinner } from '../components/ui.jsx';
import { dateTime, num } from '../lib/format.js';

const today = () => new Date().toISOString().slice(0, 10);
const daysAgo = (n) => new Date(Date.now() - n * 86400000).toISOString().slice(0, 10);

export default function Prices() {
  useTitle('大宗作物行情');
  const { user } = useAuth();
  const toast = useToast();
  const meta = useAsync(() => get('/market/meta'), []);
  const overview = useAsync(() => get('/market/overview'), []);
  const [filters, setFilters] = useState({ crop: '', province: '', market: '', spec: '', from: daysAgo(30), to: today(), page: 1 });
  const [selected, setSelected] = useState(null);
  const [series, setSeries] = useState(null);
  const [seriesLoading, setSeriesLoading] = useState(false);
  const [seriesNote, setSeriesNote] = useState('');
  const [watchOpen, setWatchOpen] = useState(false);
  const [alertOpen, setAlertOpen] = useState(false);
  const [watchCrop, setWatchCrop] = useState('');
  const [alertCrop, setAlertCrop] = useState('');
  const [direction, setDirection] = useState('above');
  const [threshold, setThreshold] = useState('');
  const [busy, setBusy] = useState(false);

  const prices = useAsync(() => get('/market/prices', { ...filters, pageSize: 20 }), [filters]);
  const watchlist = useAsync(() => (user ? get('/market/watchlist') : Promise.resolve({ items: [] })), [user?.id]);
  const alerts = useAsync(() => (user ? get('/market/alerts') : Promise.resolve({ items: [] })), [user?.id]);

  const loadSeries = async (row) => {
    setSelected(row);
    setSeriesLoading(true);
    setSeriesNote('');
    try {
      const r = await get('/market/series', { crop: row.crop, market: row.market, spec: row.spec || '', province: row.province, days: 90 });
      setSeries(r);
      if (!r.consistent) setSeriesNote(r.note || '所选口径存在多种计价单位，暂不计算涨跌。');
    } catch (err) {
      setSeries(null);
      setSeriesNote(err.message || '趋势加载失败');
    } finally {
      setSeriesLoading(false);
    }
  };

  useEffect(() => {
    const first = overview.data?.items?.[0];
    if (first && !selected) loadSeries(first);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [overview.data]);

  const addWatch = async () => {
    if (!user) return toast.error('登录后可关注行情');
    if (!watchCrop) return toast.error('请选择作物');
    setBusy(true);
    try {
      await post('/market/watchlist', { crop: watchCrop });
      toast.ok('已加入关注');
      setWatchOpen(false);
      watchlist.reload();
    } catch (err) {
      toast.error(err.message || '添加失败');
    } finally {
      setBusy(false);
    }
  };

  const addAlert = async () => {
    if (!user) return toast.error('登录后可设置价格提醒');
    if (!alertCrop || !threshold) return toast.error('请选择作物并填写阈值');
    setBusy(true);
    try {
      await post('/market/alerts', { crop: alertCrop, direction, threshold: Number(threshold) });
      toast.ok('提醒已创建，达到条件后会收到站内通知');
      setAlertOpen(false);
      setThreshold('');
      alerts.reload();
    } catch (err) {
      toast.error(err.message || '创建失败');
    } finally {
      setBusy(false);
    }
  };

  const setFilter = (k, v) => setFilters((f) => ({ ...f, [k]: v, page: 1 }));

  const latestAt = meta.data?.latestCollectedAt;
  const staleHours = latestAt ? (Date.now() - new Date(latestAt.replace(' ', 'T')).getTime()) / 3600000 : null;

  return (
    <>
      <PageHead
        items={[{ label: '首页', to: '/' }, { label: '大宗行情' }]}
        title="大宗作物行情"
        desc="每条报价都标注市场、规格、计价单位、报价口径、采集时间与来源。涨跌与趋势只在同一口径内计算，数据缺失时不做填补。"
        actions={
          <>
            <button type="button" className="btn btn--ghost btn--sm" onClick={() => setWatchOpen(true)}>关注作物</button>
            <button type="button" className="btn btn--primary btn--sm" onClick={() => setAlertOpen(true)}>设置价格提醒</button>
          </>
        }
      />
      <ServiceBar active="05" />

      <section className="section" style={{ paddingTop: 24 }}>
        <div className="container">
          <div className="notice notice--plain" style={{ justifyContent: 'space-between', flexWrap: 'wrap', alignItems: 'center' }}>
            <div className="row gap-12 wrap">
              <span className={`status-dot ${latestAt ? 'status-dot--ok' : 'status-dot--warn'}`} />
              <span className="small">
                {latestAt ? `最新采集 ${dateTime(latestAt)}` : '尚无已审核行情数据'}
                {meta.data?.sources?.length ? ` · ${meta.data.sources.length} 个数据来源` : ''}
                {staleHours != null && staleHours > 48 ? ' · 数据更新可能延迟' : ''}
              </span>
            </div>
            <span className="small muted">
              {meta.data?.configured?.api ? '行情 API 已配置，采集任务每小时运行并进入待审核队列' : '当前仅支持人工录入，经审核后展示'}
            </span>
          </div>

          {overview.loading && <div className="mt-24"><Loading rows={2} height={110} /></div>}
          {!overview.loading && (overview.data?.items || []).length === 0 && (
            <div className="mt-24">
              <Empty
                title="还没有可展示的行情数据"
                desc="平台只在数据经人工核对后展示，不会用随机数或占位价格填充。管理员可在后台录入或导入 CSV，审核通过后出现在这里。"
                action={
                  user?.role === 'admin'
                    ? <Link to="/admin?tab=market" className="btn btn--primary btn--sm">前往后台录入</Link>
                    : <span className="small muted">如需补充数据，请联系平台运营</span>
                }
              />
            </div>
          )}

          {!overview.loading && (overview.data?.items || []).length > 0 && (
            <>
              <div className="price-overview">
                {overview.data.items.map((it) => {
                  const up = it.change > 0;
                  const down = it.change < 0;
                  return (
                    <button
                      key={`${it.crop}-${it.market}`}
                      type="button"
                      onClick={() => loadSeries(it)}
                      style={{
                        background: selected && selected.crop === it.crop && selected.market === it.market ? 'var(--moss-soft)' : 'var(--paper-soft)',
                        padding: '18px 20px', border: 0, textAlign: 'left', cursor: 'pointer',
                      }}
                    >
                      <div className="row between">
                        <span style={{ fontSize: 14, fontWeight: 500 }}>{it.crop}</span>
                        <span className="small muted">{it.unit}</span>
                      </div>
                      <div style={{ fontFamily: 'var(--font-serif)', fontSize: 24, margin: '4px 0 2px' }}>{num(it.price, 2)}</div>
                      <div className="row between">
                        <span className="small muted" style={{ maxWidth: 120, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{it.market}</span>
                        {it.comparable ? (
                          <span className={`delta ${up ? 'delta--up' : down ? 'delta--down' : ''}`}>
                            {up ? '▲' : down ? '▼' : '—'} {Math.abs(it.changePct).toFixed(2)}%
                          </span>
                        ) : (
                          <span className="delta muted">—</span>
                        )}
                      </div>
                    </button>
                  );
                })}
              </div>

              <div className="detail-grid" style={{ paddingTop: 28 }}>
                <div>
                  <div className="chart-box">
                    <div className="row between" style={{ marginBottom: 6, flexWrap: 'wrap', gap: 8 }}>
                      <div>
                        <div className="eyebrow">历史趋势</div>
                        <div style={{ fontFamily: 'var(--font-serif)', fontSize: 19, marginTop: 4 }}>
                          {selected ? `${selected.crop}${selected.spec ? ` · ${selected.spec}` : ''} · ${selected.market}` : '选择一条行情查看趋势'}
                        </div>
                      </div>
                      {series?.unit && <span className="small muted">单位：{series.unit}</span>}
                    </div>
                    {seriesLoading && <div className="mt-16"><Loading rows={1} height={180} /></div>}
                    {!seriesLoading && series?.points?.length > 1 && <PriceChart points={series.points} unit={series.unit} />}
                    {!seriesLoading && series && series.points?.length <= 1 && (
                      <p className="small muted mt-16">该口径下只有一个数据点，暂不绘制趋势线。积累两天以上数据后可查看走势。</p>
                    )}
                    {seriesNote && <p className="small" style={{ color: 'var(--wheat)', marginTop: 8 }}>{seriesNote}</p>}
                    <p className="field__hint" style={{ marginTop: 10 }}>
                      趋势仅连接同作物、同市场、同规格、同报价口径的记录；不同口径的数据不会拼接到一条线上。
                    </p>
                  </div>

                  <div className="filter-bar" style={{ marginTop: 22 }}>
                    <select className="select" style={{ width: 120 }} value={filters.crop} onChange={(e) => setFilter('crop', e.target.value)} aria-label="作物">
                      <option value="">全部作物</option>
                      {(meta.data?.crops || []).map((c) => <option key={c} value={c}>{c}</option>)}
                    </select>
                    <select className="select" style={{ width: 140 }} value={filters.province} onChange={(e) => setFilter('province', e.target.value)} aria-label="地区">
                      <option value="">全部地区</option>
                      {(meta.data?.provinces || []).map((p) => <option key={p} value={p}>{p}</option>)}
                    </select>
                    <select className="select" style={{ width: 170 }} value={filters.market} onChange={(e) => setFilter('market', e.target.value)} aria-label="市场">
                      <option value="">全部市场</option>
                      {[...new Set((meta.data?.markets || []).map((m) => m.market))].map((m) => <option key={m} value={m}>{m}</option>)}
                    </select>
                    <label className="row gap-8 small muted" style={{ whiteSpace: 'nowrap' }}>
                      采集日期
                      <input className="input input--sm" style={{ width: 138 }} type="date" value={filters.from} onChange={(e) => setFilter('from', e.target.value)} aria-label="开始日期" />
                      <span>至</span>
                      <input className="input input--sm" style={{ width: 138 }} type="date" value={filters.to} onChange={(e) => setFilter('to', e.target.value)} aria-label="结束日期" />
                    </label>
                  </div>

                  {prices.loading && <div className="mt-16"><Loading rows={3} height={60} /></div>}
                  {prices.error && <ErrorState error={prices.error} onRetry={prices.reload} />}
                  {!prices.loading && !prices.error && (prices.data?.items || []).length === 0 && (
                    <p className="small muted" style={{ padding: '24px 0' }}>当前筛选条件下没有记录。</p>
                  )}

                  {!prices.loading && (prices.data?.items || []).length > 0 && (
                    <div className="table-wrap mt-16">
                      <table className="table">
                        <thead>
                          <tr>
                            <th>作物 / 规格</th>
                            <th>市场</th>
                            <th style={{ textAlign: 'right' }}>价格</th>
                            <th>口径</th>
                            <th>采集时间</th>
                            <th>来源</th>
                          </tr>
                        </thead>
                        <tbody>
                          {prices.data.items.map((p) => (
                            <tr key={p.id} style={{ cursor: 'pointer', background: selected?.id === p.id ? 'var(--moss-soft)' : undefined }} onClick={() => loadSeries(p)}>
                              <td>
                                <div style={{ fontWeight: 500 }}>{p.crop}</div>
                                <div className="small muted">{p.spec || '未标注规格'}{p.grade ? ` · ${p.grade}` : ''}</div>
                              </td>
                              <td>
                                <div style={{ fontSize: 13.5 }}>{p.market}</div>
                                <div className="small muted">{p.province}</div>
                              </td>
                              <td className="num" style={{ textAlign: 'right' }}>
                                <span className="price-cell">{num(p.price, 2)}</span>
                                <div className="small muted">{p.currency}/{p.unit}</div>
                              </td>
                              <td className="small">{p.quote_basis}</td>
                              <td className="small muted">{dateTime(p.collected_at)}</td>
                              <td className="small" style={{ minWidth: 120 }}>
                                {p.source_name}
                                {p.source_url && (
                                  <a href={p.source_url} target="_blank" rel="noreferrer" style={{ display: 'block', color: 'var(--olive)' }}>来源链接 ↗</a>
                                )}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}

                  {prices.data?.totalPages > 1 && (
                    <div className="row gap-8 mt-16" style={{ justifyContent: 'flex-end' }}>
                      <button type="button" className="btn btn--ghost btn--sm" disabled={filters.page <= 1} onClick={() => setFilters((f) => ({ ...f, page: f.page - 1 }))}>上一页</button>
                      <span className="small muted">第 {filters.page} / {prices.data.totalPages} 页</span>
                      <button type="button" className="btn btn--ghost btn--sm" disabled={filters.page >= prices.data.totalPages} onClick={() => setFilters((f) => ({ ...f, page: f.page + 1 }))}>下一页</button>
                    </div>
                  )}
                </div>

                <aside>
                  <div className="side-sticky">
                    <div className="side-card">
                      <div className="row between" style={{ marginBottom: 10 }}>
                        <span className="side-card__title" style={{ marginBottom: 0 }}>我的关注</span>
                        <button type="button" className="btn btn--quiet btn--sm" style={{ padding: 0 }} onClick={() => setWatchOpen(true)}>+ 添加</button>
                      </div>
                      {!user && <p className="small muted">登录后可关注作物并接收提醒。</p>}
                      {user && (watchlist.data?.items || []).length === 0 && <p className="small muted">还没有关注的作物。</p>}
                      <div className="stack">
                        {(watchlist.data?.items || []).map((w) => (
                          <div key={w.id} className="row between" style={{ padding: '9px 0', borderBottom: '1px solid var(--line-soft)' }}>
                            <div>
                              <div style={{ fontSize: 13.5 }}>{w.crop}{w.province ? ` · ${w.province}` : ''}</div>
                              <div className="small muted">{w.latest ? `最新 ${num(w.latest.price, 2)}/${w.latest.unit}` : '暂无报价'}</div>
                            </div>
                            <button
                              type="button"
                              className="btn btn--quiet btn--sm"
                              style={{ padding: '0 4px', color: 'var(--muted)' }}
                              onClick={() => del(`/market/watchlist/${w.id}`).then(() => { toast.ok('已取消关注'); watchlist.reload(); })}
                              aria-label="取消关注"
                            >
                              ×
                            </button>
                          </div>
                        ))}
                      </div>
                    </div>

                    <div className="side-card">
                      <div className="row between" style={{ marginBottom: 10 }}>
                        <span className="side-card__title" style={{ marginBottom: 0 }}>价格提醒</span>
                        <button type="button" className="btn btn--quiet btn--sm" style={{ padding: 0 }} onClick={() => setAlertOpen(true)}>+ 新建</button>
                      </div>
                      {!user && <p className="small muted">登录后可设置阈值提醒。</p>}
                      {user && (alerts.data?.items || []).length === 0 && <p className="small muted">暂无提醒。后台任务每 60 秒检查一次已审核报价。</p>}
                      <div className="stack">
                        {(alerts.data?.items || []).map((a) => (
                          <div key={a.id} style={{ padding: '9px 0', borderBottom: '1px solid var(--line-soft)' }}>
                            <div className="row between">
                              <span style={{ fontSize: 13.5 }}>{a.crop} {a.direction === 'above' ? '≥' : '≤'} ¥{num(a.threshold, 2)}</span>
                              <button
                                type="button"
                                className="btn btn--quiet btn--sm"
                                style={{ padding: '0 4px', color: a.active ? 'var(--olive)' : 'var(--muted)' }}
                                onClick={() => patch(`/market/alerts/${a.id}`, { active: !a.active }).then(() => alerts.reload())}
                              >
                                {a.active ? '启用中' : '已暂停'}
                              </button>
                            </div>
                            <div className="small muted">
                              {a.last_triggered_at ? `上次触发 ${dateTime(a.last_triggered_at)}` : '尚未触发'}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>

                    <div className="notice notice--plain" style={{ marginTop: 16 }}>
                      <div className="small" style={{ lineHeight: 1.9 }}>
                        行情数据仅供经营参考。平台不对价格预测或交易收益作出承诺。数据来源与采集时间标注在每条记录上。
                      </div>
                    </div>
                  </div>
                </aside>
              </div>
            </>
          )}
        </div>
      </section>

      {watchOpen && (
        <div className="overlay" onMouseDown={(e) => e.target === e.currentTarget && setWatchOpen(false)}>
          <div className="modal" role="dialog" aria-modal="true" aria-label="关注作物">
            <div className="modal__head">
              <h3 className="h3" style={{ fontSize: 21 }}>关注作物</h3>
              <button type="button" className="icon-btn" onClick={() => setWatchOpen(false)} aria-label="关闭">×</button>
            </div>
            <label className="field">
              <span className="field__label">选择作物</span>
              <select className="select" value={watchCrop} onChange={(e) => setWatchCrop(e.target.value)}>
                <option value="">请选择</option>
                {(meta.data?.crops || []).map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
            </label>
            <div className="row gap-12 mt-24" style={{ justifyContent: 'flex-end' }}>
              <button type="button" className="btn btn--ghost btn--sm" onClick={() => setWatchOpen(false)}>取消</button>
              <button type="button" className="btn btn--primary btn--sm" onClick={addWatch} disabled={busy}>{busy ? <><Spinner /> 添加中</> : '添加关注'}</button>
            </div>
          </div>
        </div>
      )}

      {alertOpen && (
        <div className="overlay" onMouseDown={(e) => e.target === e.currentTarget && setAlertOpen(false)}>
          <div className="modal" role="dialog" aria-modal="true" aria-label="价格提醒">
            <div className="modal__head">
              <h3 className="h3" style={{ fontSize: 21 }}>新建价格提醒</h3>
              <button type="button" className="icon-btn" onClick={() => setAlertOpen(false)} aria-label="关闭">×</button>
            </div>
            <div className="stack gap-16">
              <label className="field">
                <span className="field__label">作物</span>
                <select className="select" value={alertCrop} onChange={(e) => setAlertCrop(e.target.value)}>
                  <option value="">请选择</option>
                  {(meta.data?.crops || []).map((c) => <option key={c} value={c}>{c}</option>)}
                </select>
              </label>
              <div className="form-grid">
                <label className="field">
                  <span className="field__label">触发条件</span>
                  <select className="select" value={direction} onChange={(e) => setDirection(e.target.value)}>
                    <option value="above">价格达到或高于</option>
                    <option value="below">价格达到或低于</option>
                  </select>
                </label>
                <label className="field">
                  <span className="field__label">阈值（元）</span>
                  <input className="input" type="number" min="0" step="0.01" value={threshold} onChange={(e) => setThreshold(e.target.value)} placeholder="例如：4.50" />
                </label>
              </div>
              <div className="notice notice--plain small">
                提醒由后台任务每 60 秒检查一次，仅在最新已审核报价满足条件且价格较上次触发发生变化时发送，避免重复打扰。
              </div>
            </div>
            <div className="row gap-12 mt-24" style={{ justifyContent: 'flex-end' }}>
              <button type="button" className="btn btn--ghost btn--sm" onClick={() => setAlertOpen(false)}>取消</button>
              <button type="button" className="btn btn--primary btn--sm" onClick={addAlert} disabled={busy}>{busy ? <><Spinner /> 创建中</> : '创建提醒'}</button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
