import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { get, patch, post, put } from '../lib/api.js';
import { useAsync, useTitle } from '../lib/hooks.js';
import { useAuth } from '../lib/auth.jsx';
import { useToast } from '../lib/toast.jsx';
import { useRealtimeEvent } from '../lib/realtime.jsx';
import PageHead from '../components/PageHead.jsx';
import ImageUploader from '../components/ImageUploader.jsx';
import { Empty, ErrorState, Loading, Modal, Spinner, StatusTag, Tabs } from '../components/ui.jsx';
import { MACHINE_TYPES, PROVINCES, PRODUCT_CATEGORIES, PRICING_LABEL, date, dateTime, money, num, statusText, statusTone } from '../lib/format.js';

const TABS = [
  { value: 'dashboard', label: '经营概览' },
  { value: 'products', label: '商品管理' },
  { value: 'machinery', label: '农机管理' },
  { value: 'bookings', label: '预约管理' },
  { value: 'orders', label: '订单管理' },
  { value: 'shop', label: '店铺资料' },
];

const emptyProduct = { name: '', category: '肥料', spec: '', unit: '袋', price: '', stock: '', description: '', applicable: '', sourceNote: '', status: 'active' };
const emptyMachine = { name: '', type: '收割机', brand: '', model: '', power: '', province: '山东省', city: '', serviceArea: '', pricingType: 'per_mu', price: '', description: '', status: 'active' };

function ProductForm({ open, onClose, editing, onSaved }) {
  const toast = useToast();
  const [form, setForm] = useState(emptyProduct);
  const [images, setImages] = useState([]);
  const [busy, setBusy] = useState(false);
  const [errors, setErrors] = useState({});

  useEffect(() => {
    if (!open) return;
    if (editing) {
      setForm({
        name: editing.name,
        category: editing.category,
        spec: editing.spec,
        unit: editing.unit,
        price: String(editing.price),
        stock: String(editing.stock),
        description: editing.description || '',
        applicable: editing.applicable || '',
        sourceNote: editing.sourceNote || editing.source_note || '',
        status: editing.status,
      });
      setImages(editing.images || []);
    } else {
      setForm(emptyProduct);
      setImages([]);
    }
    setErrors({});
  }, [open, editing]);

  const save = async () => {
    const e = {};
    if (form.name.trim().length < 3) e.name = '商品名称至少 3 个字';
    if (!form.spec.trim() || form.spec.trim().length < 2) e.spec = '请填写规格';
    if (!form.price || Number(form.price) <= 0) e.price = '请填写有效价格';
    if (form.stock === '' || Number(form.stock) < 0) e.stock = '请填写库存';
    setErrors(e);
    if (Object.keys(e).length) return;
    setBusy(true);
    try {
      const payload = {
        name: form.name.trim(),
        category: form.category,
        spec: form.spec.trim(),
        unit: form.unit,
        price: Number(form.price),
        stock: Number(form.stock),
        description: form.description.trim() || undefined,
        applicable: form.applicable.trim() || undefined,
        sourceNote: form.sourceNote.trim() || undefined,
        status: form.status,
        imageIds: images.map((i) => i.id),
      };
      if (editing?.id) await put(`/shop/products/${editing.id}`, payload);
      else await post('/shop/products', payload);
      toast.ok(editing?.id ? '商品已更新' : '商品已创建');
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
      title={editing ? '编辑商品' : '新增商品'}
      width={640}
      footer={
        <>
          <button type="button" className="btn btn--ghost btn--sm" onClick={onClose}>取消</button>
          <button type="button" className="btn btn--primary btn--sm" onClick={save} disabled={busy}>{busy ? <><Spinner /> 保存中</> : '保存商品'}</button>
        </>
      }
    >
      <div className="form-grid">
        <label className="field span-2">
          <span className="field__label">商品名称<span className="req">*</span></span>
          <input className="input" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} maxLength={80} />
          {errors.name && <span className="field__error">{errors.name}</span>}
        </label>
        <label className="field">
          <span className="field__label">分类<span className="req">*</span></span>
          <select className="select" value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })}>
            {PRODUCT_CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
        </label>
        <label className="field">
          <span className="field__label">规格<span className="req">*</span></span>
          <input className="input" value={form.spec} onChange={(e) => setForm({ ...form, spec: e.target.value })} placeholder="例如：5kg/袋" />
          {errors.spec && <span className="field__error">{errors.spec}</span>}
        </label>
        <label className="field">
          <span className="field__label">单价（元）<span className="req">*</span></span>
          <input className="input" type="number" min="0" step="0.01" value={form.price} onChange={(e) => setForm({ ...form, price: e.target.value })} />
          {errors.price && <span className="field__error">{errors.price}</span>}
        </label>
        <label className="field">
          <span className="field__label">库存<span className="req">*</span></span>
          <div className="row gap-8">
            <input className="input" type="number" min="0" value={form.stock} onChange={(e) => setForm({ ...form, stock: e.target.value })} />
            <select className="select" style={{ width: 88 }} value={form.unit} onChange={(e) => setForm({ ...form, unit: e.target.value })} aria-label="单位">
              {['袋', '瓶', '箱', '件', '台', '包', '桶'].map((u) => <option key={u} value={u}>{u}</option>)}
            </select>
          </div>
          {errors.stock && <span className="field__error">{errors.stock}</span>}
        </label>
        <label className="field span-2">
          <span className="field__label">适用范围</span>
          <input className="input" value={form.applicable} onChange={(e) => setForm({ ...form, applicable: e.target.value })} placeholder="例如：番茄、辣椒等茄果类" />
        </label>
        <label className="field span-2">
          <span className="field__label">商品说明</span>
          <textarea className="textarea" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} style={{ minHeight: 80 }} />
        </label>
        <label className="field span-2">
          <span className="field__label">货源与合规说明</span>
          <textarea className="textarea" value={form.sourceNote} onChange={(e) => setForm({ ...form, sourceNote: e.target.value })} placeholder="生产企业、登记证号、检测报告等可核实信息。" style={{ minHeight: 70 }} />
        </label>
        <label className="field">
          <span className="field__label">上架状态</span>
          <select className="select" value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })}>
            <option value="active">上架</option>
            <option value="inactive">下架</option>
          </select>
        </label>
        <div className="span-2">
          <span className="field__label" style={{ display: 'block', marginBottom: 8 }}>商品图片（最多 6 张）</span>
          <ImageUploader value={images} onChange={setImages} purpose="product" max={6} compact label="上传商品图片" />
        </div>
      </div>
    </Modal>
  );
}

