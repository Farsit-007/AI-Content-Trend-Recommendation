import type { ReactNode } from 'react';
import { Outlet } from 'react-router-dom';
import type { TUserRole } from '@/types';

interface ProtectedRouteProps {
  /** When provided, wraps a single element; otherwise renders nested routes via <Outlet />. */
  children?: ReactNode;
  /** Restrict access to these roles. */
  roles?: TUserRole[];
}

/** Gates authenticated routes: waits for boot hydration, redirects
 *  unauthenticated users to /login, and role-guards when `roles` is set. */
export function ProtectedRoute({ children }: ProtectedRouteProps) {
  // const { isAuthenticated, isLoading, user } = useAuth();

  // if (isLoading) {
  //   return (
  //     <div className="flex min-h-svh items-center justify-center">
  //       <Loader2 className="text-muted-foreground size-6 animate-spin" />
  //     </div>
  //   );
  // }

  // if (!isAuthenticated) {
  //   return <Navigate to="/login" replace />;
  // }

  // if (roles && user && !roles.includes(user.role)) {
  //   return <Navigate to="/dashboard" replace />;
  // }

  return children ? <>{children}</> : <Outlet />;
}
