import { LogOut } from "lucide-react";

import { useAuth } from "@/context/auth-context";
import { Button } from "@/components/ui/button";
import { SidebarTrigger } from "@/components/ui/sidebar";
import { ThemeToggle } from "./ThemeToggle";

/** Roles rendered in a friendlier form in the account area. */
const roleLabel: Record<string, string> = {
  super_admin: "Super Admin",
  admin: "Admin",
  user: "Member",
};

/** Dashboard topbar. Section navigation lives in the sidebar; the
 *  `SidebarTrigger` collapses it on desktop and opens it on mobile. */
export function Navbar() {
  const { user, logout } = useAuth();

  return (
    <header className="glass-card sticky top-0 z-40 rounded-none border-x-0 border-t-0">
      <nav className="flex h-16 items-center justify-between gap-4 px-4">
        <div className="flex items-center gap-2">
          <SidebarTrigger className="-ml-1" />
        </div>

        <div className="flex items-center gap-3">
          {user && (
            <div className="hidden text-right leading-tight sm:block">
              <div className="text-sm font-medium">{user.name}</div>
              <div className="text-muted-foreground text-xs">
                {roleLabel[user.role] ?? user.role}
              </div>
            </div>
          )}
          <ThemeToggle />
          <Button variant="outline" size="sm" onClick={() => void logout()}>
            <LogOut className="size-4" />
            <span className="hidden sm:inline">Log out</span>
          </Button>
        </div>
      </nav>
    </header>
  );
}
