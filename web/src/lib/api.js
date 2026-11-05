let accessToken = null;
let refreshPromise = null;
const listeners = new Set();

export function setAccessToken(token) {
  accessToken = token;
  listeners.forEach((fn) => fn(token));
}
export function getAccessToken() {
  return accessToken;
}

export class ApiError extends Error {
  constructor(status, payload) {
    super(payload?.message || '请求失败');
    this.status = status;
    this.code = payload?.code || 'UNKNOWN';
    this.details = payload?.details;
  }
}

async function parse(res) {
  const text = await res.text();
  let data = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = null;
  }
  if (!res.ok) {
    const err = data?.error || {};
    throw new ApiError(res.status, { message: err.message || `请求失败（${res.status}）`, code: err.code, details: err.details });
  }
  return data;
}

async function doRefresh() {
  if (!refreshPromise) {
    refreshPromise = fetch('/api/auth/refresh', { method: 'POST', credentials: 'include' })
      .then(parse)
      .then((data) => {
        if (data?.user?.accessToken) setAccessToken(data.user.accessToken);
        return data?.user || null;
      })
      .catch(() => {
        setAccessToken(null);
        return null;
      })
      .finally(() => {
        refreshPromise = null;
      });
  }
  return refreshPromise;
}

export async function api(path, options = {}) {
  const { method = 'GET', body, headers = {}, signal, formData, retry = true } = options;
  const h = { ...headers };
  if (accessToken) h.Authorization = `Bearer ${accessToken}`;
  if (body !== undefined && !formData) h['Content-Type'] = 'application/json';

  const res = await fetch(`/api${path}`, {
    method,
    headers: h,
    credentials: 'include',
    body: formData ? body : body !== undefined ? JSON.stringify(body) : undefined,
    signal,
  });

  if (res.status === 401 && retry && !path.startsWith('/auth/')) {
    const user = await doRefresh();
    if (user) return api(path, { ...options, retry: false });
  }
  return parse(res);
}

export const get = (path, params) => {
  const qs = params ? `?${new URLSearchParams(Object.entries(params).filter(([, v]) => v !== undefined && v !== null && v !== ''))}` : '';
  return api(`${path}${qs}`);
};
export const post = (path, body) => api(path, { method: 'POST', body });
export const put = (path, body) => api(path, { method: 'PUT', body });
export const patch = (path, body) => api(path, { method: 'PATCH', body });
export const del = (path) => api(path, { method: 'DELETE' });
export const upload = (file, purpose = 'general', onProgress) => {
  const fd = new FormData();
  fd.append('file', file);
  fd.append('purpose', purpose);
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('POST', '/api/uploads');
    if (accessToken) xhr.setRequestHeader('Authorization', `Bearer ${accessToken}`);
    xhr.withCredentials = true;
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable && onProgress) onProgress(Math.round((e.loaded / e.total) * 100));
    };
    xhr.onload = () => {
      try {
        const data = JSON.parse(xhr.responseText || '{}');
        if (xhr.status >= 200 && xhr.status < 300) resolve(data.upload);
        else reject(new ApiError(xhr.status, { message: data?.error?.message || '上传失败', code: data?.error?.code }));
      } catch {
        reject(new ApiError(xhr.status, { message: '上传失败' }));
      }
    };
    xhr.onerror = () => reject(new ApiError(0, { message: '网络中断，上传失败' }));
    xhr.send(fd);
  });
};

export async function bootstrapSession() {
  return doRefresh();
}
export async function logoutRequest() {
  try {
    await api('/auth/logout', { method: 'POST', retry: false });
  } finally {
    setAccessToken(null);
  }
}
