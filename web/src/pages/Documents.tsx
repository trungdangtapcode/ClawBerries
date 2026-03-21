import { useState, useEffect } from "react"
import { Button } from "@/components/ui/button"
import {
  Users,
  ChevronRight,
  Sparkles,
  Code,
  Palette,
  Megaphone,
  Layers,
  Loader2,
} from "lucide-react"
import { cn } from "@/lib/utils"

const API_BASE = import.meta.env.VITE_API_URL || "http://localhost:3001"

// ── Types ─────────────────────────────────────────────────────────────────────
interface Candidate {
  id: string
  name: string
  role: string
  location: string
  aiMatch: number
  status: "shortlisted" | "new_review" | "pending"
  appliedAgo: string
}

interface JobPosition {
  id: string
  title: string
  department: string
  icon: typeof Code
  iconBg: string
  iconColor: string
  status: "active" | "urgent" | "paused"
  applicants: number
  shortlisted: number
  avgAI: number
}

// ── Sample data (will be replaced by API data when available) ──────────────
const SAMPLE_POSITIONS: JobPosition[] = [
  {
    id: "1",
    title: "Senior Software Engineer",
    department: "Engineering Department",
    icon: Code,
    iconBg: "bg-primary/10",
    iconColor: "text-primary",
    status: "active",
    applicants: 42,
    shortlisted: 8,
    avgAI: 88,
  },
  {
    id: "2",
    title: "Product Manager",
    department: "Product Department",
    icon: Layers,
    iconBg: "bg-teal-50",
    iconColor: "text-teal-600",
    status: "urgent",
    applicants: 28,
    shortlisted: 5,
    avgAI: 76,
  },
  {
    id: "3",
    title: "UI/UX Designer",
    department: "Design Department",
    icon: Palette,
    iconBg: "bg-emerald-50",
    iconColor: "text-emerald-600",
    status: "active",
    applicants: 56,
    shortlisted: 12,
    avgAI: 82,
  },
  {
    id: "4",
    title: "Marketing Operations",
    department: "Growth Department",
    icon: Megaphone,
    iconBg: "bg-slate-100",
    iconColor: "text-slate-600",
    status: "paused",
    applicants: 18,
    shortlisted: 3,
    avgAI: 65,
  },
]

const SAMPLE_CANDIDATES: Candidate[] = [
  { id: "1", name: "Alex Rivera", role: "Senior Software Engineer", location: "San Francisco, CA", aiMatch: 94, status: "shortlisted", appliedAgo: "Applied 2d ago" },
  { id: "2", name: "Emily Lu", role: "UI/UX Designer", location: "Remote", aiMatch: 91, status: "shortlisted", appliedAgo: "Applied 1d ago" },
  { id: "3", name: "Kevin Barker", role: "Product Manager", location: "New York, NY", aiMatch: 87, status: "new_review", appliedAgo: "Applied 5h ago" },
]

// ── Status badge ───────────────────────────────────────────────────────────
function StatusBadge({ status }: { status: JobPosition["status"] }) {
  const config = {
    active:  { label: "Active",  className: "bg-surface-container text-on-surface-variant" },
    urgent:  { label: "Urgent",  className: "bg-surface-container text-on-surface-variant" },
    paused:  { label: "Paused",  className: "bg-surface-container text-on-surface-variant" },
  }
  const c = config[status]
  return (
    <span className={cn("text-[10px] font-bold uppercase tracking-widest px-2.5 py-1 rounded", c.className)}>
      {c.label}
    </span>
  )
}

function CandidateStatusBadge({ status }: { status: Candidate["status"] }) {
  const config = {
    shortlisted: { label: "Shortlisted", className: "bg-emerald-100 text-emerald-700" },
    new_review:  { label: "New Review",  className: "bg-teal-100 text-teal-700" },
    pending:     { label: "Pending",     className: "bg-slate-100 text-slate-600" },
  }
  const c = config[status]
  return (
    <span className={cn("inline-flex items-center px-2.5 py-0.5 rounded-full text-[10px] font-bold", c.className)}>
      {c.label}
    </span>
  )
}

// ── Initials avatar ────────────────────────────────────────────────────────
function InitialsAvatar({ name, className }: { name: string; className?: string }) {
  const initials = name.split(" ").map((w) => w[0]).join("").toUpperCase().slice(0, 2)
  const colors = [
    "bg-primary/10 text-primary",
    "bg-teal-50 text-teal-600",
    "bg-slate-100 text-slate-600",
    "bg-emerald-50 text-emerald-600",
    "bg-blue-50 text-blue-600",
  ]
  const idx = name.charCodeAt(0) % colors.length
  return (
    <div className={cn("w-10 h-10 rounded-full flex items-center justify-center text-sm font-bold", colors[idx], className)}>
      {initials}
    </div>
  )
}

