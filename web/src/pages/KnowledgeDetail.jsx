import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { get, post } from '../lib/api.js';
import { useAsync, useTitle } from '../lib/hooks.js';
import { useAuth } from '../lib/auth.jsx';
import { useToast } from '../lib/toast.jsx';
import PageHead from '../components/PageHead.jsx';
import Markdown from '../components/Markdown.jsx';
import { ErrorState, Loading } from '../components/ui.jsx';
import { dateTime } from '../lib/format.js';

export default function KnowledgeDetail() {
  const { slug } = useParams();
  const { user } = useAuth();
  const toast = useToast();
  const { data, loading, error, reload } = useAsync(() => get(`/knowledge/${slug}`), [slug]);
  const [favorited, setFavorited] = useState(false);
  const [saving, setSaving] = useState(false);
  const a = data?.article;
  useTitle(a?.title);

  useEffect(() => {
    if (data) setFavorited(Boolean(data.favorited));
  }, [data?.article?.id, data?.favorited]);

  const toggleFavorite = async () => {
    if (!user) return toast.error('登录后可以收藏文章');
    setSaving(true);
    try {
      const r = await post('/users/me/favorites', { targetType: 'knowledge', targetId: a.id });
      setFavorited(r.favorited);
      toast.ok(r.favorited ? '已收藏' : '已取消收藏');
    } catch (err) {
      toast.error(err.message || '操作失败');
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <div className="container" style={{ padding: '60px 32px' }}><Loading rows={5} height={110} /></div>;
  if (error) return <div className="container" style={{ padding: '60px 32px' }}><ErrorState error={error} onRetry={reload} /></div>;
  if (!a) return null;

  return (
    <>
      <PageHead
        items={[{ label: '首页', to: '/' }, { label: '防控知识库', to: '/knowledge' }, { label: a.title }]}
        title={a.title}
        desc={a.summary}
        actions={
          <>
            <button type="button" className="btn btn--ghost btn--sm" onClick={toggleFavorite} disabled={saving}>
              {favorited ? '已收藏' : '收藏这篇文章'}
            </button>
            <Link to={`/diagnose`} className="btn btn--primary btn--sm">对照照片识别</Link>
          </>
        }
      />

      <section className="section" style={{ paddingTop: 36 }}>
        <div className="container">
          <div className="detail-grid">
            <article>
              <div className="row gap-12 wrap" style={{ marginBottom: 22 }}>
                <span className="tag tag--olive">{a.crop}</span>
                <span className="tag">{a.category}</span>
                <span className="small muted">审核于 {dateTime(a.reviewed_at)}</span>
              </div>

              <figure style={{ marginBottom: 28, borderRadius: 6, overflow: 'hidden', border: '1px solid var(--line)' }}>
                <img src="/images/knowledge.jpg" alt={`${a.crop}田间示意图`} style={{ width: '100%', aspectRatio: '16/7', objectFit: 'cover' }} />
              </figure>

              {a.symptoms && (
                <div className="panel" style={{ marginBottom: 26, background: 'var(--paper-soft)' }}>
                  <div className="eyebrow" style={{ marginBottom: 8 }}>典型症状</div>
                  <p className="small" style={{ lineHeight: 1.95 }}>{a.symptoms}</p>
                </div>
              )}
              {a.conditions && (
                <div className="panel" style={{ marginBottom: 26, background: 'transparent' }}>
                  <div className="eyebrow" style={{ marginBottom: 8 }}>易发条件</div>
                  <p className="small" style={{ lineHeight: 1.95 }}>{a.conditions}</p>
                </div>
              )}

              <Markdown content={a.content} />

              <div className="notice notice--warn" style={{ marginTop: 32 }}>
                <div>
                  <div className="notice__title">使用边界</div>
                  <div className="small">
                    本文用于识别与田间管理参考，不能替代实验室诊断或当地植保部门的防治意见。药剂品种、用量与安全间隔期以农药登记标签为准。
                  </div>
                </div>
              </div>
            </article>

            <aside>
              <div className="side-sticky">
                <div className="side-card">
                  <div className="side-card__title">资料来源</div>
                  <p className="small" style={{ lineHeight: 1.9 }}>{a.source_name}</p>
                  {a.source_url && (
                    <a href={a.source_url} target="_blank" rel="noreferrer" className="small" style={{ color: 'var(--olive)', textDecoration: 'underline', textUnderlineOffset: 3 }}>
                      查看来源网站 ↗
                    </a>
                  )}
                  <div className="rule" style={{ margin: '14px 0' }} />
                  <div className="info-list">
                    <div className="info-list__row"><dt>审核人</dt><dd>{a.reviewer_name || '农技编辑'}</dd></div>
                    <div className="info-list__row"><dt>审核时间</dt><dd>{dateTime(a.reviewed_at)}</dd></div>
                    <div className="info-list__row"><dt>状态</dt><dd>已发布</dd></div>
                  </div>
                </div>

                <div className="side-card">
                  <div className="side-card__title">相关文章</div>
                  {(data.related || []).length === 0 && <p className="small muted">暂无同作物文章。</p>}
                  <div className="stack">
                    {(data.related || []).map((r) => (
                      <Link key={r.id} to={`/knowledge/${r.slug}`} style={{ padding: '9px 0', borderBottom: '1px solid var(--line-soft)' }}>
                        <div style={{ fontSize: 13.5, lineHeight: 1.6 }}>{r.title}</div>
                        <div className="small muted">{r.crop}</div>
                      </Link>
                    ))}
                  </div>
                </div>

                <div className="side-card" style={{ background: 'var(--moss-soft)' }}>
                  <div className="side-card__title">需要更具体的建议？</div>
                  <p className="small" style={{ lineHeight: 1.85 }}>
                    把照片与田间情况提交给农技人员，工单会被受理并留下回复记录。
                  </p>
                  <Link to="/diagnose" className="btn btn--primary btn--sm mt-16" style={{ width: '100%' }}>上传照片并咨询</Link>
                </div>
              </div>
            </aside>
          </div>
        </div>
      </section>
    </>
  );
}
