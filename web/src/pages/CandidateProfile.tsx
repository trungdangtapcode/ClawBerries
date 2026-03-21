import { useState, useEffect, useCallback } from "react"
import { useParams, useSearchParams, useNavigate } from "react-router-dom"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import {
  ArrowLeft,
  Download,
  FileText,
  Loader2,
  Star,
  CheckCircle2,
  PauseCircle,
  XCircle,
  Mail,
  CalendarPlus,
  MapPin,
  Brain,
  Video,
  Phone,
  Building2,
  X,
} from "lucide-react"

const API_BASE = import.meta.env.VITE_API_URL || "http://localhost:3001"

interface CandidateData {
  id: string
  name: string
  originalFileName: string
  type: string
  candidateName: string | null
  candidateEmail: string | null
  status: string
  screeningStatus: string
  overallRating: string | null
  date: string
  completedAt: string | null
  // From candidate_profiles
  fullName?: string
  email?: string
  phone?: string
  location?: string
  currentTitle?: string
  yearsExperience?: number
  skills?: string[]
  documentText?: string
}

// ── Schedule Interview Modal ────────────────────────────────────────────────
function ScheduleInterviewModal({
  onClose,
  candidateName,
  candidateEmail,
  jobTitle,
}: {
  onClose: () => void
  candidateName: string
  candidateEmail?: string | null
  jobTitle?: string | null
}) {
  const tomorrow = new Date(Date.now() + 24 * 60 * 60 * 1000)
  const [date, setDate] = useState(tomorrow.toISOString().split("T")[0]!)
  const [time, setTime] = useState("10:00")
  const [duration, setDuration] = useState("60")
  const [type, setType] = useState("video")
  const [notes, setNotes] = useState("")
  const [success, setSuccess] = useState(false)
  const [submitting, setSubmitting] = useState(false)

  const handleSchedule = async () => {
    setSubmitting(true)
    const startDate = new Date(`${date}T${time}`)
    const endDate = new Date(startDate.getTime() + Number(duration) * 60 * 1000)
    const location = type === "video" ? "Google Meet" : type === "onsite" ? "Office" : "Phone Call"
    const summary = `Interview: ${candidateName}${jobTitle ? ` — ${jobTitle}` : ""}`
    const description = [
      `Candidate: ${candidateName}`,
      candidateEmail ? `Email: ${candidateEmail}` : "",
      jobTitle ? `Position: ${jobTitle}` : "",
      `Type: ${type}`,
      notes ? `Notes: ${notes}` : "",
    ].filter(Boolean).join("\n")

    // Build Google Calendar URL
    const gcalStart = startDate.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "")
    const gcalEnd = endDate.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "")
    const gcalUrl = new URL("https://calendar.google.com/calendar/render")
    gcalUrl.searchParams.set("action", "TEMPLATE")
    gcalUrl.searchParams.set("text", summary)
    gcalUrl.searchParams.set("dates", `${gcalStart}/${gcalEnd}`)
    gcalUrl.searchParams.set("details", description)
    gcalUrl.searchParams.set("location", location)
    if (candidateEmail) gcalUrl.searchParams.set("add", candidateEmail)

    // Save to backend for the Interviews tab
    try {
      await fetch(`${API_BASE}/api/interviews`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          candidateName,
          candidateEmail,
          jobTitle,
          interviewType: type,
          startTime: startDate.toISOString(),
          endTime: endDate.toISOString(),
          location,
          notes,
          googleCalendarUrl: gcalUrl.toString(),
        }),
      })
    } catch {
      // Non-blocking — calendar link still works
    }

    // Open Google Calendar in new tab
    window.open(gcalUrl.toString(), "_blank")
    setSuccess(true)
    setSubmitting(false)
    setTimeout(onClose, 1500)
  }

  const TypeIcon = type === "video" ? Video : type === "phone" ? Phone : Building2

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />
      <div className="relative z-10 w-full max-w-lg bg-white rounded-3xl shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-200">
        {/* Header */}
        <div className="flex items-center gap-3 px-6 py-5 border-b border-outline-variant/10">
          <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
            <CalendarPlus className="h-5 w-5 text-primary" />
          </div>
          <div>
            <h2 className="text-lg font-bold font-heading text-on-surface">Schedule Interview</h2>
            <p className="text-xs text-on-surface-variant">Creates event in your Google Calendar</p>
          </div>
          <button
            onClick={onClose}
            className="ml-auto p-2 rounded-xl hover:bg-surface-container transition-colors text-on-surface-variant"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {success ? (
          <div className="flex flex-col items-center justify-center py-16 gap-3">
            <div className="w-14 h-14 rounded-full bg-green-50 flex items-center justify-center">
              <CheckCircle2 className="h-7 w-7 text-green-600" />
            </div>
            <p className="font-heading font-bold text-on-surface">Interview Scheduled!</p>
            <p className="text-xs text-on-surface-variant">Google Calendar opened in a new tab</p>
          </div>
        ) : (
          <>
            {/* Pre-filled candidate info */}
            <div className="px-6 pt-5 pb-3">
              <div className="flex items-center gap-3 bg-surface-container-low rounded-xl p-3">
                <div className="w-10 h-10 rounded-full bg-gradient-to-br from-primary-fixed to-secondary-container flex items-center justify-center text-sm font-bold text-primary">
                  {candidateName.split(" ").map(w => w[0]).join("").slice(0, 2).toUpperCase()}
                </div>
                <div>
                  <p className="text-sm font-bold text-on-surface">{candidateName}</p>
                  {jobTitle && <p className="text-xs text-on-surface-variant">{jobTitle}</p>}
                </div>
              </div>
            </div>

            {/* Form */}
            <div className="px-6 py-4 space-y-4">
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
                  placeholder="Interview topics, preparation notes..."
                  rows={3}
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                />
              </div>

              {/* Preview */}
              <div className="bg-surface-container-low rounded-xl p-4 flex items-center gap-3">
                <TypeIcon className="h-5 w-5 text-primary" />
                <div className="text-xs text-on-surface-variant">
                  <span className="font-semibold text-on-surface">{date}</span> at <span className="font-semibold text-on-surface">{time}</span> · {duration} min · {type === "video" ? "Video Call" : type === "phone" ? "Phone" : "Onsite"}
                </div>
              </div>
            </div>

            {/* Footer */}
            <div className="flex items-center justify-end gap-2 px-6 py-4 border-t border-outline-variant/10 bg-surface-container-lowest">
              <Button variant="ghost" onClick={onClose}>Cancel</Button>
              <Button
                onClick={handleSchedule}
                disabled={submitting || !date || !time}
                className="gap-2 rounded-xl"
                style={{ background: "linear-gradient(135deg, #003b56 0%, #005377 100%)", color: "white" }}
              >
                {submitting ? (
                  <><Loader2 className="h-4 w-4 animate-spin" /> Creating…</>
                ) : (
                  <><CalendarPlus className="h-4 w-4" /> Add to Google Calendar</>
                )}
              </Button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}

export default function CandidateProfile() {
  const { id } = useParams<{ id: string }>()
  const [searchParams] = useSearchParams()
  const navigate = useNavigate()
  const jobId = searchParams.get("jobId")

  const [candidate, setCandidate] = useState<CandidateData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [rating, setRating] = useState(0)
  const [notes, setNotes] = useState("")
  const [jobTitle, setJobTitle] = useState<string | null>(null)
  const [screeningStatus, setScreeningStatus] = useState<string>("pending")
  const [showScheduleModal, setShowScheduleModal] = useState(false)

  // Fetch candidate data
  useEffect(() => {
    if (!id) return
    setLoading(true)
    fetch(`${API_BASE}/api/cv-profile/${id}`)
      .then((r) => r.json())
      .then((data) => {
        setCandidate(data.candidate)
        setScreeningStatus(data.candidate?.screeningStatus || "pending")
      })
      .catch(() => setError("Could not load candidate profile."))
      .finally(() => setLoading(false))
  }, [id])

  // Fetch job title
  useEffect(() => {
    if (!jobId) return
    fetch(`${API_BASE}/api/jobs`)
      .then((r) => r.json())
      .then((data) => {
        const job = data.jobs?.find((j: any) => j.id === jobId)
        setJobTitle(job?.title || null)
      })
      .catch(() => {})
  }, [jobId])

  // Update screening status
  const updateScreening = useCallback(async (newStatus: string) => {
    if (!id) return
    try {
      const res = await fetch(`${API_BASE}/api/cv/${id}/screening`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ screeningStatus: newStatus }),
      })
      if (res.ok) {
        setScreeningStatus(newStatus)
      }
    } catch {
      console.error("Failed to update screening status")
    }
  }, [id])

  const goBack = () => {
    if (jobId) {
      navigate(`/cv-search?jobId=${jobId}`)
    } else {
      navigate("/cv-search")
    }
  }

  const fileUrl = `${API_BASE}/api/cv-file/${id}`
  const fileType = candidate?.originalFileName?.split(".").pop()?.toLowerCase() || "pdf"

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <Loader2 className="h-10 w-10 animate-spin text-primary" />
      </div>
    )
  }

  if (error || !candidate) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-4 text-on-surface-variant">
        <p className="font-semibold">{error || "Candidate not found"}</p>
        <Button onClick={goBack} variant="ghost">Go Back</Button>
      </div>
    )
  }

  const displayName = candidate.candidateName || candidate.fullName || candidate.originalFileName || "Unknown Candidate"
  const displayTitle = candidate.currentTitle || "Applicant"

  return (
    <div className="flex-1 flex flex-col overflow-auto bg-surface-bright">
      {/* Header / Breadcrumb */}
      <header className="flex items-center justify-between px-8 py-5 bg-surface-container-lowest border-b border-outline-variant/10 shrink-0">
        <div className="flex items-center gap-4">
          <button
            onClick={goBack}
            className="p-2 rounded-full hover:bg-surface-container transition-colors"
          >
            <ArrowLeft className="h-5 w-5" />
          </button>
          <div className="flex items-center gap-2 text-sm font-medium text-on-surface-variant">
            {jobTitle && (
              <>
                <span>{jobTitle}</span>
                <span className="text-outline">&rsaquo;</span>
              </>
            )}
            <span className="text-on-surface font-semibold">{displayName}</span>
          </div>
        </div>
        <div className="flex gap-3">
          {candidate.candidateEmail && (
            <a
              href={`mailto:${candidate.candidateEmail}`}
              className="px-5 py-2 rounded-xl bg-secondary-container text-on-secondary-container font-semibold text-sm hover:opacity-90 transition-opacity flex items-center gap-2"
            >
              <Mail className="h-4 w-4" /> Email Candidate
            </a>
          )}
          <button
            onClick={() => setShowScheduleModal(true)}
            className="px-5 py-2 rounded-xl bg-gradient-to-br from-[#003b56] to-[#005377] text-white font-semibold text-sm hover:opacity-90 shadow-lg transition-all flex items-center gap-2"
          >
            <CalendarPlus className="h-4 w-4" /> Schedule Interview
          </button>
        </div>
      </header>

      {/* Schedule Interview Modal */}
      {showScheduleModal && (
        <ScheduleInterviewModal
          onClose={() => setShowScheduleModal(false)}
          candidateName={displayName}
          candidateEmail={candidate.candidateEmail}
          jobTitle={jobTitle}
        />
      )}

      <div className="px-8 pb-12 flex flex-col gap-8 pt-6">
        {/* Hero Profile Section */}
        <section className="bg-surface-container-low rounded-xl p-8">
          <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center gap-6">
            <div className="flex gap-6 items-center">
              {/* Avatar */}
              <div className="w-24 h-24 rounded-full border-4 border-surface-container-highest shadow-sm bg-gradient-to-br from-primary-fixed to-secondary-container flex items-center justify-center text-3xl font-bold text-primary">
                {displayName.split(" ").map(w => w[0]).join("").slice(0, 2).toUpperCase()}
              </div>
              <div className="flex flex-col gap-1">
                <div className="flex items-center gap-3">
                  <h1 className="text-3xl font-bold tracking-tight text-on-surface font-heading">
                    {displayName}
                  </h1>
                  {candidate.overallRating === "green" && (
                    <span className="px-3 py-1 rounded-full bg-primary-fixed text-on-primary-fixed-variant text-xs font-bold uppercase tracking-wider">
                      Top Match
                    </span>
                  )}
                  {candidate.overallRating === "yellow" && (
                    <span className="px-3 py-1 rounded-full bg-amber-100 text-amber-800 text-xs font-bold uppercase tracking-wider">
                      Good Fit
                    </span>
                  )}
                </div>
                <p className="text-on-surface-variant font-medium">{displayTitle}</p>
                <div className="flex gap-4 mt-2">
                  {candidate.location && (
                    <div className="flex items-center gap-1.5 text-on-surface-variant text-sm">
                      <MapPin className="h-4 w-4" /> {candidate.location}
                    </div>
                  )}
                  {candidate.candidateEmail && (
                    <div className="flex items-center gap-1.5 text-on-surface-variant text-sm">
                      <Mail className="h-4 w-4" /> {candidate.candidateEmail}
                    </div>
                  )}
                </div>
              </div>
            </div>
            {/* Match Score */}
            {candidate.overallRating && (
              <div className="flex flex-col items-center gap-2 bg-surface-container-lowest p-6 rounded-xl shadow-sm border border-outline-variant/20">
                <div className="relative w-24 h-24">
                  <svg className="w-full h-full -rotate-90" viewBox="0 0 36 36">
                    <circle
                      className="stroke-surface-container"
                      cx="18" cy="18" r="16" fill="none" strokeWidth="3"
                    />
                    <circle
                      className={cn(
                        "stroke-current",
                        candidate.overallRating === "green" ? "text-emerald-500" :
                        candidate.overallRating === "yellow" ? "text-amber-500" : "text-red-500"
                      )}
                      cx="18" cy="18" r="16" fill="none"
                      strokeWidth="3" strokeLinecap="round"
                      strokeDasharray={`${candidate.overallRating === "green" ? 90 : candidate.overallRating === "yellow" ? 65 : 35}, 100`}
                    />
                  </svg>
                  <div className="absolute inset-0 flex items-center justify-center">
                    <span className="text-2xl font-bold text-on-surface">
                      {candidate.overallRating === "green" ? "90" : candidate.overallRating === "yellow" ? "65" : "35"}
                      <span className="text-sm font-medium">%</span>
                    </span>
                  </div>
                </div>
                <span className="text-xs font-bold uppercase tracking-widest text-on-surface-variant">
                  AI Match Score
                </span>
              </div>
            )}
          </div>
        </section>

        {/* Profile Content Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
          {/* Left Column */}
          <div className="lg:col-span-8 flex flex-col gap-8">
            {/* Skills */}
            {candidate.skills && candidate.skills.length > 0 && (
              <div className="bg-surface-container-lowest rounded-xl p-6 border border-outline-variant/10">
                <h3 className="text-lg font-bold mb-4 flex items-center gap-2 font-heading">
                  <Brain className="h-5 w-5 text-primary" />
                  Skill Extraction & Analysis
                </h3>
                <div className="flex flex-wrap gap-2">
                  {candidate.skills.map((skill, i) => (
                    <div
                      key={i}
                      className={cn(
                        "px-4 py-2 rounded-lg text-sm font-semibold",
                        i < 5
                          ? "bg-tertiary-fixed text-on-tertiary-fixed-variant border border-tertiary/10"
                          : "bg-surface-container-high text-on-surface-variant"
                      )}
                    >
                      {skill}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Resume Preview */}
            <div className="bg-surface-container-lowest rounded-xl flex flex-col border border-outline-variant/10 overflow-hidden">
              <div className="px-6 py-4 border-b border-outline-variant/10 flex justify-between items-center">
                <h3 className="text-lg font-bold flex items-center gap-2 font-heading">
                  <FileText className="h-5 w-5 text-primary" />
                  Resume Preview
                </h3>
                <a
                  href={fileUrl}
                  download={candidate.originalFileName}
                  className="text-primary text-sm font-bold flex items-center gap-1 hover:underline"
                >
                  <Download className="h-4 w-4" /> Download PDF
                </a>
              </div>
              <div className="aspect-[4/5] bg-surface-container overflow-y-auto">
                {fileType === "pdf" ? (
                  <iframe
                    src={fileUrl}
                    title={candidate.originalFileName || "Resume"}
                    className="w-full h-full border-0"
                  />
                ) : (
                  <div className="p-12">
                    <div className="bg-white shadow-xl p-10 min-h-full mx-auto max-w-2xl text-sm text-gray-800 leading-normal whitespace-pre-wrap">
                      {candidate.documentText || "Preview not available. Please download the file."}
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Right Column: Ranking & Feedback */}
          <div className="lg:col-span-4 flex flex-col gap-8">
            <div className="bg-surface-container-lowest rounded-xl p-6 border border-outline-variant/10 shadow-sm flex flex-col gap-6 sticky top-8">
              <h3 className="text-lg font-bold font-heading">Candidate Evaluation</h3>

              {/* Star Rating */}
              <div className="flex flex-col gap-2">
                <label className="text-xs font-bold uppercase tracking-wider text-on-surface-variant">
                  Your Ranking
                </label>
                <div className="flex gap-1">
                  {[1, 2, 3, 4, 5].map((star) => (
                    <button
                      key={star}
                      onClick={() => setRating(star)}
                      className="transition-transform hover:scale-110"
                    >
                      <Star
                        className={cn(
                          "h-8 w-8 transition-colors",
                          star <= rating
                            ? "text-primary fill-primary"
                            : "text-outline"
                        )}
                      />
                    </button>
                  ))}
                </div>
              </div>

              {/* Internal Notes */}
              <div className="flex flex-col gap-2">
                <label className="text-xs font-bold uppercase tracking-wider text-on-surface-variant">
                  Internal Notes
                </label>
                <textarea
                  className="w-full bg-surface-container-low border-none rounded-xl p-4 text-sm focus:ring-2 focus:ring-primary h-32 resize-y"
                  placeholder="Leave your impressions or specific feedback for the hiring committee..."
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                />
              </div>

              {/* Disposition Actions */}
              <div className="flex flex-col gap-3 mt-2">
                <button
                  onClick={() => updateScreening("shortlisted")}
                  className={cn(
                    "w-full py-4 font-bold rounded-xl shadow-md transition-all flex items-center justify-center gap-2",
                    screeningStatus === "shortlisted"
                      ? "bg-gradient-to-br from-emerald-600 to-emerald-700 text-white ring-2 ring-emerald-300"
                      : "bg-gradient-to-br from-[#003b56] to-[#005377] text-white hover:brightness-110"
                  )}
                >
                  <CheckCircle2 className="h-5 w-5" />
                  {screeningStatus === "shortlisted" ? "✓ Shortlisted" : "Shortlist"}
                </button>
                <button
                  onClick={() => updateScreening("waitlisted")}
                  className={cn(
                    "w-full py-4 font-bold rounded-xl transition-all flex items-center justify-center gap-2",
                    screeningStatus === "waitlisted"
                      ? "bg-amber-100 text-amber-800 ring-2 ring-amber-300"
                      : "bg-surface-container-high text-on-surface hover:bg-surface-container-highest"
                  )}
                >
                  <PauseCircle className="h-5 w-5" />
                  {screeningStatus === "waitlisted" ? "✓ Waitlisted" : "Waitlist"}
                </button>
                <button
                  onClick={() => updateScreening("rejected")}
                  className={cn(
                    "w-full py-4 font-bold rounded-xl transition-all flex items-center justify-center gap-2",
                    screeningStatus === "rejected"
                      ? "bg-red-600 text-white ring-2 ring-red-300"
                      : "bg-error-container text-on-error-container hover:opacity-90"
                  )}
                >
                  <XCircle className="h-5 w-5" />
                  {screeningStatus === "rejected" ? "✓ Rejected" : "Reject Candidate"}
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
