import { Link } from 'react-router-dom';

const ITEMS = [
  { to: '/diagnose', label: '病虫害识别', idx: '01' },
  { to: '/supply', label: '产销对接', idx: '02' },
  { to: '/machinery', label: '农机服务', idx: '03' },
  { to: '/shop', label: '农资商城', idx: '04' },
  { to: '/prices', label: '大宗行情', idx: '05' },
];

export default function ServiceBar({ active }) {
  return (
    <div className="service-bar">
      <div className="container service-bar__inner">
        <span className="service-bar__label">服务</span>
        {ITEMS.map((it) => (
          <Link
            key={it.to}
            to={it.to}
            className={`service-bar__item ${active === it.idx ? 'is-active' : ''}`}
            aria-current={active === it.idx ? 'page' : undefined}
          >
            <span className="idx">{it.idx}</span>
            <span>{it.label}</span>
          </Link>
        ))}
      </div>
    </div>
  );
}
