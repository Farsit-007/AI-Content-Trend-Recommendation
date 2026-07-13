"use client"

import { useState } from "react"
import Link from "next/link"
import { usePathname } from "next/navigation"
import { useTheme } from "next-themes"
import {
  LayoutDashboard,
  Sparkles,
  BarChart2,
  MessageCircle,
  Settings,
  TrendingUp,
  Sun,
  Moon,
  Building2,
  Play,
  Link2,
} from "lucide-react"
import {
  Sidebar,
  SidebarContent,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuItem,
  SidebarMenuButton,
  SidebarProvider,
  SidebarTrigger,
  SidebarInset,
} from "@/components/ui/sidebar"
import { Button } from "@/components/ui/button"
import { Separator } from "@/components/ui/separator"
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet"
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip"
import { Toaster } from "@/components/ui/sonner"
import { Badge } from "@/components/ui/badge"
import { cn } from "@/lib/utils"

const navItems = [
  { label: "Feed", href: "/dashboard/feed", icon: LayoutDashboard },
  { label: "Generate", href: "/dashboard/generate", icon: Sparkles },
  { label: "Report", href: "/dashboard/report", icon: BarChart2 },
  { label: "Chat", href: "/dashboard/chat", icon: MessageCircle },
  { label: "Admin", href: "/dashboard/admin", icon: Settings },
]

const PAGE_TITLES: Record<string, string> = {
  "/dashboard/feed": "News Feed",
  "/dashboard/generate": "Generate Content",
  "/dashboard/report": "30-Day Report",
  "/dashboard/chat": "Ask Growth Studio",
  "/dashboard/admin": "Admin Controls",
}

const CONNECTED_PLATFORMS = [
  { label: "Facebook", icon: Building2, status: "Connected", color: "text-success", dot: "bg-success" },
  { label: "YouTube", icon: Play, status: "Connected", color: "text-success", dot: "bg-success" },
  { label: "LinkedIn", icon: Link2, status: "Pending approval", color: "text-warning", dot: "bg-warning animate-pulse" },
]

function ThemeToggle() {
  const { resolvedTheme, setTheme } = useTheme()
  const isDark = resolvedTheme === "dark"

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          aria-label="Toggle theme"
          onClick={() => setTheme(isDark ? "light" : "dark")}
          className="size-8 text-muted-foreground hover:text-foreground hover:bg-accent"
        >
          {isDark ? <Sun className="size-4" /> : <Moon className="size-4" />}
        </Button>
      </TooltipTrigger>
      <TooltipContent side="bottom">
        Switch to {isDark ? "light" : "dark"} mode
      </TooltipContent>
    </Tooltip>
  )
}

