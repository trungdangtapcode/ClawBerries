import { useState, useEffect } from "react"
import { useNavigate } from "react-router-dom"
import { Button } from "@/components/ui/button"
import {
  Users,
  ChevronRight,
  Sparkles,
  Briefcase,
  Plus,
  Loader2,
  X,
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
  status: "shortlisted" | "new_review" | "pending" | "waitlisted" | "rejected"
  screeningStatus: string
  appliedAgo: string
}

interface JobFromAPI {
  id: string
  title: string
  department: string | null
  description: string | null
  status: "active" | "paused" | "closed"
  createdAt: string
  applicants: number
  shortlisted: number
}

// ── Status badge ───────────────────────────────────────────────────────────
function StatusBadge({ status }: { status: JobFromAPI["status"] }) {
  const config = {
    active: { label: "Active", className: "bg-emerald-50 text-emerald-700" },
    paused: { label: "Paused", className: "bg-slate-100 text-slate-600" },
    closed: { label: "Closed", className: "bg-red-50 text-red-600" },
  }
  const c = config[status]
  return (
    <span className={cn("text-[10px] font-bold uppercase tracking-widest px-2.5 py-1 rounded", c.className)}>
      {c.label}
    </span>
  )
}

function CandidateStatusBadge({ screeningStatus }: { screeningStatus: string }) {
  const config: Record<string, { label: string; className: string }> = {
    shortlisted: { label: "Shortlisted", className: "bg-emerald-100 text-emerald-700" },
    waitlisted:  { label: "Waitlisted",  className: "bg-amber-100 text-amber-700" },
    rejected:    { label: "Rejected",    className: "bg-red-100 text-red-600" },
    pending:     { label: "Pending",     className: "bg-slate-100 text-slate-600" },
  }
  const c = config[screeningStatus] || config.pending!
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

// ── Icon colors for job cards ─────────────────────────────────────────────
const CARD_COLORS = [
  { bg: "bg-primary/10", text: "text-primary" },
  { bg: "bg-teal-50", text: "text-teal-600" },
  { bg: "bg-emerald-50", text: "text-emerald-600" },
  { bg: "bg-blue-50", text: "text-blue-600" },
  { bg: "bg-amber-50", text: "text-amber-600" },
  { bg: "bg-rose-50", text: "text-rose-600" },
  { bg: "bg-purple-50", text: "text-purple-600" },
]

// ── Job Position Card ──────────────────────────────────────────────────────
function JobCard({ job, colorIdx, onClick }: { job: JobFromAPI; colorIdx: number; onClick: () => void }) {
  const color = CARD_COLORS[colorIdx % CARD_COLORS.length]!
  return (
    <div
      onClick={onClick}
      className="bg-white rounded-2xl p-6 shadow-sm border border-outline-variant/10 hover:border-primary/30 transition-all group cursor-pointer"
    >
      {/* Header */}
      <div className="flex justify-between items-start mb-6">
        <div className={cn("p-2.5 rounded-xl", color.bg, color.text)}>
          <Briefcase className="h-5 w-5" />
        </div>
        <StatusBadge status={job.status} />
      </div>

      {/* Title */}
      <h3 className="text-lg font-bold text-on-surface mb-1 truncate font-heading">{job.title}</h3>
      <p className="text-xs text-on-surface-variant mb-5">{job.department || "General"}</p>

      {/* Counts */}
      <div className="grid grid-cols-2 gap-4">
        <div className="flex flex-col">
          <span className="text-2xl font-black text-primary leading-tight">{job.applicants}</span>
          <span className="text-[10px] font-bold text-on-surface-variant uppercase tracking-wide">Applicants</span>
        </div>
        <div className="flex flex-col">
          <span className="text-2xl font-black text-emerald-600 leading-tight">{job.shortlisted}</span>
          <span className="text-[10px] font-bold text-on-surface-variant uppercase tracking-wide">Shortlisted</span>
        </div>
      </div>

      {/* Footer */}
      <div className="mt-6 pt-4 border-t border-outline-variant/10 flex items-center justify-between">
        <div className="flex items-center gap-1.5">
          <Sparkles className="h-3.5 w-3.5 text-primary" />
          <span className="text-xs font-bold text-on-surface">View Applicants</span>
        </div>
        <ChevronRight className="h-4 w-4 text-on-surface-variant/50 group-hover:text-primary transition-colors" />
      </div>
    </div>
  )
}

// ── Create Job Modal ──────────────────────────────────────────────────────
function CreateJobModal({ onClose, onCreate }: { onClose: () => void; onCreate: (job: JobFromAPI) => void }) {
  const [title, setTitle] = useState("")
  const [department, setDepartment] = useState("")
  const [description, setDescription] = useState("")
  const [submitting, setSubmitting] = useState(false)

  const handleSubmit = async () => {
    if (!title.trim()) return
    setSubmitting(true)
    try {
      const res = await fetch(`${API_BASE}/api/jobs`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: title.trim(), department: department.trim() || null, description: description.trim() || null }),
      })
      if (!res.ok) throw new Error("Failed to create job")
      const data = await res.json()
      onCreate({ ...data.job, applicants: 0, shortlisted: 0 })
      onClose()
    } catch (err) {
      console.error("Failed to create job:", err)
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />
      <div className="relative z-10 w-full max-w-lg bg-white rounded-3xl shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="flex items-center gap-3 px-6 py-5 border-b border-outline-variant/10">
          <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
            <Briefcase className="h-5 w-5 text-primary" />
          </div>
          <div>
            <h2 className="text-lg font-bold font-heading text-on-surface">Create Job Opening</h2>
            <p className="text-xs text-on-surface-variant">Define a position to start receiving CVs</p>
          </div>
          <button onClick={onClose} className="ml-auto p-2 rounded-xl hover:bg-surface-container transition-colors text-on-surface-variant">
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Form */}
        <div className="px-6 py-5 space-y-4">
          <div>
            <label className="block text-xs font-semibold text-on-surface-variant mb-1.5 uppercase tracking-wide">
              Job Title *
            </label>
            <input
              className="w-full px-3 py-2.5 rounded-xl border border-outline-variant/30 bg-surface text-sm focus:outline-none focus:ring-2 focus:ring-primary/20"
              placeholder="e.g. Senior Software Engineer"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              autoFocus
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-on-surface-variant mb-1.5 uppercase tracking-wide">
              Department
            </label>
            <input
              className="w-full px-3 py-2.5 rounded-xl border border-outline-variant/30 bg-surface text-sm focus:outline-none focus:ring-2 focus:ring-primary/20"
              placeholder="e.g. Engineering"
              value={department}
              onChange={(e) => setDepartment(e.target.value)}
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-on-surface-variant mb-1.5 uppercase tracking-wide">
              Job Description / Requirements
            </label>
            <textarea
              className="w-full px-3 py-2.5 rounded-xl border border-outline-variant/30 bg-surface text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 resize-none"
              placeholder="Paste the full JD or key requirements here..."
              rows={6}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-2 px-6 py-4 border-t border-outline-variant/10 bg-surface-container-lowest">
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button
            onClick={handleSubmit}
            disabled={!title.trim() || submitting}
            className="gap-2 bg-primary hover:bg-primary/90 text-on-primary rounded-xl disabled:opacity-50"
          >
            {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
            Create Job Opening
          </Button>
        </div>
      </div>
    </div>
  )
}

