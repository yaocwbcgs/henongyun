import { useEffect, useRef, useState } from 'react';
import { Link, NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../lib/auth.jsx';
import { useRealtime } from '../lib/realtime.jsx';
import { get } from '../lib/api.js';
import { Avatar } from './ui.jsx';
import { PROVINCES } from '../lib/format.js';

const NAV = [
  { to: '/diagnose', label: '病虫害识别' },
  { to: '/supply', label: '产销对接' },
  { to: '/machinery', label: '农机服务' },
  { to: '/shop', label: '农资商城' },
  { to: '/prices', label: '大宗行情' },
];

const Icon = {
  search: (
    <svg width="17" height="17" viewBox="0 0 20 20" fill="none" aria-hidden="true">
      <circle cx="9" cy="9" r="6" stroke="currentColor" strokeWidth="1.5" />
      <path d="M13.5 13.5L17 17" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  ),
  bell: (
    <svg width="19" height="19" viewBox="0 0 20 20" fill="none" aria-hidden="true">
      <path d="M5 8a5 5 0 0110 0c0 3.2.8 4.6 1.5 5.4H3.5C4.2 12.6 5 11.2 5 8z" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round" />
      <path d="M8 16.2a2 2 0 004 0" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
    </svg>
  ),
  menu: (
    <svg width="20" height="20" viewBox="0 0 20 20" fill="none" aria-hidden="true">
      <path d="M3 6h14M3 10h14M3 14h14" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  ),
  chevron: (
    <svg width="10" height="6" viewBox="0 0 10 6" fill="none" aria-hidden="true">
      <path d="M1 1l4 4 4-4" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
    </svg>
  ),
};

function useSystemInfo() {
  const [info, setInfo] = useState(null);
  useEffect(() => {
    get('/system/info').then(setInfo).catch(() => {});
  }, []);
  return info;
}

export default function Layout() {
  const { user, logout } = useAuth();
  const { counts, connected } = useRealtime();
  const navigate = useNavigate();
  const location = useLocation();
  const system = useSystemInfo();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [q, setQ] = useState('');
  const [region, setRegion] = useState(() => localStorage.getItem('hn_region') || '全国');
  const menuRef = useRef(null);

  useEffect(() => {
    window.scrollTo({ top: 0, behavior: 'auto' });
    setMobileOpen(false);
    setMenuOpen(false);
  }, [location.pathname, location.search]);

  useEffect(() => {
    const onClick = (e) => {
      if (menuRef.current && !menuRef.current.contains(e.target)) setMenuOpen(false);
    };
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, []);

  const submitSearch = (e) => {
    e.preventDefault();
    navigate(`/supply?q=${encodeURIComponent(q.trim())}`);
  };

  const changeRegion = (v) => {
    setRegion(v);
    localStorage.setItem('hn_region', v);
    if (v !== '全国') navigate(`/supply?province=${encodeURIComponent(v)}`);
  };

  const totalUnread = (counts.messages || 0) + (counts.notifications || 0);

  return (
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>
      <a href="#main" className="skip-link">跳到主要内容</a>

      {system?.demoMode && (
        <div className="demo-bar" style={{ background: 'var(--wheat-soft)', borderBottom: '1px solid #e2d0b3' }}>
          <div className="container" style={{ display: 'flex', gap: 10, alignItems: 'center', padding: '7px 32px', fontSize: 12, color: '#7a5d34' }}>
            <span className="status-dot status-dot--warn" />
            当前运行在演示数据集：店铺、商品与供需信息均带「演示」标识，行情与识别结果不会伪造。生产部署请设置 <code>DEMO_SEED=false</code>。
          </div>
        </div>
      )}

      <header className="site-header">
        <div className="container site-header__inner">
          <Link to="/" className="brand" aria-label="禾农云首页">
            <span className="brand__mark" aria-hidden="true">禾</span>
            <span>
              <span className="brand__name">禾农云</span>
              <span className="brand__sub">HENONG CLOUD</span>
            </span>
          </Link>

          <nav className="nav-main" aria-label="主导航">
            {NAV.map((n) => (
              <NavLink key={n.to} to={n.to} className={({ isActive }) => `nav-link ${isActive ? 'is-active' : ''}`}>
                {n.label}
              </NavLink>
            ))}
          </nav>

          <div className="nav-tools">
            <label className="sr-only" htmlFor="region">选择地区</label>
            <div className="region-select" style={{ position: 'relative' }}>
              <span>{region === '全国' ? '全国' : region.replace(/省|市|自治区|壮族|回族|维吾尔/g, '')}</span>
              {Icon.chevron}
              <select
                id="region"
                value={region}
                onChange={(e) => changeRegion(e.target.value)}
                style={{ position: 'absolute', inset: 0, opacity: 0, cursor: 'pointer', width: '100%' }}
                aria-label="切换地区"
              >
                <option value="全国">全国</option>
                {PROVINCES.map((p) => (
                  <option key={p} value={p}>{p}</option>
                ))}
              </select>
            </div>

            <form className="nav-search" onSubmit={submitSearch} role="search">
              <input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="搜索供应与采购"
                aria-label="搜索供应与采购信息"
              />
              <button type="submit" aria-label="搜索">{Icon.search}</button>
            </form>

            <Link to="/messages" className="icon-btn" aria-label={`消息中心${totalUnread ? `，${totalUnread} 条未读` : ''}`}>
              {Icon.bell}
              {totalUnread > 0 && <span className="icon-btn__badge">{totalUnread > 99 ? '99+' : totalUnread}</span>}
            </Link>

            {user ? (
              <div className="dropdown" ref={menuRef}>
                <button type="button" className="user-chip" onClick={() => setMenuOpen((v) => !v)} aria-expanded={menuOpen} aria-haspopup="menu">
                  <Avatar name={user.name} url={user.avatarUrl} />
                  <span style={{ maxWidth: 78, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{user.name}</span>
                  {Icon.chevron}
                </button>
                {menuOpen && (
                  <div className="dropdown__menu" role="menu">
                    <Link to="/me" className="dropdown__item" role="menuitem">用户中心</Link>
                    <Link to="/orders" className="dropdown__item" role="menuitem">我的订单</Link>
                    <Link to="/bookings" className="dropdown__item" role="menuitem">我的预约</Link>
                    <Link to="/me?tab=favorites" className="dropdown__item" role="menuitem">我的收藏</Link>
                    {(user.role === 'merchant' || user.role === 'admin') && (
                      <>
                        <div className="dropdown__sep" />
                        <Link to="/merchant" className="dropdown__item" role="menuitem">商家工作台</Link>
                      </>
                    )}
                    {user.role === 'admin' && <Link to="/admin" className="dropdown__item" role="menuitem">管理后台</Link>}
                    <div className="dropdown__sep" />
                    <div className="dropdown__item" style={{ fontSize: 11.5, color: 'var(--muted)', cursor: 'default' }}>
                      <span className="row gap-8">
                        <span className={`status-dot ${connected ? 'status-dot--ok' : ''}`} />
                        {connected ? '实时连接正常' : '实时连接重连中'}
                      </span>
                    </div>
                    <button type="button" className="dropdown__item" role="menuitem" onClick={() => logout().then(() => navigate('/'))}>
                      退出登录
                    </button>
                  </div>
                )}
              </div>
            ) : (
              <div className="row gap-8" style={{ marginLeft: 4 }}>
                <Link to="/login" className="btn btn--quiet btn--sm">登录</Link>
                <Link to="/register" className="btn btn--primary btn--sm">注册</Link>
              </div>
            )}

            <button type="button" className="icon-btn nav-toggle" onClick={() => setMobileOpen((v) => !v)} aria-label="展开导航菜单" aria-expanded={mobileOpen}>
              {Icon.menu}
            </button>
          </div>
        </div>

        {mobileOpen && (
          <div className="mobile-nav container">
            <form className="mobile-search" onSubmit={submitSearch} role="search">
              <input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="搜索供应与采购"
                aria-label="搜索供应与采购信息"
              />
              <button type="submit" className="btn btn--primary btn--sm">搜索</button>
            </form>
            {NAV.map((n) => (
              <Link key={n.to} to={n.to}>{n.label}</Link>
            ))}
            <Link to="/messages">消息中心</Link>
            <Link to="/me">用户中心</Link>
            {user?.role === 'merchant' && <Link to="/merchant">商家工作台</Link>}
            {user?.role === 'admin' && <Link to="/admin">管理后台</Link>}
            {!user && <Link to="/login">登录 / 注册</Link>}
          </div>
        )}
      </header>

      <main id="main" style={{ flex: 1 }}>
        <Outlet context={{ system }} />
      </main>

      <footer className="site-footer">
        <div className="container">
          <div className="site-footer__top">
            <div>
              <div className="site-footer__brand">禾农云</div>
              <p className="site-footer__desc">
                面向种植户、合作社与农业经营主体的综合服务平台。把病虫害识别、产销对接、农机调度、农资采购与行情判断放在同一处，让每个生产决策都有据可依。
              </p>
            </div>
            <div className="site-footer__col">
              <h4>服务</h4>
              <Link to="/diagnose">病虫害识别</Link>
              <Link to="/knowledge">防控知识库</Link>
              <Link to="/supply">供应大厅</Link>
              <Link to="/demand">采购大厅</Link>
            </div>
            <div className="site-footer__col">
              <h4>经营</h4>
              <Link to="/machinery">农机服务</Link>
              <Link to="/shop">农资商城</Link>
              <Link to="/prices">大宗行情</Link>
              <Link to="/merchant">商家入驻</Link>
            </div>
            <div className="site-footer__col">
              <h4>关于</h4>
              <Link to="/me">用户中心</Link>
              <Link to="/messages">消息中心</Link>
              <a href="/api/system/info" target="_blank" rel="noreferrer">服务状态</a>
            </div>
          </div>
          <div className="site-footer__bottom">
            <span>© {new Date().getFullYear()} 禾农云 · 农业综合服务平台</span>
            <span>
              识别结果与行情数据均标注来源，不构成用药或投资建议 · 农技咨询由持证农技人员回复
            </span>
          </div>
        </div>
      </footer>
    </div>
  );
}
