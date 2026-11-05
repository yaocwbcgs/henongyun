import { useCallback, useEffect, useRef, useState } from 'react';

export function useAsync(fn, deps = [], options = {}) {
  const { immediate = true } = options;
  const [state, setState] = useState({ data: null, loading: immediate, error: null });
  const fnRef = useRef(fn);
  fnRef.current = fn;
  const seq = useRef(0);

  const run = useCallback(async () => {
    const id = ++seq.current;
    setState((s) => ({ ...s, loading: true, error: null }));
    try {
      const data = await fnRef.current();
      if (id === seq.current) setState({ data, loading: false, error: null });
      return data;
    } catch (err) {
      if (id === seq.current) setState({ data: null, loading: false, error: err });
      return null;
    }
  }, []);

  useEffect(() => {
    if (!immediate) return;
    run();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);

  return { ...state, reload: run, setData: (data) => setState((s) => ({ ...s, data })) };
}

export function useDebounced(value, delay = 350) {
  const [v, setV] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setV(value), delay);
    return () => clearTimeout(t);
  }, [value, delay]);
  return v;
}

export function useTitle(title) {
  useEffect(() => {
    document.title = title ? `${title} · 禾农云` : '禾农云 · 让每一季耕耘，都有更好的收获';
  }, [title]);
}

export function useQueryState(initial) {
  const [params, setParams] = useState(initial);
  const update = (patch) => setParams((p) => ({ ...p, ...patch }));
  return [params, update, setParams];
}
