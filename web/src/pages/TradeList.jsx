import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { get, post } from '../lib/api.js';
import { useAsync, useDebounced, useTitle } from '../lib/hooks.js';
import { useAuth } from '../lib/auth.jsx';
import { useToast } from '../lib/toast.jsx';
import PageHead from '../components/PageHead.jsx';
import ServiceBar from '../components/ServiceBar.jsx';
import { Empty, ErrorState, Loading, Pagination } from '../components/ui.jsx';
import { POST_CATEGORIES, PROVINCES, money, num, relative, date } from '../lib/format.js';

export default function TradeList({ mode = 'supply' }) {
  const isSupply = mode === 'supply';
  useTitle(isSupply ? '供应大厅' : '采购大厅');
  const { user } = useAuth();
  const toast = useToast();
  const [params, setParams] = useSearchParams();
  const [qInput, setQInput] = useState(params.get('q') || '');
  const dq = useDebounced(qInput, 400);

  const page = Number(params.get('page') || 1);
  const province = params.get('province') || '';
  const category = params.get('category') || '';
  const priceType = params.get('priceType') || '';
  const sort = params.get('sort') || 'latest';

  useEffect(() => {
    if ((params.get('q') || '') !== dq) {
      const next = new URLSearchParams(params);
      if (dq) next.set('q', dq); else next.delete('q');
      next.set('page', '1');
      setParams(next, { replace: true });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dq]);

  const { data, loading, error, reload } = useAsync(
    () => get('/posts', { type: mode, page, pageSize: 10, province, category, priceType, sort, q: dq }),
    [mode, page, province, category, priceType, sort, dq],
  );

  const setParam = (key, value) => {
    const next = new URLSearchParams(params);
    if (value) next.set(key, value); else next.delete(key);
    next.set('page', '1');
    setParams(next);
  };

  const favorite = async (id) => {
    if (!user) return toast.error('登录后可以收藏');
    try {
      const r = await post('/users/me/favorites', { targetType: 'post', targetId: id });
      toast.ok(r.favorited ? '已加入收藏' : '已取消收藏');
    } catch (err) {
      toast.error(err.message || '操作失败');
    }
  };

  return (
    <>
      <PageHead
        items={[{ label: '首页', to: '/' }, { label: isSupply ? '供应大厅' : '采购大厅' }]}
        title={isSupply ? '供应大厅' : '采购大厅'}
        desc={
          isSupply
            ? '产地直供的农产品信息，规格、数量、价格方式与有效期都写在明处。信息经平台审核后公开，询价与沟通记录长期保存。'
            : '来自采购商与加工企业的真实需求。可以直接报价，也可以在站内沟通规格、包装与交付节奏。'
        }
        actions={
          <>
            <Link to={`/trade/publish?type=${mode}`} className="btn btn--primary btn--sm">发布{isSupply ? '供应' : '采购'}</Link>
            <Link to={isSupply ? '/demand' : '/supply'} className="btn btn--ghost btn--sm">去{isSupply ? '采购大厅' : '供应大厅'}</Link>
          </>
        }
      />
      <ServiceBar active="02" />

      <section className="section" style={{ paddingTop: 28 }}>
        <div className="container">
          <div className="filter-bar" style={{ marginBottom: 8 }}>
            <input
              className="input filter-bar__grow"
              placeholder={isSupply ? '搜索品类、品种或产地' : '搜索求购品类、规格'}
              value={qInput}
              onChange={(e) => setQInput(e.target.value)}
              aria-label="关键词搜索"
            />
            <select className="select" style={{ width: 150 }} value={province} onChange={(e) => setParam('province', e.target.value)} aria-label="地区">
              <option value="">全部地区</option>
              {PROVINCES.map((p) => <option key={p} value={p}>{p}</option>)}
            </select>
            <select className="select" style={{ width: 130 }} value={category} onChange={(e) => setParam('category', e.target.value)} aria-label="品类">
              <option value="">全部品类</option>
              {POST_CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
            <select className="select" style={{ width: 140 }} value={priceType} onChange={(e) => setParam('priceType', e.target.value)} aria-label="价格方式">
              <option value="">价格方式</option>
              <option value="fixed">一口价</option>
              <option value="negotiable">价格面议</option>
            </select>
            <select className="select" style={{ width: 140 }} value={sort} onChange={(e) => setParam('sort', e.target.value)} aria-label="排序方式">
              <option value="latest">最新发布</option>
              <option value="price_asc">价格从低到高</option>
              <option value="price_desc">价格从高到低</option>
              <option value="deadline">即将到期</option>
            </select>
          </div>

          <div className="row between" style={{ padding: '10px 0 16px' }}>
            <span className="small muted">
              {loading ? '正在加载…' : `共 ${data?.total ?? 0} 条${isSupply ? '供应' : '采购'}信息`}
              {province ? ` · ${province}` : ''}{category ? ` · ${category}` : ''}
            </span>
            <span className="small muted">信息经审核后展示</span>
          </div>

          {loading && <Loading rows={5} height={92} />}
          {error && <ErrorState error={error} onRetry={reload} />}
          {!loading && !error && (data?.items || []).length === 0 && (
            <Empty
              title="没有找到匹配的信息"
              desc="可以放宽筛选条件，或成为第一个发布的人。"
              action={<Link to={`/trade/publish?type=${mode}`} className="btn btn--primary btn--sm">发布{isSupply ? '供应' : '采购'}信息</Link>}
            />
          )}

          {!loading && !error && (data?.items || []).length > 0 && (
            <div style={{ borderTop: '1px solid var(--line-strong)' }}>
              {data.items.map((p) => (
                <div key={p.id} className="trade-row">
                  <Link to={`/trade/${p.id}`} style={{ display: 'block', width: 112, height: 84, borderRadius: 6, overflow: 'hidden', background: 'var(--paper-deep)', border: '1px solid var(--line-soft)' }}>
                    {p.coverUrl ? <img src={p.coverUrl} alt={p.title} style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : (
                      <span className="thumb-placeholder">{p.category}<br />暂无实拍图</span>
                    )}
                  </Link>

                  <div style={{ minWidth: 0 }}>
                    <Link to={`/trade/${p.id}`} style={{ fontSize: 16.5, lineHeight: 1.5, display: 'block', marginBottom: 5 }}>{p.title}</Link>
                    <div className="small muted" style={{ display: 'flex', gap: 14, flexWrap: 'wrap' }}>
                      <span>{p.province} · {p.city}</span>
                      <span>{p.category}{p.variety ? ` · ${p.variety}` : ''}</span>
                      {p.spec && <span>{p.spec}</span>}
                      <span>有效期至 {date(p.validUntil)}</span>
                    </div>
                  </div>

                  <div className="trade-row__price">
                    <div style={{ fontFamily: 'var(--font-serif)', fontSize: 19 }}>
                      {p.priceType === 'negotiable' ? '价格面议' : <>{money(p.price)}<span className="small muted" style={{ fontFamily: 'var(--font-sans)' }}>/{p.unit}</span></>}
                    </div>
                    <div className="small muted">可供 {num(p.quantity, 2)} {p.unit}</div>
                  </div>

                  <div className="trade-row__actions" style={{ textAlign: 'right' }}>
                    <div className="small muted" style={{ marginBottom: 6 }}>{relative(p.createdAt)}</div>
                    <div className="row gap-8" style={{ justifyContent: 'flex-end' }}>
                      <button type="button" className="btn btn--quiet btn--sm" style={{ padding: '0 8px' }} onClick={() => favorite(p.id)} aria-label="收藏">收藏</button>
                      <Link to={`/trade/${p.id}`} className="btn btn--ghost btn--sm">查看</Link>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}

          <Pagination page={page} totalPages={data?.totalPages} total={data?.total} onChange={(p) => {
            const next = new URLSearchParams(params);
            next.set('page', String(p));
            setParams(next);
          }} />
        </div>
      </section>
    </>
  );
}
