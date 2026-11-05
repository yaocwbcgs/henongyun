import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { get, post } from '../lib/api.js';
import { useAsync, useTitle } from '../lib/hooks.js';
import { useToast } from '../lib/toast.jsx';
import { useRealtimeEvent } from '../lib/realtime.jsx';
import PageHead from '../components/PageHead.jsx';
import { StatusTag, Spinner, Modal, Loading, ErrorState, Empty } from '../components/ui.jsx';
import { CROP_LABEL, dateTime, statusText, statusTone } from '../lib/format.js';

const STEPS = ['提交任务', '图像检查', '模型识别', '防控建议'];

export default function DiagnoseResult() {
  const { id } = useParams();
  const navigate = useNavigate();
  const toast = useToast();
  const [polling, setPolling] = useState(false);
  const tries = useRef(0);
  const { data, loading, error, reload } = useAsync(() => get(`/diagnoses/${id}`), [id]);
  const [advisoryOpen, setAdvisoryOpen] = useState(false);
  const [subject, setSubject] = useState('');
  const [content, setContent] = useState('');
  const [sending, setSending] = useState(false);
  const [retrying, setRetrying] = useState(false);

  const d = data?.diagnosis;
  const status = d?.status;
  useTitle(d ? `${d.cropLabel}识别结果` : '识别结果');

  useEffect(() => {
    if (!d) return;
    setSubject(`${d.cropLabel}识别结果复核`);
    setContent(`识别记录 #${d.id}，作物：${d.cropLabel}。症状描述：${d.symptoms || '（未填写）'}。请协助判断并给出本地适用建议。`);
  }, [d?.id, d?.cropLabel]);

  useRealtimeEvent('diagnosis', useCallback((payload) => {
    if (payload?.id === Number(id)) reload();
  }, [id, reload]));

  useEffect(() => {
    if (!status || !['queued', 'processing'].includes(status)) {
      setPolling(false);
      return undefined;
    }
    setPolling(true);
    const timer = setInterval(() => {
      tries.current += 1;
      if (tries.current > 24) {
        clearInterval(timer);
        setPolling(false);
        return;
      }
      reload();
    }, 2500);
    return () => clearInterval(timer);
  }, [status, reload]);

  const retry = async () => {
    setRetrying(true);
    try {
      await post(`/diagnoses/${id}/retry`);
      tries.current = 0;
      toast.ok('已重新提交识别');
      reload();
    } catch (err) {
      toast.error(err.message || '重试失败');
    } finally {
      setRetrying(false);
    }
  };

  const submitAdvisory = async () => {
    if (subject.trim().length < 4) return toast.error('请填写至少 4 个字的主题');
    if (content.trim().length < 10) return toast.error('请补充至少 10 个字的田间情况');
    setSending(true);
    try {
      await post(`/diagnoses/${id}/advisory`, { subject: subject.trim(), content: content.trim() });
      toast.ok('农技咨询已提交，农技人员受理后会通知你');
      setAdvisoryOpen(false);
      reload();
    } catch (err) {
      toast.error(err.message || '提交失败');
    } finally {
      setSending(false);
    }
  };

  if (loading && !d) {
    return <div className="container" style={{ padding: '60px 32px' }}><Loading rows={4} /></div>;
  }
  if (error) {
    return (
      <div className="container" style={{ padding: '60px 32px' }}>
        <ErrorState error={error} onRetry={reload} />
      </div>
    );
  }

  const result = d?.result;
  const candidates = result?.candidates || [];
  const top = candidates[0];
  const processing = ['queued', 'processing'].includes(status);
  const stepIndex = processing ? (status === 'queued' ? 0 : 2) : 3;

  return (
    <>
      <PageHead
        items={[{ label: '首页', to: '/' }, { label: '病虫害识别', to: '/diagnose' }, { label: `记录 #${id}` }]}
        title="识别结果"
        desc="结果来自识别服务模型，包含模型输出概率与典型症状说明。概率不代表田块发病率，也不能替代田间诊断。"
        actions={
          <>
            <Link to="/diagnose" className="btn btn--ghost btn--sm">再识别一张</Link>
            <button type="button" className="btn btn--primary btn--sm" onClick={() => setAdvisoryOpen(true)}>提交农技咨询</button>
          </>
        }
      />

      <section className="section" style={{ paddingTop: 32 }}>
        <div className="container">
          <div className="steps">
            {STEPS.map((s, i) => (
              <div key={s} className={`step ${i < stepIndex ? 'is-done' : ''} ${i === stepIndex ? 'is-current' : ''}`}>{s}</div>
            ))}
          </div>

          <div className="result-hero">
            <div>
              <figure className="result-img">
                {d.imageUrl ? <img src={d.imageUrl} alt={`${d.cropLabel}待识别图片`} /> : <div style={{ height: 260, display: 'grid', placeItems: 'center', color: '#8a9088' }}>图片不可用</div>}
              </figure>
              <div className="row between mt-16" style={{ flexWrap: 'wrap', gap: 10 }}>
                <StatusTag status={status} text={statusText(status)} tone={statusTone(status)} />
                <span className="small muted">提交于 {dateTime(d.createdAt)}</span>
              </div>
              {d.quality && (
                <div className="panel" style={{ marginTop: 16, padding: 18 }}>
                  <div className="row between" style={{ marginBottom: 8 }}>
                    <span className="eyebrow">图像检查</span>
                    <span className="small muted">{d.quality.acceptable ? '通过' : '存在风险'}</span>
                  </div>
                  <div className="info-list">
                    <div className="info-list__row"><dt>分辨率</dt><dd>{d.quality.width} × {d.quality.height} px</dd></div>
                    <div className="info-list__row"><dt>亮度均值</dt><dd>{d.quality.meanBrightness}</dd></div>
                    <div className="info-list__row"><dt>对比度</dt><dd>{d.quality.contrast}</dd></div>
                    <div className="info-list__row"><dt>清晰度</dt><dd>{d.quality.sharpnessScore}</dd></div>
                  </div>
                  {d.quality.issues?.length > 0 && (
                    <div className="notice notice--warn" style={{ marginTop: 12 }}>
                      <div className="small">{d.quality.issues.join('；')}</div>
                    </div>
                  )}
                  <p className="field__hint mt-8">以上指标由服务端对图片实际像素计算得出，仅用于判断拍摄质量。</p>
                </div>
              )}
            </div>

            <div>
              <div className="row between" style={{ alignItems: 'flex-start', gap: 16 }}>
                <div>
                  <div className="eyebrow eyebrow--olive">作物 · {d.cropLabel}</div>
                  <h2 className="h2" style={{ marginTop: 8 }}>
                    {processing ? '正在处理这张照片' : status === 'failed' ? '这次没有完成识别' : top ? top.name : result?.isHealthy ? '未发现明显病害特征' : '未识别到明确病害'}
                  </h2>
                </div>
                {top?.probability != null && (
                  <div style={{ textAlign: 'right', flexShrink: 0 }}>
                    <div className="small muted">模型输出概率</div>
                    <div style={{ fontFamily: 'var(--font-serif)', fontSize: 26 }}>{(top.probability * 100).toFixed(1)}%</div>
                  </div>
                )}
              </div>

              {processing && (
                <div className="panel mt-24" style={{ background: 'var(--paper-soft)' }}>
                  <div className="row gap-12"><Spinner /> <span>正在{status === 'queued' ? '排队' : '调用识别服务'}…</span></div>
                  <p className="small muted mt-8">
                    通常需要几秒到半分钟。可以留在本页，结果生成后会自动更新；也可以离开，稍后从「我的识别记录」查看。
                  </p>
                  {!polling && <p className="small" style={{ color: 'var(--wheat)', marginTop: 8 }}>轮询已暂停，可手动刷新。</p>}
                  <button type="button" className="btn btn--ghost btn--sm mt-16" onClick={reload}>刷新状态</button>
                </div>
              )}

              {status === 'failed' && (
                <div className="notice notice--danger mt-24">
                  <div>
                    <div className="notice__title">失败原因</div>
                    <div>{d.failureReason || '识别服务没有返回有效结果'}</div>
                    <div className="row gap-8 mt-16" style={{ flexWrap: 'wrap' }}>
                      <button type="button" className="btn btn--ghost btn--sm" onClick={retry} disabled={retrying}>
                        {retrying ? <><Spinner /> 重试中</> : '重试识别'}
                      </button>
                      <button type="button" className="btn btn--primary btn--sm" onClick={() => setAdvisoryOpen(true)}>转人工复核</button>
                      <Link to="/diagnose" className="btn btn--quiet btn--sm">换一张照片</Link>
                    </div>
                  </div>
                </div>
              )}

              {(status === 'needs_review' || result?.uncertain) && !processing && status !== 'failed' && (
                <div className="notice notice--warn mt-24">
                  <div>
                    <div className="notice__title">识别结果不够确定</div>
                    <div className="small">
                      照片质量、病害早期特征不明显，或候选结果之间差距较小，都可能出现这种情况。建议补拍叶背与整株照片后重新识别，或提交农技咨询由人工判断。
                    </div>
                    <button type="button" className="btn btn--ghost btn--sm mt-16" onClick={() => setAdvisoryOpen(true)}>提交农技咨询</button>
                  </div>
                </div>
              )}

              {!processing && status !== 'failed' && (
                <>
                  {result?.isPlant === false && (
                    <div className="notice notice--warn mt-24">
                      <div className="small">识别服务未在图片中确认到明确的植物主体。请确认照片是否为作物叶片或果实，并重新拍摄。</div>
                    </div>
                  )}

                  {candidates.length > 0 && (
                    <div className="mt-24">
                      <div className="row between" style={{ marginBottom: 6 }}>
                        <span className="eyebrow">候选病害</span>
                        <span className="small muted">按模型概率排序</span>
                      </div>
                      {candidates.map((c, i) => (
                        <div key={`${c.name}-${i}`} className="candidate">
                          <div className="candidate__head">
                            <span className="candidate__name">{c.name}</span>
                            <span className="candidate__prob">{c.probability != null ? `${(c.probability * 100).toFixed(1)}%` : '未提供概率'}</span>
                          </div>
                          {c.probability != null && (
                            <div className="prob-bar" aria-hidden="true"><span style={{ width: `${Math.min(100, c.probability * 100)}%` }} /></div>
                          )}
                          {c.description && (
                            <p className="small" style={{ marginTop: 10, color: 'var(--ink-soft)', lineHeight: 1.85 }}>
                              {String(c.description).slice(0, 260)}{String(c.description).length > 260 ? '…' : ''}
                            </p>
                          )}
                        </div>
                      ))}
                      <p className="field__hint mt-8">
                        概率为识别服务模型输出，不是田块发病率，也不代表结论一定成立。候选排序接近时请优先人工复核。
                      </p>
                    </div>
                  )}

                  {!candidates.length && result?.isHealthy && (
                    <p className="prose mt-16">
                      识别服务未检测到明显病害特征。仍需结合田间观察：如果叶片已出现扩展性病斑，建议补拍局部特写后再次识别。
                    </p>
                  )}

                  {top?.treatment && (
                    <div className="mt-32">
                      <div className="eyebrow" style={{ marginBottom: 12 }}>处理步骤（来自识别服务）</div>
                      <div className="stack gap-16">
                        {[
                          ['农业与物理措施', top.treatment.prevention],
                          ['生物防治', top.treatment.biological],
                          ['化学防治参考', top.treatment.chemical],
                        ].map(([label, list]) =>
                          Array.isArray(list) && list.length ? (
                            <div key={label} className="panel" style={{ padding: 18 }}>
                              <div style={{ fontSize: 13.5, fontWeight: 500, marginBottom: 6 }}>{label}</div>
                              <ul style={{ margin: 0, paddingLeft: 18, listStyle: 'disc' }} className="small">
                                {list.slice(0, 5).map((item, i) => (
                                  <li key={i} style={{ marginBottom: 4, lineHeight: 1.8 }}>{String(item)}</li>
                                ))}
                              </ul>
                            </div>
                          ) : null,
                        )}
                      </div>
                      <div className="notice notice--warn mt-16">
                        <div className="small">
                          上述内容为识别服务返回的通用建议，未经本地登记核对。具体药剂品种、用量与安全间隔期，必须以<strong>当地植保部门意见</strong>和<strong>农药登记标签</strong>为准，平台不提供配比。
                        </div>
                      </div>
                    </div>
                  )}

                  {candidates.length > 1 && (
                    <div className="mt-24">
                      <div className="eyebrow" style={{ marginBottom: 8 }}>相似病害提示</div>
                      <p className="small" style={{ lineHeight: 1.9, color: 'var(--ink-soft)' }}>
                        需要与 {candidates.slice(1, 3).map((c) => c.name).join('、')} 区分。若病斑形态与描述不符，建议补拍叶背、茎部与整株照片，或提交农技咨询。
                      </p>
                    </div>
                  )}

                  <div className="mt-32" style={{ borderTop: '1px solid var(--line)', paddingTop: 18 }}>
                    <div className="row between" style={{ flexWrap: 'wrap', gap: 10 }}>
                      <div className="small muted">
                        识别来源：{result?.source || '识别服务'} {result?.modelVersion ? `· 模型 ${result.modelVersion}` : ''} · 返回于 {result?.fetchedAt ? dateTime(result.fetchedAt.slice(0, 19).replace('T', ' ')) : '—'}
                      </div>
                      <Link to={`/knowledge?crop=${encodeURIComponent(d.cropLabel)}`} className="btn btn--quiet btn--sm">查看{d.cropLabel}防控资料 →</Link>
                    </div>
                    <p className="field__hint mt-8">{result?.rawScoreNote}</p>
                  </div>
                </>
              )}

              {data?.advisory && (
                <div className="panel mt-24" style={{ background: 'var(--moss-soft)' }}>
                  <div className="row between" style={{ marginBottom: 8 }}>
                    <span className="eyebrow eyebrow--olive">农技咨询</span>
                    <StatusTag status={data.advisory.status} text={statusText(data.advisory.status)} tone={statusTone(data.advisory.status)} />
                  </div>
                  {data.advisory.reply ? (
                    <>
                      <p className="small" style={{ whiteSpace: 'pre-wrap', lineHeight: 1.9 }}>{data.advisory.reply}</p>
                      <div className="field__hint mt-8">回复于 {dateTime(data.advisory.replied_at)}</div>
                    </>
                  ) : (
                    <p className="small">工单已提交，农技人员受理后会通过站内消息通知你。可在「用户中心 · 农技咨询」查看进度。</p>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      </section>

      <Modal
        open={advisoryOpen}
        onClose={() => setAdvisoryOpen(false)}
        title="提交农技咨询"
        footer={
          <>
            <button type="button" className="btn btn--ghost btn--sm" onClick={() => setAdvisoryOpen(false)}>取消</button>
            <button type="button" className="btn btn--primary btn--sm" onClick={submitAdvisory} disabled={sending}>
              {sending ? <><Spinner /> 提交中</> : '提交工单'}
            </button>
          </>
        }
      >
        <div className="stack gap-16">
          <div className="notice notice--plain">
            <div className="small">
              工单会关联本次识别记录与照片，农技人员可查看原始信息。请补充田间实际情况，便于判断。
            </div>
          </div>
          <label className="field">
            <span className="field__label">主题<span className="req">*</span></span>
            <input className="input" value={subject} onChange={(e) => setSubject(e.target.value)} maxLength={80} />
          </label>
          <label className="field">
            <span className="field__label">田间情况<span className="req">*</span></span>
            <textarea className="textarea" value={content} onChange={(e) => setContent(e.target.value)} maxLength={1000} style={{ minHeight: 140 }} />
            <span className="field__hint">包括发病面积、植株比例、近期用药与天气情况。{content.length}/1000</span>
          </label>
        </div>
      </Modal>
    </>
  );
}
