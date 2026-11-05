import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { get, post } from '../lib/api.js';
import { useAsync, useTitle } from '../lib/hooks.js';
import { useAuth } from '../lib/auth.jsx';
import { useToast } from '../lib/toast.jsx';
import PageHead from '../components/PageHead.jsx';
import ServiceBar from '../components/ServiceBar.jsx';
import ImageUploader from '../components/ImageUploader.jsx';
import { CROP_OPTIONS, dateTime, statusText } from '../lib/format.js';
import { StatusTag, Spinner, Empty } from '../components/ui.jsx';

export default function Diagnose() {
  useTitle('病虫害识别');
  const { user } = useAuth();
  const navigate = useNavigate();
  const toast = useToast();
  const meta = useAsync(() => get('/diagnoses/meta'), []);
  const history = useAsync(() => (user ? get('/diagnoses', { pageSize: 5 }) : Promise.resolve({ items: [] })), [user?.id]);
  const [images, setImages] = useState([]);
  const [crop, setCrop] = useState('tomato');
  const [stage, setStage] = useState('');
  const [symptoms, setSymptoms] = useState('');
  const [busy, setBusy] = useState(false);
  const [formError, setFormError] = useState('');

  useEffect(() => {
    if (!user) return;
    if (history.data) return;
  }, [user, history.data]);

  const quality = images[0]?.quality;

  const submit = async () => {
    setFormError('');
    if (!user) {
      navigate('/login?redirect=/diagnose');
      return;
    }
    if (!images.length) {
      setFormError('请先上传一张作物照片');
      return;
    }
    if (symptoms && symptoms.trim().length > 0 && symptoms.trim().length < 6) {
      setFormError('症状描述太短，至少写 6 个字，或留空');
      return;
    }
    setBusy(true);
    try {
      const data = await post('/diagnoses', {
        uploadId: images[0].id,
        crop,
        growthStage: stage || undefined,
        symptoms: symptoms.trim() || undefined,
      });
      toast.ok('识别任务已提交');
      navigate(`/diagnose/result/${data.diagnosis.id}`);
    } catch (err) {
      toast.error(err.message || '提交失败，请稍后重试');
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <PageHead
        items={[{ label: '首页', to: '/' }, { label: '病虫害识别' }]}
        title="病虫害识别与防控"
        desc="上传一张清晰的作物照片，补充作物与症状信息，提交识别任务。识别结果会标注来源与不确定情形，并给出可追溯的防控资料。"
      />
      <ServiceBar active="01" />

      <section className="section">
        <div className="container">
          <div className="grid12" style={{ alignItems: 'start' }}>
            <div style={{ gridColumn: 'span 7' }}>
              <div className="panel panel--white" style={{ padding: 30 }}>
                <div className="row between" style={{ marginBottom: 18 }}>
                  <h2 className="h3">提交识别任务</h2>
                  <span className="small muted">第一步 / 共三步</span>
                </div>

                <div className="stack gap-8" style={{ marginBottom: 22 }}>
                  <span className="field__label">作物照片<span className="req">*</span></span>
                  <ImageUploader
                    value={images}
                    onChange={setImages}
                    max={1}
                    single
                    purpose="diagnosis"
                    label="点击拍照或选择图片"
                    hint="对准病斑拍摄，保留叶片轮廓；自然光下效果更好。支持 JPG / PNG / WebP，不超过 8MB。"
                  />
                  {quality && (
                    <div className={`notice ${quality.acceptable ? '' : 'notice--warn'}`} style={{ marginTop: 6 }}>
                      <div>
                        <div className="notice__title">
                          {quality.acceptable ? '图像质量检查通过' : '图像质量可能影响判断'}
                        </div>
                        <div className="small">
                          {quality.width}×{quality.height}px · 亮度 {quality.meanBrightness} · 对比度 {quality.contrast} · 清晰度 {quality.sharpnessScore}
                          {quality.issues?.length ? `。${quality.issues.join('；')}` : ''}
                        </div>
                        {!quality.acceptable && <div className="small" style={{ marginTop: 4 }}>可以继续提交，但结果会标注需复核；也可以换一张更清晰的照片。</div>}
                      </div>
                    </div>
                  )}
                </div>

                <div className="form-grid">
                  <label className="field">
                    <span className="field__label">作物<span className="req">*</span></span>
                    <select className="select" value={crop} onChange={(e) => setCrop(e.target.value)}>
                      {CROP_OPTIONS.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
                    </select>
                  </label>
                  <label className="field">
                    <span className="field__label">生育期</span>
                    <select className="select" value={stage} onChange={(e) => setStage(e.target.value)}>
                      <option value="">未填写</option>
                      <option>苗期</option>
                      <option>营养生长期</option>
                      <option>开花坐果期</option>
                      <option>结果期</option>
                      <option>成熟期</option>
                    </select>
                  </label>
                  <label className="field span-2">
                    <span className="field__label">症状补充</span>
                    <textarea
                      className="textarea"
                      value={symptoms}
                      onChange={(e) => setSymptoms(e.target.value)}
                      maxLength={500}
                      placeholder="例如：下部叶片出现褐色圆斑，有同心轮纹，棚内湿度大时叶背有黑霉；已发生约 5 天，零星几株。"
                    />
                    <span className="field__hint">写清发病部位、病斑形态、发生时间与天气条件，有助于人工复核。{symptoms.length}/500</span>
                  </label>
                </div>

                {formError && <div className="notice notice--danger" style={{ marginTop: 16 }}>{formError}</div>}

                <div className="row between mt-24" style={{ gap: 16, flexWrap: 'wrap' }}>
                  <span className="small muted">提交后将创建一条可回看的识别记录</span>
                  <button type="button" className="btn btn--primary" onClick={submit} disabled={busy || !images.length}>
                    {busy ? <><Spinner /> 正在提交…</> : '提交识别'}
                  </button>
                </div>
              </div>

              <div className="panel" style={{ marginTop: 20, background: 'transparent' }}>
                <h3 className="h4" style={{ marginBottom: 10 }}>识别之后可以做什么</h3>
                <div className="grid12" style={{ gap: 16 }}>
                  {[
                    ['查看候选与依据', '候选病害、模型概率、典型症状与相似病害提示都会列在结果页。'],
                    ['转人工复核', '对结果不确定时，一键生成农技咨询工单，由农技人员受理回复。'],
                    ['查阅防控资料', '按作物进入知识库，查看适用条件与资料来源，不提供无出处的药剂配比。'],
                  ].map(([t, d]) => (
                    <div key={t} style={{ gridColumn: 'span 4' }}>
                      <div style={{ fontSize: 14, fontWeight: 500, marginBottom: 4 }}>{t}</div>
                      <div className="small muted" style={{ lineHeight: 1.8 }}>{d}</div>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            <aside style={{ gridColumn: 'span 5' }}>
              <div className="panel">
                <div className="row between">
                  <h3 className="h4">服务范围</h3>
                  <StatusTag status={meta.data?.configured ? '已接入' : '待接入'} tone={meta.data?.configured ? 'olive' : 'wheat'} text={meta.data?.configured ? '识别服务已接入' : '识别服务待接入'} />
                </div>
                <p className="small muted" style={{ marginTop: 10, lineHeight: 1.8 }}>{meta.data?.note || '正在读取识别服务状态…'}</p>
                <div className="stack gap-8 mt-16">
                  {(meta.data?.supportedCrops || CROP_OPTIONS.map((c) => ({ label: c.label, scope: '' }))).map((c) => (
                    <div key={c.label} className="row between" style={{ fontSize: 13.5, paddingBottom: 8, borderBottom: '1px solid var(--line-soft)' }}>
                      <span>{c.label}</span>
                      <span className="small muted" style={{ textAlign: 'right', maxWidth: 190 }}>{c.scope || '常规识别参考'}</span>
                    </div>
                  ))}
                </div>
                <p className="field__hint mt-16">
                  识别能力的实际覆盖范围由所接入的识别服务决定。平台不会宣称未经验证的准确率。
                </p>
              </div>

              <div className="panel" style={{ marginTop: 16 }}>
                <div className="row between" style={{ marginBottom: 12 }}>
                  <h3 className="h4">我的识别记录</h3>
                  <Link to="/me?tab=diagnoses" className="small" style={{ color: 'var(--olive)' }}>全部</Link>
                </div>
                {!user && <p className="small muted">登录后可查看历史识别记录。</p>}
                {user && history.loading && <div className="skeleton" style={{ height: 90 }} />}
                {user && !history.loading && (history.data?.items || []).length === 0 && (
                  <p className="small muted">还没有识别记录。上传第一张照片开始。</p>
                )}
                <div className="stack">
                  {(history.data?.items || []).map((d) => (
                    <Link key={d.id} to={`/diagnose/result/${d.id}`} className="row gap-12" style={{ padding: '10px 0', borderBottom: '1px solid var(--line-soft)' }}>
                      <div style={{ width: 46, height: 46, borderRadius: 4, overflow: 'hidden', background: 'var(--paper-deep)', flexShrink: 0 }}>
                        {d.imageUrl ? <img src={d.imageUrl} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : null}
                      </div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 13.5 }}>{d.cropLabel} · {d.top || statusText(d.status)}</div>
                        <div className="small muted">{dateTime(d.createdAt)}</div>
                      </div>
                      <span className="small muted">→</span>
                    </Link>
                  ))}
                </div>
              </div>

              <div className="notice notice--plain" style={{ marginTop: 16 }}>
                <div>
                  <div className="notice__title">拍摄建议</div>
                  <div className="small" style={{ lineHeight: 1.9 }}>
                    一张照片只拍一片叶子或一个果实，避免逆光和强烈阴影；病斑占画面 1/3 以上，必要时补拍叶背。
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
