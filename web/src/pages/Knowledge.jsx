import { useState } from 'react';
import { Link } from 'react-router-dom';
import { get } from '../lib/api.js';
import { useAsync, useDebounced, useTitle } from '../lib/hooks.js';
import { CROPS } from '../lib/format.js';
import PageHead from '../components/PageHead.jsx';
import { Empty, ErrorState, Loading, Pagination } from '../components/ui.jsx';

export default function Knowledge() {
  useTitle('病虫害防控知识库');
  const [crop, setCrop] = useState('');
  const [q, setQ] = useState('');
  const [page, setPage] = useState(1);
  const dq = useDebounced(q);
  const { data, loading, error, reload } = useAsync(
    () => get('/knowledge', { crop, q: dq, page, pageSize: 8 }),
    [crop, dq, page],
  );

  return (
    <>
      <PageHead
        items={[{ label: '首页', to: '/' }, { label: '防控知识库' }]}
        title="病虫害防控知识库"
        desc="内容按作物与病害类型整理，每篇标注资料来源与审核信息。适用条件写在前面，药剂使用一律指向当地植保部门意见与农药登记标签。"
      />

      <section className="section" style={{ paddingTop: 36 }}>
        <div className="container">
          <div className="filter-bar" style={{ marginBottom: 34 }}>
            <input
              className="input filter-bar__grow"
              placeholder="搜索病害名称或症状，例如「同心轮纹」"
              value={q}
              onChange={(e) => { setQ(e.target.value); setPage(1); }}
              aria-label="搜索知识库"
            />
            <span className="small muted">作物</span>
            <div className="filter-tabs" role="group" aria-label="按作物筛选">
              <button type="button" aria-pressed={crop === ''} onClick={() => { setCrop(''); setPage(1); }}>全部</button>
              {CROPS.map((c) => (
                <button key={c} type="button" aria-pressed={crop === c} onClick={() => { setCrop(c); setPage(1); }}>{c}</button>
              ))}
            </div>
          </div>

          {loading && <Loading rows={5} height={96} />}
          {error && <ErrorState error={error} onRetry={reload} />}
          {!loading && !error && (data?.items || []).length === 0 && (
            <Empty title="没有匹配的文章" desc="换个关键词，或选择其他作物试试。" />
          )}

          {!loading && !error && (data?.items || []).length > 0 && (
            <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr)', gap: 0, borderTop: '1px solid var(--line-strong)' }}>
              {data.items.map((a, i) => (
                <Link key={a.id} to={`/knowledge/${a.slug}`} className="kb-row">
                  <span className="kb-row__idx" style={{ fontFamily: 'var(--font-serif)', color: 'var(--wheat)', fontSize: 14 }}>
                    {String((page - 1) * 8 + i + 1).padStart(2, '0')}
                  </span>
                  <span className="small" style={{ color: 'var(--olive)' }}>{a.crop} · {a.category}</span>
                  <span>
                    <span style={{ display: 'block', fontFamily: 'var(--font-serif)', fontSize: 21, lineHeight: 1.45, marginBottom: 8 }}>{a.title}</span>
                    <span className="small muted" style={{ lineHeight: 1.85 }}>{a.summary}</span>
                  </span>
                  <span className="small muted kb-row__source" style={{ textAlign: 'right', lineHeight: 1.8 }}>
                    来源<br />{a.source_name?.replace(/（.*?）/, '') || '平台编辑整理'}
                  </span>
                </Link>
              ))}
            </div>
          )}

          <Pagination page={page} totalPages={data?.totalPages} total={data?.total} onChange={setPage} />
        </div>
      </section>
    </>
  );
}
