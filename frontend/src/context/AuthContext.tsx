import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import * as authApi from '@/lib/api/auth';
import { clearToken, setToken } from '@/lib/api/tokenStore';
import { queryClient } from '@/lib/queryClient';
import type { AuthUser } from '@/lib/api/types';
import { AuthContext, type AuthContextValue } from './auth-context';

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const navigate = useNavigate();
  const [user, setUser] = useState<AuthUser | null>(null);
  // Always loading on boot: with no persisted access token, the only way to know
  // whether a session exists is to try refreshing from the httpOnly cookie.
  const [isLoading, setIsLoading] = useState(true);

  // Boot hydration: silently mint a fresh in-memory access token from the refresh
  // cookie, then load the current user. A missing/expired cookie simply yields the
  // unauthenticated state (public routes still render; protected routes redirect).
  useEffect(() => {
    let active = true;
    authApi
      .refreshToken()
      .then((result) => {
        setToken(result.token);
        return authApi.getMe();
      })
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
    // Fetch the full profile (incl. team_ids) rather than the trimmed login payload.
    const me = await authApi.getMe();
    setUser(me);
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
