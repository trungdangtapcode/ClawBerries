import { useState, useEffect } from "react"
import { NavLink, Link, Outlet, useLocation, useSearchParams } from "react-router-dom"
import { cn } from "@/lib/utils"
import { Avatar } from "@/components/ui/avatar"
import { Button } from "@/components/ui/button"
import {
  LayoutDashboard,
  Search,
  CalendarDays,
  FileText,
  HelpCircle,
  LogOut,
  Menu,
  X,
  Bell,
  ChevronRight,
} from "lucide-react"

const mainNavItems = [
  { to: "/", icon: LayoutDashboard, label: "Dashboard" },
  { to: "/cv-search", icon: Search, label: "CV Search" },
  { to: "/interviews", icon: CalendarDays, label: "Interviews" },
  { to: "/documents", icon: FileText, label: "Applicants" },
]

const bottomNavItems = [
  { to: "/support", icon: HelpCircle, label: "Support" },
  { to: "/sign-out", icon: LogOut, label: "Sign Out" },
]

const topBarLinks: { to: string; label: string }[] = []

interface Crumb { label: string; href?: string }

function getBreadcrumb(pathname: string): Crumb[] {
  const map: Record<string, Crumb[]> = {
    "/": [{ label: "Dashboard" }],
    "/cv-search": [{ label: "Dashboard", href: "/" }, { label: "CV Search", href: "/cv-search" }],
    "/candidate": [{ label: "Dashboard", href: "/" }, { label: "CV Search", href: "/cv-search" }, { label: "Candidate Profile" }],
    "/resume": [{ label: "Dashboard", href: "/" }, { label: "Candidate Pipeline", href: "/pipeline" }, { label: "Resume Profile" }],
    "/pipeline": [{ label: "Dashboard", href: "/" }, { label: "Candidate Pipeline" }],
    "/interviews": [{ label: "Dashboard", href: "/" }, { label: "Interviews" }],
    "/documents": [{ label: "Dashboard", href: "/" }, { label: "Applicants" }],
  }
  const key = Object.keys(map).find((k) =>
    k === "/" ? pathname === "/" : pathname.startsWith(k)
  )
  return map[key || "/"] || [{ label: "Dashboard" }]
}

