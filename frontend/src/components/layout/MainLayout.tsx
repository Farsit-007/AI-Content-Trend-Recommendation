import { Outlet } from "react-router-dom";
import { TeamProvider } from "@/context/TeamProvider";
import { TourProvider } from "@/context/TourProvider";
import { Navbar } from "@/components/shared/Navbar";
import { TourOverlay } from "@/components/tour/TourOverlay";
import { WelcomeTourModal } from "@/components/tour/WelcomeTourModal";
import { AppSidebar } from "./Sidebar";
import {
  SidebarInset,
  SidebarProvider,
} from "@/components/ui/sidebar";

/** Authenticated dashboard shell: collapsible sidebar + topbar + routed content. */
export function MainLayout() {
  return (
    <TeamProvider>
      <TourProvider>
        <SidebarProvider>
          <AppSidebar />
          <SidebarInset>
            <Navbar />
            <main className="min-w-0 flex-1 px-4 py-8">
              <Outlet />
            </main>
          </SidebarInset>
        </SidebarProvider>
        <TourOverlay />
        <WelcomeTourModal />
      </TourProvider>
    </TeamProvider>
  );
}
