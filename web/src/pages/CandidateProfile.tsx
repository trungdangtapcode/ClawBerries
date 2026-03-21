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
  Briefcase,
  GraduationCap,
  Brain,
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
          <button className="px-5 py-2 rounded-xl bg-gradient-to-br from-[#003b56] to-[#005377] text-white font-semibold text-sm hover:opacity-90 shadow-lg transition-all flex items-center gap-2">
            <CalendarPlus className="h-4 w-4" /> Schedule Interview
          </button>
        </div>
      </header>

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
