import { useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../lib/auth.jsx';
import { useToast } from '../lib/toast.jsx';
import { useTitle } from '../lib/hooks.js';
import { Field, Spinner } from '../components/ui.jsx';
import { useOutletContext } from 'react-router-dom';

function AuthShell({ title, sub, children, footer }) {
  return (
    <div className="auth-wrap">
      <div className="auth-visual">
        <img src="/images/auth-farm.jpg" alt="清晨的农田与远山" />
        <div className="auth-visual__quote">
          “把每一次判断的依据留下来，<br />下一季就不用从头再来。”
          <div className="small" style={{ marginTop: 10, opacity: 0.75, fontFamily: 'var(--font-sans)' }}>禾农云 · 田间记录</div>
        </div>
      </div>
      <div className="auth-form-wrap">
        <div className="auth-form">
          <h1>{title}</h1>
          <p className="auth-form__sub">{sub}</p>
          {children}
          <div className="auth-foot">{footer}</div>
        </div>
      </div>
    </div>
  );
}

export function Login() {
  useTitle('登录');
  const { login } = useAuth();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const toast = useToast();
  const { system } = useOutletContext() || {};
  const redirect = params.get('redirect') || '/';
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const submit = async (e) => {
    e.preventDefault();
    setError('');
    if (!email || !password) return setError('请输入邮箱和密码');
    setBusy(true);
    try {
      const u = await login(email.trim(), password);
      toast.ok(`欢迎回来，${u.name}`);
      navigate(redirect.startsWith('/') ? redirect : '/', { replace: true });
    } catch (err) {
      setError(err.message || '登录失败');
    } finally {
      setBusy(false);
    }
  };

  return (
    <AuthShell
      title="登录禾农云"
      sub="管理你的识别记录、供需信息、预约与订单。"
      footer={<>还没有账号？<Link to={`/register?redirect=${encodeURIComponent(redirect)}`} style={{ color: 'var(--olive)', textDecoration: 'underline', textUnderlineOffset: 3 }}>注册一个</Link></>}
    >
      <form onSubmit={submit}>
        <Field label="邮箱" required htmlFor="login-email">
          <input id="login-email" className="input" type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" />
        </Field>
        <Field label="密码" required htmlFor="login-password">
          <input id="login-password" className="input" type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="输入密码" />
        </Field>
        {error && <div className="notice notice--danger" style={{ marginBottom: 14 }}>{error}</div>}
        <div className="row between" style={{ marginBottom: 18 }}>
          <span />
          <Link to="/forgot-password" className="small" style={{ color: 'var(--olive)' }}>忘记密码？</Link>
        </div>
        <button type="submit" className="btn btn--primary btn--block btn--lg" disabled={busy}>
          {busy ? <><Spinner /> 登录中…</> : '登录'}
        </button>
      </form>

      {system?.demoMode && (
        <div className="notice notice--plain" style={{ marginTop: 22 }}>
          <div className="small" style={{ lineHeight: 1.9 }}>
            <strong>演示账号</strong>（仅本地验证使用）<br />
            管理员 admin@henongyun.cn / Admin@12345<br />
            商家 merchant@demo.henongyun.local / Demo@12345<br />
            用户 farmer@demo.henongyun.local / Demo@12345
          </div>
        </div>
      )}
    </AuthShell>
  );
}

export function Register() {
  useTitle('注册');
  const { register } = useAuth();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const toast = useToast();
  const redirect = params.get('redirect') || '/';
  const [form, setForm] = useState({ name: '', email: '', password: '', confirm: '', phone: '', region: '' });
  const [errors, setErrors] = useState({});
  const [busy, setBusy] = useState(false);

  const set = (k, v) => {
    setForm((f) => ({ ...f, [k]: v }));
    setErrors((e) => ({ ...e, [k]: undefined }));
  };

  const submit = async (e) => {
    e.preventDefault();
    const errs = {};
    if (form.name.trim().length < 2) errs.name = '请填写至少 2 个字的称呼';
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email)) errs.email = '请输入有效的邮箱地址';
    if (form.password.length < 8) errs.password = '密码至少 8 位';
    else if (!/[A-Za-z]/.test(form.password) || !/\d/.test(form.password)) errs.password = '密码需同时包含字母和数字';
    if (form.password !== form.confirm) errs.confirm = '两次输入的密码不一致';
    if (form.phone && !/^1[3-9]\d{9}$/.test(form.phone)) errs.phone = '手机号格式不正确';
    setErrors(errs);
    if (Object.keys(errs).length) return;
    setBusy(true);
    try {
      await register({
        name: form.name.trim(),
        email: form.email.trim(),
        password: form.password,
        phone: form.phone || undefined,
        region: form.region || undefined,
      });
      toast.ok('注册成功，已自动登录');
      navigate(redirect.startsWith('/') ? redirect : '/', { replace: true });
    } catch (err) {
      if (err.details?.length) setErrors(Object.fromEntries(err.details.map((d) => [d.field, d.message])));
      else setErrors({ form: err.message });
    } finally {
      setBusy(false);
    }
  };

  return (
    <AuthShell
      title="创建账号"
      sub="注册后可以发布供需、预约农机、购买农资并保存识别记录。"
      footer={<>已有账号？<Link to="/login" style={{ color: 'var(--olive)', textDecoration: 'underline', textUnderlineOffset: 3 }}>直接登录</Link></>}
    >
      <form onSubmit={submit}>
        <Field label="称呼" required error={errors.name} htmlFor="reg-name">
          <input id="reg-name" className="input" value={form.name} onChange={(e) => set('name', e.target.value)} autoComplete="name" placeholder="真实姓名或常用称呼" />
        </Field>
        <Field label="邮箱" required error={errors.email} htmlFor="reg-email">
          <input id="reg-email" className="input" type="email" value={form.email} onChange={(e) => set('email', e.target.value)} autoComplete="email" placeholder="用于登录与找回密码" />
        </Field>
        <div className="form-grid" style={{ gap: 14 }}>
          <Field label="密码" required error={errors.password} htmlFor="reg-pwd">
            <input id="reg-pwd" className="input" type="password" value={form.password} onChange={(e) => set('password', e.target.value)} autoComplete="new-password" placeholder="至少 8 位，含字母和数字" />
          </Field>
          <Field label="确认密码" required error={errors.confirm} htmlFor="reg-confirm">
            <input id="reg-confirm" className="input" type="password" value={form.confirm} onChange={(e) => set('confirm', e.target.value)} autoComplete="new-password" />
          </Field>
        </div>
        <Field label="手机号（选填）" error={errors.phone} hint="用于商家联系与农机预约，不在公开页面展示。" htmlFor="reg-phone">
          <input id="reg-phone" className="input" value={form.phone} onChange={(e) => set('phone', e.target.value)} inputMode="numeric" />
        </Field>
        {errors.form && <div className="notice notice--danger" style={{ marginBottom: 14 }}>{errors.form}</div>}
        <button type="submit" className="btn btn--primary btn--block btn--lg" disabled={busy}>
          {busy ? <><Spinner /> 注册中…</> : '创建账号'}
        </button>
        <p className="field__hint" style={{ marginTop: 12 }}>
          注册即表示同意平台对发布内容进行审核，并遵守农药、种子等农资的经营与使用规定。
        </p>
      </form>
    </AuthShell>
  );
}

