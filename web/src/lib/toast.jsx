import { createContext, useCallback, useContext, useMemo, useRef, useState } from 'react';

const ToastCtx = createContext(null);

export function ToastProvider({ children }) {
  const [items, setItems] = useState([]);
  const seq = useRef(0);

  const remove = useCallback((id) => setItems((list) => list.filter((t) => t.id !== id)), []);

  const push = useCallback(
    (message, tone = 'ok', ms = 4200) => {
      const id = ++seq.current;
      setItems((list) => [...list.slice(-2), { id, message, tone }]);
      setTimeout(() => remove(id), ms);
      return id;
    },
    [remove],
  );

  const value = useMemo(
    () => ({
      ok: (m) => push(m, 'ok'),
      error: (m) => push(m, 'error', 6000),
      info: (m) => push(m, 'info'),
      remove,
    }),
    [push, remove],
  );

  return (
    <ToastCtx.Provider value={value}>
      {children}
      <div className="toasts" role="status" aria-live="polite">
        {items.map((t) => (
          <div key={t.id} className={`toast ${t.tone === 'error' ? 'toast--error' : 'toast--ok'}`}>
            <span style={{ flex: 1 }}>{t.message}</span>
            <button type="button" onClick={() => remove(t.id)} aria-label="关闭提示">
              ×
            </button>
          </div>
        ))}
      </div>
    </ToastCtx.Provider>
  );
}

export const useToast = () => useContext(ToastCtx);
