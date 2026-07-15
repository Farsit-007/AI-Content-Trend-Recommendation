import { createBrowserRouter, Navigate, Outlet } from 'react-router-dom';
import { AuthProvider } from '@/context/AuthContext';
import { PublicLayout } from '@/components/shared/PublicLayout';
import { MainLayout } from '@/components/layout/MainLayout';
import { ProtectedRoute } from '@/components/layout/ProtectedRoute';
import { routeGenerator } from '@/utils/routesGenerator';
import { supperAdminPaths } from './supperAdmin.routes';
import Landing from '@/pages/Landing';
import About from '@/pages/About';
import Login from '@/pages/Login';

// The dashboard registers the full (super-admin) route set; role-restricted
// entries are guarded individually, and the sidebar shows only what the
// current role is allowed to see. AuthProvider is a root route element so it
// can use router hooks (useNavigate) while living inside the router.
export const router = createBrowserRouter([
  {
    element: (
      <AuthProvider>
        <Outlet />
      </AuthProvider>
    ),
    children: [
      {
        element: <PublicLayout />,
        children: [
          { path: '/', element: <Landing /> },
          { path: '/about', element: <About /> },
        ],
      },
      { path: '/login', element: <Login /> },
      {
        element: <ProtectedRoute />,
        children: [
          {
            path: '/dashboard',
            element: <MainLayout />,
            children: routeGenerator(supperAdminPaths),
          },
        ],
      },
      { path: '*', element: <Navigate to="/" replace /> },
    ],
  },
]);
