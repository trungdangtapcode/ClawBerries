import { useState, useEffect } from "react"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Avatar } from "@/components/ui/avatar"
import { Progress } from "@/components/ui/progress"
import { Button } from "@/components/ui/button"
import {
  Users,
  Briefcase,
  Clock,
  CheckCircle2,
  Sparkles,
  Target,
  Lightbulb,
  ArrowRight,
  MoreHorizontal,
  Loader2,
  AlertCircle,
} from "lucide-react"

const API_BASE = import.meta.env.VITE_API_URL || "http://localhost:3001"

// ── Types ─────────────────────────────────────────────────────────────────────
interface DashboardStats {
  totalApplicants: number
  activeJobs: number
  inReview: number
  hiredThisMonth: number
}

interface Application {
  id: string
  name: string
  role: string
  email: string | null
  createdAt: string
  status: "hired" | "pending" | "rejected"
  skills: string[]
}

interface FunnelStage {
  label: string
  count: number
}

// ── Fallback data (shown while DB is empty or API is unreachable) ─────────────
const fallbackStats: DashboardStats = {
  totalApplicants: 0,
  activeJobs: 0,
  inReview: 0,
  hiredThisMonth: 0,
}

const fallbackApplications: Application[] = []

const fallbackFunnel: FunnelStage[] = [
  { label: "Applied", count: 0 },
  { label: "Screened", count: 0 },
  { label: "Researched", count: 0 },
  { label: "Synthesized", count: 0 },
  { label: "Delivered", count: 0 },
]

// ── Stat card icon helper ─────────────────────────────────────────────────────
const statConfig = [
  { key: "totalApplicants", label: "Total Applicants", icon: Users, color: "bg-primary-fixed" },
  { key: "activeJobs", label: "Active Jobs", icon: Briefcase, color: "bg-secondary-container" },
  { key: "inReview", label: "In Review", icon: Clock, color: "bg-primary-fixed-dim/30" },
  { key: "hiredThisMonth", label: "Delivered", icon: CheckCircle2, color: "bg-tertiary-fixed" },
] as const

