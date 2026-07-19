import { Check, ChevronsUpDown, Compass } from "lucide-react";
import { DropdownMenu as DropdownMenuPrimitive } from "radix-ui";

import { useAuth } from "@/context/auth-context";
import { useTeamContext } from "@/context/team-context";
import { useTour } from "@/context/tour-context";
import { getDashboardPaths } from "@/routes";
import { sidebarItemsGenerator } from "@/utils/sidebarItemsGenerator";
import { buildSidebarTour, SIDEBAR_TOUR_ID } from "@/lib/tours";
import { Button } from "@/components/ui/button";
import { SidebarTrigger } from "@/components/ui/sidebar";
import { ActiveTasksIndicator } from "./ActiveTasksIndicator";
import { ThemeToggle } from "./ThemeToggle";

/** Roles rendered in a friendlier form in the account area. */
const roleLabel: Record<string, string> = {
  super_admin: "Super Admin",
  admin: "Admin",
  user: "Member",
};

/** Team switcher — hidden entirely when the user only has one (or zero) visible teams. */
function TeamSwitcher() {
  const { teamId, teams, setActiveTeam } = useTeamContext();
  if (teams.length <= 1) return null;

  const activeTeam = teams.find((t) => t._id === teamId);

  return (
    <DropdownMenuPrimitive.Root>
      <DropdownMenuPrimitive.Trigger asChild>
        <Button variant="outline" size="sm" className="max-w-40 justify-between gap-1.5">
          <span className="truncate">{activeTeam?.name ?? "Select team"}</span>
          <ChevronsUpDown className="size-3.5 shrink-0 text-muted-foreground" />
        </Button>
      </DropdownMenuPrimitive.Trigger>
      <DropdownMenuPrimitive.Portal>
        <DropdownMenuPrimitive.Content
          align="start"
          className="z-50 min-w-48 rounded-md border border-border bg-popover p-1 text-popover-foreground shadow-md"
        >
          {teams.map((team) => (
            <DropdownMenuPrimitive.Item
              key={team._id}
              onSelect={() => setActiveTeam(team._id)}
              className="flex cursor-pointer items-center justify-between gap-2 rounded-sm px-2 py-1.5 text-sm outline-none data-[highlighted]:bg-accent data-[highlighted]:text-accent-foreground"
            >
              <span className="truncate">{team.name}</span>
              {team._id === teamId && <Check className="size-3.5 shrink-0 text-violet-600 dark:text-violet-400" />}
            </DropdownMenuPrimitive.Item>
          ))}
        </DropdownMenuPrimitive.Content>
      </DropdownMenuPrimitive.Portal>
    </DropdownMenuPrimitive.Root>
  );
}

/** Dashboard topbar. Section navigation lives in the sidebar; the
 *  `SidebarTrigger` collapses it on desktop and opens it on mobile. */
export function Navbar() {
  const { user } = useAuth();
  const { startTour, isTourCompleted } = useTour();
  // Once the whole-system tour has been run or dismissed, this stops occupying prime topbar real
  // estate. It remains reachable from the Guide page and from each page's help dialog.
  const showTakeTour = !isTourCompleted(SIDEBAR_TOUR_ID);

  const handleTakeTour = () => {
    const items = sidebarItemsGenerator(getDashboardPaths(user?.role));
    startTour(buildSidebarTour(items), SIDEBAR_TOUR_ID);
  };

  return (
    <header className="glass-card sticky top-0 z-40 rounded-none border-x-0 border-t-0">
      <nav className="flex h-16 items-center justify-between gap-4 px-4">
        <div className="flex items-center gap-2">
          <SidebarTrigger className="-ml-1" />
          <TeamSwitcher />
        </div>

        <div className="flex items-center gap-3">
          <ActiveTasksIndicator />
          {showTakeTour && (
            <Button variant="outline" size="sm" onClick={handleTakeTour} className="gap-1.5">
              <Compass className="size-4" />
              <span className="hidden sm:inline">Take a tour</span>
            </Button>
          )}
          {user && (
            <div className="hidden text-right leading-tight sm:block">
              <div className="text-sm font-medium">{user.name}</div>
              <div className="text-muted-foreground text-xs">
                {roleLabel[user.role] ?? user.role}
              </div>
            </div>
          )}
          <ThemeToggle />
        </div>
      </nav>
    </header>
  );
}
