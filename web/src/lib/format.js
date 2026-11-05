export const CROPS = ['番茄', '黄瓜', '辣椒', '苹果', '葡萄', '柑橘', '水稻', '小麦'];
export const CROP_OPTIONS = [
  { value: 'tomato', label: '番茄' },
  { value: 'cucumber', label: '黄瓜' },
  { value: 'pepper', label: '辣椒' },
  { value: 'apple', label: '苹果' },
  { value: 'grape', label: '葡萄' },
  { value: 'citrus', label: '柑橘' },
  { value: 'rice', label: '水稻' },
  { value: 'wheat', label: '小麦' },
];
export const CROP_LABEL = Object.fromEntries(CROP_OPTIONS.map((c) => [c.value, c.label]));
export const CROP_VALUE = Object.fromEntries(CROP_OPTIONS.map((c) => [c.label, c.value]));

export const POST_CATEGORIES = ['蔬菜', '水果', '粮食', '油料', '茶叶', '中药材', '畜禽', '水产', '其他'];
export const PRODUCT_CATEGORIES = ['种子种苗', '肥料', '农药', '农膜农机具', '饲料', '其他'];
export const UNITS = ['吨', '公斤', '斤', '件', '箱', '亩'];
export const MACHINE_TYPES = ['拖拉机', '收割机', '植保无人机', '播种机', '插秧机', '烘干设备', '运输车辆', '其他'];

export const PROVINCES = [
  '北京市', '天津市', '河北省', '山西省', '内蒙古自治区', '辽宁省', '吉林省', '黑龙江省',
  '上海市', '江苏省', '浙江省', '安徽省', '福建省', '江西省', '山东省', '河南省',
  '湖北省', '湖南省', '广东省', '广西壮族自治区', '海南省', '重庆市', '四川省', '贵州省',
  '云南省', '西藏自治区', '陕西省', '甘肃省', '青海省', '宁夏回族自治区', '新疆维吾尔自治区',
];

export const STATUS_TEXT = {
  draft: '草稿',
  pending: '待审核',
  active: '已发布',
  rejected: '未通过',
  closed: '已关闭',
  expired: '已过期',
  queued: '排队中',
  processing: '识别中',
  completed: '已完成',
  failed: '未完成',
  needs_review: '建议复核',
  open: '待受理',
  accepted: '已受理',
  replied: '已回复',
  pending_payment: '待付款',
  paid: '待发货',
  shipped: '已发货',
  cancelled: '已取消',
  refunding: '售后中',
  refunded: '已退款',
  confirmed: '已确认',
  in_progress: '作业中',
  requested: '待处理',
  approved: '已批准',
};

export const STATUS_TONE = {
  active: 'olive',
  completed: 'olive',
  replied: 'olive',
  paid: 'wheat',
  confirmed: 'olive',
  in_progress: 'wheat',
  pending: 'wheat',
  pending_payment: 'wheat',
  queued: 'muted',
  processing: 'wheat',
  needs_review: 'wheat',
  draft: 'muted',
  closed: 'muted',
  expired: 'muted',
  cancelled: 'muted',
  rejected: 'danger',
  failed: 'danger',
  refunding: 'danger',
  refunded: 'muted',
  open: 'wheat',
};

export const statusText = (s) => STATUS_TEXT[s] || s;
export const statusTone = (s) => STATUS_TONE[s] || 'muted';

export function money(value, withSymbol = true) {
  if (value === null || value === undefined || Number.isNaN(Number(value))) return '—';
  const n = Number(value);
  const s = n.toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return withSymbol ? `¥${s}` : s;
}
export function num(value, digits = 0) {
  if (value === null || value === undefined) return '—';
  return Number(value).toLocaleString('zh-CN', { maximumFractionDigits: digits });
}
export function date(value) {
  if (!value) return '—';
  return String(value).slice(0, 10);
}
export function dateTime(value) {
  if (!value) return '—';
  return String(value).replace('T', ' ').slice(0, 16);
}
export function relative(value) {
  if (!value) return '';
  const t = new Date(String(value).replace(' ', 'T')).getTime();
  if (Number.isNaN(t)) return '';
  const diff = Date.now() - t;
  if (diff < 60_000) return '刚刚';
  if (diff < 3600_000) return `${Math.floor(diff / 60_000)} 分钟前`;
  if (diff < 86400_000) return `${Math.floor(diff / 3600_000)} 小时前`;
  if (diff < 7 * 86400_000) return `${Math.floor(diff / 86400_000)} 天前`;
  return date(value);
}
export const priceUnit = (priceType, price, unit) =>
  priceType === 'negotiable' ? '价格面议' : price != null ? `¥${num(price, 2)}/${unit}` : '—';

export const PRICING_LABEL = { per_mu: '元/亩', per_hour: '元/小时', per_day: '元/天' };
export const pricingLabel = (t) => PRICING_LABEL[t] || t;

export function maskPhone(p) {
  if (!p) return '';
  return String(p).replace(/^(\d{3})\d{4}(\d{4})$/, '$1****$2');
}
