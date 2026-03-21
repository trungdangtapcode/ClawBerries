import { useState } from "react"
import { Button } from "@/components/ui/button"
import {
  CalendarDays,
  Plus,
  ExternalLink,
  Clock,
  User,
  Video,
  MapPin,
  ChevronRight,
  RefreshCw,
} from "lucide-react"
import { cn } from "@/lib/utils"

// ── Types ─────────────────────────────────────────────────────────────────────
interface ScheduledInterview {
  id: string
  candidateName: string
  role: string
  date: string
  time: string
  duration: string
  interviewer: string
  type: "video" | "onsite" | "phone"
  status: "upcoming" | "today" | "completed"
}

// ── Sample upcoming interviews ─────────────────────────────────────────────
const SAMPLE_INTERVIEWS: ScheduledInterview[] = [
  {
    id: "1",
    candidateName: "Thang Nguyen Tien",
    role: "AI Engineer",
    date: "Mar 22, 2026",
    time: "10:00 AM",
    duration: "60 min",
    interviewer: "Marcus Chen",
    type: "video",
    status: "today",
  },
  {
    id: "2",
    candidateName: "Linh Pham Thi",
    role: "Product Manager",
    date: "Mar 23, 2026",
    time: "2:30 PM",
    duration: "45 min",
    interviewer: "Angela Park",
    type: "onsite",
    status: "upcoming",
  },
  {
    id: "3",
    candidateName: "Minh Tran Van",
    role: "Backend Engineer",
    date: "Mar 24, 2026",
    time: "11:00 AM",
    duration: "60 min",
    interviewer: "James Hoang",
    type: "video",
    status: "upcoming",
  },
]

// ── Google Calendar helpers ────────────────────────────────────────────────

function buildGoogleEventUrl({
  title,
  details,
  location,
  startDate,
  durationMins = 60,
}: {
  title: string
  details?: string
  location?: string
  startDate?: Date
  durationMins?: number
}) {
  const start = startDate || new Date(Date.now() + 24 * 60 * 60 * 1000)
  const end = new Date(start.getTime() + durationMins * 60 * 1000)

  const fmt = (d: Date) =>
    d.toISOString().replace(/[-:]/g, "").split(".")[0] + "Z"

  const params = new URLSearchParams({
    action: "TEMPLATE",
    text: title,
    dates: `${fmt(start)}/${fmt(end)}`,
    details: details || "Interview scheduled via Kinetic Talent",
    location: location || "Google Meet",
  })

  return `https://calendar.google.com/calendar/r/eventedit?${params.toString()}`
}

// ── Interview type badge ───────────────────────────────────────────────────
function TypeBadge({ type }: { type: ScheduledInterview["type"] }) {
  const config = {
    video: { icon: Video, label: "Video", className: "bg-blue-50 text-blue-600" },
    onsite: { icon: MapPin, label: "Onsite", className: "bg-green-50 text-green-600" },
    phone: { icon: Clock, label: "Phone", className: "bg-orange-50 text-orange-600" },
  }
  const { icon: Icon, label, className } = config[type]
  return (
    <span className={cn("inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold", className)}>
      <Icon className="h-3 w-3" />
      {label}
    </span>
  )
}

