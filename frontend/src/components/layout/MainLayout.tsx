import { Outlet } from "react-router-dom";
import { Navbar } from "@/components/shared/Navbar";
import { AppSidebar } from "./Sidebar";
import {
  SidebarInset,
  SidebarProvider,
} from "@/components/ui/sidebar";

/** Authenticated dashboard shell: collapsible sidebar + topbar + routed content. */
export function MainLayout() {
  return (
    <SidebarProvider>
      <AppSidebar />
      <SidebarInset>
        <Navbar />
        <main className="min-w-0 flex-1 px-4 py-8">
          <Outlet />
        </main>
      </SidebarInset>
    </SidebarProvider>
  );
}
