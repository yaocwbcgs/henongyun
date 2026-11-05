import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { get } from '../lib/api.js';
import { useAsync, useDebounced, useTitle } from '../lib/hooks.js';
import PageHead from '../components/PageHead.jsx';
import ServiceBar from '../components/ServiceBar.jsx';
import { Empty, ErrorState, Loading, Pagination } from '../components/ui.jsx';
import { PRODUCT_CATEGORIES, money, num } from '../lib/format.js';
import { categoryImage } from '../lib/images.js';

export default function ShopList() {
  useTitle('农资商城');
  const [params, setParams] = useSearchParams();
  const [qInput, setQInput] = useState(params.get('q') || '');
  const dq = useDebounced(qInput, 400);
  const category = params.get('category') || '';
  const sort = params.get('sort') || 'latest';
  const minPrice = params.get('minPrice') || '';
  const maxPrice = params.get('maxPrice') || '';
  const page = Number(params.get('page') || 1);

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
    () => get('/shop/products', { category, q: dq, sort, minPrice, maxPrice, page, pageSize: 12 }),
    [category, dq, sort, minPrice, maxPrice, page],
  );

  const setParam = (k, v) => {
    const next = new URLSearchParams(params);
    if (v) next.set(k, v); else next.delete(k);
    next.set('page', '1');
    setParams(next);
  };

  return (
    <>
      <PageHead
        items={[{ label: '首页', to: '/' }, { label: '农资商城' }]}
        title="农资商城"
        desc="种子种苗、肥料、农药与农机具。规格、适用范围与货源说明写在详情页，库存以下单时服务端扣减为准。"
        actions={<Link to="/cart" className="btn btn--ghost btn--sm">购物车</Link>}
      />
      <ServiceBar active="04" />

      <section className="section" style={{ paddingTop: 26 }}>
        <div className="container">
          <div className="filter-bar">
            <input className="input filter-bar__grow" placeholder="搜索商品名称、适用作物" value={qInput} onChange={(e) => setQInput(e.target.value)} aria-label="搜索商品" />
            <select className="select" style={{ width: 150 }} value={minPrice} onChange={(e) => setParam('minPrice', e.target.value)} aria-label="最低价">
              <option value="">价格不限</option>
              <option value="0">¥0 以上</option>
              <option value="50">¥50 以上</option>
              <option value="200">¥200 以上</option>
              <option value="500">¥500 以上</option>
            </select>
            <select className="select" style={{ width: 130 }} value={maxPrice} onChange={(e) => setParam('maxPrice', e.target.value)} aria-label="最高价">
              <option value="">不限上限</option>
              <option value="50">¥50 以下</option>
              <option value="100">¥100 以下</option>
              <option value="300">¥300 以下</option>
              <option value="1000">¥1000 以下</option>
            </select>
            <select className="select" style={{ width: 140 }} value={sort} onChange={(e) => setParam('sort', e.target.value)} aria-label="排序">
              <option value="latest">最新上架</option>
              <option value="price_asc">价格从低到高</option>
              <option value="price_desc">价格从高到低</option>
              <option value="sales">销量优先</option>
            </select>
          </div>

          <div className="row gap-8 wrap" style={{ padding: '14px 0 4px' }}>
            <button type="button" className={`tag ${!category ? 'tag--solid' : ''}`} style={{ cursor: 'pointer', background: !category ? 'var(--olive)' : 'transparent' }} onClick={() => setParam('category', '')}>全部品类</button>
            {PRODUCT_CATEGORIES.map((c) => (
              <button
                key={c}
                type="button"
                className="tag"
                style={{ cursor: 'pointer', background: category === c ? 'var(--olive)' : 'transparent', color: category === c ? 'var(--paper)' : 'var(--ink-soft)', borderColor: category === c ? 'var(--olive)' : 'var(--line-strong)' }}
                onClick={() => setParam('category', category === c ? '' : c)}
              >
                {c}
              </button>
            ))}
          </div>

          <div className="row between" style={{ padding: '14px 0 18px' }}>
            <span className="small muted">{loading ? '加载中…' : `共 ${data?.total ?? 0} 件商品`}</span>
            <span className="small muted">满 ¥199 免运费</span>
          </div>

          {loading && <Loading rows={3} height={200} />}
          {error && <ErrorState error={error} onRetry={reload} />}
          {!loading && !error && (data?.items || []).length === 0 && <Empty title="没有找到匹配的商品" desc="换个关键词或品类试试。" />}

          {!loading && !error && (data?.items || []).length > 0 && (
            <div className="product-grid">
              {data.items.map((p) => (
                <Link key={p.id} to={`/shop/${p.id}`} className="product-card">
                  <div className="product-card__frame">
                    <img src={p.coverUrl || categoryImage(p.category)} alt={p.name} />
                    {!p.coverUrl && <span className="img-note">品类示意图</span>}
                  </div>
                  <div className="product-card__body">
                    <div className="product-card__name">{p.name}</div>
                    <div className="product-card__spec">{p.spec} · 库存 {num(p.stock)} {p.unit}</div>
                    <div className="product-card__foot">
                      <span className="price">{money(p.price)}<small>/{p.unit}</small></span>
                      <span className="product-card__shop">{p.shopName || p.merchantName}</span>
                    </div>
                  </div>
                </Link>
              ))}
            </div>
          )}

          <Pagination page={page} totalPages={data?.totalPages} total={data?.total} onChange={(p) => setParam('page', String(p))} />
        </div>
      </section>
    </>
  );
}
