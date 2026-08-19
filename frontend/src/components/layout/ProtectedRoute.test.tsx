import { render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import { ProtectedRoute } from './ProtectedRoute';
import type { AuthUser } from '@/lib/api/types';

/**
 * Role gating is an authorization boundary, so it is worth asserting directly rather than trusting
 * that the backend will catch everything: `super_admin`-only pages are registered in the router for
 * *every* signed-in user and rely entirely on this component to keep them out.
 */

const mockAuth = vi.fn();
vi.mock('@/context/auth-context', () => ({ useAuth: () => mockAuth() }));

const asUser = (role: AuthUser['role']) => ({
  isAuthenticated: true,
  isLoading: false,
  user: { id: 'u1', email: 'a@b.test', name: 'A', role },
});

const renderAt = (path: string, element: React.ReactNode) =>
  render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/admin" element={element} />
        <Route path="/login" element={<div>login page</div>} />
        <Route path="/dashboard" element={<div>dashboard</div>} />
      </Routes>
    </MemoryRouter>,
  );

describe('ProtectedRoute', () => {
  it('waits for boot hydration instead of bouncing a returning user to /login', () => {
    // The refresh cookie is still being exchanged; redirecting here would sign out every user who
    // reloads the page.
    mockAuth.mockReturnValue({ isAuthenticated: false, isLoading: true, user: null });

    renderAt('/admin', <ProtectedRoute>secret</ProtectedRoute>);

    expect(screen.queryByText('login page')).not.toBeInTheDocument();
    expect(screen.queryByText('secret')).not.toBeInTheDocument();
  });

  it('redirects an unauthenticated visitor to /login', () => {
    mockAuth.mockReturnValue({ isAuthenticated: false, isLoading: false, user: null });

    renderAt('/admin', <ProtectedRoute>secret</ProtectedRoute>);

    expect(screen.getByText('login page')).toBeInTheDocument();
  });

  it('renders an unrestricted route for any signed-in user', () => {
    mockAuth.mockReturnValue(asUser('user'));

    renderAt('/admin', <ProtectedRoute>allowed</ProtectedRoute>);

    expect(screen.getByText('allowed')).toBeInTheDocument();
  });

  it('keeps a plain user out of a super_admin-only route', () => {
    mockAuth.mockReturnValue(asUser('user'));

    renderAt('/admin', <ProtectedRoute roles={['super_admin']}>admin console</ProtectedRoute>);

    expect(screen.queryByText('admin console')).not.toBeInTheDocument();
  });

  it('lets a super_admin into a super_admin-only route', () => {
    mockAuth.mockReturnValue(asUser('super_admin'));

    renderAt('/admin', <ProtectedRoute roles={['super_admin']}>admin console</ProtectedRoute>);

    expect(screen.getByText('admin console')).toBeInTheDocument();
  });
});