// ── Schedule Interview Modal ───────────────────────────────────────────────
function ScheduleModal({ onClose }: { onClose: () => void }) {
  const [candidateName, setCandidateName] = useState("")
  const [role, setRole] = useState("")
  const [date, setDate] = useState("")
  const [time, setTime] = useState("")
  const [duration, setDuration] = useState("60")
  const [type, setType] = useState("video")
  const [notes, setNotes] = useState("")

  const handleCreate = () => {
    const startDate = date && time ? new Date(`${date}T${time}`) : undefined
    const url = buildGoogleEventUrl({
      title: `Interview: ${candidateName || "Candidate"} — ${role || "Position"}`,
      details: `Candidate: ${candidateName}\nRole: ${role}\nType: ${type}\nNotes: ${notes}`,
      location: type === "video" ? "Google Meet" : type === "onsite" ? "Office" : "Phone Call",
      startDate,
      durationMins: Number(duration),
    })
    window.open(url, "_blank", "noopener,noreferrer")
    onClose()
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />
      <div className="relative z-10 w-full max-w-lg bg-white rounded-3xl shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="flex items-center gap-3 px-6 py-5 border-b border-outline-variant/10">
          <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
            <CalendarDays className="h-5 w-5 text-primary" />
          </div>
          <div>
            <h2 className="text-lg font-bold font-heading text-on-surface">Schedule Interview</h2>
            <p className="text-xs text-on-surface-variant">Opens Google Calendar to create the event</p>
          </div>
          <button
            onClick={onClose}
            className="ml-auto p-2 rounded-xl hover:bg-surface-container transition-colors text-on-surface-variant"
          >
            ✕
          </button>
        </div>

        {/* Form */}
        <div className="px-6 py-5 space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-on-surface-variant mb-1.5 uppercase tracking-wide">
                Candidate Name
              </label>
              <input
                className="w-full px-3 py-2.5 rounded-xl border border-outline-variant/30 bg-surface text-sm focus:outline-none focus:ring-2 focus:ring-primary/20"
                placeholder="e.g. Thang Nguyen"
                value={candidateName}
                onChange={(e) => setCandidateName(e.target.value)}
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-on-surface-variant mb-1.5 uppercase tracking-wide">
                Position
              </label>
              <input
                className="w-full px-3 py-2.5 rounded-xl border border-outline-variant/30 bg-surface text-sm focus:outline-none focus:ring-2 focus:ring-primary/20"
                placeholder="e.g. AI Engineer"
                value={role}
                onChange={(e) => setRole(e.target.value)}
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-on-surface-variant mb-1.5 uppercase tracking-wide">
                Date
              </label>
              <input
                type="date"
                className="w-full px-3 py-2.5 rounded-xl border border-outline-variant/30 bg-surface text-sm focus:outline-none focus:ring-2 focus:ring-primary/20"
                value={date}
                onChange={(e) => setDate(e.target.value)}
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-on-surface-variant mb-1.5 uppercase tracking-wide">
                Time
              </label>
              <input
                type="time"
                className="w-full px-3 py-2.5 rounded-xl border border-outline-variant/30 bg-surface text-sm focus:outline-none focus:ring-2 focus:ring-primary/20"
                value={time}
                onChange={(e) => setTime(e.target.value)}
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-on-surface-variant mb-1.5 uppercase tracking-wide">
                Duration
              </label>
              <select
                className="w-full px-3 py-2.5 rounded-xl border border-outline-variant/30 bg-surface text-sm focus:outline-none focus:ring-2 focus:ring-primary/20"
                value={duration}
                onChange={(e) => setDuration(e.target.value)}
              >
                <option value="30">30 minutes</option>
                <option value="45">45 minutes</option>
                <option value="60">60 minutes</option>
                <option value="90">90 minutes</option>
                <option value="120">2 hours</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold text-on-surface-variant mb-1.5 uppercase tracking-wide">
                Interview Type
              </label>
              <select
                className="w-full px-3 py-2.5 rounded-xl border border-outline-variant/30 bg-surface text-sm focus:outline-none focus:ring-2 focus:ring-primary/20"
                value={type}
                onChange={(e) => setType(e.target.value)}
              >
                <option value="video">📹 Video Call</option>
                <option value="onsite">🏢 Onsite</option>
                <option value="phone">📞 Phone</option>
              </select>
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-on-surface-variant mb-1.5 uppercase tracking-wide">
              Notes (optional)
            </label>
            <textarea
              className="w-full px-3 py-2.5 rounded-xl border border-outline-variant/30 bg-surface text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 resize-none"
              placeholder="Any additional notes for this interview..."
              rows={3}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
            />
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-2 px-6 py-4 border-t border-outline-variant/10 bg-surface-container-lowest">
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button
            onClick={handleCreate}
            className="gap-2 bg-primary hover:bg-primary/90 text-on-primary rounded-xl"
          >
            <ExternalLink className="h-4 w-4" />
            Open in Google Calendar
          </Button>
        </div>
      </div>
    </div>
  )
}

