import { useEffect, useId, useRef } from 'react';
import { Link } from 'react-router-dom';

export function Field({ label, required, hint, error, htmlFor, children, className = '' }) {
  return (
    <div className={`field ${className}`}>
      {label && (
        <label className="field__label" htmlFor={htmlFor}>
          {label}
          {required && <span className="req">*</span>}
        </label>
      )}
      {children}
      {error ? <span className="field__error">{error}</span> : hint ? <span className="field__hint">{hint}</span> : null}
    </div>
  );
}

export function Spinner({ size = 16 }) {
  return <span className="spinner" style={{ width: size, height: size }} aria-hidden="true" />;
}

export function Loading({ rows = 3, height = 74 }) {
  return (
    <div className="stack gap-12" aria-busy="true" aria-label="加载中">
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="skeleton" style={{ height, opacity: 1 - i * 0.15 }} />
      ))}
    </div>
  );
}

export function Empty({ title = '暂无内容', desc, action, icon }) {
  return (
    <div className="empty">
      {icon ? <div style={{ marginBottom: 12, color: 'var(--line-strong)' }}>{icon}</div> : null}
      <div className="empty__title">{title}</div>
      {desc && <p className="small" style={{ maxWidth: 420, margin: '0 auto 16px' }}>{desc}</p>}
      {action}
    </div>
  );
}

export function ErrorState({ error, onRetry }) {
  const message = error?.message || '加载失败，请稍后重试';
  return (
    <div className="empty" role="alert">
      <div className="empty__title">内容没有加载出来</div>
      <p className="small" style={{ marginBottom: 16 }}>{message}</p>
      {onRetry && (
        <button type="button" className="btn btn--ghost btn--sm" onClick={onRetry}>
          重新加载
        </button>
      )}
    </div>
  );
}

export function Pagination({ page, totalPages, total, onChange }) {
  if (!totalPages || totalPages <= 1) return null;
  const pages = [];
  const start = Math.max(1, Math.min(page - 2, totalPages - 4));
  for (let i = start; i <= Math.min(totalPages, start + 4); i++) pages.push(i);
  return (
    <nav className="pagination" aria-label="分页">
      <button type="button" className="pagination__btn" onClick={() => onChange(page - 1)} disabled={page <= 1}>
        上一页
      </button>
      {start > 1 && <span className="small muted">…</span>}
      {pages.map((p) => (
        <button
          key={p}
          type="button"
          className="pagination__btn"
          aria-current={p === page ? 'page' : undefined}
          onClick={() => onChange(p)}
        >
          {p}
        </button>
      ))}
      {pages[pages.length - 1] < totalPages && <span className="small muted">…</span>}
      <button type="button" className="pagination__btn" onClick={() => onChange(page + 1)} disabled={page >= totalPages}>
        下一页
      </button>
      <span className="pagination__info">共 {total} 条</span>
    </nav>
  );
}

export function Tabs({ tabs, value, onChange, ariaLabel }) {
  return (
    <div className="tabs" role="tablist" aria-label={ariaLabel}>
      {tabs.map((t) => (
        <button
          key={t.value}
          type="button"
          role="tab"
          className="tab"
          aria-selected={value === t.value}
          onClick={() => onChange(t.value)}
        >
          {t.label}
          {t.count != null && t.count > 0 ? <span className="muted small"> {t.count}</span> : null}
        </button>
      ))}
    </div>
  );
}

export function Modal({ open, onClose, title, children, footer, width }) {
  const ref = useRef(null);
  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e) => {
      if (e.key === 'Escape') onClose?.();
      if (e.key === 'Tab' && ref.current) {
        const nodes = ref.current.querySelectorAll('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])');
        if (!nodes.length) return;
        const first = nodes[0];
        const last = nodes[nodes.length - 1];
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    };
    document.addEventListener('keydown', onKey);
    const prev = document.activeElement;
    setTimeout(() => ref.current?.focus(), 30);
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = '';
      prev?.focus?.();
    };
  }, [open, onClose]);

  if (!open) return null;
  return (
    <div className="overlay" onMouseDown={(e) => e.target === e.currentTarget && onClose?.()}>
      <div className="modal" role="dialog" aria-modal="true" aria-label={title} tabIndex={-1} ref={ref} style={width ? { maxWidth: width } : undefined}>
        <div className="modal__head">
          <h3 className="h3" style={{ fontSize: 21 }}>{title}</h3>
          <button type="button" className="icon-btn" onClick={onClose} aria-label="关闭">
            ×
          </button>
        </div>
        {children}
        {footer && <div className="row gap-12 mt-24" style={{ justifyContent: 'flex-end' }}>{footer}</div>}
      </div>
    </div>
  );
}

export function StatusTag({ status, text, tone }) {
  const cls = tone === 'olive' ? 'tag--olive' : tone === 'wheat' ? 'tag--wheat' : tone === 'danger' ? 'tag--danger' : tone === 'muted' ? 'tag--muted' : '';
  return <span className={`tag ${cls}`}>{text || status}</span>;
}

