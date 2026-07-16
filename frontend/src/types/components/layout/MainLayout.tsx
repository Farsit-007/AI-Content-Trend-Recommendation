import { useState } from "react";
import { Outlet } from "react-router-dom";
import { Navbar } from "@/types/components/shared/Navbar";
import { Sidebar } from "./Sidebar";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/types/components/ui/sheet";

/** Authenticated dashboard shell: topbar + role-driven sidebar + routed content. */
export function MainLayout() {
  const [mobileOpen, setMobileOpen] = useState(false);

  return (
    <div className="flex min-h-svh flex-col">
      <Navbar onMenuClick={() => setMobileOpen(true)} />

      <div className="mx-auto flex w-full max-w-7xl flex-1">
        {/* Desktop sidebar */}
        <aside className="hidden w-60 shrink-0 border-r border-white/10 md:block">
          <Sidebar />
        </aside>

        <main className="min-w-0 flex-1 px-4 py-8">
          <Outlet />
        </main>
      </div>

      {/* Mobile sidebar */}
      <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
        <SheetContent side="left" className="p-0">
          <SheetHeader>
            <SheetTitle>
              <span className="gradient-text">Growth Studio</span>
            </SheetTitle>
          </SheetHeader>
          <Sidebar onNavigate={() => setMobileOpen(false)} />
        </SheetContent>
      </Sheet>
    </div>
  );
}