// ── Helpers ───────────────────────────────────────────────────────────────────
function timeAgo(dateStr: string) {
  const diff = Date.now() - new Date(dateStr).getTime()
  const mins = Math.floor(diff / 60_000)
  if (mins < 60) return `${mins}m ago`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs}h ago`
  const days = Math.floor(hrs / 24)
  return `${days}d ago`
}

// ── Component ─────────────────────────────────────────────────────────────────
export function Dashboard() {
  const [stats, setStats] = useState<DashboardStats>(fallbackStats)
  const [applications, setApplications] = useState<Application[]>(fallbackApplications)
  const [funnel, setFunnel] = useState<FunnelStage[]>(fallbackFunnel)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false

    async function fetchDashboard() {
      setLoading(true)
      setError(null)

      try {
        const [statsRes, appsRes, funnelRes] = await Promise.all([
          fetch(`${API_BASE}/api/dashboard/stats`),
          fetch(`${API_BASE}/api/dashboard/recent-applications`),
          fetch(`${API_BASE}/api/dashboard/funnel`),
        ])

        if (!statsRes.ok || !appsRes.ok || !funnelRes.ok) {
          throw new Error("API returned an error")
        }

        const statsData = await statsRes.json()
        const appsData = await appsRes.json()
        const funnelData = await funnelRes.json()

        if (cancelled) return

        setStats({
          totalApplicants: statsData.totalApplicants ?? 0,
          activeJobs: statsData.activeJobs ?? 0,
          inReview: statsData.inReview ?? 0,
          hiredThisMonth: statsData.hiredThisMonth ?? 0,
        })
        setApplications(appsData.applications ?? [])
        setFunnel(funnelData.funnel ?? fallbackFunnel)
      } catch (err) {
        if (!cancelled) {
          setError("Could not load data from the database. Make sure the API server and PostgreSQL are running.")
        }
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    fetchDashboard()
    return () => { cancelled = true }
  }, [])

  const maxFunnelCount = Math.max(...funnel.map((s) => s.count), 1)

  return (
    <div className="space-y-8">
      {/* Greeting */}
      <div>
        <h1 className="font-heading text-3xl font-bold tracking-tight lg:text-4xl">
          Good morning, Super HR.
        </h1>
        <p className="mt-2 text-on-surface-variant">
          {loading ? (
            <span className="inline-flex items-center gap-2">
              <Loader2 className="h-4 w-4 animate-spin" /> Loading your dashboard…
            </span>
          ) : error ? (
            <span className="inline-flex items-center gap-2 text-error">
              <AlertCircle className="h-4 w-4" /> {error}
            </span>
          ) : (
            <>
              You have <span className="font-semibold text-on-surface">{stats.totalApplicants} applicant{stats.totalApplicants !== 1 ? "s" : ""}</span> in your pipeline.
            </>
          )}
        </p>
      </div>

      {/* Pipeline Stats */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {statConfig.map((cfg) => {
          const value = stats[cfg.key]
          return (
            <Card key={cfg.key} className="group hover:shadow-md transition-shadow">
              <CardContent className="flex items-start gap-4">
                <div className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl ${cfg.color}`}>
                  <cfg.icon className="h-5 w-5 text-primary" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-on-surface-variant">{cfg.label}</p>
                  <div className="flex items-baseline gap-2">
                    {loading ? (
                      <Loader2 className="h-5 w-5 animate-spin text-on-surface-variant" />
                    ) : (
                      <p className="text-2xl font-bold font-heading">{value.toLocaleString()}</p>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>
          )
        })}
      </div>

      {/* Main content grid */}
      <div className="grid grid-cols-1 gap-6 xl:grid-cols-3">
        {/* Recent Applications */}
        <Card className="xl:col-span-2">
          <CardHeader className="flex-row items-center justify-between">
            <div>
              <CardTitle>Recent Applications</CardTitle>
              <CardDescription>
                {loading
                  ? "Loading…"
                  : `${applications.length} candidate${applications.length !== 1 ? "s" : ""} from database`}
              </CardDescription>
            </div>
            <Button variant="ghost" size="sm">
              View All <ArrowRight className="ml-1 h-4 w-4" />
            </Button>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="h-8 w-8 animate-spin text-primary" />
              </div>
            ) : applications.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 text-on-surface-variant">
                <Users className="mb-3 h-10 w-10 opacity-30" />
                <p className="text-sm font-medium">No applications yet</p>
                <p className="mt-1 text-xs">Process some CVs to see them here.</p>
              </div>
            ) : (
              <div className="space-y-1">
                {applications.map((app) => (
                  <div
                    key={app.id}
                    className="flex items-center gap-4 rounded-lg p-3 transition-colors hover:bg-surface-container-low cursor-pointer"
                  >
                    <Avatar fallback={app.name} size="md" />
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-sm truncate">{app.name}</p>
                      <p className="text-xs text-on-surface-variant truncate">{app.role}</p>
                    </div>
                    <div className="hidden items-center gap-2 sm:flex">
                      <div className="text-right">
                        <p className="text-[11px] text-on-surface-variant">{timeAgo(app.createdAt)}</p>
                      </div>
                    </div>
                    <Badge variant={app.status}>
                      {app.status === "hired" ? "Delivered" : app.status === "rejected" ? "Flagged" : "In Review"}
                    </Badge>
                    <Button variant="ghost" size="icon" className="h-8 w-8 shrink-0">
                      <MoreHorizontal className="h-4 w-4" />
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Hiring Funnel */}
        <Card>
          <CardHeader>
            <CardTitle>Pipeline Funnel</CardTitle>
            <CardDescription>
              {loading ? "Loading…" : "Current pipeline conversion"}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {loading ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="h-6 w-6 animate-spin text-primary" />
              </div>
            ) : (
              funnel.map((stage) => (
                <div key={stage.label} className="space-y-1.5">
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-on-surface-variant">{stage.label}</span>
                    <span className="font-medium">{stage.count.toLocaleString()}</span>
                  </div>
                  <Progress
                    value={(stage.count / maxFunnelCount) * 100}
                    variant={stage.label === "Delivered" ? "tertiary" : "primary"}
                  />
                </div>
              ))
            )}
          </CardContent>
        </Card>
      </div>

      {/* AI Insights (static — not from DB) */}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        <Card className="bg-gradient-to-br from-primary-fixed/30 to-surface-container-lowest">
          <CardContent className="flex gap-4">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary-fixed">
              <Sparkles className="h-5 w-5 text-primary" />
            </div>
            <div>
              <h4 className="font-heading text-sm font-semibold">Match Efficiency Insight</h4>
              <p className="mt-1 text-xs text-on-surface-variant leading-relaxed">
                Screen-to-Interview ratio is up <span className="font-semibold text-tertiary-container">14%</span> this
                month due to new AI sorting filters.
              </p>
            </div>
          </CardContent>
        </Card>

        <Card className="bg-gradient-to-br from-tertiary-fixed/20 to-surface-container-lowest">
          <CardContent className="flex gap-4">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-tertiary-fixed">
              <Target className="h-5 w-5 text-tertiary-container" />
            </div>
            <div>
              <h4 className="font-heading text-sm font-semibold">Candidate Diversity Goal</h4>
              <p className="mt-1 text-xs text-on-surface-variant leading-relaxed">
                You are <span className="font-semibold text-tertiary-container">12% ahead</span> of your quarterly
                commitment to inclusive hiring practices.
              </p>
            </div>
          </CardContent>
        </Card>

        <Card className="bg-gradient-to-br from-secondary-container/20 to-surface-container-lowest">
          <CardContent className="flex gap-4">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-secondary-container">
              <Lightbulb className="h-5 w-5 text-secondary" />
            </div>
            <div>
              <h4 className="font-heading text-sm font-semibold">Smart Requisition Recommendations</h4>
              <p className="mt-1 text-xs text-on-surface-variant leading-relaxed">
                Start tracking a new search to see AI-matched profiles here.
              </p>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
