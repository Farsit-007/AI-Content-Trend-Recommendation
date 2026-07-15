import { useState } from 'react';
import { NavLink, Link } from 'react-router-dom';
import { Menu } from 'lucide-react';

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
import { ThemeToggle } from './ThemeToggle';

/** Public marketing links (no auth required). */
const publicLinks = [
  { label: 'Home', to: '/' },
  { label: 'About', to: '/about' },
];

export function PublicNavbar() {
  const { isAuthenticated } = useAuth();
  const [open, setOpen] = useState(false);

  const linkClass = ({ isActive }: { isActive: boolean }) =>
    cn(
      'rounded-md px-3 py-2 text-sm font-medium transition-colors',
      isActive
        ? 'text-foreground'
        : 'text-muted-foreground hover:text-foreground hover:bg-white/5',
    );

  // Logged-in users get a shortcut to the app; everyone else sees "Log in".
  const cta = isAuthenticated ? (
    <Button asChild size="sm">
      <Link to="/dashboard">Dashboard</Link>
    </Button>
  ) : (
    <Button asChild size="sm">
      <Link to="/login">Log in</Link>
    </Button>
  );

  return (
    <header className="glass-card fixed inset-x-0 top-0 z-40 rounded-none border-x-0 border-t-0">
      <nav className="mx-auto flex h-16 max-w-7xl items-center justify-between gap-4 px-4 sm:px-6 lg:px-8">
        <div className="flex items-center gap-6">
          <Link to="/" className="text-lg font-semibold tracking-tight">
            <span className="gradient-text">Growth Studio</span>
          </Link>
          <div className="hidden items-center gap-1 md:flex">
            {publicLinks.map((item) => (
              <NavLink key={item.to} to={item.to} end className={linkClass}>
                {item.label}
              </NavLink>
            ))}
          </div>
        </div>

        <div className="hidden items-center gap-2 md:flex">
          <ThemeToggle />
          {cta}
        </div>

        {/* Mobile */}
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
              <div className="flex flex-1 flex-col gap-1 p-4">
                {publicLinks.map((item) => (
                  <NavLink
                    key={item.to}
                    to={item.to}
                    end
                    onClick={() => setOpen(false)}
                    className={linkClass}
                  >
                    {item.label}
                  </NavLink>
                ))}
              </div>
              <div className="p-4" onClick={() => setOpen(false)}>
                {cta}
              </div>
            </SheetContent>
          </Sheet>
        </div>
      </nav>
    </header>
  );
}