export function Layout() {
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const location = useLocation()
  const [searchParams] = useSearchParams()
  const jobId = searchParams.get("jobId")
  const [jobTitleForBreadcrumb, setJobTitleForBreadcrumb] = useState<string | null>(null)

  const baseBreadcrumbs = getBreadcrumb(location.pathname)
  const breadcrumbs: Crumb[] = jobId && jobTitleForBreadcrumb
    ? [
      ...baseBreadcrumbs.map(c => ({ ...c, href: c.href || undefined })),
      { label: jobTitleForBreadcrumb, href: "/documents" },
    ]
    : baseBreadcrumbs

  useEffect(() => {
    if (!jobId) { setJobTitleForBreadcrumb(null); return }
    const API = import.meta.env.VITE_API_URL || "http://localhost:3001"
    fetch(`${API}/api/jobs`)
      .then((r) => r.json())
      .then((data) => {
        const job = data.jobs?.find((j: any) => j.id === jobId)
        setJobTitleForBreadcrumb(job?.title || null)
      })
      .catch(() => setJobTitleForBreadcrumb(null))
  }, [jobId])

  return (
    <div className="flex h-screen overflow-hidden bg-surface">
      {/* Mobile overlay */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/40 backdrop-blur-sm lg:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside
        className={cn(
          "fixed inset-y-0 left-0 z-50 flex w-64 flex-col bg-primary text-on-primary transition-transform duration-300 lg:static lg:translate-x-0",
          sidebarOpen ? "translate-x-0" : "-translate-x-full"
        )}
      >
        {/* Logo */}
        <div className="flex h-16 items-center gap-3 px-5">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-white/10 font-heading text-lg font-bold">
            C
          </div>
          <span className="font-heading text-lg font-semibold tracking-tight">
            ClawBerries Agent
          </span>
          <button
            className="ml-auto rounded-md p-1 hover:bg-white/10 lg:hidden"
            onClick={() => setSidebarOpen(false)}
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Main nav */}
        <nav className="flex-1 space-y-1 px-3 py-4">
          {mainNavItems.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.to === "/"}
              onClick={() => setSidebarOpen(false)}
              className={({ isActive }) =>
                cn(
                  "flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-all duration-200",
                  isActive
                    ? "bg-white/15 text-white shadow-sm"
                    : "text-white/70 hover:bg-white/10 hover:text-white"
                )
              }
            >
              <item.icon className="h-5 w-5 shrink-0" />
              <span>{item.label}</span>
            </NavLink>
          ))}
        </nav>

        {/* Bottom nav */}
        <div className="space-y-1 border-t border-white/10 px-3 py-4">
          {bottomNavItems.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              onClick={() => setSidebarOpen(false)}
              className="flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium text-white/70 transition-all hover:bg-white/10 hover:text-white"
            >
              <item.icon className="h-5 w-5 shrink-0" />
              <span>{item.label}</span>
            </NavLink>
          ))}
        </div>

        {/* User card */}
        <div className="border-t border-white/10 px-4 py-4">
          <div className="flex items-center gap-3">
            <Avatar fallback="Super HR" size="sm" className="bg-secondary-container text-on-secondary-container" />
            <div className="overflow-hidden">
              <p className="truncate text-sm font-medium text-white">Super HR</p>
              <p className="truncate text-xs text-white/50">Sr. Recruiter</p>
            </div>
          </div>
        </div>
      </aside>

      {/* Main content */}
      <div className="flex flex-1 flex-col overflow-hidden">
        {/* Top bar */}
        <header className="flex h-16 shrink-0 items-center gap-4 bg-surface-container-lowest px-4 lg:px-8">
          <button
            className="rounded-md p-2 text-on-surface-variant hover:bg-surface-container-low lg:hidden"
            onClick={() => setSidebarOpen(true)}
          >
            <Menu className="h-5 w-5" />
          </button>

          {/* Breadcrumb */}
          <div className="hidden items-center gap-1.5 text-sm md:flex">
            {breadcrumbs.map((crumb, idx) => (
              <span key={crumb.label} className="flex items-center gap-1.5">
                {idx > 0 && <ChevronRight className="h-3.5 w-3.5 text-on-surface-variant/50" />}
                {crumb.href ? (
                  <Link
                    to={crumb.href}
                    className="text-on-surface-variant hover:text-primary hover:underline transition-colors"
                  >
                    {crumb.label}
                  </Link>
                ) : (
                  <span
                    className={cn(
                      idx === breadcrumbs.length - 1
                        ? "font-medium text-on-surface"
                        : "text-on-surface-variant"
                    )}
                  >
                    {crumb.label}
                  </span>
                )}
              </span>
            ))}
          </div>

          <div className="flex-1" />

          {/* Quick links */}
          <nav className="hidden items-center gap-1 lg:flex">
            {topBarLinks.map((link) => (
              <NavLink
                key={link.to}
                to={link.to}
                className="rounded-md px-3 py-1.5 text-sm text-on-surface-variant transition-colors hover:bg-surface-container-low hover:text-on-surface"
              >
                {link.label}
              </NavLink>
            ))}
          </nav>

          {/* Actions */}
          <Button variant="ghost" size="icon" className="relative">
            <Bell className="h-5 w-5 text-on-surface-variant" />
            <span className="absolute -right-0.5 -top-0.5 h-2.5 w-2.5 rounded-full bg-error ring-2 ring-surface-container-lowest" />
          </Button>

          <div className="hidden items-center gap-3 border-l border-outline-variant/20 pl-4 md:flex">
            <Avatar fallback="Super HR" size="sm" />
          </div>
        </header>

        {/* Page content */}
        <main className="flex-1 overflow-y-auto bg-surface p-4 lg:p-8">
          <Outlet />
        </main>
      </div>
    </div>
  )
}
