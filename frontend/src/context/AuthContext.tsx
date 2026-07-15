import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import * as authApi from '@/lib/api/auth';
import { clearToken, getToken, setToken } from '@/lib/api/tokenStore';
import { queryClient } from '@/lib/queryClient';
import type { AuthUser } from '@/lib/api/types';
import { AuthContext, type AuthContextValue } from './auth-context';

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const navigate = useNavigate();
  const [user, setUser] = useState<AuthUser | null>(null);
  // Only "loading" when there's a stored token to validate; otherwise we already
  // know the user is unauthenticated (avoids a synchronous setState in the effect).
  const [isLoading, setIsLoading] = useState(() => !!getToken());

  // Boot hydration: if a token is stored, validate it via /auth/me. Clearing on
  // failure prevents rendering as authenticated with a stale/invalid token.
  useEffect(() => {
    if (!getToken()) return;
    let active = true;
    authApi
      .getMe()
      .then((me) => {
        if (active) setUser(me);
      })
      .catch(() => {
        clearToken();
        if (active) setUser(null);
      })
      .finally(() => {
        if (active) setIsLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);

  const login = useCallback(async (email: string, password: string) => {
    const result = await authApi.login(email, password);
    setToken(result.token);
    setUser(result.user);
  }, []);

  const logout = useCallback(async () => {
    try {
      await authApi.logout();
    } catch {
      /* ignore — clear the client session regardless */
    }
    clearToken();
    setUser(null);
    queryClient.clear();
    navigate('/login', { replace: true });
  }, [navigate]);

  const value = useMemo<AuthContextValue>(
    () => ({
      user,
      isAuthenticated: !!user,
      isLoading,
      login,
      logout,
    }),
    [user, isLoading, login, logout],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
