import { Outlet } from 'react-router-dom';
import { PublicNavbar } from './PublicNavbar';

/** Public shell: lightweight marketing navbar above public pages. */
export function PublicLayout() {
  return (
    <div className="flex min-h-svh flex-col">
      <PublicNavbar />
      <main className="flex-1">
        <Outlet />
      </main>
    </div>
  );
}