function MachineForm({ open, onClose, editing, onSaved }) {
  const toast = useToast();
  const [form, setForm] = useState(emptyMachine);
  const [images, setImages] = useState([]);
  const [busy, setBusy] = useState(false);
  const [errors, setErrors] = useState({});

  useEffect(() => {
    if (!open) return;
    if (editing) {
      setForm({
        name: editing.name,
        type: editing.type,
        brand: editing.brand || '',
        model: editing.model || '',
        power: editing.power || '',
        province: editing.province,
        city: editing.city,
        serviceArea: editing.serviceArea,
        pricingType: editing.pricingType,
        price: String(editing.price),
        description: editing.description || '',
        status: editing.status,
      });
      setImages(editing.images || []);
    } else {
      setForm(emptyMachine);
      setImages([]);
    }
    setErrors({});
  }, [open, editing]);

  const save = async () => {
    const e = {};
    if (form.name.trim().length < 3) e.name = '设备名称至少 3 个字';
    if (form.city.trim().length < 2) e.city = '请填写城市';
    if (form.serviceArea.trim().length < 3) e.serviceArea = '请说明服务范围';
    if (!form.price || Number(form.price) <= 0) e.price = '请填写有效价格';
    setErrors(e);
    if (Object.keys(e).length) return;
    setBusy(true);
    try {
      const payload = {
        name: form.name.trim(),
        type: form.type,
        brand: form.brand.trim() || undefined,
        model: form.model.trim() || undefined,
        power: form.power.trim() || undefined,
        province: form.province,
        city: form.city.trim(),
        serviceArea: form.serviceArea.trim(),
        pricingType: form.pricingType,
        price: Number(form.price),
        description: form.description.trim() || undefined,
        status: form.status,
        imageIds: images.map((i) => i.id),
      };
      if (editing?.id) await put(`/machinery/${editing.id}`, payload);
      else await post('/machinery', payload);
      toast.ok(editing?.id ? '设备已更新' : '设备已创建');
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
      title={editing ? '编辑设备' : '新增设备'}
      width={640}
      footer={
        <>
          <button type="button" className="btn btn--ghost btn--sm" onClick={onClose}>取消</button>
          <button type="button" className="btn btn--primary btn--sm" onClick={save} disabled={busy}>{busy ? <><Spinner /> 保存中</> : '保存设备'}</button>
        </>
      }
    >
      <div className="form-grid">
        <label className="field span-2">
          <span className="field__label">设备名称<span className="req">*</span></span>
          <input className="input" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="例如：久保田 PRO688Q 联合收割机" />
          {errors.name && <span className="field__error">{errors.name}</span>}
        </label>
        <label className="field">
          <span className="field__label">设备类型</span>
          <select className="select" value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })}>
            {MACHINE_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
          </select>
        </label>
        <label className="field">
          <span className="field__label">品牌 / 型号</span>
          <div className="row gap-8">
            <input className="input" value={form.brand} onChange={(e) => setForm({ ...form, brand: e.target.value })} placeholder="品牌" />
            <input className="input" value={form.model} onChange={(e) => setForm({ ...form, model: e.target.value })} placeholder="型号" />
          </div>
        </label>
        <label className="field">
          <span className="field__label">动力 / 规格</span>
          <input className="input" value={form.power} onChange={(e) => setForm({ ...form, power: e.target.value })} placeholder="例如：90 马力 / 50L 药箱" />
        </label>
        <label className="field">
          <span className="field__label">所在省份</span>
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
          <span className="field__label">服务范围<span className="req">*</span></span>
          <input className="input" value={form.serviceArea} onChange={(e) => setForm({ ...form, serviceArea: e.target.value })} placeholder="例如：潍坊市及周边 50 公里" />
          {errors.serviceArea && <span className="field__error">{errors.serviceArea}</span>}
        </label>
        <label className="field">
          <span className="field__label">计价方式</span>
          <select className="select" value={form.pricingType} onChange={(e) => setForm({ ...form, pricingType: e.target.value })}>
            <option value="per_mu">按亩</option>
            <option value="per_hour">按小时</option>
            <option value="per_day">按天</option>
          </select>
        </label>
        <label className="field">
          <span className="field__label">单价（元）<span className="req">*</span></span>
          <input className="input" type="number" min="0" step="0.01" value={form.price} onChange={(e) => setForm({ ...form, price: e.target.value })} />
          {errors.price && <span className="field__error">{errors.price}</span>}
        </label>
        <label className="field span-2">
          <span className="field__label">设备说明</span>
          <textarea className="textarea" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} style={{ minHeight: 80 }} placeholder="车况、配套农具、机手经验、跨区作业说明。" />
        </label>
        <div className="span-2">
          <span className="field__label" style={{ display: 'block', marginBottom: 8 }}>设备照片（最多 6 张）</span>
          <ImageUploader value={images} onChange={setImages} purpose="machinery" max={6} compact label="上传设备照片" />
        </div>
      </div>
    </Modal>
  );
}

