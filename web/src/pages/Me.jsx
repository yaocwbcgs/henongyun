import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { del, get, patch, post, put } from '../lib/api.js';
import { useAsync, useTitle } from '../lib/hooks.js';
import { useAuth } from '../lib/auth.jsx';
import { useToast } from '../lib/toast.jsx';
import PageHead from '../components/PageHead.jsx';
import ImageUploader from '../components/ImageUploader.jsx';
import { Avatar, Empty, ErrorState, Loading, Modal, Spinner, StatusTag } from '../components/ui.jsx';
import { PROVINCES, date, dateTime, money, num, statusText, statusTone, CROP_LABEL } from '../lib/format.js';

const TABS = [
  { value: 'overview', label: '概览' },
  { value: 'profile', label: '账号资料' },
  { value: 'addresses', label: '收货地址' },
  { value: 'favorites', label: '我的收藏' },
  { value: 'diagnoses', label: '识别记录' },
  { value: 'posts', label: '我的发布' },
  { value: 'advisories', label: '农技咨询' },
  { value: 'security', label: '登录与安全' },
];

const ACCOUNT_LABEL = { user: '普通用户', merchant: '商家', agronomist: '农技人员', admin: '平台管理员' };

function AddressModal({ open, onClose, initial, onSaved }) {
  const toast = useToast();
  const [form, setForm] = useState(initial || { receiver: '', phone: '', province: '山东省', city: '', district: '', detail: '', isDefault: false });
  const [errors, setErrors] = useState({});
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (open) setForm(initial || { receiver: '', phone: '', province: '山东省', city: '', district: '', detail: '', isDefault: false });
  }, [open, initial]);

  const save = async () => {
    const e = {};
    if (form.receiver.trim().length < 2) e.receiver = '请填写收货人';
    if (!/^1[3-9]\d{9}$/.test(form.phone)) e.phone = '手机号格式不正确';
    if (form.city.trim().length < 2) e.city = '请填写城市';
    if (form.district.trim().length < 2) e.district = '请填写区县';
    if (form.detail.trim().length < 5) e.detail = '详细地址至少 5 个字';
    setErrors(e);
    if (Object.keys(e).length) return;
    setBusy(true);
    try {
      if (initial?.id) await put(`/users/me/addresses/${initial.id}`, form);
      else await post('/users/me/addresses', form);
      toast.ok('地址已保存');
      onSaved();
      onClose();
    } catch (err) {
      toast.error(err.message || '保存失败');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={initial?.id ? '编辑地址' : '新增地址'}
      footer={
        <>
          <button type="button" className="btn btn--ghost btn--sm" onClick={onClose}>取消</button>
          <button type="button" className="btn btn--primary btn--sm" onClick={save} disabled={busy}>{busy ? '保存中…' : '保存'}</button>
        </>
      }
    >
      <div className="form-grid">
        <label className="field">
          <span className="field__label">收货人<span className="req">*</span></span>
          <input className="input" value={form.receiver} onChange={(e) => setForm({ ...form, receiver: e.target.value })} />
          {errors.receiver && <span className="field__error">{errors.receiver}</span>}
        </label>
        <label className="field">
          <span className="field__label">手机号<span className="req">*</span></span>
          <input className="input" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
          {errors.phone && <span className="field__error">{errors.phone}</span>}
        </label>
        <label className="field">
          <span className="field__label">省份</span>
          <select className="select" value={form.province} onChange={(e) => setForm({ ...form, province: e.target.value })}>
            {PROVINCES.map((p) => <option key={p} value={p}>{p}</option>)}
          </select>
        </label>
        <label className="field">
          <span className="field__label">城市<span className="req">*</span></span>
          <input className="input" value={form.city} onChange={(e) => setForm({ ...form, city: e.target.value })} />
          {errors.city && <span className="field__error">{errors.city}</span>}
        </label>
        <label className="field">
          <span className="field__label">区 / 县<span className="req">*</span></span>
          <input className="input" value={form.district} onChange={(e) => setForm({ ...form, district: e.target.value })} />
          {errors.district && <span className="field__error">{errors.district}</span>}
        </label>
        <label className="field">
          <span className="field__label">详细地址<span className="req">*</span></span>
          <input className="input" value={form.detail} onChange={(e) => setForm({ ...form, detail: e.target.value })} />
          {errors.detail && <span className="field__error">{errors.detail}</span>}
        </label>
        <label className="check span-2">
          <input type="checkbox" checked={form.isDefault} onChange={(e) => setForm({ ...form, isDefault: e.target.checked })} />
          设为默认地址
        </label>
      </div>
    </Modal>
  );
}

