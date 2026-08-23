import { Suspense, type ReactNode } from "react";
import { createBrowserRouter, Navigate, Outlet } from "react-router-dom";
import { AuthProvider } from "@/context/AuthContext";
import { PublicLayout } from "@/components/shared/PublicLayout";
import { MainLayout } from "@/components/layout/MainLayout";
import { ProtectedRoute } from "@/components/layout/ProtectedRoute";
import { RouteErrorElement } from "@/components/layout/RouteErrorElement";
import { RouteFallback } from "@/components/layout/RouteFallback";
import { routeGenerator } from "@/utils/routesGenerator";
// Public pages are lazy too. Landing is the heaviest page in the app (aurora background, bento grid,
// testimonials, motion) and every authenticated user pays for it on first load otherwise.
import { About, ForgotPassword, Landing, Login, ResetPassword } from "./lazyPages";
import { superAdminPaths } from "./superAdmin.routes";

const suspended = (element: ReactNode) => (
  <Suspense fallback={<RouteFallback />}>{element}</Suspense>
);

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
    // Router-level last resort: catches anything the per-page boundary in routeGenerator can't,
    // including a lazy chunk that fails to load or an error thrown by a layout element itself.
    errorElement: <RouteErrorElement />,
    children: [
      {
        element: <PublicLayout />,
        children: [
          { path: "/", element: suspended(<Landing />) },
          { path: "/about", element: suspended(<About />) },
        ],
      },
      { path: "/login", element: suspended(<Login />) },
      { path: "/forgot-password", element: suspended(<ForgotPassword />) },
      { path: "/reset-password", element: suspended(<ResetPassword />) },
      {
        element: <ProtectedRoute />,
        children: [
          {
            path: "/dashboard",
            element: <MainLayout />,
            children: routeGenerator(superAdminPaths),
          },
        ],
      },
      { path: "*", element: <Navigate to="/" replace /> },
    ],
  },
]);