// ── Main Page ─────────────────────────────────────────────────────────────
export function Interviews() {
  const [showModal, setShowModal] = useState(false)
  const [calView, setCalView] = useState<"WEEK" | "MONTH" | "AGENDA">("WEEK")

  const calUrl = `https://calendar.google.com/calendar/embed?mode=${calView}&showTitle=0&showNav=1&showDate=1&showPrint=0&showTabs=0&showCalendars=0&showTz=1`

  const today = SAMPLE_INTERVIEWS.filter((i) => i.status === "today")
  const upcoming = SAMPLE_INTERVIEWS.filter((i) => i.status === "upcoming")

  return (
    <div className="flex flex-col gap-8 max-w-screen-xl">
      {/* Schedule modal */}
      {showModal && <ScheduleModal onClose={() => setShowModal(false)} />}

      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h1 className="font-heading text-2xl font-bold text-on-surface">Interviews</h1>
          <p className="mt-1 text-sm text-on-surface-variant">
            Manage interview schedules and sync with Google Calendar
          </p>
        </div>
        <div className="flex items-center gap-2">
          <a
            href="https://calendar.google.com"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl border border-outline-variant/20 bg-white text-sm font-medium text-on-surface-variant hover:text-on-surface hover:border-outline-variant/40 transition-all"
          >
            <ExternalLink className="h-4 w-4" />
            Open Google Calendar
          </a>
          <Button
            onClick={() => setShowModal(true)}
            className="gap-2 bg-primary hover:bg-primary/90 text-on-primary rounded-xl"
          >
            <Plus className="h-4 w-4" />
            Schedule Interview
          </Button>
        </div>
      </div>

      {/* Two-column layout */}
      <div className="grid grid-cols-1 xl:grid-cols-[1fr_340px] gap-6 items-start">
        {/* Left: Google Calendar embed */}
        <div className="bg-white rounded-3xl shadow-sm border border-outline-variant/10 overflow-hidden">
          {/* Toolbar */}
          <div className="flex items-center justify-between px-5 py-3 border-b border-outline-variant/10">
            <div className="flex items-center gap-2">
              <CalendarDays className="h-4 w-4 text-primary" />
              <span className="text-sm font-bold text-on-surface">Calendar</span>
            </div>
            <div className="flex items-center gap-1">
              {(["WEEK", "MONTH", "AGENDA"] as const).map((v) => (
                <button
                  key={v}
                  onClick={() => setCalView(v)}
                  className={cn(
                    "px-3 py-1 rounded-lg text-xs font-semibold transition-all",
                    calView === v
                      ? "bg-primary text-on-primary"
                      : "text-on-surface-variant hover:bg-surface-container"
                  )}
                >
                  {v.charAt(0) + v.slice(1).toLowerCase()}
                </button>
              ))}
              <a
                href="https://calendar.google.com"
                target="_blank"
                rel="noopener noreferrer"
                className="ml-2 p-1.5 rounded-lg text-on-surface-variant hover:bg-surface-container transition-all"
                title="Open in Google Calendar"
              >
                <ExternalLink className="h-3.5 w-3.5" />
              </a>
            </div>
          </div>

          {/* Iframe */}
          <div className="relative">
            <iframe
              src={calUrl}
              className="w-full border-none"
              height={580}
              title="Google Calendar"
              sandbox="allow-scripts allow-same-origin allow-popups allow-forms"
            />
            {/* Overlay hint for first visit */}
            <div className="absolute bottom-4 right-4 bg-white/90 backdrop-blur-sm rounded-xl px-3 py-1.5 shadow text-xs text-on-surface-variant flex items-center gap-1.5 pointer-events-none">
              <RefreshCw className="h-3 w-3" />
              Sign in to Google to see your events
            </div>
          </div>
        </div>

        {/* Right: Sidebar */}
        <div className="flex flex-col gap-4">
          {/* Today */}
          {today.length > 0 && (
            <div className="bg-white rounded-3xl border border-outline-variant/10 shadow-sm overflow-hidden">
              <div className="px-5 py-3 border-b border-outline-variant/10 flex items-center justify-between">
                <span className="text-sm font-bold text-on-surface flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-error animate-pulse" />
                  Today
                </span>
                <span className="text-xs text-on-surface-variant">{today.length} interview{today.length !== 1 ? "s" : ""}</span>
              </div>
              <div className="divide-y divide-outline-variant/10">
                {today.map((iv) => (
                  <InterviewCard key={iv.id} interview={iv} />
                ))}
              </div>
            </div>
          )}

          {/* Upcoming */}
          <div className="bg-white rounded-3xl border border-outline-variant/10 shadow-sm overflow-hidden">
            <div className="px-5 py-3 border-b border-outline-variant/10 flex items-center justify-between">
              <span className="text-sm font-bold text-on-surface">Upcoming</span>
              <span className="text-xs text-on-surface-variant">{upcoming.length} scheduled</span>
            </div>
            {upcoming.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-10 text-on-surface-variant gap-2">
                <CalendarDays className="h-8 w-8 opacity-20" />
                <p className="text-xs font-medium">No upcoming interviews</p>
                <button
                  onClick={() => setShowModal(true)}
                  className="mt-1 text-primary font-bold text-xs hover:underline uppercase tracking-widest"
                >
                  Schedule one
                </button>
              </div>
            ) : (
              <div className="divide-y divide-outline-variant/10">
                {upcoming.map((iv) => (
                  <InterviewCard key={iv.id} interview={iv} />
                ))}
              </div>
            )}
          </div>

          {/* Quick add to Google Calendar */}
          <button
            onClick={() => setShowModal(true)}
            className="w-full flex items-center gap-3 px-5 py-4 bg-primary/5 hover:bg-primary/10 border border-primary/15 rounded-2xl transition-all group"
          >
            <div className="w-9 h-9 rounded-xl bg-primary flex items-center justify-center shrink-0 group-hover:scale-105 transition-transform">
              <Plus className="h-4 w-4 text-on-primary" />
            </div>
            <div className="text-left">
              <p className="text-sm font-bold text-on-surface">Schedule New Interview</p>
              <p className="text-xs text-on-surface-variant">Creates event in Google Calendar</p>
            </div>
            <ChevronRight className="ml-auto h-4 w-4 text-on-surface-variant/50 group-hover:text-primary transition-colors" />
          </button>
        </div>
      </div>
    </div>
  )
}

