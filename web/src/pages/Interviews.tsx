import { useState, useCallback, useEffect } from "react"
import { Button } from "@/components/ui/button"
import { CalendarWidget } from "@/components/CalendarWidget"
import { useGoogleCalendar } from "@/hooks/useGoogleCalendar"
import type { CalendarEvent, CreateEventParams } from "@/hooks/useGoogleCalendar"
import {
  CalendarDays,
  Plus,
  ExternalLink,
  Clock,
  User,
  Video,
  MapPin,
  ChevronRight,
  LogIn,
  LogOut,
  AlertCircle,
  Loader2,
  CheckCircle2,
  RefreshCw,
} from "lucide-react"
import { cn } from "@/lib/utils"

// ── Types ─────────────────────────────────────────────────────────────────────

type ViewMode = "month" | "week"

// ── Interview type badge ───────────────────────────────────────────────────

function TypeBadge({ type }: { type: "video" | "onsite" | "phone" }) {
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

// ── Detect interview type from event ───────────────────────────────────────

function detectInterviewType(event: CalendarEvent): "video" | "onsite" | "phone" {
  const loc = (event.location || "").toLowerCase()
  const desc = (event.description || "").toLowerCase()
  if (loc.includes("meet") || loc.includes("zoom") || loc.includes("teams") || desc.includes("video")) return "video"
  if (loc.includes("phone") || desc.includes("phone")) return "phone"
  if (loc && !loc.includes("http")) return "onsite"
  return "video"
}

// ── Schedule Interview Modal ───────────────────────────────────────────────

function ScheduleModal({
  onClose,
  onSubmit,
  isSubmitting,
  initialDate,
}: {
  onClose: () => void
  onSubmit: (params: CreateEventParams) => Promise<void>
  isSubmitting: boolean
  initialDate?: Date
}) {
  const defaultDate = initialDate || new Date(Date.now() + 24 * 60 * 60 * 1000)
  const [candidateName, setCandidateName] = useState("")
  const [role, setRole] = useState("")
  const [date, setDate] = useState(defaultDate.toISOString().split("T")[0])
  const [time, setTime] = useState(
    defaultDate.getHours() > 0
      ? `${String(defaultDate.getHours()).padStart(2, "0")}:${String(defaultDate.getMinutes()).padStart(2, "0")}`
      : "10:00"
  )
  const [duration, setDuration] = useState("60")
  const [type, setType] = useState("video")
  const [notes, setNotes] = useState("")
  const [success, setSuccess] = useState(false)

  const handleCreate = async () => {
    const startDate = new Date(`${date}T${time}`)
    const endDate = new Date(startDate.getTime() + Number(duration) * 60 * 1000)
    const location = type === "video" ? "Google Meet" : type === "onsite" ? "Office" : "Phone Call"

    await onSubmit({
      summary: `Interview: ${candidateName || "Candidate"} — ${role || "Position"}`,
      description: `Candidate: ${candidateName}\nRole: ${role}\nType: ${type}\nNotes: ${notes}`,
      location,
      startDateTime: startDate.toISOString(),
      endDateTime: endDate.toISOString(),
    })

    setSuccess(true)
    setTimeout(onClose, 1500)
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />
      <div className="relative z-10 w-full max-w-lg bg-white rounded-3xl shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-200">
        {/* Header */}
        <div className="flex items-center gap-3 px-6 py-5 border-b border-outline-variant/10">
          <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
            <CalendarDays className="h-5 w-5 text-primary" />
          </div>
          <div>
            <h2 className="text-lg font-bold font-heading text-on-surface">Schedule Interview</h2>
            <p className="text-xs text-on-surface-variant">Creates event directly in your Google Calendar</p>
          </div>
          <button
            onClick={onClose}
            className="ml-auto p-2 rounded-xl hover:bg-surface-container transition-colors text-on-surface-variant"
          >
            ✕
          </button>
        </div>

        {success ? (
          <div className="flex flex-col items-center justify-center py-16 gap-3">
            <div className="w-14 h-14 rounded-full bg-green-50 flex items-center justify-center">
              <CheckCircle2 className="h-7 w-7 text-green-600" />
            </div>
            <p className="font-heading font-bold text-on-surface">Interview Scheduled!</p>
            <p className="text-xs text-on-surface-variant">Event created in your Google Calendar</p>
          </div>
        ) : (
          <>
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
                disabled={isSubmitting}
                className="gap-2 bg-primary hover:bg-primary/90 text-on-primary rounded-xl"
              >
                {isSubmitting ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Creating…
                  </>
                ) : (
                  <>
                    <CalendarDays className="h-4 w-4" />
                    Create Event
                  </>
                )}
              </Button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}

// ── Upcoming Event Card ────────────────────────────────────────────────────

function UpcomingEventCard({ event }: { event: CalendarEvent }) {
  const type = detectInterviewType(event)
  const startTime = event.start.dateTime
    ? new Date(event.start.dateTime).toLocaleTimeString([], { hour: "numeric", minute: "2-digit", hour12: true })
    : "All day"
  const startDate = event.start.dateTime
    ? new Date(event.start.dateTime).toLocaleDateString([], { month: "short", day: "numeric", year: "numeric" })
    : event.start.date || ""

  return (
    <div className="px-5 py-4 hover:bg-surface-container-lowest transition-colors group">
      <div className="flex items-start gap-3">
        <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center shrink-0 mt-0.5">
          <User className="h-4 w-4 text-primary" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-on-surface truncate">{event.summary || "(No title)"}</p>
          {event.description && (
            <p className="text-xs text-on-surface-variant truncate">{event.description.split("\n")[0]}</p>
          )}
          <div className="flex items-center gap-2 mt-1.5 flex-wrap">
            <span className="text-xs text-on-surface-variant flex items-center gap-1">
              <Clock className="h-3 w-3" />
              {startDate} · {startTime}
            </span>
            <TypeBadge type={type} />
          </div>
        </div>
        {event.htmlLink && (
          <a
            href={event.htmlLink}
            target="_blank"
            rel="noopener noreferrer"
            className="opacity-0 group-hover:opacity-100 transition-opacity p-1.5 rounded-lg hover:bg-surface-container text-on-surface-variant"
            title="Open in Google Calendar"
          >
            <ExternalLink className="h-3.5 w-3.5" />
          </a>
        )}
      </div>
    </div>
  )
}

// ── Connect Prompt ────────────────────────────────────────────────────────

function ConnectPrompt({
  onConnect,
  isLoading,
  isConfigured,
  error,
}: {
  onConnect: () => void
  isLoading: boolean
  isConfigured: boolean
  error: string | null
}) {
  return (
    <div className="bg-white rounded-3xl shadow-sm border border-outline-variant/10 overflow-hidden">
      <div className="flex flex-col items-center justify-center py-20 px-8 text-center">
        <div className="w-16 h-16 rounded-2xl bg-primary/10 flex items-center justify-center mb-4">
          <CalendarDays className="h-8 w-8 text-primary" />
        </div>
        <h3 className="font-heading text-xl font-bold text-on-surface mb-2">
          Connect Your Google Calendar
        </h3>
        <p className="text-sm text-on-surface-variant max-w-sm mb-6 leading-relaxed">
          {isConfigured
            ? "Sign in with your Google account to view and manage interview schedules directly from this dashboard."
            : "To enable calendar sync, add your Google Cloud credentials to the environment variables."}
        </p>

        {error && (
          <div className="bg-red-50 border border-red-200 rounded-xl px-4 py-3 text-left max-w-sm mb-4">
            <div className="flex gap-2 items-start">
              <AlertCircle className="h-4 w-4 text-red-500 shrink-0 mt-0.5" />
              <div className="text-xs text-red-700 space-y-1">
                <p className="font-semibold">Initialization Error</p>
                <p>{error}</p>
                <p className="text-red-500">Check browser console for details (F12 → Console).</p>
              </div>
            </div>
          </div>
        )}

        {!isConfigured ? (
          <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 text-left max-w-sm">
            <div className="flex gap-2 items-start">
              <AlertCircle className="h-4 w-4 text-amber-600 shrink-0 mt-0.5" />
              <div className="text-xs text-amber-800 space-y-1">
                <p className="font-semibold">Configuration Required</p>
                <p>Set these in your <code className="bg-amber-100 px-1 rounded">web/.env</code> file:</p>
                <ul className="list-disc pl-4 space-y-0.5">
                  <li><code className="bg-amber-100 px-1 rounded">VITE_GOOGLE_CLIENT_ID</code></li>
                  <li><code className="bg-amber-100 px-1 rounded">VITE_GOOGLE_API_KEY</code></li>
                </ul>
              </div>
            </div>
          </div>
        ) : (
          <button
            onClick={onConnect}
            disabled={isLoading}
            className="inline-flex items-center gap-2 px-6 py-3 rounded-xl bg-primary text-on-primary font-semibold text-sm hover:bg-primary/90 transition-all shadow-md hover:shadow-lg disabled:opacity-50"
          >
            {isLoading ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Loading Google APIs…
              </>
            ) : (
              <>
                <LogIn className="h-4 w-4" />
                Sign in with Google
              </>
            )}
          </button>
        )}
      </div>
    </div>
  )
}

// ── Main Page ─────────────────────────────────────────────────────────────

export function Interviews() {
  const [showModal, setShowModal] = useState(false)
  const [calView, setCalView] = useState<ViewMode>("month")
  const [isCreating, setIsCreating] = useState(false)
  const [modalInitialDate, setModalInitialDate] = useState<Date | undefined>()

  const {
    isSignedIn,
    isLoading,
    events,
    error,
    signIn,
    signOut,
    fetchEvents,
    createEvent,
    isConfigured,
  } = useGoogleCalendar()

  // Fetch events when date range changes
  const handleDateRangeChange = useCallback(
    (start: Date, end: Date) => {
      if (isSignedIn) {
        fetchEvents(start.toISOString(), end.toISOString())
      }
    },
    [isSignedIn, fetchEvents]
  )

  // Auto-fetch on first sign-in
  useEffect(() => {
    if (isSignedIn) {
      const now = new Date()
      const start = new Date(now.getFullYear(), now.getMonth(), 1)
      const end = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59)
      fetchEvents(start.toISOString(), end.toISOString())
    }
  }, [isSignedIn, fetchEvents])

  // Handle event creation
  const handleCreateEvent = async (params: CreateEventParams) => {
    setIsCreating(true)
    try {
      const created = await createEvent(params)
      if (created) {
        // Refresh events
        const now = new Date()
        const start = new Date(now.getFullYear(), now.getMonth(), 1)
        const end = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59)
        await fetchEvents(start.toISOString(), end.toISOString())
      }
    } finally {
      setIsCreating(false)
    }
  }

  // Handle slot click → open modal with date prefilled
  const handleSlotClick = (date: Date) => {
    if (!isSignedIn) return
    setModalInitialDate(date)
    setShowModal(true)
  }

  // Separate today and upcoming events
  const now = new Date()
  const todayEvents = events.filter((ev) => {
    const d = new Date(ev.start.dateTime || ev.start.date || "")
    return d.toDateString() === now.toDateString()
  })

  const upcomingEvents = events
    .filter((ev) => {
      const d = new Date(ev.start.dateTime || ev.start.date || "")
      return d > now
    })
    .slice(0, 5)

  return (
    <div className="flex flex-col gap-8 max-w-screen-xl">
      {/* Schedule modal */}
      {showModal && (
        <ScheduleModal
          onClose={() => setShowModal(false)}
          onSubmit={handleCreateEvent}
          isSubmitting={isCreating}
          initialDate={modalInitialDate}
        />
      )}

      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h1 className="font-heading text-2xl font-bold text-on-surface">Interviews</h1>
          <p className="mt-1 text-sm text-on-surface-variant">
            {isSignedIn
              ? "Your schedule, synced with Google Calendar"
              : "Manage interview schedules and sync with Google Calendar"}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {isSignedIn && (
            <>
              <button
                onClick={() => {
                  const start = new Date(now.getFullYear(), now.getMonth(), 1)
                  const end = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59)
                  fetchEvents(start.toISOString(), end.toISOString())
                }}
                className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl border border-outline-variant/20 bg-white text-sm font-medium text-on-surface-variant hover:text-on-surface hover:border-outline-variant/40 transition-all"
                title="Refresh events"
              >
                <RefreshCw className="h-4 w-4" />
              </button>
              <a
                href="https://calendar.google.com"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl border border-outline-variant/20 bg-white text-sm font-medium text-on-surface-variant hover:text-on-surface hover:border-outline-variant/40 transition-all"
              >
                <ExternalLink className="h-4 w-4" />
                Google Calendar
              </a>
              <Button
                onClick={() => {
                  setModalInitialDate(undefined)
                  setShowModal(true)
                }}
                className="gap-2 bg-primary hover:bg-primary/90 text-on-primary rounded-xl"
              >
                <Plus className="h-4 w-4" />
                Schedule Interview
              </Button>
              <button
                onClick={signOut}
                className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-sm text-on-surface-variant hover:bg-surface-container transition-all"
                title="Disconnect Google Calendar"
              >
                <LogOut className="h-4 w-4" />
              </button>
            </>
          )}
        </div>
      </div>

      {/* Error banner */}
      {error && (
        <div className="bg-red-50 border border-red-200 rounded-2xl px-5 py-3 flex items-center gap-3">
          <AlertCircle className="h-5 w-5 text-red-500 shrink-0" />
          <p className="text-sm text-red-700">{error}</p>
        </div>
      )}

      {/* Main content */}
      {!isSignedIn ? (
        <ConnectPrompt onConnect={signIn} isLoading={isLoading} isConfigured={isConfigured} error={error} />
      ) : (
        <div className="grid grid-cols-1 xl:grid-cols-[1fr_340px] gap-6 items-start">
          {/* Left: Calendar widget */}
          <CalendarWidget
            events={events}
            isLoading={isLoading}
            view={calView}
            onViewChange={setCalView}
            onDateRangeChange={handleDateRangeChange}
            onSlotClick={handleSlotClick}
          />

          {/* Right: Sidebar */}
          <div className="flex flex-col gap-4">
            {/* Today */}
            {todayEvents.length > 0 && (
              <div className="bg-white rounded-3xl border border-outline-variant/10 shadow-sm overflow-hidden">
                <div className="px-5 py-3 border-b border-outline-variant/10 flex items-center justify-between">
                  <span className="text-sm font-bold text-on-surface flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full bg-error animate-pulse" />
                    Today
                  </span>
                  <span className="text-xs text-on-surface-variant">
                    {todayEvents.length} event{todayEvents.length !== 1 ? "s" : ""}
                  </span>
                </div>
                <div className="divide-y divide-outline-variant/10">
                  {todayEvents.map((ev) => (
                    <UpcomingEventCard key={ev.id} event={ev} />
                  ))}
                </div>
              </div>
            )}

            {/* Upcoming */}
            <div className="bg-white rounded-3xl border border-outline-variant/10 shadow-sm overflow-hidden">
              <div className="px-5 py-3 border-b border-outline-variant/10 flex items-center justify-between">
                <span className="text-sm font-bold text-on-surface">Upcoming</span>
                <span className="text-xs text-on-surface-variant">
                  {upcomingEvents.length} scheduled
                </span>
              </div>
              {upcomingEvents.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-10 text-on-surface-variant gap-2">
                  <CalendarDays className="h-8 w-8 opacity-20" />
                  <p className="text-xs font-medium">No upcoming events</p>
                  <button
                    onClick={() => {
                      setModalInitialDate(undefined)
                      setShowModal(true)
                    }}
                    className="mt-1 text-primary font-bold text-xs hover:underline uppercase tracking-widest"
                  >
                    Schedule one
                  </button>
                </div>
              ) : (
                <div className="divide-y divide-outline-variant/10">
                  {upcomingEvents.map((ev) => (
                    <UpcomingEventCard key={ev.id} event={ev} />
                  ))}
                </div>
              )}
            </div>

            {/* Quick add */}
            <button
              onClick={() => {
                setModalInitialDate(undefined)
                setShowModal(true)
              }}
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
      )}
    </div>
  )
}
