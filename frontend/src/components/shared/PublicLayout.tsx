import { Outlet } from 'react-router-dom';
import { PublicNavbar } from './PublicNavbar';

/** Public shell: lightweight marketing navbar above public pages. */
export function PublicLayout() {
  return (
    <div className="flex min-h-svh flex-col">
      <PublicNavbar />
      {/* pt-16 offsets the fixed h-16 navbar so content isn't hidden underneath. */}
      <main className="flex-1 pt-16">
        <Outlet />
      </main>
    </div>
  );
}
