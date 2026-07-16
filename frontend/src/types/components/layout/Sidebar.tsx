import { NavLink } from 'react-router-dom';
import { useAuth } from '@/context/auth-context';
import { cn } from '@/lib/utils';
import { getDashboardPaths } from '@/routes';
import { sidebarItemsGenerator } from '@/utils/sidebarItemsGenerator';

/** Role-driven dashboard sidebar. `onNavigate` lets the mobile sheet close on click. */
export function Sidebar({ onNavigate }: { onNavigate?: () => void }) {
  const { user } = useAuth();
  const items = sidebarItemsGenerator(getDashboardPaths(user?.role));

  return (
    <nav className="flex flex-col gap-1 p-4">
      {items.map((item) => {
        const Icon = item.icon;
        return (
          <NavLink
            key={item.key}
            to={item.to}
            end={item.end}
            onClick={onNavigate}
            className={({ isActive }) =>
              cn(
                'flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors',
                isActive
                  ? 'bg-violet-500/15 text-violet-300'
                  : 'text-muted-foreground hover:text-foreground hover:bg-white/5',
              )
            }
          >
            {Icon && <Icon className="size-4" />}
            {item.label}
          </NavLink>
        );
      })}
    </nav>
  );
}