// ── Job Position Card ──────────────────────────────────────────────────────
function JobCard({ pos }: { pos: JobPosition }) {
  const Icon = pos.icon
  return (
    <div className="bg-white rounded-2xl p-6 shadow-sm border border-outline-variant/10 hover:border-primary/30 transition-all group cursor-pointer">
      {/* Header */}
      <div className="flex justify-between items-start mb-6">
        <div className={cn("p-2.5 rounded-xl", pos.iconBg, pos.iconColor)}>
          <Icon className="h-5 w-5" />
        </div>
        <StatusBadge status={pos.status} />
      </div>

      {/* Title */}
      <h3 className="text-lg font-bold text-on-surface mb-1 truncate font-heading">{pos.title}</h3>
      <p className="text-xs text-on-surface-variant mb-5">{pos.department}</p>

      {/* Counts */}
      <div className="grid grid-cols-2 gap-4">
        <div className="flex flex-col">
          <span className="text-2xl font-black text-primary leading-tight">{pos.applicants}</span>
          <span className="text-[10px] font-bold text-on-surface-variant uppercase tracking-wide">Applicants</span>
        </div>
        <div className="flex flex-col">
          <span className="text-2xl font-black text-emerald-600 leading-tight">{pos.shortlisted}</span>
          <span className="text-[10px] font-bold text-on-surface-variant uppercase tracking-wide">Shortlisted</span>
        </div>
      </div>

      {/* Footer */}
      <div className="mt-6 pt-4 border-t border-outline-variant/10 flex items-center justify-between">
        <div className="flex items-center gap-1.5">
          <Sparkles className="h-3.5 w-3.5 text-primary" />
          <span className="text-xs font-bold text-on-surface">Avg AI: {pos.avgAI}%</span>
        </div>
        <span className="text-xs font-semibold text-primary group-hover:underline">View Details</span>
      </div>
    </div>
  )
}

