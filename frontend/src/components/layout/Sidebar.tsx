import { NavLink, Link, useLocation } from 'react-router-dom';
import { Home, LogOut, Sparkles } from 'lucide-react';
import { useAuth } from '@/context/auth-context';
import { getDashboardPaths } from '@/routes';
import { useTeamId } from '@/lib/useTeamId';
import { sidebarItemsGenerator } from '@/utils/sidebarItemsGenerator';
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarRail,
  useSidebar,
} from '@/components/ui/sidebar';

/** Roles rendered in a friendlier form in the account area. */
const roleLabel: Record<string, string> = {
  super_admin: 'Super Admin',
  admin: 'Admin',
  user: 'Member',
};

/** Role-driven dashboard sidebar built on the shadcn `Sidebar` primitives.
 *  Collapses to an icon rail on desktop and opens as a sheet on mobile. */
export function AppSidebar() {
  const { user, logout } = useAuth();
  const activeTeamId = useTeamId();
  // Whether this viewer admins the team currently in context — not merely whether they admin some
  // team, which would show team-management nav while looking at a team they only belong to.
  const isTeamAdmin = Boolean(
    activeTeamId && user?.team_admin_team_ids?.includes(activeTeamId),
  );

  const { pathname } = useLocation();
  const { setOpenMobile } = useSidebar();
  const items = sidebarItemsGenerator(getDashboardPaths(user?.role, isTeamAdmin));

  return (
    <Sidebar collapsible="icon">
      <SidebarHeader>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton asChild size="lg" tooltip="Growth Studio">
              <Link to="/dashboard" onClick={() => setOpenMobile(false)}>
                <div className="flex aspect-square size-8 items-center justify-center rounded-lg bg-primary text-primary-foreground">
                  <Sparkles className="size-4" />
                </div>
                <span className="gradient-text text-base font-semibold">
                  Growth Studio
                </span>
              </Link>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>

      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupContent>
            <SidebarMenu>
              {items.map((item) => {
                const Icon = item.icon;
                const isActive = item.end
                  ? pathname === item.to
                  : pathname === item.to || pathname.startsWith(`${item.to}/`);
                return (
                  <SidebarMenuItem key={item.key}>
                    <SidebarMenuButton
                      asChild
                      isActive={isActive}
                      tooltip={item.label}
                    >
                      <NavLink
                        to={item.to}
                        end={item.end}
                        onClick={() => setOpenMobile(false)}
                        data-tour={`nav-${item.label.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '')}`}
                      >
                        {Icon && <Icon />}
                        <span>{item.label}</span>
                      </NavLink>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                );
              })}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>

      <SidebarFooter>
        <SidebarMenu>
          {user && (
            <SidebarMenuItem>
              <SidebarMenuButton size="lg" className="cursor-default hover:bg-transparent">
                <div className="flex aspect-square size-8 items-center justify-center rounded-lg bg-sidebar-accent text-sidebar-accent-foreground text-xs font-semibold">
                  {user.name?.charAt(0).toUpperCase()}
                </div>
                <div className="grid flex-1 text-left leading-tight">
                  <span className="truncate text-sm font-medium">{user.name}</span>
                  <span className="text-muted-foreground truncate text-xs">
                    {roleLabel[user.role] ?? user.role}
                  </span>
                </div>
              </SidebarMenuButton>
            </SidebarMenuItem>
          )}
          {/* Grouped with Log out: both leave the dashboard, and unlike the header's brand link
              (which goes to /dashboard) this exits to the public landing page. */}
          <SidebarMenuItem>
            <SidebarMenuButton asChild tooltip="Return home">
              <Link to="/" onClick={() => setOpenMobile(false)}>
                <Home />
                <span>Return home</span>
              </Link>
            </SidebarMenuButton>
          </SidebarMenuItem>
          <SidebarMenuItem>
            <SidebarMenuButton onClick={() => void logout()} tooltip="Log out">
              <LogOut />
              <span>Log out</span>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>

      <SidebarRail />
    </Sidebar>
  );
}
