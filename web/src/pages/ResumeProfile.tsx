import { useParams, Link } from "react-router-dom"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Avatar } from "@/components/ui/avatar"
import { Progress } from "@/components/ui/progress"
import { Button } from "@/components/ui/button"
import {
  ArrowLeft,
  Brain,
  FileText,
  Star,
  Mail,
  Calendar,
  Phone,
  MapPin,
  Briefcase,
  GraduationCap,
  MessageSquare,
  ChevronRight,
  Download,
  Share2,
  Sparkles,
  CheckCircle2,
} from "lucide-react"

const candidateData = {
  name: "Alex Rivera",
  role: "Senior Full Stack Engineer",
  experience: "8.5 years experience",
  location: "San Francisco",
  email: "alex.rivera@email.com",
  phone: "+1 (415) 555-0189",
  matchScore: 96,
  status: "hired" as const,
  skills: [
    { name: "React", level: 95 },
    { name: "Node.js", level: 92 },
    { name: "TypeScript", level: 90 },
    { name: "AWS", level: 85 },
    { name: "Docker", level: 82 },
    { name: "PostgreSQL", level: 88 },
    { name: "GraphQL", level: 78 },
    { name: "CI/CD", level: 86 },
  ],
  experience_list: [
    {
      title: "Led the migration of a monolithic PHP application to a distributed Node.js microservices architecture.",
    },
    { title: "Optimized database queries reducing latency by 45% across core APIs." },
    { title: "Mentored a team of 6 junior and mid-level engineers." },
    {
      title: "Developed and maintained a high-traffic e-commerce dashboard using React and Redux.",
    },
    { title: "Implemented automated CI/CD pipelines using GitHub Actions and Docker." },
  ],
  education: [
    { degree: "B.S. Computer Science", school: "UC Berkeley", year: "2017" },
  ],
  reviews: [
    { text: "Outstanding technical interview performance.", author: "Sarah M., Engineering Manager", rating: 5 },
    { text: "Strong culture fit. Highly recommend.", author: "Jake T., VP Engineering", rating: 5 },
    { text: "Excellent problem-solving under pressure.", author: "Lina K., Lead Architect", rating: 4 },
  ],
  journey: [
    { stage: "Applied", date: "Mar 1", done: true },
    { stage: "Screened", date: "Mar 5", done: true },
    { stage: "Technical Interview", date: "Mar 10", done: true },
    { stage: "Culture Fit", date: "Mar 14", done: true },
    { stage: "Offer Extended", date: "Mar 18", done: false },
  ],
}