function InterviewCard({ interview }: { interview: ScheduledInterview }) {
  const handleAddToCalendar = () => {
    const url = buildGoogleEventUrl({
      title: `Interview: ${interview.candidateName} — ${interview.role}`,
      details: `Interviewer: ${interview.interviewer}\nDuration: ${interview.duration}`,
      durationMins: Number(interview.duration.replace(" min", "")),
    })
    window.open(url, "_blank", "noopener,noreferrer")
  }

  return (
    <div className="px-5 py-4 hover:bg-surface-container-lowest transition-colors group">
      <div className="flex items-start gap-3">
        <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center shrink-0 mt-0.5">
          <User className="h-4 w-4 text-primary" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-on-surface truncate">{interview.candidateName}</p>
          <p className="text-xs text-on-surface-variant">{interview.role}</p>
          <div className="flex items-center gap-2 mt-1.5 flex-wrap">
            <span className="text-xs text-on-surface-variant flex items-center gap-1">
              <Clock className="h-3 w-3" />
              {interview.date} · {interview.time}
            </span>
            <TypeBadge type={interview.type} />
          </div>
        </div>
        <button
          onClick={handleAddToCalendar}
          className="opacity-0 group-hover:opacity-100 transition-opacity p-1.5 rounded-lg hover:bg-surface-container text-on-surface-variant"
          title="Add to Google Calendar"
        >
          <ExternalLink className="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
  )
}
