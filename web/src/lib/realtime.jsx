import { createContext, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { post } from './api.js';
import { useAuth } from './auth.jsx';
import { useToast } from './toast.jsx';

const RealtimeCtx = createContext({ counts: { notifications: 0, messages: 0 }, connected: false, subscribe: () => () => {} });

const EVENTS = ['ready', 'notification', 'message', 'unread', 'order', 'booking', 'diagnosis', 'inquiry', 'merchant', 'read', 'connected'];

export function RealtimeProvider({ children }) {
  const { user } = useAuth();
  const toast = useToast();
  const location = useLocation();
  const [counts, setCounts] = useState({ notifications: 0, messages: 0 });
  const [connected, setConnected] = useState(false);
  const listeners = useRef(new Map());
  const pathRef = useRef(location.pathname);
  pathRef.current = location.pathname;

  const subscribe = useMemo(
    () => (type, handler) => {
      const set = listeners.current.get(type) || new Set();
      set.add(handler);
      listeners.current.set(type, set);
      return () => set.delete(handler);
    },
    [],
  );

  const emit = (type, payload) => {
    for (const fn of listeners.current.get(type) || []) {
      try {
        fn(payload);
      } catch (err) {
        console.error('realtime handler failed', err);
      }
    }
  };

  useEffect(() => {
    if (!user) {
      setConnected(false);
      return undefined;
    }
    let es;
    let stopped = false;
    let retryTimer;

    const connect = async () => {
      if (stopped) return;
      try {
        const { ticket } = await post('/events/ticket');
        if (stopped) return;
        es = new EventSource(`/api/events?ticket=${encodeURIComponent(ticket)}`);
        es.onopen = () => setConnected(true);
        const handle = (type) => (e) => {
          let data = null;
          try {
            data = JSON.parse(e.data);
          } catch {
            data = null;
          }
          if (type === 'ready') setConnected(true);
          if (type === 'unread' && data) setCounts({ notifications: data.notifications ?? 0, messages: data.messages ?? 0 });
          if (type === 'ready' && data?.counts) setCounts(data.counts);
          if (type === 'notification' && data?.counts) setCounts(data.counts);
          if (type === 'notification' && data?.notification) {
            if (pathRef.current !== '/messages') toast.info(data.notification.title);
          }
          if (type === 'message' && data?.message && !data.message.mine && pathRef.current !== '/messages') {
            toast.info(`${data.message.senderName || '对方'}：${String(data.message.body).slice(0, 28)}`);
          }
          emit(type, data);
        };
        for (const type of EVENTS) es.addEventListener(type, handle(type));
        es.onerror = () => {
          setConnected(false);
          es?.close();
          if (!stopped) retryTimer = setTimeout(connect, 4000);
        };
      } catch {
        setConnected(false);
        if (!stopped) retryTimer = setTimeout(connect, 6000);
      }
    };
    connect();

    return () => {
      stopped = true;
      clearTimeout(retryTimer);
      es?.close();
      setConnected(false);
    };
  }, [user?.id, toast]);

  const value = useMemo(() => ({ counts, connected, subscribe, setCounts }), [counts, connected, subscribe]);
  return <RealtimeCtx.Provider value={value}>{children}</RealtimeCtx.Provider>;
}

export const useRealtime = () => useContext(RealtimeCtx);

/** 订阅单类实时事件 */
export function useRealtimeEvent(type, handler) {
  const { subscribe } = useRealtime();
  useEffect(() => subscribe(type, handler), [type, handler, subscribe]);
}
