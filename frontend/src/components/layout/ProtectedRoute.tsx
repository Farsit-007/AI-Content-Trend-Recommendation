import { useAuth } from '@/context/auth-context';
import type { TUserRole } from '@/types';
import { Loader2 } from 'lucide-react';
import type { ReactNode } from 'react';
import { Navigate, Outlet } from 'react-router-dom';

interface ProtectedRouteProps {
  /** When provided, wraps a single element; otherwise renders nested routes via <Outlet />. */
  children?: ReactNode;
  /** Restrict access to these roles. */
  roles?: TUserRole[];
}

/** Gates authenticated routes: waits for boot hydration, redirects
 *  unauthenticated users to /login, and role-guards when `roles` is set. */
export function ProtectedRoute({ children, roles }: ProtectedRouteProps) {
  const { isAuthenticated, isLoading, user } = useAuth();

  // Wait for boot-time refresh to resolve before deciding to redirect, so a
  // returning user with a valid refresh cookie isn't bounced to /login.
  if (isLoading) {
    return (
      <div className="flex min-h-svh items-center justify-center">
        <Loader2 className="text-muted-foreground size-6 animate-spin" />
      </div>
    );
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }

  if (roles && user && !roles.includes(user.role)) {
    return <Navigate to="/dashboard" replace />;
  }

  return children ? <>{children}</> : <Outlet />;
}
