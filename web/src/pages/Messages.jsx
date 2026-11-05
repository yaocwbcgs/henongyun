import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { get, post } from '../lib/api.js';
import { useAsync, useTitle } from '../lib/hooks.js';
import { useAuth } from '../lib/auth.jsx';
import { useToast } from '../lib/toast.jsx';
import { useRealtime, useRealtimeEvent } from '../lib/realtime.jsx';
import PageHead from '../components/PageHead.jsx';
import { Empty, ErrorState, Loading, Spinner, Tabs, Avatar } from '../components/ui.jsx';
import { dateTime, relative } from '../lib/format.js';

export default function Messages() {
  useTitle('消息中心');
  const { user } = useAuth();
  const toast = useToast();
  const { counts } = useRealtime();
  const [params, setParams] = useSearchParams();
  const [tab, setTab] = useState('messages');
  const [activeId, setActiveId] = useState(params.get('conversation') ? Number(params.get('conversation')) : null);
  const [thread, setThread] = useState(null);
  const [threadLoading, setThreadLoading] = useState(false);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const bottomRef = useRef(null);

  const convs = useAsync(() => (user ? get('/conversations') : Promise.resolve({ items: [] })), [user?.id]);
  const notifs = useAsync(() => (user ? get('/notifications', { pageSize: 30 }) : Promise.resolve({ items: [] })), [user?.id]);

  const loadThread = useCallback(async (id) => {
    if (!id) return;
    setThreadLoading(true);
    try {
      const r = await get(`/conversations/${id}/messages`, { pageSize: 60 });
      setThread(r);
      await post(`/conversations/${id}/read`);
      convs.reload();
    } catch (err) {
      toast.error(err.message || '会话加载失败');
      setThread(null);
    } finally {
      setThreadLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    if (activeId) {
      loadThread(activeId);
      const next = new URLSearchParams(params);
      next.set('conversation', String(activeId));
      setParams(next, { replace: true });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeId]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [thread?.items?.length]);

  useRealtimeEvent('message', useCallback((payload) => {
    convs.reload();
    if (payload?.conversationId === activeId && payload.message) {
      setThread((t) => (t ? { ...t, items: [...t.items, { ...payload.message, mine: payload.message.senderId === user?.id }] } : t));
      if (!payload.message.mine) post(`/conversations/${activeId}/read`).catch(() => {});
    }
  }, [activeId, convs, user?.id]));

  useRealtimeEvent('notification', useCallback(() => notifs.reload(), [notifs]));

  const send = async () => {
    const body = input.trim();
    if (!body || !activeId) return;
    setSending(true);
    try {
      const r = await post(`/conversations/${activeId}/messages`, { body });
      setInput('');
      setThread((t) => (t ? { ...t, items: [...t.items, { ...r.message, mine: true }] } : t));
      convs.reload();
    } catch (err) {
      toast.error(err.message || '发送失败');
    } finally {
      setSending(false);
    }
  };

  const markAll = async () => {
    await post('/notifications/read-all');
    notifs.reload();
    toast.ok('已全部标记为已读');
  };

  if (!user) {
    return (
      <>
        <PageHead items={[{ label: '首页', to: '/' }, { label: '消息中心' }]} title="消息中心" />
        <div className="container section">
          <Empty title="登录后查看消息" desc="询价、报价与系统通知都会保存在服务端，换设备登录后仍可查看。" action={<Link to="/login?redirect=/messages" className="btn btn--primary btn--sm">去登录</Link>} />
        </div>
      </>
    );
  }

  const active = (convs.data?.items || []).find((c) => c.id === activeId);

  return (
    <>
      <PageHead
        items={[{ label: '首页', to: '/' }, { label: '消息中心' }]}
        title="消息中心"
        desc="询价、报价与订单沟通都保存在站内会话中；系统通知包含审核结果、预约与订单状态变化。"
        actions={tab === 'notifications' ? <button type="button" className="btn btn--ghost btn--sm" onClick={markAll}>全部标为已读</button> : null}
      />

      <section className="section" style={{ paddingTop: 24 }}>
        <div className="container">
          <Tabs
            tabs={[
              { value: 'messages', label: '站内消息', count: counts.messages },
              { value: 'notifications', label: '系统通知', count: counts.notifications },
            ]}
            value={tab}
            onChange={setTab}
            ariaLabel="消息分类"
          />

          {tab === 'messages' && (
            <div className="msg-layout mt-16">
              <div className="msg-list">
                {convs.loading && <div style={{ padding: 16 }}><Loading rows={3} height={52} /></div>}
                {!convs.loading && (convs.data?.items || []).length === 0 && (
                  <div style={{ padding: 20 }}><p className="small muted">还没有会话。在供需详情页点击「发起询价」即可开始沟通。</p></div>
                )}
                {(convs.data?.items || []).map((c) => (
                  <button key={c.id} type="button" className={`msg-list__item ${activeId === c.id ? 'is-active' : ''}`} onClick={() => setActiveId(c.id)}>
                    <div className="msg-list__top">
                      <span className="msg-list__name">{c.other.name}</span>
                      <span className="msg-list__time">{relative(c.lastAt)}</span>
                    </div>
                    <div className="row between gap-8">
                      <span className="msg-list__preview">{c.lastMessage || '（暂无消息）'}</span>
                      {c.unread > 0 && <span className="msg-list__unread">{c.unread}</span>}
                    </div>
                    <div className="small muted" style={{ marginTop: 3, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {c.postTitle ? `关联：${c.postTitle}` : '直接会话'}
                    </div>
                  </button>
                ))}
              </div>

              <div className="msg-thread">
                {!activeId && (
                  <div style={{ flex: 1, display: 'grid', placeItems: 'center' }}>
                    <div style={{ textAlign: 'center' }}>
                      <div className="empty__title">选择一个会话</div>
                      <p className="small muted">消息会实时推送，并保存在服务端。</p>
                    </div>
                  </div>
                )}
                {activeId && (
                  <>
                    <div className="msg-thread__head">
                      <div className="row gap-8">
                        <Avatar name={active?.other?.name} />
                        <div>
                          <div style={{ fontSize: 14 }}>{active?.other?.name || '会话'}</div>
                          <div className="small muted">{active?.postTitle || '直接会话'}</div>
                        </div>
                      </div>
                      {active?.postId && <Link to={`/trade/${active.postId}`} className="btn btn--quiet btn--sm">查看关联信息 →</Link>}
                    </div>

                    <div className="msg-thread__body">
                      {threadLoading && <div className="small muted">正在加载消息…</div>}
                      {!threadLoading && thread?.items?.length === 0 && <p className="small muted">还没有消息，发送第一条吧。</p>}
                      {(thread?.items || []).map((m) => (
                        <div key={m.id} className={`bubble ${m.mine ? 'bubble--mine' : ''}`}>
                          {m.body}
                          <span className="bubble__time">{dateTime(m.createdAt)}</span>
                        </div>
                      ))}
                      <div ref={bottomRef} />
                    </div>

                    <div className="msg-thread__composer">
                      <textarea
                        className="textarea"
                        style={{ minHeight: 46, height: 46, resize: 'none', paddingTop: 11 }}
                        value={input}
                        onChange={(e) => setInput(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' && !e.shiftKey) {
                            e.preventDefault();
                            send();
                          }
                        }}
                        placeholder="输入消息，Enter 发送，Shift + Enter 换行"
                        maxLength={1000}
                        aria-label="输入消息"
                      />
                      <button type="button" className="btn btn--primary" onClick={send} disabled={sending || !input.trim()}>
                        {sending ? <Spinner /> : '发送'}
                      </button>
                    </div>
                  </>
                )}
              </div>
            </div>
          )}

          {tab === 'notifications' && (
            <div className="mt-16">
              {notifs.loading && <Loading rows={4} height={70} />}
              {notifs.error && <ErrorState error={notifs.error} onRetry={notifs.reload} />}
              {!notifs.loading && (notifs.data?.items || []).length === 0 && <Empty title="暂无系统通知" desc="审核结果、订单与预约状态变化会在这里通知你。" />}
              <div style={{ borderTop: '1px solid var(--line-strong)' }}>
                {(notifs.data?.items || []).map((n) => (
                  <div key={n.id} style={{ padding: '16px 4px', borderBottom: '1px solid var(--line)', background: n.read_at ? 'transparent' : 'rgba(220,229,204,0.22)' }}>
                    <div className="row between" style={{ alignItems: 'flex-start', gap: 16 }}>
                      <div>
                        <div className="row gap-8" style={{ marginBottom: 4 }}>
                          {!n.read_at && <span className="status-dot status-dot--warn" />}
                          <span style={{ fontSize: 14.5, fontWeight: n.read_at ? 400 : 500 }}>{n.title}</span>
                        </div>
                        <div className="small muted" style={{ lineHeight: 1.8 }}>{n.body}</div>
                      </div>
                      <div className="row gap-8" style={{ flexShrink: 0 }}>
                        {n.link && <Link to={n.link} className="btn btn--quiet btn--sm" onClick={() => post(`/notifications/${n.id}/read`).then(() => notifs.reload()).catch(() => {})}>查看</Link>}
                        {!n.read_at && (
                          <button type="button" className="btn btn--quiet btn--sm" onClick={() => post(`/notifications/${n.id}/read`).then(() => notifs.reload())}>标为已读</button>
                        )}
                      </div>
                    </div>
                    <div className="field__hint mt-8">{dateTime(n.created_at)}</div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </section>
    </>
  );
}