export function ForgotPassword() {
  useTitle('找回密码');
  const navigate = useNavigate();
  const toast = useToast();
  const [step, setStep] = useState(1);
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const sendCode = async () => {
    setError('');
    setNotice('');
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return setError('请输入有效的邮箱地址');
    setBusy(true);
    try {
      const r = await fetch('/api/auth/password/forgot', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      });
      const data = await r.json().catch(() => ({}));
      if (!r.ok) {
        setError(data?.error?.message || '发送失败');
        return;
      }
      setNotice(data.message || '如果该邮箱已注册，验证码将在几分钟内送达');
      setStep(2);
    } catch {
      setError('网络异常，请稍后重试');
    } finally {
      setBusy(false);
    }
  };

  const reset = async () => {
    setError('');
    if (code.length !== 6) return setError('请输入 6 位验证码');
    if (password.length < 8) return setError('新密码至少 8 位');
    setBusy(true);
    try {
      const r = await fetch('/api/auth/password/reset', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, code, password }),
      });
      const data = await r.json().catch(() => ({}));
      if (!r.ok) {
        setError(data?.error?.message || '重置失败');
        return;
      }
      toast.ok('密码已重置，请使用新密码登录');
      navigate('/login');
    } catch {
      setError('网络异常，请稍后重试');
    } finally {
      setBusy(false);
    }
  };

  return (
    <AuthShell
      title="找回密码"
      sub="验证码会发送到注册邮箱，10 分钟内有效。"
      footer={<Link to="/login" style={{ color: 'var(--olive)' }}>返回登录</Link>}
    >
      <Field label="注册邮箱" required htmlFor="fp-email">
        <input id="fp-email" className="input" type="email" value={email} onChange={(e) => setEmail(e.target.value)} disabled={step === 2} />
      </Field>

      {step === 2 && (
        <>
          <Field label="验证码" required htmlFor="fp-code">
            <input id="fp-code" className="input" value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))} inputMode="numeric" placeholder="6 位数字" />
          </Field>
          <Field label="新密码" required htmlFor="fp-pwd">
            <input id="fp-pwd" className="input" type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="new-password" />
          </Field>
        </>
      )}

      {notice && <div className="notice" style={{ marginBottom: 14 }}>{notice}</div>}
      {error && <div className="notice notice--danger" style={{ marginBottom: 14 }}>{error}</div>}

      <button type="button" className="btn btn--primary btn--block btn--lg" onClick={step === 1 ? sendCode : reset} disabled={busy}>
        {busy ? <><Spinner /> 处理中…</> : step === 1 ? '发送验证码' : '重置密码'}
      </button>

      {step === 2 && (
        <button type="button" className="btn btn--quiet btn--block mt-8" onClick={sendCode} disabled={busy}>重新发送验证码</button>
      )}

      <div className="notice notice--plain" style={{ marginTop: 20 }}>
        <div className="small">
          验证码由服务端通过 SMTP 真实发送。若平台尚未配置邮件服务，会明确提示而不是假装发送成功。
        </div>
      </div>
    </AuthShell>
  );
}
