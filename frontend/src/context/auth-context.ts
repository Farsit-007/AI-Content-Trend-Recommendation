import { createContext, useContext } from 'react';
import type { AuthUser } from '@/lib/api/types';

export interface AuthContextValue {
  user: AuthUser | null;
  isAuthenticated: boolean;
  /** True during boot-time session hydration. */
  isLoading: boolean;
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
}

export const AuthContext = createContext<AuthContextValue | null>(null);

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error('useAuth must be used within <AuthProvider>');
  }
  return ctx;
}