function UserProfile() {
  const [open, setOpen] = useState(false)

  return (
    <>
      <Tooltip>
        <TooltipTrigger asChild>
          <button
            onClick={() => setOpen(true)}
            className="flex items-center gap-2.5 rounded-lg px-2 py-1.5 hover:bg-accent transition-colors"
          >
            <div className="size-7 rounded-full brand-gradient flex items-center justify-center text-xs font-bold text-white shrink-0 ring-2 ring-primary/30">
              M
            </div>
            <div className="hidden md:block text-left leading-tight">
              <p className="text-xs font-semibold text-foreground">Mursalin</p>
              <p className="text-[10px] text-muted-foreground">Next Level Engineer</p>
            </div>
          </button>
        </TooltipTrigger>
        <TooltipContent side="bottom">View profile</TooltipContent>
      </Tooltip>

      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent
          side="right"
          className="w-80 bg-background border-border flex flex-col gap-0 p-0"
        >
          <SheetHeader className="p-0">
            <SheetTitle className="sr-only">User Profile</SheetTitle>
          </SheetHeader>

          {/* Profile hero */}
          <div className="flex flex-col items-center gap-3 pt-10 pb-6 px-6 border-b border-border bg-gradient-to-b from-primary/5 to-transparent">
            <div className="size-18 rounded-full brand-gradient flex items-center justify-center text-3xl font-bold text-white ring-4 ring-primary/20">
              M
            </div>
            <div className="text-center">
              <h2 className="font-bold text-base">Mursalin Ahmed</h2>
              <p className="text-sm text-muted-foreground">Content Creator · Marketing Lead</p>
              <Badge
                variant="outline"
                className="mt-2 text-xs border-primary/30 text-primary bg-primary/10"
              >
                Next Level Engineer
              </Badge>
            </div>
          </div>

          {/* Connected platforms */}
          <div className="p-6 space-y-3">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
              Connected Platforms
            </p>
            {CONNECTED_PLATFORMS.map(({ label, icon: Icon, status, color, dot }) => (
              <div
                key={label}
                className="flex items-center justify-between px-3 py-2.5 rounded-lg glass-card text-sm"
              >
                <div className="flex items-center gap-2.5">
                  <Icon className="size-4 text-muted-foreground" />
                  <span className="font-medium">{label}</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <span className={cn("size-1.5 rounded-full", dot)} />
                  <span className={cn("text-xs", color)}>{status}</span>
                </div>
              </div>
            ))}
          </div>

          {/* Stats summary */}
          <div className="px-6 pb-6 space-y-3">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
              This Month
            </p>
            <div className="grid grid-cols-2 gap-2">
              {[
                { label: "Total Reach", value: "523K" },
                { label: "Engagements", value: "22.1K" },
                { label: "Video Views", value: "124K" },
                { label: "Eng. Rate", value: "4.2%" },
              ].map((s) => (
                <div key={s.label} className="glass-card rounded-lg p-3 text-center">
                  <p className="text-base font-bold gradient-text">{s.value}</p>
                  <p className="text-[10px] text-muted-foreground mt-0.5">{s.label}</p>
                </div>
              ))}
            </div>
          </div>

          {/* Footer hint */}
          <div className="mt-auto px-6 pb-6">
            <p className="text-[11px] text-muted-foreground/60 text-center">
              Press <kbd className="px-1.5 py-0.5 rounded bg-muted font-mono text-[10px]">D</kbd> to toggle dark / light mode
            </p>
          </div>
        </SheetContent>
      </Sheet>
    </>
  )
}

function AppSidebar() {
  const pathname = usePathname()

  return (
    <Sidebar variant="inset">
      <SidebarHeader className="border-b border-border px-4 py-4">
        <Link href="/" className="flex items-center gap-2 font-bold text-sm">
          <TrendingUp className="size-4 text-primary" />
          <span className="gradient-text">Growth Studio</span>
        </Link>
      </SidebarHeader>
      <SidebarContent className="pt-2">
        <SidebarMenu>
          {navItems.map((item) => {
            const active = pathname.startsWith(item.href)
            return (
              <SidebarMenuItem key={item.href}>
                <SidebarMenuButton
                  asChild
                  className={cn(
                    "gap-3 transition-colors",
                    active
                      ? "bg-primary/10 text-primary border-l-2 border-primary"
                      : "text-muted-foreground hover:text-foreground hover:bg-accent"
                  )}
                >
                  <Link href={item.href}>
                    <item.icon className="size-4" />
                    {item.label}
                  </Link>
                </SidebarMenuButton>
              </SidebarMenuItem>
            )
          })}
        </SidebarMenu>
      </SidebarContent>
    </Sidebar>
  )
}

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const pageTitle = PAGE_TITLES[pathname] ?? "Dashboard"

  return (
    <TooltipProvider>
      <SidebarProvider>
        <AppSidebar />
        <SidebarInset className="flex flex-col min-h-screen bg-background">
          {/* Navbar */}
          <header className="flex items-center justify-between gap-3 border-b border-border px-4 h-14 shrink-0">
            {/* Left: trigger + page title */}
            <div className="flex items-center gap-3 min-w-0">
              <SidebarTrigger className="text-muted-foreground hover:text-foreground shrink-0" />
              <Separator orientation="vertical" className="h-5 opacity-20 shrink-0" />
              <span className="text-sm font-semibold truncate">{pageTitle}</span>
            </div>

            {/* Right: theme toggle + user */}
            <div className="flex items-center gap-1 shrink-0">
              <ThemeToggle />
              <Separator orientation="vertical" className="h-5 opacity-20 mx-1" />
              <UserProfile />
            </div>
          </header>

          <main className="flex-1 overflow-auto p-4 md:p-6">{children}</main>
        </SidebarInset>
        <Toaster />
      </SidebarProvider>
    </TooltipProvider>
  )
}