function SlotModal({ open, onClose, machine, onSaved }) {
  const toast = useToast();
  const [dateValue, setDateValue] = useState(new Date(Date.now() + 86400000).toISOString().slice(0, 10));
  const [hours, setHours] = useState([]);
  const [status, setStatus] = useState('blocked');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (open) {
      setHours([]);
      setDateValue(new Date(Date.now() + 86400000).toISOString().slice(0, 10));
    }
  }, [open]);

  const toggle = (h) => setHours((list) => (list.includes(h) ? list.filter((x) => x !== h) : [...list, h]));

  const save = async () => {
    if (!hours.length) return toast.error('请选择要设置的时段');
    setBusy(true);
    try {
      await post(`/machinery/${machine.id}/slots`, { date: dateValue, hours, status });
      toast.ok(status === 'blocked' ? '已设为不可预约' : '已恢复为可预约');
      onSaved();
      onClose();
    } catch (err) {
      toast.error(err.message || '设置失败');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={`设置可预约时段 · ${machine?.name || ''}`}
      footer={
        <>
          <button type="button" className="btn btn--ghost btn--sm" onClick={onClose}>取消</button>
          <button type="button" className="btn btn--primary btn--sm" onClick={save} disabled={busy}>保存设置</button>
        </>
      }
    >
      <div className="stack gap-16">
        <label className="field">
          <span className="field__label">日期</span>
          <input className="input" type="date" value={dateValue} min={new Date().toISOString().slice(0, 10)} onChange={(e) => setDateValue(e.target.value)} />
        </label>
        <div>
          <span className="field__label" style={{ display: 'block', marginBottom: 8 }}>选择小时（06:00 - 18:00）</span>
          <div className="slot-grid">
            {Array.from({ length: 13 }).map((_, i) => {
              const h = i + 6;
              return (
                <button key={h} type="button" className={`slot ${hours.includes(h) ? 'is-selected' : ''}`} onClick={() => toggle(h)}>
                  {String(h).padStart(2, '0')}
                </button>
              );
            })}
          </div>
        </div>
        <label className="field">
          <span className="field__label">设置为</span>
          <select className="select" value={status} onChange={(e) => setStatus(e.target.value)}>
            <option value="blocked">不可预约（维修 / 已排班）</option>
            <option value="open">恢复可预约</option>
          </select>
        </label>
        <div className="notice notice--plain small">已被预约的小时无法修改，需要先与用户改期或取消。</div>
      </div>
    </Modal>
  );
}