export default function Me() {
  const { user, booting, refreshUser, setUser } = useAuth();
  const toast = useToast();
  const [params, setParams] = useSearchParams();
  const tab = params.get('tab') || 'overview';
  useTitle('用户中心');

  useEffect(() => {
    if (!booting && !user) window.location.replace('/login?redirect=/me');
  }, [user, booting]);

  const overview = useAsync(() => (user ? get('/users/me/overview') : Promise.resolve(null)), [user?.id]);
  const addresses = useAsync(() => (user ? get('/users/me/addresses') : Promise.resolve({ items: [] })), [user?.id]);
  const favorites = useAsync(() => (user && tab === 'favorites' ? get('/users/me/favorites') : Promise.resolve({ items: [] })), [user?.id, tab]);
  const diagnoses = useAsync(() => (user && tab === 'diagnoses' ? get('/diagnoses', { pageSize: 20 }) : Promise.resolve({ items: [] })), [user?.id, tab]);
  const posts = useAsync(() => (user && tab === 'posts' ? get('/posts/mine/list') : Promise.resolve({ items: [] })), [user?.id, tab]);
  const advisories = useAsync(() => (user && tab === 'advisories' ? get('/diagnoses/advisories/mine') : Promise.resolve({ items: [] })), [user?.id, tab]);

  const [profile, setProfile] = useState({ name: '', phone: '', region: '', bio: '' });
  const [avatar, setAvatar] = useState([]);
  const [saving, setSaving] = useState(false);
  const [addrOpen, setAddrOpen] = useState(false);
  const [editingAddr, setEditingAddr] = useState(null);
  const [pwd, setPwd] = useState({ currentPassword: '', newPassword: '', confirm: '' });
  const [reportOpen, setReportOpen] = useState(false);
  const [report, setReport] = useState({ targetType: 'other', reason: '', detail: '' });

  useEffect(() => {
    if (user) {
      setProfile({ name: user.name || '', phone: user.phone || '', region: user.region || '', bio: user.bio || '' });
      setAvatar(user.avatarUrl ? [{ id: 'current', url: user.avatarUrl, thumbUrl: user.avatarUrl }] : []);
    }
  }, [user?.id]);

  const saveProfile = async () => {
    setSaving(true);
    try {
      const avatarUpload = avatar[0] && avatar[0].id !== 'current' ? avatar[0].id : null;
      const r = await patch('/users/me', {
        name: profile.name.trim(),
        phone: profile.phone || null,
        region: profile.region || null,
        bio: profile.bio || null,
        avatarUploadId: avatarUpload,
      });
      setUser((u) => ({ ...u, ...r.user, avatarUrl: r.user.avatarUrl }));
      toast.ok('资料已更新');
      refreshUser();
    } catch (err) {
      toast.error(err.message || '保存失败');
    } finally {
      setSaving(false);
    }
  };

  const changePassword = async () => {
    if (pwd.newPassword !== pwd.confirm) return toast.error('两次输入的新密码不一致');
    setSaving(true);
    try {
      await post('/users/me/password', { currentPassword: pwd.currentPassword, newPassword: pwd.newPassword });
      toast.ok('密码已修改，其他设备会话已失效');
      setPwd({ currentPassword: '', newPassword: '', confirm: '' });
    } catch (err) {
      toast.error(err.message || '修改失败');
    } finally {
      setSaving(false);
    }
  };

  const removeFavorite = async (f) => {
    try {
      await post('/users/me/favorites', { targetType: f.type, targetId: f.target.id });
      toast.ok('已取消收藏');
      favorites.reload();
    } catch (err) {
      toast.error(err.message);
    }
  };

  const removeAddress = async (a) => {
    if (!window.confirm(`确定删除地址「${a.receiver} ${a.detail}」？`)) return;
    try {
      await del(`/users/me/addresses/${a.id}`);
      toast.ok('地址已删除');
      addresses.reload();
    } catch (err) {
      toast.error(err.message);
    }
  };

  const closePost = async (p) => {
    try {
      await post(`/posts/${p.id}/close`);
      toast.ok('已关闭该信息');
      posts.reload();
    } catch (err) {
      toast.error(err.message);
    }
  };

  const submitReport = async () => {
    if (report.reason.trim().length < 5) return toast.error('请说明问题');
    try {
      await post('/complaints', { targetType: report.targetType, reason: report.reason.trim(), detail: report.detail.trim() || undefined });
      toast.ok('投诉已提交');
      setReportOpen(false);
      setReport({ targetType: 'other', reason: '', detail: '' });
    } catch (err) {
      toast.error(err.message);
    }
  };

  if (booting || !user) return <div className="container" style={{ padding: '60px 32px' }}><Loading rows={3} /></div>;

  const setTab = (v) => {
    const next = new URLSearchParams(params);
    if (v === 'overview') next.delete('tab'); else next.set('tab', v);
    setParams(next);
  };

  return (
    <>
      <PageHead
        items={[{ label: '首页', to: '/' }, { label: '用户中心' }]}
        title={`你好，${user.name}`}
        desc={`${ACCOUNT_LABEL[user.role] || '用户'} · 注册于 ${date(user.createdAt)}${user.region ? ` · ${user.region}` : ''}`}
        actions={
          <>
            <Link to="/orders" className="btn btn--ghost btn--sm">我的订单</Link>
            <Link to="/bookings" className="btn btn--ghost btn--sm">我的预约</Link>
          </>
        }
      />

      <div className="container">
        <div className="workbench">
          <aside className="wb-side">
            <div className="wb-side__head">
              <div className="row gap-12">
                <Avatar name={user.name} url={user.avatarUrl} size="lg" />
                <div>
                  <div className="wb-side__title">{user.name}</div>
                  <div className="wb-side__sub">{ACCOUNT_LABEL[user.role]}</div>
                </div>
              </div>
            </div>
            <nav className="wb-nav" aria-label="用户中心导航">
              {TABS.map((t) => (
                <button key={t.value} type="button" aria-current={tab === t.value} onClick={() => setTab(t.value)}>
                  {t.label}
                  {t.value === 'advisories' && <span className="wb-nav__count">{overview.data?.advisories || ''}</span>}
                </button>
              ))}
            </nav>
            <div style={{ borderTop: '1px solid var(--line)', marginTop: 14, paddingTop: 14 }}>
              <button type="button" className="btn btn--quiet btn--sm" style={{ width: '100%', justifyContent: 'flex-start' }} onClick={() => setReportOpen(true)}>提交投诉</button>
              {user.role === 'merchant' && <Link to="/merchant" className="btn btn--quiet btn--sm" style={{ width: '100%', justifyContent: 'flex-start' }}>商家工作台</Link>}
              {user.role === 'admin' && <Link to="/admin" className="btn btn--quiet btn--sm" style={{ width: '100%', justifyContent: 'flex-start' }}>管理后台</Link>}
            </div>
          </aside>

          <div className="wb-body">
            {tab === 'overview' && (
              <>
                <div className="wb-head"><div><h2>账号概览</h2><p>这些数字来自你的真实业务记录。</p></div></div>
                <div className="stat-grid">
                  {[
                    ['发布信息', overview.data?.posts, '/me?tab=posts'],
                    ['识别记录', overview.data?.diagnoses, '/me?tab=diagnoses'],
                    ['农机预约', overview.data?.bookings, '/bookings'],
                    ['商城订单', overview.data?.orders, '/orders'],
                    ['收藏', overview.data?.favorites, '/me?tab=favorites'],
                    ['农技咨询', overview.data?.advisories, '/me?tab=advisories'],
                    ['未读消息', overview.data?.unreadMessages, '/messages'],
                  ].map(([label, value, to]) => (
                    <div key={label} className="stat-cell">
                      <div className="stat-cell__label">{label}</div>
                      <div className="stat-cell__value">{value ?? '—'}</div>
                      <Link to={to} className="stat-cell__foot" style={{ color: 'var(--olive)' }}>查看 →</Link>
                    </div>
                  ))}
                </div>

                <div className="panel mt-24">
                  <div className="row between" style={{ marginBottom: 12 }}>
                    <h3 className="h4">最近的识别记录</h3>
                    <button type="button" className="btn btn--quiet btn--sm" onClick={() => setTab('diagnoses')}>全部</button>
                  </div>
                  {(overview.data?.diagnoses || 0) === 0 ? (
                    <p className="small muted">还没有识别记录。上传一张作物照片开始。</p>
                  ) : (
                    <p className="small muted">点击左侧「识别记录」查看全部历史与结果。</p>
                  )}
                </div>

                {user.role === 'user' && (
                  <div className="panel mt-16" style={{ background: 'var(--moss-soft)' }}>
                    <div className="row between" style={{ flexWrap: 'wrap', gap: 12 }}>
                      <div>
                        <h3 className="h4">想把农产品或农机放到平台上？</h3>
                        <p className="small muted" style={{ marginTop: 4 }}>申请商家入驻，审核通过后可发布商品、管理农机并处理订单。</p>
                      </div>
                      <Link to="/merchant" className="btn btn--primary btn--sm">申请入驻</Link>
                    </div>
                  </div>
                )}
              </>
            )}

            {tab === 'profile' && (
              <>
                <div className="wb-head"><div><h2>账号资料</h2><p>邮箱用于登录与找回密码，修改后需重新登录。</p></div></div>
                <div className="panel panel--white" style={{ padding: 26 }}>
                  <div className="form-grid">
                    <label className="field">
                      <span className="field__label">称呼<span className="req">*</span></span>
                      <input className="input" value={profile.name} onChange={(e) => setProfile({ ...profile, name: e.target.value })} maxLength={30} />
                    </label>
                    <label className="field">
                      <span className="field__label">登录邮箱</span>
                      <input className="input" value={user.email || ''} disabled />
                      <span className="field__hint">邮箱修改需联系平台管理员。</span>
                    </label>
                    <label className="field">
                      <span className="field__label">手机号</span>
                      <input className="input" value={profile.phone} onChange={(e) => setProfile({ ...profile, phone: e.target.value })} placeholder="11 位手机号" />
                    </label>
                    <label className="field">
                      <span className="field__label">所在地区</span>
                      <input className="input" value={profile.region} onChange={(e) => setProfile({ ...profile, region: e.target.value })} placeholder="例如：山东省潍坊市寿光市" />
                    </label>
                    <label className="field span-2">
                      <span className="field__label">个人简介</span>
                      <textarea className="textarea" value={profile.bio} onChange={(e) => setProfile({ ...profile, bio: e.target.value })} maxLength={300} style={{ minHeight: 80 }} />
                    </label>
                    <div className="span-2">
                      <span className="field__label" style={{ display: 'block', marginBottom: 8 }}>头像</span>
                      <ImageUploader value={avatar} onChange={setAvatar} single purpose="avatar" compact label="上传头像" hint="建议使用正方形图片" />
                    </div>
                  </div>
                  <div className="row between mt-24">
                    <span className="small muted">资料保存后会同步到导航与商家信息。</span>
                    <button type="button" className="btn btn--primary" onClick={saveProfile} disabled={saving}>{saving ? '保存中…' : '保存资料'}</button>
                  </div>
                </div>
              </>
            )}

            {tab === 'addresses' && (
              <>
                <div className="wb-head">
                  <div><h2>收货地址</h2><p>下单时会保存地址快照，后续修改不影响历史订单。</p></div>
                  <button type="button" className="btn btn--primary btn--sm" onClick={() => { setEditingAddr(null); setAddrOpen(true); }}>+ 新增地址</button>
                </div>
                {addresses.loading && <Loading rows={2} height={80} />}
                {!addresses.loading && (addresses.data?.items || []).length === 0 && (
                  <Empty title="还没有收货地址" desc="添加地址后，商城下单会更方便。" action={<button type="button" className="btn btn--primary btn--sm" onClick={() => setAddrOpen(true)}>添加地址</button>} />
                )}
                <div className="stack gap-12">
                  {(addresses.data?.items || []).map((a) => (
                    <div key={a.id} className="panel" style={{ padding: 18 }}>
                      <div className="row between" style={{ alignItems: 'flex-start', flexWrap: 'wrap', gap: 10 }}>
                        <div>
                          <div style={{ fontSize: 14 }}>
                            {a.receiver} <span className="muted">· {a.phone}</span>
                            {a.isDefault && <span className="tag tag--olive" style={{ marginLeft: 8 }}>默认</span>}
                          </div>
                          <div className="small muted" style={{ marginTop: 4 }}>{a.province}{a.city}{a.district} {a.detail}</div>
                        </div>
                        <div className="row gap-8">
                          <button type="button" className="btn btn--quiet btn--sm" onClick={() => { setEditingAddr(a); setAddrOpen(true); }}>编辑</button>
                          <button type="button" className="btn btn--quiet btn--sm" style={{ color: 'var(--danger)' }} onClick={() => removeAddress(a)}>删除</button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </>
            )}

            {tab === 'favorites' && (
              <>
                <div className="wb-head"><div><h2>我的收藏</h2><p>收藏的供需、商品、农机与知识文章。</p></div></div>
                {favorites.loading && <Loading rows={2} height={80} />}
                {!favorites.loading && (favorites.data?.items || []).length === 0 && <Empty title="还没有收藏" desc="在详情页点击收藏即可保存到这里。" />}
                <div className="stack gap-12">
                  {(favorites.data?.items || []).map((f) => {
                    const t = f.target;
                    const to = f.type === 'post' ? `/trade/${t.id}` : f.type === 'product' ? `/shop/${t.id}` : f.type === 'machinery' ? `/machinery/${t.id}` : `/knowledge/${t.slug}`;
                    const title = t.title || t.name;
                    const meta = f.type === 'post' ? `${t.province}${t.city} · ${t.price_type === 'fixed' ? money(t.price) : '价格面议'}` : f.type === 'product' ? `${t.spec} · ${money(t.price)}` : f.type === 'machinery' ? `${t.type} · ${t.province}` : `${t.crop}`;
                    return (
                      <div key={f.id} className="panel" style={{ padding: 16 }}>
                        <div className="row between" style={{ flexWrap: 'wrap', gap: 10 }}>
                          <div>
                            <Link to={to} style={{ fontSize: 14.5 }}>{title}</Link>
                            <div className="small muted" style={{ marginTop: 3 }}>{meta}</div>
                          </div>
                          <div className="row gap-8">
                            <Link to={to} className="btn btn--ghost btn--sm">查看</Link>
                            <button type="button" className="btn btn--quiet btn--sm" onClick={() => removeFavorite(f)}>取消收藏</button>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </>
            )}

            {tab === 'diagnoses' && (
              <>
                <div className="wb-head">
                  <div><h2>识别记录</h2><p>每次识别的图片、质量报告与结果都会长期保存。</p></div>
                  <Link to="/diagnose" className="btn btn--primary btn--sm">开始识别</Link>
                </div>
                {diagnoses.loading && <Loading rows={3} height={80} />}
                {!diagnoses.loading && (diagnoses.data?.items || []).length === 0 && <Empty title="还没有识别记录" action={<Link to="/diagnose" className="btn btn--primary btn--sm">上传照片</Link>} />}
                <div style={{ borderTop: '1px solid var(--line-strong)' }}>
                  {(diagnoses.data?.items || []).map((d) => (
                    <Link key={d.id} to={`/diagnose/result/${d.id}`} style={{ display: 'grid', gridTemplateColumns: '64px 1fr 120px', gap: 16, padding: '14px 4px', borderBottom: '1px solid var(--line)', alignItems: 'center' }}>
                      <div style={{ width: 56, height: 56, borderRadius: 5, overflow: 'hidden', background: 'var(--paper-deep)' }}>
                        {d.imageUrl && <img src={d.imageUrl} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />}
                      </div>
                      <div>
                        <div style={{ fontSize: 14 }}>{d.cropLabel} · {d.top || '待查看结果'}</div>
                        <div className="small muted">{dateTime(d.createdAt)}</div>
                      </div>
                      <div style={{ textAlign: 'right' }}><StatusTag status={d.status} text={statusText(d.status)} tone={statusTone(d.status)} /></div>
                    </Link>
                  ))}
                </div>
              </>
            )}

            {tab === 'posts' && (
              <>
                <div className="wb-head">
                  <div><h2>我的发布</h2><p>草稿、审核中与已下架的信息都在这里，可编辑后重新提交。</p></div>
                  <Link to="/trade/publish" className="btn btn--primary btn--sm">发布信息</Link>
                </div>
                {posts.loading && <Loading rows={3} height={80} />}
                {!posts.loading && (posts.data?.items || []).length === 0 && <Empty title="还没有发布" desc="发布供应或采购信息，审核通过后公开展示。" action={<Link to="/trade/publish" className="btn btn--primary btn--sm">去发布</Link>} />}
                <div className="stack gap-12">
                  {(posts.data?.items || []).map((p) => (
                    <div key={p.id} className="panel" style={{ padding: 18 }}>
                      <div className="row between" style={{ flexWrap: 'wrap', gap: 10 }}>
                        <div style={{ flex: 1, minWidth: 240 }}>
                          <div className="row gap-8" style={{ marginBottom: 5 }}>
                            <span className={`tag ${p.type === 'supply' ? 'tag--olive' : 'tag--wheat'}`}>{p.type === 'supply' ? '供应' : '采购'}</span>
                            <StatusTag status={p.status} text={statusText(p.status)} tone={statusTone(p.status)} />
                          </div>
                          <div style={{ fontSize: 15 }}>{p.title}</div>
                          <div className="small muted mt-8">
                            {num(p.quantity, 2)} {p.unit} · {p.priceType === 'fixed' ? money(p.price) : '价格面议'} · 有效期至 {date(p.validUntil)}
                          </div>
                          {p.rejectReason && <div className="small" style={{ color: 'var(--danger)', marginTop: 4 }}>驳回原因：{p.rejectReason}</div>}
                        </div>
                        <div className="row gap-8">
                          <Link to={`/trade/${p.id}`} className="btn btn--quiet btn--sm">预览</Link>
                          <Link to={`/trade/publish?id=${p.id}`} className="btn btn--ghost btn--sm">编辑</Link>
                          {p.status === 'active' && <button type="button" className="btn btn--quiet btn--sm" onClick={() => closePost(p)}>下架</button>}
                          {p.status === 'draft' && <button type="button" className="btn btn--primary btn--sm" onClick={() => post(`/posts/${p.id}/submit`).then(() => { toast.ok('已提交审核'); posts.reload(); }).catch((e) => toast.error(e.message))}>提交审核</button>}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </>
            )}

            {tab === 'advisories' && (
              <>
                <div className="wb-head"><div><h2>农技咨询</h2><p>工单由农技人员受理，回复内容与时间都会记录。</p></div></div>
                {advisories.loading && <Loading rows={2} height={90} />}
                {!advisories.loading && (advisories.data?.items || []).length === 0 && <Empty title="还没有咨询记录" desc="在识别结果页可以一键提交农技咨询。" />}
                <div className="stack gap-12">
                  {(advisories.data?.items || []).map((a) => (
                    <div key={a.id} className="panel" style={{ padding: 18 }}>
                      <div className="row between" style={{ marginBottom: 8 }}>
                        <span style={{ fontSize: 14.5 }}>{a.subject}</span>
                        <StatusTag status={a.status} text={statusText(a.status)} tone={statusTone(a.status)} />
                      </div>
                      <p className="small" style={{ whiteSpace: 'pre-wrap', lineHeight: 1.8 }}>{a.content}</p>
                      {a.reply ? (
                        <div className="notice" style={{ marginTop: 12 }}>
                          <div>
                            <div className="notice__title">农技人员回复 {a.agronomist_name ? `· ${a.agronomist_name}` : ''}</div>
                            <div className="small" style={{ whiteSpace: 'pre-wrap', lineHeight: 1.9 }}>{a.reply}</div>
                            <div className="field__hint mt-8">{dateTime(a.replied_at)}</div>
                          </div>
                        </div>
                      ) : (
                        <div className="small muted mt-8">提交于 {dateTime(a.created_at)} · 等待受理</div>
                      )}
                    </div>
                  ))}
                </div>
              </>
            )}

            {tab === 'security' && (
              <>
                <div className="wb-head"><div><h2>登录与安全</h2><p>密码修改后，其他设备的登录会话会全部失效。</p></div></div>
                <div className="panel panel--white" style={{ padding: 26, maxWidth: 520 }}>
                  <label className="field" style={{ marginBottom: 14 }}>
                    <span className="field__label">当前密码</span>
                    <input className="input" type="password" value={pwd.currentPassword} onChange={(e) => setPwd({ ...pwd, currentPassword: e.target.value })} autoComplete="current-password" />
                  </label>
                  <label className="field" style={{ marginBottom: 14 }}>
                    <span className="field__label">新密码</span>
                    <input className="input" type="password" value={pwd.newPassword} onChange={(e) => setPwd({ ...pwd, newPassword: e.target.value })} autoComplete="new-password" />
                    <span className="field__hint">至少 8 位，需包含字母和数字。</span>
                  </label>
                  <label className="field" style={{ marginBottom: 20 }}>
                    <span className="field__label">确认新密码</span>
                    <input className="input" type="password" value={pwd.confirm} onChange={(e) => setPwd({ ...pwd, confirm: e.target.value })} autoComplete="new-password" />
                  </label>
                  <button type="button" className="btn btn--primary" onClick={changePassword} disabled={saving}>修改密码</button>
                </div>

                <div className="panel mt-16">
                  <h3 className="h4" style={{ marginBottom: 8 }}>会话说明</h3>
                  <p className="small muted" style={{ lineHeight: 1.9 }}>
                    访问令牌有效期 15 分钟，刷新令牌保存在 HttpOnly Cookie 中，不写入 localStorage，也不出现在 URL 里。退出登录会撤销当前刷新令牌。
                  </p>
                </div>
              </>
            )}
          </div>
        </div>
      </div>

      <AddressModal open={addrOpen} onClose={() => setAddrOpen(false)} initial={editingAddr} onSaved={addresses.reload} />

      <Modal
        open={reportOpen}
        onClose={() => setReportOpen(false)}
        title="提交投诉"
        footer={
          <>
            <button type="button" className="btn btn--ghost btn--sm" onClick={() => setReportOpen(false)}>取消</button>
            <button type="button" className="btn btn--primary btn--sm" onClick={submitReport}>提交</button>
          </>
        }
      >
        <div className="stack gap-16">
          <label className="field">
            <span className="field__label">问题类型</span>
            <select className="select" value={report.targetType} onChange={(e) => setReport({ ...report, targetType: e.target.value })}>
              <option value="post">供需信息</option>
              <option value="product">商品</option>
              <option value="machinery">农机服务</option>
              <option value="user">用户行为</option>
              <option value="other">其他</option>
            </select>
          </label>
          <label className="field">
            <span className="field__label">问题描述<span className="req">*</span></span>
            <input className="input" value={report.reason} onChange={(e) => setReport({ ...report, reason: e.target.value })} maxLength={120} placeholder="一句话说明问题" />
          </label>
          <label className="field">
            <span className="field__label">补充说明</span>
            <textarea className="textarea" value={report.detail} onChange={(e) => setReport({ ...report, detail: e.target.value })} maxLength={800} />
          </label>
        </div>
      </Modal>
    </>
  );
}