// ── Candidate Row ─────────────────────────────────────────────────────────
function CandidateRow({ candidate, onShortlist, onWaitlist, onReject }: {
  candidate: Candidate
  onShortlist: () => void
  onWaitlist: () => void
  onReject: () => void
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
          <CandidateStatusBadge screeningStatus={candidate.screeningStatus} />
          <span className="text-[9px] text-on-surface-variant">{candidate.appliedAgo}</span>
        </div>

        {/* Actions */}
        <div className="flex gap-2">
          <button
            onClick={onShortlist}
            className={cn(
              "px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all",
              candidate.screeningStatus === "shortlisted"
                ? "bg-emerald-600 text-white"
                : "bg-primary text-white hover:opacity-90"
            )}
          >
            {candidate.screeningStatus === "shortlisted" ? "✓ Shortlisted" : "Shortlist"}
          </button>
          <button
            onClick={onWaitlist}
            className={cn(
              "px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all",
              candidate.screeningStatus === "waitlisted"
                ? "bg-amber-500 text-white"
                : "border border-outline-variant/40 text-on-surface hover:bg-surface-container"
            )}
          >
            {candidate.screeningStatus === "waitlisted" ? "✓ Waitlisted" : "Waitlist"}
          </button>
          <button
            onClick={onReject}
            className={cn(
              "px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all",
              candidate.screeningStatus === "rejected"
                ? "bg-red-600 text-white"
                : "border border-red-200 text-red-600 hover:bg-red-50"
            )}
          >
            {candidate.screeningStatus === "rejected" ? "✓ Rejected" : "Reject"}
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Main Page ─────────────────────────────────────────────────────────────
export function Documents() {
  const navigate = useNavigate()
  const [jobs, setJobs] = useState<JobFromAPI[]>([])
  const [candidates, setCandidates] = useState<Candidate[]>([])
  const [filter, setFilter] = useState("all")
  const [loading, setLoading] = useState(true)
  const [showCreateModal, setShowCreateModal] = useState(false)

  // Load data
  useEffect(() => {
    async function loadData() {
      try {
        const [jobsRes, cvRes] = await Promise.all([
          fetch(`${API_BASE}/api/jobs`),
          fetch(`${API_BASE}/api/cv-library`),
        ])

        if (jobsRes.ok) {
          const data = await jobsRes.json()
          setJobs(data.jobs || [])
        }

        if (cvRes.ok) {
          const data = await cvRes.json()
          if (data.files && data.files.length > 0) {
            const dbCandidates: Candidate[] = data.files.slice(0, 5).map((f: any) => ({
              id: f.id,
              name: f.candidateName || f.name.replace(/\.[^.]+$/, ""),
              role: f.tags?.[0] || "Candidate",
              location: "—",
              aiMatch: Math.floor(Math.random() * 20 + 75),
              status: (f.screeningStatus || "pending") as Candidate["status"],
              screeningStatus: f.screeningStatus || "pending",
              appliedAgo: f.date ? `Applied ${timeAgo(f.date)}` : "Applied recently",
            }))
            setCandidates(dbCandidates)
          }
        }
      } catch {
        // Keep empty
      } finally {
        setLoading(false)
      }
    }
    loadData()
  }, [])

  const updateScreeningStatus = async (id: string, newStatus: string) => {
    try {
      const res = await fetch(`${API_BASE}/api/cv/${id}/screening`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ screeningStatus: newStatus }),
      })
      if (res.ok) {
        setCandidates((prev) => prev.map((c) =>
          c.id === id ? { ...c, screeningStatus: newStatus, status: newStatus as Candidate["status"] } : c
        ))
      }
    } catch {
      console.error("Failed to update screening status")
    }
  }

  const filteredJobs = filter === "all" ? jobs : jobs.filter((j) => j.id === filter)

  return (
    <div className="flex flex-col gap-8 max-w-screen-xl">
      {/* Create Job Modal */}
      {showCreateModal && (
        <CreateJobModal
          onClose={() => setShowCreateModal(false)}
          onCreate={(job) => setJobs((prev) => [job, ...prev])}
        />
      )}

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
              {jobs.map((j) => (
                <option key={j.id} value={j.id}>{j.title}</option>
              ))}
            </select>
            <ChevronRight className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 rotate-90 pointer-events-none text-on-surface-variant" />
          </div>
          {/* Create Job */}
          <Button
            onClick={() => setShowCreateModal(true)}
            className="gap-2 rounded-xl text-sm font-semibold shadow-md"
            style={{
              background: "linear-gradient(135deg, #003b56 0%, #005377 100%)",
              color: "white",
            }}
          >
            <Plus className="h-4 w-4" />
            New Job Opening
          </Button>
        </div>
      </header>

      {/* Job Position Cards Grid */}
      {loading ? (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      ) : filteredJobs.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 bg-white rounded-2xl border border-outline-variant/10 gap-3">
          <Briefcase className="h-12 w-12 text-on-surface-variant/20" />
          <p className="text-sm font-semibold text-on-surface-variant">
            {jobs.length === 0 ? "No job openings yet" : "No matching jobs"}
          </p>
          {jobs.length === 0 && (
            <button
              onClick={() => setShowCreateModal(true)}
              className="mt-1 text-primary font-bold text-xs hover:underline uppercase tracking-widest"
            >
              Create your first job opening
            </button>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-6">
          {filteredJobs.map((job, i) => (
            <JobCard
              key={job.id}
              job={job}
              colorIdx={i}
              onClick={() => navigate(`/cv-search?jobId=${job.id}`)}
            />
          ))}
        </div>
      )}

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
                onShortlist={() => updateScreeningStatus(c.id, "shortlisted")}
                onWaitlist={() => updateScreeningStatus(c.id, "waitlisted")}
                onReject={() => updateScreeningStatus(c.id, "rejected")}
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
