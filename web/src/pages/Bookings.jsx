import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { get } from '../lib/api.js';
import { useAsync, useTitle } from '../lib/hooks.js';
import { useRealtimeEvent } from '../lib/realtime.jsx';
import PageHead from '../components/PageHead.jsx';
import { Empty, ErrorState, Loading, StatusTag, Tabs } from '../components/ui.jsx';
import { date, num, statusText, statusTone } from '../lib/format.js';

const TABS = [
  { value: 'all', label: '全部' },
  { value: 'pending', label: '待确认' },
  { value: 'confirmed', label: '已确认' },
  { value: 'in_progress', label: '作业中' },
  { value: 'completed', label: '已完成' },
  { value: 'cancelled', label: '已取消' },
];

export default function Bookings() {
  useTitle('我的预约');
  const [tab, setTab] = useState('all');
  const { data, loading, error, reload } = useAsync(() => get('/machinery/bookings/mine'), []);

  useRealtimeEvent('booking', useCallback(() => reload(), [reload]));

  const items = (data?.items || []).filter((b) => (tab === 'all' ? true : tab === 'cancelled' ? ['cancelled', 'rejected'].includes(b.status) : b.status === tab));

  return (
    <>
      <PageHead
        items={[{ label: '首页', to: '/' }, { label: '农机服务', to: '/machinery' }, { label: '我的预约' }]}
        title="我的预约"
        desc="预约状态与机手操作实时同步。作业完成后可对本次服务评价。"
        actions={<Link to="/machinery" className="btn btn--ghost btn--sm">继续找设备</Link>}
      />

      <section className="section" style={{ paddingTop: 24 }}>
        <div className="container">
          <Tabs tabs={TABS.map((t) => ({ ...t, count: t.value === 'all' ? data?.items?.length : (data?.items || []).filter((b) => t.value === 'cancelled' ? ['cancelled', 'rejected'].includes(b.status) : b.status === t.value).length }))} value={tab} onChange={setTab} ariaLabel="预约状态" />

          <div className="mt-24">
            {loading && <Loading rows={3} height={96} />}
            {error && <ErrorState error={error} onRetry={reload} />}
            {!loading && !error && items.length === 0 && (
              <Empty title="暂无预约记录" desc="选择一台设备并提交预约后，记录会出现在这里。" action={<Link to="/machinery" className="btn btn--primary btn--sm">查找农机</Link>} />
            )}

            {!loading && !error && items.length > 0 && (
              <div style={{ borderTop: '1px solid var(--line-strong)' }}>
                {items.map((b) => (
                  <Link key={b.id} to={`/bookings/${b.id}`} style={{ display: 'grid', gridTemplateColumns: '1fr 190px 140px', gap: 20, padding: '20px 4px', borderBottom: '1px solid var(--line)', alignItems: 'center' }}>
                    <div>
                      <div className="row gap-8" style={{ marginBottom: 6 }}>
                        <span className="tag tag--muted">{b.machinery_type}</span>
                        <StatusTag status={b.status} text={statusText(b.status)} tone={statusTone(b.status)} />
                        {b.my_rating && <span className="tag tag--wheat">已评价 {b.my_rating} 星</span>}
                      </div>
                      <div style={{ fontSize: 16, marginBottom: 4 }}>{b.machinery_name}</div>
                      <div className="small muted">
                        预约号 {b.order_no} · 机手 {b.merchant_name}
                      </div>
                    </div>
                    <div className="small">
                      <div>{date(b.date)}</div>
                      <div className="muted">{String(b.start_hour).padStart(2, '0')}:00 - {String(b.end_hour).padStart(2, '0')}:00</div>
                    </div>
                    <div style={{ textAlign: 'right' }}>
                      <div style={{ fontFamily: 'var(--font-serif)', fontSize: 18 }}>¥{num(b.fee, 2)}</div>
                      <div className="small muted">查看详情 →</div>
                    </div>
                  </Link>
                ))}
              </div>
            )}
          </div>
        </div>
      </section>
    </>
  );
}
