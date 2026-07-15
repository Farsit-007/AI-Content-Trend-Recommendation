import { Outlet } from 'react-router-dom';
import { Navbar } from './Navbar';

/** Authenticated app shell: persistent navbar above the routed page. */
export function AppLayout() {
  return (
    <div className="flex min-h-svh flex-col">
      <Navbar />
      <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-8">
        <Outlet />
      </main>
    </div>
  );
}