export function SectionHead({ index, title, desc, more, moreLabel = '查看全部' }) {
  return (
    <div className="section-head">
      <div className="section-head__title">
        {index && <span className="section-head__index">{index}</span>}
        <div>
          <h2 className="h2">{title}</h2>
          {desc && <p className="small muted" style={{ marginTop: 6, maxWidth: 620 }}>{desc}</p>}
        </div>
      </div>
      {more && (
        <Link className="section-head__more" to={more}>
          {moreLabel} →
        </Link>
      )}
    </div>
  );
}

export function Breadcrumbs({ items }) {
  return (
    <div className="page-head__crumbs">
      {items.map((it, i) => (
        <span key={`${it.label}-${i}`} style={{ display: 'inline-flex', gap: 8, alignItems: 'center' }}>
          {i > 0 && <span aria-hidden="true">/</span>}
          {it.to ? <Link to={it.to}>{it.label}</Link> : <span style={{ color: 'var(--ink-soft)' }}>{it.label}</span>}
        </span>
      ))}
    </div>
  );
}

export function Avatar({ name, url, size = 'md' }) {
  const cls = size === 'lg' ? 'avatar avatar--lg' : 'avatar';
  return <span className={cls}>{url ? <img src={url} alt="" /> : (name || '用').slice(0, 1)}</span>;
}

export function Stars({ value = 0, onChange, readOnly = false }) {
  const id = useId();
  return (
    <div className="row gap-4" role={readOnly ? 'img' : 'radiogroup'} aria-label={`评分 ${value} 分`}>
      {[1, 2, 3, 4, 5].map((n) => (
        <button
          key={`${id}-${n}`}
          type="button"
          disabled={readOnly}
          onClick={() => onChange?.(n)}
          aria-label={`${n} 分`}
          style={{
            background: 'none',
            border: 0,
            padding: '0 1px',
            cursor: readOnly ? 'default' : 'pointer',
            color: n <= value ? 'var(--wheat)' : 'var(--line-strong)',
            fontSize: 17,
            lineHeight: 1,
          }}
        >
          ★
        </button>
      ))}
    </div>
  );
}

/** 手写 SVG 折线图：仅展示同口径数据点 */
export function PriceChart({ points, unit, height = 220 }) {
  if (!points?.length) return null;
  const w = 720;
  const h = height;
  const padL = 52;
  const padR = 16;
  const padT = 16;
  const padB = 34;
  const prices = points.map((p) => Number(p.price));
  const min = Math.min(...prices);
  const max = Math.max(...prices);
  const span = max - min || max * 0.05 || 1;
  const yMin = min - span * 0.12;
  const yMax = max + span * 0.12;
  const x = (i) => padL + (i / Math.max(1, points.length - 1)) * (w - padL - padR);
  const y = (v) => padT + (1 - (v - yMin) / (yMax - yMin)) * (h - padT - padB);
  const path = points.map((p, i) => `${i === 0 ? 'M' : 'L'}${x(i).toFixed(1)},${y(Number(p.price)).toFixed(1)}`).join(' ');
  const area = `${path} L${x(points.length - 1).toFixed(1)},${h - padB} L${padL},${h - padB} Z`;
  const ticks = 4;
  const labelIdx = points.length > 6 ? [0, Math.floor(points.length / 2), points.length - 1] : points.map((_, i) => i);

  return (
    <svg className="chart-svg" viewBox={`0 0 ${w} ${h}`} role="img" aria-label={`价格趋势图，共 ${points.length} 个数据点，单位 ${unit || ''}`}>
      {Array.from({ length: ticks + 1 }).map((_, i) => {
        const v = yMin + ((yMax - yMin) * i) / ticks;
        const yy = y(v);
        return (
          <g key={i}>
            <line x1={padL} y1={yy} x2={w - padR} y2={yy} stroke="#DEDCCB" strokeWidth="1" strokeDasharray={i === 0 ? '0' : '3 4'} />
            <text x={padL - 8} y={yy + 4} textAnchor="end" fontSize="10" fill="#8A9088">
              {v.toFixed(2)}
            </text>
          </g>
        );
      })}
      <path d={area} fill="rgba(66,82,61,0.07)" />
      <path d={path} fill="none" stroke="#42523D" strokeWidth="1.6" strokeLinejoin="round" strokeLinecap="round" />
      {points.map((p, i) => (
        <circle key={i} cx={x(i)} cy={y(Number(p.price))} r="2.6" fill="#F4F1E8" stroke="#42523D" strokeWidth="1.3" />
      ))}
      {labelIdx.map((i) => (
        <text key={i} x={x(i)} y={h - 12} textAnchor={i === 0 ? 'start' : i === points.length - 1 ? 'end' : 'middle'} fontSize="10" fill="#8A9088">
          {String(points[i].collected_at).slice(5, 10)}
        </text>
      ))}
    </svg>
  );
}