export default function Merchant() {
  useTitle('商家工作台');
  const { user, booting } = useAuth();
  const toast = useToast();
  const [params, setParams] = useSearchParams();
  const tab = params.get('tab') || 'dashboard';
  const profile = useAsync(() => (user ? get('/merchant/profile') : Promise.resolve({ profile: null })), [user?.id]);
  const dashboard = useAsync(() => (user && (user.role === 'merchant' || user.role === 'admin') ? get('/merchant/dashboard') : Promise.resolve(null)), [user?.id, tab]);
  const products = useAsync(() => (tab === 'products' ? get('/shop/merchant/products') : Promise.resolve({ items: [] })), [tab]);
  const machines = useAsync(() => (tab === 'machinery' ? get('/machinery/merchant/list') : Promise.resolve({ items: [] })), [tab]);
  const bookings = useAsync(() => (tab === 'bookings' ? get('/machinery/bookings/merchant') : Promise.resolve({ items: [] })), [tab]);
  const orders = useAsync(() => (tab === 'orders' ? get('/shop/orders', { role: 'merchant', status: 'all' }) : Promise.resolve({ items: [] })), [tab]);

  const [productForm, setProductForm] = useState({ open: false, editing: null });
  const [machineForm, setMachineForm] = useState({ open: false, editing: null });
  const [slotMachine, setSlotMachine] = useState(null);
  const [applyForm, setApplyForm] = useState({ shopName: '', contactName: '', contactPhone: '', region: '', businessType: '农资经销', licenseNo: '', intro: '' });
  const [busy, setBusy] = useState('');
  const [shipOrder, setShipOrder] = useState(null);
  const [company, setCompany] = useState('');
  const [trackingNo, setTrackingNo] = useState('');

  useRealtimeEvent('order', () => { if (tab === 'orders' || tab === 'dashboard') { orders.reload(); dashboard.reload(); } });
  useRealtimeEvent('booking', () => { if (tab === 'bookings' || tab === 'dashboard') { bookings.reload(); dashboard.reload(); } });

  useEffect(() => {
    if (!booting && !user) window.location.replace('/login?redirect=/merchant');
  }, [user, booting]);

  const setTab = (v) => {
    const next = new URLSearchParams(params);
    if (v === 'dashboard') next.delete('tab'); else next.set('tab', v);
    setParams(next);
  };

  const apply = async () => {
    if (!applyForm.shopName || applyForm.shopName.trim().length < 3) return toast.error('请填写店铺名称（至少 3 个字）');
    if (!applyForm.contactName || applyForm.contactName.trim().length < 2) return toast.error('请填写联系人');
    if (!/^1[3-9]\d{9}$/.test(applyForm.contactPhone)) return toast.error('手机号格式不正确');
    if (!applyForm.region || applyForm.region.trim().length < 2) return toast.error('请填写所在地区');
    setBusy('apply');
    try {
      await post('/merchant/apply', applyForm);
      toast.ok('入驻申请已提交，审核结果会通知你');
      profile.reload();
    } catch (err) {
      toast.error(err.message || '提交失败');
    } finally {
      setBusy('');
    }
  };

  const bookingAction = async (id, action, payload) => {
    setBusy(`${action}${id}`);
    try {
      await post(`/machinery/bookings/${id}/${action}`, payload);
      toast.ok('操作已完成');
      bookings.reload();
      dashboard.reload();
    } catch (err) {
      toast.error(err.message || '操作失败');
    } finally {
      setBusy('');
    }
  };

  const toggleProduct = async (p) => {
    try {
      await put(`/shop/products/${p.id}`, {
        name: p.name, category: p.category, spec: p.spec, unit: p.unit, price: p.price, stock: p.stock,
        description: p.description || undefined, applicable: p.applicable || undefined,
        sourceNote: p.sourceNote || undefined, status: p.status === 'active' ? 'inactive' : 'active',
        imageIds: (p.images || []).map((i) => i.id),
      });
      toast.ok(p.status === 'active' ? '商品已下架' : '商品已上架');
      products.reload();
    } catch (err) {
      toast.error(err.message);
    }
  };

  const toggleMachine = async (m) => {
    try {
      await put(`/machinery/${m.id}`, {
        name: m.name, type: m.type, brand: m.brand || undefined, model: m.model || undefined, power: m.power || undefined,
        province: m.province, city: m.city, serviceArea: m.serviceArea, pricingType: m.pricingType, price: m.price,
        description: m.description || undefined, status: m.status === 'active' ? 'inactive' : 'active',
        imageIds: (m.images || []).map((i) => i.id),
      });
      toast.ok(m.status === 'active' ? '设备已下架' : '设备已上架');
      machines.reload();
    } catch (err) {
      toast.error(err.message);
    }
  };

  const confirmOffline = async (o) => {
    try {
      await post(`/shop/orders/${o.id}/confirm-offline`);
      toast.ok('已确认收款');
      orders.reload();
    } catch (err) {
      toast.error(err.message);
    }
  };

  const ship = async () => {
    if (company.trim().length < 2) return toast.error('请填写物流公司');
    if (trackingNo.trim().length < 6) return toast.error('请填写真实运单号');
    setBusy('ship');
    try {
      await post(`/shop/orders/${shipOrder.id}/ship`, { trackingCompany: company.trim(), trackingNo: trackingNo.trim() });
      toast.ok('已发货');
      setShipOrder(null);
      setCompany('');
      setTrackingNo('');
      orders.reload();
    } catch (err) {
      toast.error(err.message);
    } finally {
      setBusy('');
    }
  };

  if (booting || !user) return <div className="container" style={{ padding: '60px 32px' }}><Loading rows={3} /></div>;

  const p = profile.data?.profile;
  const isApproved = p?.status === 'approved' || user.role === 'admin';
  const isPending = p?.status === 'pending';
  const isRejected = p?.status === 'rejected';

  return (
    <>
      <PageHead
        items={[{ label: '首页', to: '/' }, { label: '商家工作台' }]}
        title={isApproved ? (p?.shop_name || '商家工作台') : '商家入驻'}
        desc={
          isApproved
            ? '管理商品、农机与订单。所有操作即时生效，并记录操作人与时间。'
            : isPending
              ? '入驻申请正在审核中，通常 1 个工作日内完成。'
              : '通过入驻审核后，可以发布商品、管理农机设备并处理订单。'
        }
        actions={isApproved ? <Link to="/shop" className="btn btn--ghost btn--sm">查看商城前台</Link> : null}
      />

      <div className="container">
        {!isApproved ? (
          <div className="section" style={{ paddingTop: 30 }}>
            {isPending && (
              <div className="notice notice--warn" style={{ marginBottom: 20 }}>
                <div>
                  <div className="notice__title">审核中</div>
                  <div className="small">店铺「{p.shop_name}」已提交，审核结果会通过站内消息通知。</div>
                </div>
              </div>
            )}
            {isRejected && (
              <div className="notice notice--danger" style={{ marginBottom: 20 }}>
                <div>
                  <div className="notice__title">上次申请未通过</div>
                  <div className="small">{p.review_note || '请补充资质材料后重新提交'}</div>
                </div>
              </div>
            )}
            <div className="panel panel--white" style={{ padding: 28, maxWidth: 720 }}>
              <h2 className="h3" style={{ marginBottom: 6 }}>提交入驻资料</h2>
              <p className="small muted" style={{ marginBottom: 22 }}>平台会核验店铺与联系人信息。演示环境不会核验真实营业执照。</p>
              <div className="form-grid">
                <label className="field span-2">
                  <span className="field__label">店铺名称<span className="req">*</span></span>
                  <input className="input" value={applyForm.shopName} onChange={(e) => setApplyForm({ ...applyForm, shopName: e.target.value })} />
                </label>
                <label className="field">
                  <span className="field__label">联系人<span className="req">*</span></span>
                  <input className="input" value={applyForm.contactName} onChange={(e) => setApplyForm({ ...applyForm, contactName: e.target.value })} />
                </label>
                <label className="field">
                  <span className="field__label">联系电话<span className="req">*</span></span>
                  <input className="input" value={applyForm.contactPhone} onChange={(e) => setApplyForm({ ...applyForm, contactPhone: e.target.value })} />
                </label>
                <label className="field">
                  <span className="field__label">所在地区<span className="req">*</span></span>
                  <input className="input" value={applyForm.region} onChange={(e) => setApplyForm({ ...applyForm, region: e.target.value })} placeholder="省 / 市 / 县" />
                </label>
                <label className="field">
                  <span className="field__label">经营类型</span>
                  <select className="select" value={applyForm.businessType} onChange={(e) => setApplyForm({ ...applyForm, businessType: e.target.value })}>
                    {['农资经销', '农产品经纪', '农机服务', '合作社', '其他'].map((t) => <option key={t} value={t}>{t}</option>)}
                  </select>
                </label>
                <label className="field">
                  <span className="field__label">营业执照号（选填）</span>
                  <input className="input" value={applyForm.licenseNo} onChange={(e) => setApplyForm({ ...applyForm, licenseNo: e.target.value })} />
                </label>
                <label className="field span-2">
                  <span className="field__label">店铺简介</span>
                  <textarea className="textarea" value={applyForm.intro} onChange={(e) => setApplyForm({ ...applyForm, intro: e.target.value })} />
                </label>
              </div>
              <button type="button" className="btn btn--primary mt-24" onClick={apply} disabled={busy === 'apply'}>
                {busy === 'apply' ? <><Spinner /> 提交中</> : isRejected ? '重新提交申请' : '提交入驻申请'}
              </button>
            </div>
          </div>
        ) : (
          <div className="workbench">
            <aside className="wb-side">
              <div className="wb-side__head">
                <div className="wb-side__title">{p?.shop_name || '平台管理'}</div>
                <div className="wb-side__sub">{p?.region || '管理员视图'}</div>
              </div>
              <nav className="wb-nav" aria-label="商家工作台导航">
                {TABS.map((t) => (
                  <button key={t.value} type="button" aria-current={tab === t.value} onClick={() => setTab(t.value)}>
                    {t.label}
                    {t.value === 'orders' && (dashboard.data?.pendingOrders || 0) > 0 && <span className="wb-nav__count">{dashboard.data.pendingOrders}</span>}
                    {t.value === 'bookings' && (dashboard.data?.pendingBookings || 0) > 0 && <span className="wb-nav__count">{dashboard.data.pendingBookings}</span>}
                  </button>
                ))}
              </nav>
            </aside>

            <div className="wb-body">
              {tab === 'dashboard' && (
                <>
                  <div className="wb-head"><div><h2>经营概览</h2><p>以下指标由订单与预约数据实时计算。</p></div></div>
                  {dashboard.loading && <Loading rows={2} height={90} />}
                  {dashboard.data && (
                    <>
                      <div className="stat-grid">
                        <div className="stat-cell"><div className="stat-cell__label">待发货订单</div><div className="stat-cell__value">{dashboard.data.pendingOrders}</div><div className="stat-cell__foot">已收款待处理</div></div>
                        <div className="stat-cell"><div className="stat-cell__label">待确认预约</div><div className="stat-cell__value">{dashboard.data.pendingBookings}</div><div className="stat-cell__foot">农机作业</div></div>
                        <div className="stat-cell"><div className="stat-cell__label">累计成交额</div><div className="stat-cell__value" style={{ fontSize: 24 }}>¥{num(dashboard.data.revenue, 2)}</div><div className="stat-cell__foot">已支付及以后状态订单</div></div>
                        <div className="stat-cell"><div className="stat-cell__label">在售商品 / 设备</div><div className="stat-cell__value">{dashboard.data.activeProducts} <small>/ {dashboard.data.activeMachinery}</small></div><div className="stat-cell__foot">上架中</div></div>
                      </div>

                      <div className="grid12 mt-24" style={{ gap: 16 }}>
                        <div className="panel" style={{ gridColumn: 'span 6' }}>
                          <div className="row between" style={{ marginBottom: 10 }}><h3 className="h4">最近订单</h3><button type="button" className="btn btn--quiet btn--sm" onClick={() => setTab('orders')}>全部</button></div>
                          {(dashboard.data.recentOrders || []).length === 0 && <p className="small muted">暂无订单。</p>}
                          {(dashboard.data.recentOrders || []).map((o) => (
                            <Link key={o.id} to={`/orders/${o.id}`} className="row between" style={{ padding: '8px 0', borderBottom: '1px solid var(--line-soft)', fontSize: 13 }}>
                              <span>{o.order_no}</span>
                              <span className="tabular">{money(o.total)}</span>
                              <StatusTag status={o.status} text={statusText(o.status)} tone={statusTone(o.status)} />
                            </Link>
                          ))}
                        </div>
                        <div className="panel" style={{ gridColumn: 'span 6' }}>
                          <div className="row between" style={{ marginBottom: 10 }}><h3 className="h4">最近预约</h3><button type="button" className="btn btn--quiet btn--sm" onClick={() => setTab('bookings')}>全部</button></div>
                          {(dashboard.data.recentBookings || []).length === 0 && <p className="small muted">暂无预约。</p>}
                          {(dashboard.data.recentBookings || []).map((b) => (
                            <Link key={b.id} to={`/bookings/${b.id}`} className="row between" style={{ padding: '8px 0', borderBottom: '1px solid var(--line-soft)', fontSize: 13 }}>
                              <span>{b.name}</span>
                              <span>{date(b.date)}</span>
                              <StatusTag status={b.status} text={statusText(b.status)} tone={statusTone(b.status)} />
                            </Link>
                          ))}
                        </div>
                      </div>

                      {(dashboard.data.lowStock || []).length > 0 && (
                        <div className="panel mt-16" style={{ background: 'var(--wheat-soft)', borderColor: '#e2d0b3' }}>
                          <h3 className="h4" style={{ marginBottom: 8 }}>库存提醒（低于 10）</h3>
                          {dashboard.data.lowStock.map((s) => (
                            <div key={s.id} className="row between small" style={{ padding: '4px 0' }}>
                              <span>{s.name} · {s.spec}</span>
                              <span style={{ color: 'var(--danger)' }}>剩 {s.stock} {s.unit}</span>
                            </div>
                          ))}
                        </div>
                      )}
                    </>
                  )}
                </>
              )}

              {tab === 'products' && (
                <>
                  <div className="wb-head">
                    <div><h2>商品管理</h2><p>商品上下架与库存调整会即时影响商城前台。</p></div>
                    <button type="button" className="btn btn--primary btn--sm" onClick={() => setProductForm({ open: true, editing: null })}>+ 新增商品</button>
                  </div>
                  {products.loading && <Loading rows={3} height={80} />}
                  {!products.loading && (products.data?.items || []).length === 0 && <Empty title="还没有商品" desc="新增商品后会在商城中展示。" action={<button type="button" className="btn btn--primary btn--sm" onClick={() => setProductForm({ open: true, editing: null })}>新增商品</button>} />}
                  <div className="stack gap-12">
                    {(products.data?.items || []).map((pr) => (
                      <div key={pr.id} className="panel" style={{ padding: 16 }}>
                        <div className="row between" style={{ flexWrap: 'wrap', gap: 10 }}>
                          <div>
                            <div className="row gap-8" style={{ marginBottom: 4 }}>
                              <StatusTag status={pr.status} text={pr.status === 'active' ? '在售' : '已下架'} tone={pr.status === 'active' ? 'olive' : 'muted'} />
                              <span className="tag tag--muted">{pr.category}</span>
                            </div>
                            <div style={{ fontSize: 14.5 }}>{pr.name}</div>
                            <div className="small muted">{pr.spec} · {money(pr.price)}/{pr.unit} · 库存 {num(pr.stock)} · 已售 {num(pr.sales)}</div>
                          </div>
                          <div className="row gap-8">
                            <button type="button" className="btn btn--quiet btn--sm" onClick={() => setProductForm({ open: true, editing: pr })}>编辑</button>
                            <button type="button" className="btn btn--ghost btn--sm" onClick={() => toggleProduct(pr)}>{pr.status === 'active' ? '下架' : '上架'}</button>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </>
              )}

              {tab === 'machinery' && (
                <>
                  <div className="wb-head">
                    <div><h2>农机管理</h2><p>维护设备资料与可预约时段；已被预约的时段不可修改。</p></div>
                    <button type="button" className="btn btn--primary btn--sm" onClick={() => setMachineForm({ open: true, editing: null })}>+ 新增设备</button>
                  </div>
                  {machines.loading && <Loading rows={3} height={80} />}
                  {!machines.loading && (machines.data?.items || []).length === 0 && <Empty title="还没有设备" desc="添加设备后，用户可以在农机服务中预约。" />}
                  <div className="stack gap-12">
                    {(machines.data?.items || []).map((m) => (
                      <div key={m.id} className="panel" style={{ padding: 16 }}>
                        <div className="row between" style={{ flexWrap: 'wrap', gap: 10 }}>
                          <div>
                            <div className="row gap-8" style={{ marginBottom: 4 }}>
                              <StatusTag status={m.status} text={m.status === 'active' ? '可预约' : '已下架'} tone={m.status === 'active' ? 'olive' : 'muted'} />
                              <span className="tag tag--muted">{m.type}</span>
                            </div>
                            <div style={{ fontSize: 14.5 }}>{m.name}</div>
                            <div className="small muted">¥{num(m.price, 0)} {PRICING_LABEL[m.pricingType]} · {m.province}{m.city} · 服务 {m.serviceArea}</div>
                          </div>
                          <div className="row gap-8">
                            <button type="button" className="btn btn--quiet btn--sm" onClick={() => setSlotMachine(m)}>时段设置</button>
                            <button type="button" className="btn btn--quiet btn--sm" onClick={() => setMachineForm({ open: true, editing: m })}>编辑</button>
                            <button type="button" className="btn btn--ghost btn--sm" onClick={() => toggleMachine(m)}>{m.status === 'active' ? '下架' : '上架'}</button>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </>
              )}

              {tab === 'bookings' && (
                <>
                  <div className="wb-head"><div><h2>预约管理</h2><p>确认、拒绝、开始与完成操作都会实时通知用户。</p></div></div>
                  {bookings.loading && <Loading rows={3} height={80} />}
                  {!bookings.loading && (bookings.data?.items || []).length === 0 && <Empty title="还没有预约" desc="设备上架后可被用户预约。" />}
                  <div className="stack gap-12">
                    {(bookings.data?.items || []).map((b) => (
                      <div key={b.id} className="panel" style={{ padding: 16 }}>
                        <div className="row between" style={{ flexWrap: 'wrap', gap: 10 }}>
                          <div>
                            <div className="row gap-8" style={{ marginBottom: 4 }}>
                              <StatusTag status={b.status} text={statusText(b.status)} tone={statusTone(b.status)} />
                              <span className="small muted">{b.order_no}</span>
                            </div>
                            <div style={{ fontSize: 14.5 }}>{b.machinery_name} · {date(b.date)} {String(b.start_hour).padStart(2, '0')}:00-{String(b.end_hour).padStart(2, '0')}:00</div>
                            <div className="small muted">{b.user_name} · {b.contact_phone} · {b.location} · ¥{num(b.fee, 2)}</div>
                          </div>
                          <div className="row gap-8" style={{ flexWrap: 'wrap' }}>
                            <Link to={`/bookings/${b.id}`} className="btn btn--quiet btn--sm">详情</Link>
                            {b.status === 'pending' && (
                              <>
                                <button type="button" className="btn btn--primary btn--sm" onClick={() => bookingAction(b.id, 'confirm')} disabled={busy === `confirm${b.id}`}>确认</button>
                                <button type="button" className="btn btn--ghost btn--sm" onClick={() => bookingAction(b.id, 'reject')} disabled={busy === `reject${b.id}`}>拒绝</button>
                              </>
                            )}
                            {b.status === 'confirmed' && <button type="button" className="btn btn--primary btn--sm" onClick={() => bookingAction(b.id, 'start')}>开始作业</button>}
                            {b.status === 'in_progress' && <button type="button" className="btn btn--primary btn--sm" onClick={() => bookingAction(b.id, 'complete')}>完成</button>}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </>
              )}

              {tab === 'orders' && (
                <>
                  <div className="wb-head"><div><h2>订单管理</h2><p>线下收款可由商家确认；在线支付以服务端验签结果为准。</p></div></div>
                  {orders.loading && <Loading rows={3} height={80} />}
                  {!orders.loading && (orders.data?.items || []).length === 0 && <Empty title="还没有订单" />}
                  <div className="stack gap-12">
                    {(orders.data?.items || []).map((o) => (
                      <div key={o.id} className="panel" style={{ padding: 16 }}>
                        <div className="row between" style={{ flexWrap: 'wrap', gap: 10 }}>
                          <div>
                            <div className="row gap-8" style={{ marginBottom: 4 }}>
                              <StatusTag status={o.status} text={statusText(o.status)} tone={statusTone(o.status)} />
                              <span className="small muted">{o.order_no} · {dateTime(o.created_at)}</span>
                            </div>
                            <div style={{ fontSize: 14.5 }}>{o.first_item}{o.item_count > 1 ? ` 等 ${o.item_count} 件` : ''}</div>
                            <div className="small muted">买家 {o.buyer_name} · 合计 {money(o.total)}</div>
                          </div>
                          <div className="row gap-8">
                            <Link to={`/orders/${o.id}`} className="btn btn--quiet btn--sm">详情</Link>
                            {o.status === 'pending_payment' && <button type="button" className="btn btn--primary btn--sm" onClick={() => confirmOffline(o)}>确认收款</button>}
                            {o.status === 'paid' && <button type="button" className="btn btn--primary btn--sm" onClick={() => setShipOrder(o)}>发货</button>}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </>
              )}

              {tab === 'shop' && (
                <>
                  <div className="wb-head"><div><h2>店铺资料</h2><p>商家资料由平台审核维护，如需修改请联系管理员。</p></div></div>
                  <div className="panel panel--white" style={{ padding: 26 }}>
                    <div className="info-list">
                      <div className="info-list__row"><dt>店铺名称</dt><dd>{p?.shop_name}</dd></div>
                      <div className="info-list__row"><dt>联系人</dt><dd>{p?.contact_name} · {p?.contact_phone}</dd></div>
                      <div className="info-list__row"><dt>所在地区</dt><dd>{p?.region}</dd></div>
                      <div className="info-list__row"><dt>经营类型</dt><dd>{p?.business_type}</dd></div>
                      <div className="info-list__row"><dt>营业执照号</dt><dd>{p?.license_no || '未填写'}</dd></div>
                      <div className="info-list__row"><dt>审核状态</dt><dd>已通过 · {dateTime(p?.reviewed_at)}</dd></div>
                      <div className="info-list__row"><dt>店铺简介</dt><dd style={{ maxWidth: 380, textAlign: 'right' }}>{p?.intro || '未填写'}</dd></div>
                    </div>
                  </div>
                </>
              )}
            </div>
          </div>
        )}
      </div>

      <ProductForm open={productForm.open} editing={productForm.editing} onClose={() => setProductForm({ open: false, editing: null })} onSaved={products.reload} />
      <MachineForm open={machineForm.open} editing={machineForm.editing} onClose={() => setMachineForm({ open: false, editing: null })} onSaved={machines.reload} />
      <SlotModal open={Boolean(slotMachine)} machine={slotMachine} onClose={() => setSlotMachine(null)} onSaved={machines.reload} />

      <Modal
        open={Boolean(shipOrder)}
        onClose={() => setShipOrder(null)}
        title="填写发货信息"
        footer={
          <>
            <button type="button" className="btn btn--ghost btn--sm" onClick={() => setShipOrder(null)}>取消</button>
            <button type="button" className="btn btn--primary btn--sm" onClick={ship} disabled={busy === 'ship'}>确认发货</button>
          </>
        }
      >
        <div className="stack gap-16">
          <div className="notice notice--plain small">请填写真实物流公司与运单号，平台不生成虚构物流轨迹。</div>
          <label className="field"><span className="field__label">物流公司</span><input className="input" value={company} onChange={(e) => setCompany(e.target.value)} /></label>
          <label className="field"><span className="field__label">运单号</span><input className="input" value={trackingNo} onChange={(e) => setTrackingNo(e.target.value)} /></label>
        </div>
      </Modal>
    </>
  );
}