export function ResumeProfile() {
  const { id: _id } = useParams()
  const c = candidateData

  return (
    <div className="space-y-6">
      {/* Back link */}
      <Link
        to="/"
        className="inline-flex items-center gap-1.5 text-sm text-on-surface-variant hover:text-on-surface transition-colors"
      >
        <ArrowLeft className="h-4 w-4" /> Back to Pipeline
      </Link>

      {/* Candidate header */}
      <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
        <div className="flex items-center gap-5">
          <Avatar fallback={c.name} size="xl" />
          <div>
            <div className="flex items-center gap-3">
              <h1 className="font-heading text-2xl font-bold lg:text-3xl">{c.name}</h1>
              <Badge variant={c.status}>{c.status === "hired" ? "Hired" : "In Review"}</Badge>
            </div>
            <p className="mt-1 text-on-surface-variant">
              {c.role} • {c.experience}
            </p>
            <div className="mt-2 flex flex-wrap items-center gap-3 text-xs text-on-surface-variant">
              <span className="flex items-center gap-1">
                <MapPin className="h-3.5 w-3.5" /> {c.location}
              </span>
              <span className="flex items-center gap-1">
                <Mail className="h-3.5 w-3.5" /> {c.email}
              </span>
              <span className="flex items-center gap-1">
                <Phone className="h-3.5 w-3.5" /> {c.phone}
              </span>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm">
            <Download className="mr-1.5 h-4 w-4" /> Download CV
          </Button>
          <Button variant="outline" size="sm">
            <Share2 className="mr-1.5 h-4 w-4" /> Share
          </Button>
          <Button size="sm">
            <Calendar className="mr-1.5 h-4 w-4" /> Schedule Interview
          </Button>
        </div>
      </div>

      {/* Main grid */}
      <div className="grid grid-cols-1 gap-6 xl:grid-cols-3">
        {/* Left column */}
        <div className="space-y-6 xl:col-span-2">
          {/* AI Insight */}
          <Card className="bg-gradient-to-br from-primary-fixed/20 to-surface-container-lowest">
            <CardHeader className="flex-row items-start gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary-fixed">
                <Brain className="h-5 w-5 text-primary" />
              </div>
              <div>
                <CardTitle className="flex items-center gap-2">
                  <Sparkles className="h-4 w-4 text-primary" /> Skill Extraction & Analysis
                </CardTitle>
                <CardDescription className="mt-1">
                  AI Insight: Alex shows strong architectural knowledge in cloud-native applications. Their
                  recent work at TechFlow involved scaling microservices from 10k to 500k DAU, directly
                  aligning with your current roadmap needs.
                </CardDescription>
              </div>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                {c.skills.map((skill) => (
                  <div key={skill.name} className="space-y-1.5">
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-on-surface-variant">{skill.name}</span>
                      <span className="font-medium text-xs">{skill.level}%</span>
                    </div>
                    <Progress value={skill.level} variant={skill.level >= 90 ? "tertiary" : "primary"} />
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          {/* Resume Preview */}
          <Card>
            <CardHeader className="flex-row items-center gap-3">
              <FileText className="h-5 w-5 text-primary" />
              <CardTitle>Resume Preview</CardTitle>
            </CardHeader>
            <CardContent className="space-y-6">
              {/* Resume header */}
              <div className="rounded-xl bg-surface-container-low p-6">
                <h3 className="font-heading text-xl font-bold uppercase tracking-wide">
                  {c.name}
                </h3>
                <p className="mt-1 text-sm text-on-surface-variant">
                  {c.role} | {c.location} | {c.email}
                </p>
              </div>

              {/* Experience */}
              <div>
                <h4 className="flex items-center gap-2 font-heading text-sm font-semibold uppercase tracking-wider text-on-surface-variant mb-3">
                  <Briefcase className="h-4 w-4" /> Experience
                </h4>
                <ul className="space-y-2.5">
                  {c.experience_list.map((exp, i) => (
                    <li key={i} className="flex items-start gap-2.5 text-sm text-on-surface-variant">
                      <ChevronRight className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                      <span>{exp.title}</span>
                    </li>
                  ))}
                </ul>
              </div>

              {/* Education */}
              <div>
                <h4 className="flex items-center gap-2 font-heading text-sm font-semibold uppercase tracking-wider text-on-surface-variant mb-3">
                  <GraduationCap className="h-4 w-4" /> Education
                </h4>
                {c.education.map((ed) => (
                  <div key={ed.degree} className="flex items-center gap-3 text-sm">
                    <div className="h-2 w-2 rounded-full bg-primary" />
                    <span className="font-medium">{ed.degree}</span>
                    <span className="text-on-surface-variant">— {ed.school}, {ed.year}</span>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Right column */}
        <div className="space-y-6">
          {/* Match Score */}
          <Card className="text-center">
            <CardContent className="py-6">
              <div className="relative mx-auto mb-4 flex h-28 w-28 items-center justify-center">
                <svg className="h-full w-full -rotate-90" viewBox="0 0 100 100">
                  <circle
                    cx="50"
                    cy="50"
                    r="42"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="8"
                    className="text-surface-container-high"
                  />
                  <circle
                    cx="50"
                    cy="50"
                    r="42"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="8"
                    strokeDasharray={`${c.matchScore * 2.64} ${264 - c.matchScore * 2.64}`}
                    strokeLinecap="round"
                    className="text-tertiary-container transition-all duration-1000"
                  />
                </svg>
                <span className="absolute font-heading text-2xl font-bold">{c.matchScore}%</span>
              </div>
              <p className="text-sm font-medium">AI Match Score</p>
              <p className="mt-1 text-xs text-on-surface-variant">Based on job requirements</p>
            </CardContent>
          </Card>

          {/* Candidate Journey */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Candidate Journey</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="relative space-y-0">
                {c.journey.map((step, i) => (
                  <div key={step.stage} className="flex items-start gap-3 pb-6 last:pb-0">
                    {/* Vertical line */}
                    <div className="relative flex flex-col items-center">
                      <div
                        className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full ${
                          step.done
                            ? "bg-secondary text-on-secondary"
                            : "border-2 border-outline-variant/20 bg-surface-container-lowest"
                        }`}
                      >
                        {step.done && <CheckCircle2 className="h-3.5 w-3.5" />}
                      </div>
                      {i < c.journey.length - 1 && (
                        <div className="absolute top-6 h-full w-px bg-outline-variant/20" />
                      )}
                    </div>
                    <div className="pt-0.5">
                      <p className={`text-sm font-medium ${step.done ? "" : "text-on-surface-variant"}`}>
                        {step.stage}
                      </p>
                      <p className="text-xs text-on-surface-variant">{step.date}</p>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          {/* Reviews */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <MessageSquare className="h-4 w-4" /> Candidate Evaluation
              </CardTitle>
              <CardDescription>Other Reviews ({c.reviews.length})</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {c.reviews.map((review, i) => (
                <div key={i} className="rounded-lg bg-surface-container-low p-3">
                  <p className="text-sm italic text-on-surface-variant">"{review.text}"</p>
                  <div className="mt-2 flex items-center justify-between">
                    <span className="text-xs text-on-surface-variant">{review.author}</span>
                    <div className="flex gap-0.5">
                      {Array.from({ length: 5 }).map((_, j) => (
                        <Star
                          key={j}
                          className={`h-3.5 w-3.5 ${
                            j < review.rating
                              ? "fill-primary-fixed-dim text-primary-fixed-dim"
                              : "text-outline-variant/30"
                          }`}
                        />
                      ))}
                    </div>
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  )
}