// ── Candidate Row ─────────────────────────────────────────────────────────
function CandidateRow({ candidate, onApprove, onDecline }: {
  candidate: Candidate
  onApprove: () => void
  onDecline: () => void
}) {
  return (
    <div className="px-6 py-4 flex items-center justify-between hover:bg-surface-container-lowest/70 transition-colors group">
      <div className="flex items-center gap-4 flex-1 min-w-0">
        <InitialsAvatar name={candidate.name} />
        <div className="flex flex-col min-w-0">
          <span className="text-sm font-bold text-on-surface truncate">{candidate.name}</span>
          <span className="text-[11px] text-on-surface-variant truncate">{candidate.role} • {candidate.location}</span>
        </div>
      </div>

      <div className="flex items-center gap-8 shrink-0">
        {/* AI Match */}
        <div className="flex flex-col items-center">
          <span className="text-sm font-black text-primary">{candidate.aiMatch}%</span>
          <span className="text-[9px] font-bold uppercase tracking-wider text-on-surface-variant">AI Match</span>
        </div>

        {/* Status */}
        <div className="hidden md:flex flex-col items-end gap-0.5">
          <CandidateStatusBadge status={candidate.status} />
          <span className="text-[9px] text-on-surface-variant">{candidate.appliedAgo}</span>
        </div>

        {/* Actions */}
        <div className="flex gap-2">
          <button
            onClick={onDecline}
            className="px-3.5 py-1.5 rounded-lg border border-outline-variant/40 text-xs font-bold text-on-surface hover:bg-surface-container transition-colors"
          >
            Decline
          </button>
          <button
            onClick={onApprove}
            className="px-3.5 py-1.5 rounded-lg bg-primary text-white text-xs font-bold hover:opacity-90 transition-opacity"
          >
            Approve
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Main Page ─────────────────────────────────────────────────────────────
export function Documents() {
  const [positions] = useState<JobPosition[]>(SAMPLE_POSITIONS)
  const [candidates, setCandidates] = useState<Candidate[]>(SAMPLE_CANDIDATES)
  const [filter, setFilter] = useState("all")
  const [loading, setLoading] = useState(true)

  // Load real candidates from DB if available
  useEffect(() => {
    async function loadFromDB() {
      try {
        const res = await fetch(`${API_BASE}/api/cv-library`)
        if (!res.ok) throw new Error("Failed to load")
        const data = await res.json()
        if (data.files && data.files.length > 0) {
          const dbCandidates: Candidate[] = data.files.map((f: any) => ({
            id: f.id,
            name: f.candidateName || f.name.replace(/\.[^.]+$/, ""),
            role: f.tags?.[0] || "Candidate",
            location: "—",
            aiMatch: Math.floor(Math.random() * 20 + 75), // placeholder until real scoring
            status: f.status === "delivered" ? "shortlisted" as const : "new_review" as const,
            appliedAgo: f.date ? `Applied ${timeAgo(f.date)}` : "Applied recently",
          }))
          setCandidates(dbCandidates.length > 0 ? dbCandidates : SAMPLE_CANDIDATES)
        }
      } catch {
        // Keep sample data
      } finally {
        setLoading(false)
      }
    }
    loadFromDB()
  }, [])

  const handleApprove = (id: string) => {
    setCandidates((prev) => prev.map((c) => c.id === id ? { ...c, status: "shortlisted" as const } : c))
  }
  const handleDecline = (id: string) => {
    setCandidates((prev) => prev.filter((c) => c.id !== id))
  }

  return (
    <div className="flex flex-col gap-8 max-w-screen-xl">
      {/* Header */}
      <header className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-2xl font-extrabold text-on-surface tracking-tight font-heading">
            Executive Overview Dashboard
          </h1>
          <p className="text-sm text-on-surface-variant font-medium mt-0.5">
            High-level insights across active hiring pipelines
          </p>
        </div>
        <div className="flex items-center gap-3">
          {/* Filter dropdown */}
          <div className="relative">
            <select
              className="bg-surface-container-lowest border border-outline-variant/30 rounded-xl px-4 py-2.5 text-sm font-semibold focus:ring-2 focus:ring-primary appearance-none pr-10 min-w-[180px]"
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
            >
              <option value="all">All Job Titles</option>
              {positions.map((p) => (
                <option key={p.id} value={p.id}>{p.title}</option>
              ))}
            </select>
            <ChevronRight className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 rotate-90 pointer-events-none text-on-surface-variant" />
          </div>
          {/* Generate Report */}
          <Button
            className="gap-2 rounded-xl text-sm font-semibold shadow-md"
            style={{
              background: "linear-gradient(135deg, #003b56 0%, #005377 100%)",
              color: "white",
            }}
          >
            <Sparkles className="h-4 w-4" />
            Generate Report
          </Button>
        </div>
      </header>

      {/* Job Position Cards Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-6">
        {positions
          .filter((p) => filter === "all" || p.id === filter)
          .map((pos) => (
            <JobCard key={pos.id} pos={pos} />
          ))}
      </div>

      {/* Key Candidates for Review */}
      <div className="bg-white rounded-2xl shadow-sm border border-outline-variant/10 overflow-hidden">
        {/* Table header */}
        <div className="px-6 py-5 border-b border-outline-variant/10 flex items-center justify-between bg-surface-container-lowest">
          <div>
            <h2 className="text-lg font-bold text-on-surface font-heading">Key Candidates for Review</h2>
            <p className="text-xs text-on-surface-variant font-medium mt-0.5">
              Top applicants requiring immediate hiring manager feedback
            </p>
          </div>
          <a
            href="/cv-search"
            className="text-sm font-bold text-primary hover:underline transition-colors"
          >
            View All Candidates
          </a>
        </div>

        {/* Candidate rows */}
        {loading ? (
          <div className="flex items-center justify-center py-16">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
          </div>
        ) : candidates.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-on-surface-variant gap-2">
            <Users className="h-10 w-10 opacity-20" />
            <p className="text-sm font-medium">No candidates to review</p>
            <p className="text-xs">Upload CVs to get started with AI screening</p>
          </div>
        ) : (
          <div className="divide-y divide-outline-variant/10">
            {candidates.map((c) => (
              <CandidateRow
                key={c.id}
                candidate={c}
                onApprove={() => handleApprove(c.id)}
                onDecline={() => handleDecline(c.id)}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

function timeAgo(dateStr: string) {
  const diff = Date.now() - new Date(dateStr).getTime()
  const mins = Math.floor(diff / 60_000)
  if (mins < 60) return `${mins}m ago`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs}h ago`
  const days = Math.floor(hrs / 24)
  return `${days}d ago`
}
