import { useState } from 'react';
import { NavLink, Link } from 'react-router-dom';
import { Menu, LogOut } from 'lucide-react';

import { useAuth } from '@/context/auth-context';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from '@/components/ui/sheet';
import { visibleNavItems } from './nav-items';
import { ThemeToggle } from './ThemeToggle';

/** Roles rendered in a friendlier form in the account area. */
const roleLabel: Record<string, string> = {
  super_admin: 'Super Admin',
  admin: 'Admin',
  user: 'Member',
};

export function Navbar() {
  const { user, logout } = useAuth();
  const [open, setOpen] = useState(false);
  const items = visibleNavItems(user?.role);

  const handleLogout = () => {
    setOpen(false);
    void logout();
  };

  const linkClass = ({ isActive }: { isActive: boolean }) =>
    cn(
      'rounded-md px-3 py-2 text-sm font-medium transition-colors',
      isActive
        ? 'bg-violet-500/15 text-violet-300'
        : 'text-muted-foreground hover:text-foreground hover:bg-white/5',
    );

  return (
    <header className="glass-card sticky top-0 z-40 rounded-none border-x-0 border-t-0">
      <nav className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-4 px-4">
        {/* Brand + desktop links */}
        <div className="flex items-center gap-6">
          <Link to="/dashboard" className="text-lg font-semibold tracking-tight">
            <span className="gradient-text">Growth Studio</span>
          </Link>
          <div className="hidden items-center gap-1 md:flex">
            {items.map((item) => (
              <NavLink key={item.to} to={item.to} className={linkClass}>
                {item.label}
              </NavLink>
            ))}
          </div>
        </div>

        {/* Desktop account section */}
        <div className="hidden items-center gap-3 md:flex">
          {user && (
            <div className="text-right leading-tight">
              <div className="text-sm font-medium">{user.name}</div>
              <div className="text-muted-foreground text-xs">
                {roleLabel[user.role] ?? user.role}
              </div>
            </div>
          )}
          <ThemeToggle />
          <Button variant="outline" size="sm" onClick={handleLogout}>
            <LogOut className="size-4" />
            Log out
          </Button>
        </div>

        {/* Mobile menu */}
        <div className="flex items-center gap-2 md:hidden">
          <ThemeToggle />
          <Sheet open={open} onOpenChange={setOpen}>
            <SheetTrigger asChild>
              <Button variant="outline" size="icon" aria-label="Open menu">
                <Menu className="size-4" />
              </Button>
            </SheetTrigger>
            <SheetContent className="flex flex-col gap-0">
              <SheetHeader>
                <SheetTitle>
                  <span className="gradient-text">Growth Studio</span>
                </SheetTitle>
              </SheetHeader>

              {user && (
                <div className="border-white/10 border-b px-4 pb-4">
                  <div className="text-sm font-medium">{user.name}</div>
                  <div className="text-muted-foreground text-xs">
                    {user.email} · {roleLabel[user.role] ?? user.role}
                  </div>
                </div>
              )}

              <div className="flex flex-1 flex-col gap-1 p-4">
                {items.map((item) => {
                  const Icon = item.icon;
                  return (
                    <NavLink
                      key={item.to}
                      to={item.to}
                      onClick={() => setOpen(false)}
                      className={({ isActive }) =>
                        cn(
                          'flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors',
                          isActive
                            ? 'bg-violet-500/15 text-violet-300'
                            : 'text-muted-foreground hover:text-foreground hover:bg-white/5',
                        )
                      }
                    >
                      <Icon className="size-4" />
                      {item.label}
                    </NavLink>
                  );
                })}
              </div>

              <div className="p-4">
                <Button
                  variant="outline"
                  className="w-full"
                  onClick={handleLogout}
                >
                  <LogOut className="size-4" />
                  Log out
                </Button>
              </div>
            </SheetContent>
          </Sheet>
        </div>
      </nav>
    </header>
  );
}
