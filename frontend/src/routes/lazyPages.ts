import { lazy } from 'react';

/**
 * Every page in the app, as a lazily-loaded component. One module so there is a single list of what
 * gets code-split, and so the route config files stay pure data (`TUserPath[]`) — which also keeps
 * `react-refresh/only-export-components` satisfied, since a file may not both declare components and
 * export non-component values.
 *
 * `routeGenerator` wraps each of these in a Suspense boundary; the public pages in `routes.tsx` get
 * one inline.
 */

// Public
export const Landing = lazy(() => import('@/pages/Landing'));
export const About = lazy(() => import('@/pages/About'));
export const Login = lazy(() => import('@/pages/Login'));
export const ForgotPassword = lazy(() => import('@/pages/ForgotPassword'));
export const ResetPassword = lazy(() => import('@/pages/ResetPassword'));

// Dashboard — every authenticated user
export const Overview = lazy(() => import('@/pages/dashboard/Overview'));
export const Feed = lazy(() => import('@/pages/dashboard/Feed'));
/** Studio hosts Compose (Generate) and Library (Drafts) as tabs — see Studio.tsx. The two inner
 *  pages stay separately lazy so opening one tab does not download the other. */
export const Studio = lazy(() => import('@/pages/dashboard/Studio'));
export const Generate = lazy(() => import('@/pages/dashboard/Generate'));
export const Drafts = lazy(() => import('@/pages/dashboard/Drafts'));
export const Chat = lazy(() => import('@/pages/dashboard/Chat'));
export const Team = lazy(() => import('@/pages/dashboard/settings/Team'));
export const ActivityLog = lazy(() => import('@/pages/dashboard/ActivityLog'));
export const Guide = lazy(() => import('@/pages/dashboard/Guide'));
export const Account = lazy(() => import('@/pages/dashboard/Account'));
export const Usage = lazy(() => import('@/pages/dashboard/Usage'));

// Dashboard — super admin only. The set that matters most for bundle size: a normal user never opens
// any of these, and until this split every one of them shipped to every visitor.
export const Admin = lazy(() => import('@/pages/dashboard/Admin'));
export const AdminUsers = lazy(() => import('@/pages/dashboard/admin/Users'));
export const AdminTeams = lazy(() => import('@/pages/dashboard/admin/Teams'));
export const AdminCatalog = lazy(() => import('@/pages/dashboard/admin/Catalog'));
export const StylePacks = lazy(() => import('@/pages/dashboard/admin/StylePacks'));
export const AIProviders = lazy(() => import('@/pages/dashboard/admin/AIProviders'));
