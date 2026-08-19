import { render, screen, waitFor } from '@testing-library/react';
import { lazy } from 'react';
import { createMemoryRouter, RouterProvider } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import { routeGenerator } from './routesGenerator';
import type { TUserPath } from '@/types';

/**
 * Routing here is data-driven — one `TUserPath[]` produces both the routes and the sidebar — so this
 * function is the single point where a mistake silently unguards a page or drops one entirely.
 */

const mockAuth = vi.fn(() => ({
  isAuthenticated: true,
  isLoading: false,
  user: { id: 'u1', email: 'a@b.test', name: 'A', role: 'user' as const },
}));
vi.mock('@/context/auth-context', () => ({ useAuth: () => mockAuth() }));

const paths: TUserPath[] = [
  { name: 'Overview', index: true, element: <div>overview</div> },
  { name: 'Feed', path: 'feed', element: <div>feed</div> },
  { name: 'Users', path: 'admin/users', element: <div>admin users</div>, roles: ['super_admin'] },
  // No element: a config entry that should produce no route at all.
  { name: 'Ghost', path: 'ghost' },
];

/** Mounts the generated routes through the real router, the same way routes.tsx does. */
const renderRoutes = (entry: string, children = routeGenerator(paths)) =>
  render(
    <RouterProvider
      router={createMemoryRouter(
        [
          { path: '/dashboard', children },
          { path: '/login', element: <div>login page</div> },
        ],
        { initialEntries: [entry] },
      )}
    />,
  );

describe('routeGenerator', () => {
  it('produces one route per entry that has an element, and skips those that do not', () => {
    const routes = routeGenerator(paths);
    expect(routes).toHaveLength(3);
  });

  it('marks the index entry as an index route rather than giving it a path', () => {
    const [first] = routeGenerator(paths);
    expect(first.index).toBe(true);
    expect(first.path).toBeUndefined();
  });

  it('renders an unrestricted route', async () => {
    renderRoutes('/dashboard/feed');
    expect(await screen.findByText('feed')).toBeInTheDocument();
  });

  it('guards an entry that declares roles', async () => {
    mockAuth.mockReturnValue({
      isAuthenticated: true,
      isLoading: false,
      user: { id: 'u1', email: 'a@b.test', name: 'A', role: 'user' as const },
    });

    renderRoutes('/dashboard/admin/users');

    // The route exists for everyone — only the guard keeps a plain user out of it.
    await waitFor(() => expect(screen.queryByText('admin users')).not.toBeInTheDocument());
  });

  it('wraps elements in Suspense so a lazy page does not crash the render', async () => {
    const Lazy = lazy(async () => ({ default: () => <div>lazy page</div> }));
    const routes = routeGenerator([{ name: 'Lazy', path: 'lazy', element: <Lazy /> }]);

    renderRoutes('/dashboard/lazy', routes);

    // Without the Suspense boundary this throws instead of resolving.
    expect(await screen.findByText('lazy page')).toBeInTheDocument();
  });

  it('catches a render error inside a page instead of blanking the app', async () => {
    const Boom = () => {
      throw new Error('kaboom');
    };
    const routes = routeGenerator([{ name: 'Boom', path: 'boom', element: <Boom /> }]);
    // The boundary logs the error; silence it so the run's output stays readable.
    vi.spyOn(console, 'error').mockImplementation(() => undefined);

    renderRoutes('/dashboard/boom', routes);

    expect(await screen.findByText(/didn't load/i)).toBeInTheDocument();
  });
});
