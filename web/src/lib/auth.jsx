import { createContext, useContext, useEffect, useMemo, useState, useCallback } from 'react';
import { bootstrapSession, get, logoutRequest, post, setAccessToken } from './api.js';

const AuthCtx = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [booting, setBooting] = useState(true);

  useEffect(() => {
    let alive = true;
    bootstrapSession()
      .then((u) => {
        if (alive && u) {
          setAccessToken(u.accessToken);
          setUser(u);
        }
      })
      .finally(() => alive && setBooting(false));
    return () => {
      alive = false;
    };
  }, []);

  const applySession = useCallback((payload) => {
    const u = payload?.user || payload;
    if (u?.accessToken) setAccessToken(u.accessToken);
    setUser(u);
    return u;
  }, []);

  const login = useCallback(
    async (email, password) => {
      const data = await post('/auth/login', { email, password });
      return applySession(data);
    },
    [applySession],
  );

  const register = useCallback(
    async (payload) => {
      const data = await post('/auth/register', payload);
      return applySession(data);
    },
    [applySession],
  );

  const logout = useCallback(async () => {
    await logoutRequest();
    setUser(null);
  }, []);

  const refreshUser = useCallback(async () => {
    try {
      const data = await get('/auth/me');
      setUser((prev) => ({ ...prev, ...data.user }));
      return data.user;
    } catch {
      return null;
    }
  }, []);

  const value = useMemo(
    () => ({ user, booting, login, register, logout, refreshUser, setUser, isMerchant: user?.role === 'merchant' || user?.role === 'admin' }),
    [user, booting, login, register, logout, refreshUser],
  );
  return <AuthCtx.Provider value={value}>{children}</AuthCtx.Provider>;
}

export const useAuth = () => useContext(AuthCtx);
