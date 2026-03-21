/**
 * CalendarWidget — Beautiful, interactive monthly/weekly calendar that renders
 * Google Calendar events. Supports month navigation, view switching (month/week),
 * event dots, event details popover, and quick event creation.
 */
import { useState, useMemo, useEffect } from "react"
import {
  ChevronLeft,
  ChevronRight,
  Clock,
  MapPin,
  Video,
  Users,
  ExternalLink,
  Loader2,
} from "lucide-react"
import { cn } from "@/lib/utils"
import type { CalendarEvent } from "@/hooks/useGoogleCalendar"

// ── Types ─────────────────────────────────────────────────────────────────────

type ViewMode = "month" | "week"

interface CalendarWidgetProps {
  events: CalendarEvent[]
  isLoading: boolean
  view: ViewMode
  onViewChange: (view: ViewMode) => void
  onDateRangeChange: (start: Date, end: Date) => void
  onEventClick?: (event: CalendarEvent) => void
  onSlotClick?: (date: Date) => void
}

// ── Helpers ───────────────────────────────────────────────────────────────────

const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"]
const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
]

function isSameDay(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate()
}

function getEventDate(event: CalendarEvent): Date {
  const raw = event.start.dateTime || event.start.date || ""
  return new Date(raw)
}

function getEventEndDate(event: CalendarEvent): Date {
  const raw = event.end.dateTime || event.end.date || ""
  return new Date(raw)
}

function formatTime(dateStr: string | undefined): string {
  if (!dateStr) return ""
  const d = new Date(dateStr)
  return d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit", hour12: true })
}

function formatDuration(start: string | undefined, end: string | undefined): string {
  if (!start || !end) return "All day"
  const ms = new Date(end).getTime() - new Date(start).getTime()
  const mins = Math.round(ms / 60000)
  if (mins < 60) return `${mins}m`
  const hrs = Math.floor(mins / 60)
  const rem = mins % 60
  return rem > 0 ? `${hrs}h ${rem}m` : `${hrs}h`
}

// Color palette for events (Google Calendar color IDs mapped to tailwind-ish colors)
const EVENT_COLORS: Record<string, { bg: string; text: string; dot: string }> = {
  "1": { bg: "bg-blue-50", text: "text-blue-700", dot: "bg-blue-500" },
  "2": { bg: "bg-green-50", text: "text-green-700", dot: "bg-green-500" },
  "3": { bg: "bg-purple-50", text: "text-purple-700", dot: "bg-purple-500" },
  "4": { bg: "bg-red-50", text: "text-red-700", dot: "bg-red-500" },
  "5": { bg: "bg-yellow-50", text: "text-yellow-700", dot: "bg-yellow-500" },
  "6": { bg: "bg-orange-50", text: "text-orange-700", dot: "bg-orange-500" },
  "7": { bg: "bg-cyan-50", text: "text-cyan-700", dot: "bg-cyan-500" },
  "8": { bg: "bg-gray-50", text: "text-gray-700", dot: "bg-gray-500" },
  "9": { bg: "bg-indigo-50", text: "text-indigo-700", dot: "bg-indigo-500" },
  "10": { bg: "bg-emerald-50", text: "text-emerald-700", dot: "bg-emerald-500" },
  "11": { bg: "bg-rose-50", text: "text-rose-700", dot: "bg-rose-500" },
  default: { bg: "bg-sky-50", text: "text-sky-700", dot: "bg-sky-500" },
}

function getEventColor(colorId?: string) {
  return EVENT_COLORS[colorId || ""] || EVENT_COLORS["default"]!
}

// ── Get calendar grid dates ───────────────────────────────────────────────────

function getMonthDays(year: number, month: number): Date[] {
  const firstDay = new Date(year, month, 1)
  const startDay = firstDay.getDay()
  const dates: Date[] = []

  // Previous month padding
  for (let i = startDay - 1; i >= 0; i--) {
    dates.push(new Date(year, month, -i))
  }

  // Current month
  const daysInMonth = new Date(year, month + 1, 0).getDate()
  for (let i = 1; i <= daysInMonth; i++) {
    dates.push(new Date(year, month, i))
  }

  // Next month padding (fill to 42 = 6 rows)
  while (dates.length < 42) {
    dates.push(new Date(year, month + 1, dates.length - startDay - daysInMonth + 1))
  }

  return dates
}

function getWeekDays(date: Date): Date[] {
  const startOfWeek = new Date(date)
  startOfWeek.setDate(date.getDate() - date.getDay())
  const dates: Date[] = []
  for (let i = 0; i < 7; i++) {
    dates.push(new Date(startOfWeek.getFullYear(), startOfWeek.getMonth(), startOfWeek.getDate() + i))
  }
  return dates
}

// ── Event Detail Popover ──────────────────────────────────────────────────────

function EventPopover({
  event,
  onClose,
}: {
  event: CalendarEvent
  onClose: () => void
}) {
  const color = getEventColor(event.colorId)
  const startTime = formatTime(event.start.dateTime)
  const endTime = formatTime(event.end.dateTime)
  const duration = formatDuration(event.start.dateTime, event.end.dateTime)
  const isAllDay = !event.start.dateTime

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="absolute inset-0 bg-black/20 backdrop-blur-[2px]" />
      <div
        className="relative z-10 w-full max-w-sm bg-white rounded-2xl shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-200"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Color bar */}
        <div className={cn("h-1.5", color?.dot)} />

        <div className="p-5 space-y-3">
          {/* Title */}
          <h3 className="font-heading text-lg font-bold text-on-surface leading-tight">
            {event.summary || "(No title)"}
          </h3>

          {/* Time */}
          <div className="flex items-center gap-2 text-sm text-on-surface-variant">
            <Clock className="h-4 w-4 shrink-0" />
            {isAllDay ? (
              <span>All day</span>
            ) : (
              <span>{startTime} – {endTime} <span className="text-xs opacity-60">({duration})</span></span>
            )}
          </div>

          {/* Location */}
          {event.location && (
            <div className="flex items-start gap-2 text-sm text-on-surface-variant">
              {event.location.toLowerCase().includes("meet") || event.location.toLowerCase().includes("zoom") ? (
                <Video className="h-4 w-4 shrink-0 mt-0.5" />
              ) : (
                <MapPin className="h-4 w-4 shrink-0 mt-0.5" />
              )}
              <span className="break-words">{event.location}</span>
            </div>
          )}

          {/* Attendees */}
          {event.attendees && event.attendees.length > 0 && (
            <div className="flex items-start gap-2 text-sm text-on-surface-variant">
              <Users className="h-4 w-4 shrink-0 mt-0.5" />
              <span>{event.attendees.length} attendee{event.attendees.length !== 1 ? "s" : ""}</span>
            </div>
          )}

          {/* Description */}
          {event.description && (
            <p className="text-xs text-on-surface-variant/70 line-clamp-3 leading-relaxed">
              {event.description}
            </p>
          )}

          {/* Actions */}
          <div className="flex gap-2 pt-1">
            {event.htmlLink && (
              <a
                href={event.htmlLink}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-primary/10 text-primary hover:bg-primary/20 transition-colors"
              >
                <ExternalLink className="h-3 w-3" />
                Open in Calendar
              </a>
            )}
            <button
              onClick={onClose}
              className="px-3 py-1.5 rounded-lg text-xs font-semibold text-on-surface-variant hover:bg-surface-container transition-colors"
            >
              Close
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

// ── Hour labels for week view ─────────────────────────────────────────────────

const HOURS = Array.from({ length: 24 }, (_, i) => i)

function formatHour(h: number): string {
  if (h === 0) return "12 AM"
  if (h < 12) return `${h} AM`
  if (h === 12) return "12 PM"
  return `${h - 12} PM`
}

// ── Main Widget ───────────────────────────────────────────────────────────────

export function CalendarWidget({
  events,
  isLoading,
  view,
  onViewChange,
  onDateRangeChange,
  onEventClick,
  onSlotClick,
}: CalendarWidgetProps) {
  const [currentDate, setCurrentDate] = useState(new Date())
  const [selectedEvent, setSelectedEvent] = useState<CalendarEvent | null>(null)
  const today = new Date()

  // Navigate
  const navigate = (delta: number) => {
    setCurrentDate((prev) => {
      const next = new Date(prev)
      if (view === "month") {
        next.setMonth(next.getMonth() + delta)
      } else {
        next.setDate(next.getDate() + 7 * delta)
      }
      return next
    })
  }

  const goToToday = () => setCurrentDate(new Date())

  // Compute range and notify parent
  const dateRange = useMemo(() => {
    if (view === "month") {
      const start = new Date(currentDate.getFullYear(), currentDate.getMonth(), 1)
      const end = new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 0, 23, 59, 59)
      // Extend to include visible padding days
      start.setDate(start.getDate() - start.getDay())
      end.setDate(end.getDate() + (6 - end.getDay()))
      return { start, end }
    } else {
      const startOfWeek = new Date(currentDate)
      startOfWeek.setDate(currentDate.getDate() - currentDate.getDay())
      startOfWeek.setHours(0, 0, 0, 0)
      const endOfWeek = new Date(startOfWeek)
      endOfWeek.setDate(startOfWeek.getDate() + 6)
      endOfWeek.setHours(23, 59, 59, 999)
      return { start: startOfWeek, end: endOfWeek }
    }
  }, [currentDate, view])

  useEffect(() => {
    onDateRangeChange(dateRange.start, dateRange.end)
  }, [dateRange, onDateRangeChange])

  // Group events by date
  const eventsByDate = useMemo(() => {
    const map = new Map<string, CalendarEvent[]>()
    for (const event of events) {
      const dateKey = getEventDate(event).toDateString()
      if (!map.has(dateKey)) map.set(dateKey, [])
      map.get(dateKey)!.push(event)
    }
    return map
  }, [events])

  // Header title
  const headerTitle = view === "month"
    ? `${MONTHS[currentDate.getMonth()]} ${currentDate.getFullYear()}`
    : (() => {
        const week = getWeekDays(currentDate)
        const start = week[0]!
        const end = week[6]!
        if (start.getMonth() === end.getMonth()) {
          return `${MONTHS[start.getMonth()]} ${start.getDate()} – ${end.getDate()}, ${start.getFullYear()}`
        }
        return `${MONTHS[start.getMonth()]!.slice(0, 3)} ${start.getDate()} – ${MONTHS[end.getMonth()]!.slice(0, 3)} ${end.getDate()}, ${end.getFullYear()}`
      })()

  return (
    <div className="bg-white rounded-3xl shadow-sm border border-outline-variant/10 overflow-hidden">
      {/* Toolbar */}
      <div className="flex items-center justify-between px-5 py-3 border-b border-outline-variant/10">
        <div className="flex items-center gap-3">
          <button
            onClick={goToToday}
            className="px-3 py-1.5 rounded-lg text-xs font-bold text-primary border border-primary/20 hover:bg-primary/5 transition-all"
          >
            Today
          </button>
          <div className="flex items-center gap-0.5">
            <button
              onClick={() => navigate(-1)}
              className="p-1.5 rounded-lg hover:bg-surface-container transition-colors"
            >
              <ChevronLeft className="h-4 w-4 text-on-surface-variant" />
            </button>
            <button
              onClick={() => navigate(1)}
              className="p-1.5 rounded-lg hover:bg-surface-container transition-colors"
            >
              <ChevronRight className="h-4 w-4 text-on-surface-variant" />
            </button>
          </div>
          <h2 className="text-sm font-bold text-on-surface font-heading">
            {headerTitle}
          </h2>
          {isLoading && <Loader2 className="h-4 w-4 animate-spin text-primary" />}
        </div>

        {/* View switcher */}
        <div className="flex items-center gap-1 bg-surface-container-low rounded-lg p-0.5">
          {(["month", "week"] as const).map((v) => (
            <button
              key={v}
              onClick={() => onViewChange(v)}
              className={cn(
                "px-3 py-1 rounded-md text-xs font-semibold transition-all",
                view === v
                  ? "bg-primary text-on-primary shadow-sm"
                  : "text-on-surface-variant hover:text-on-surface"
              )}
            >
              {v.charAt(0).toUpperCase() + v.slice(1)}
            </button>
          ))}
        </div>
      </div>

      {/* Calendar body */}
      {view === "month" ? (
        <MonthView
          currentDate={currentDate}
          today={today}
          eventsByDate={eventsByDate}
          onEventClick={(e) => { setSelectedEvent(e); onEventClick?.(e) }}
          onSlotClick={onSlotClick}
        />
      ) : (
        <WeekView
          currentDate={currentDate}
          today={today}
          events={events}
          onEventClick={(e) => { setSelectedEvent(e); onEventClick?.(e) }}
          onSlotClick={onSlotClick}
        />
      )}

      {/* Event detail popover */}
      {selectedEvent && (
        <EventPopover event={selectedEvent} onClose={() => setSelectedEvent(null)} />
      )}
    </div>
  )
}

// ── Month View ────────────────────────────────────────────────────────────────

function MonthView({
  currentDate,
  today,
  eventsByDate,
  onEventClick,
  onSlotClick,
}: {
  currentDate: Date
  today: Date
  eventsByDate: Map<string, CalendarEvent[]>
  onEventClick: (event: CalendarEvent) => void
  onSlotClick?: (date: Date) => void
}) {
  const days = getMonthDays(currentDate.getFullYear(), currentDate.getMonth())

  return (
    <div>
      {/* Day headers */}
      <div className="grid grid-cols-7 border-b border-outline-variant/10">
        {DAYS.map((day) => (
          <div key={day} className="py-2 text-center text-xs font-semibold text-on-surface-variant uppercase tracking-wider">
            {day}
          </div>
        ))}
      </div>

      {/* Day cells */}
      <div className="grid grid-cols-7">
        {days.map((date, idx) => {
          const isCurrentMonth = date.getMonth() === currentDate.getMonth()
          const isToday = isSameDay(date, today)
          const dateKey = date.toDateString()
          const dayEvents = eventsByDate.get(dateKey) || []
          const maxVisible = 3

          return (
            <div
              key={idx}
              className={cn(
                "min-h-[90px] border-b border-r border-outline-variant/5 p-1.5 transition-colors cursor-pointer group",
                isCurrentMonth ? "bg-white" : "bg-surface-container-lowest/50",
                "hover:bg-primary/[0.03]"
              )}
              onClick={() => onSlotClick?.(date)}
            >
              {/* Date number */}
              <div className="flex items-center justify-between mb-0.5">
                <span
                  className={cn(
                    "inline-flex items-center justify-center w-7 h-7 rounded-full text-xs font-semibold transition-all",
                    isToday
                      ? "bg-primary text-on-primary shadow-sm"
                      : isCurrentMonth
                        ? "text-on-surface"
                        : "text-on-surface-variant/40"
                  )}
                >
                  {date.getDate()}
                </span>
              </div>

              {/* Events */}
              <div className="space-y-0.5">
                {dayEvents.slice(0, maxVisible).map((event) => {
                  const color = getEventColor(event.colorId)
                  const time = formatTime(event.start.dateTime)
                  return (
                    <button
                      key={event.id}
                      onClick={(e) => { e.stopPropagation(); onEventClick(event) }}
                      className={cn(
                        "w-full text-left px-1.5 py-0.5 rounded text-[10px] leading-tight font-medium truncate transition-all",
                        color?.bg, color?.text,
                        "hover:opacity-80 hover:shadow-sm"
                      )}
                      title={event.summary}
                    >
                      {time && <span className="opacity-60 mr-0.5">{time}</span>}
                      {event.summary || "(No title)"}
                    </button>
                  )
                })}
                {dayEvents.length > maxVisible && (
                  <span className="block text-[10px] text-on-surface-variant/60 font-medium pl-1.5">
                    +{dayEvents.length - maxVisible} more
                  </span>
                )}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ── Week View ─────────────────────────────────────────────────────────────────

function WeekView({
  currentDate,
  today,
  events,
  onEventClick,
  onSlotClick,
}: {
  currentDate: Date
  today: Date
  events: CalendarEvent[]
  onEventClick: (event: CalendarEvent) => void
  onSlotClick?: (date: Date) => void
}) {
  const weekDays = getWeekDays(currentDate)

  // Group events by day and hour
  const eventsInRange = events.filter((ev) => {
    const evDate = getEventDate(ev)
    return evDate >= weekDays[0]! && evDate <= new Date(weekDays[6]!.getTime() + 24 * 60 * 60000)
  })

  // Only show business hours initially (7 AM - 21 PM)
  const visibleHours = HOURS.filter((h) => h >= 7 && h <= 21)

  return (
    <div className="overflow-auto max-h-[560px]">
      {/* Day headers */}
      <div className="grid grid-cols-[56px_repeat(7,1fr)] sticky top-0 z-10 bg-white border-b border-outline-variant/10">
        <div className="py-2" />
        {weekDays.map((date, i) => {
          const isToday = isSameDay(date, today)
          return (
            <div
              key={i}
              className={cn(
                "py-2 text-center border-l border-outline-variant/5",
                isToday && "bg-primary/5"
              )}
            >
              <div className="text-[10px] font-semibold text-on-surface-variant uppercase tracking-wider">
                {DAYS[date.getDay()]}
              </div>
              <div
                className={cn(
                  "inline-flex items-center justify-center w-7 h-7 rounded-full text-sm font-bold mt-0.5",
                  isToday ? "bg-primary text-on-primary" : "text-on-surface"
                )}
              >
                {date.getDate()}
              </div>
            </div>
          )
        })}
      </div>

      {/* Time grid */}
      <div className="grid grid-cols-[56px_repeat(7,1fr)]">
        {visibleHours.map((hour) => (
          <div key={hour} className="contents">
            {/* Hour label */}
            <div className="h-14 pr-2 text-right text-[10px] text-on-surface-variant/60 font-medium pt-0 flex items-start justify-end">
              {formatHour(hour)}
            </div>

            {/* Day columns */}
            {weekDays.map((date, dayIdx) => {
              const isToday = isSameDay(date, today)
              const slotEvents = eventsInRange.filter((ev) => {
                const evDate = getEventDate(ev)
                return isSameDay(evDate, date) && evDate.getHours() === hour
              })

              return (
                <div
                  key={dayIdx}
                  className={cn(
                    "h-14 border-l border-t border-outline-variant/5 relative cursor-pointer transition-colors",
                    isToday ? "bg-primary/[0.02]" : "hover:bg-surface-container-lowest"
                  )}
                  onClick={() => {
                    const d = new Date(date)
                    d.setHours(hour)
                    onSlotClick?.(d)
                  }}
                >
                  {slotEvents.map((event) => {
                    const color = getEventColor(event.colorId)
                    const startDate = getEventDate(event)
                    const endDate = getEventEndDate(event)
                    const durationMins = (endDate.getTime() - startDate.getTime()) / 60000
                    const heightPx = Math.max(Math.min((durationMins / 60) * 56, 56 * 3), 20) // 56px per hour

                    return (
                      <button
                        key={event.id}
                        onClick={(e) => { e.stopPropagation(); onEventClick(event) }}
                        className={cn(
                          "absolute left-0.5 right-0.5 rounded-md px-1.5 py-0.5 text-[10px] leading-tight font-medium truncate z-10 border-l-2 transition-all hover:shadow-md",
                          color?.bg, color?.text
                        )}
                        style={{
                          top: `${(startDate.getMinutes() / 60) * 56}px`,
                          height: `${heightPx}px`,
                          borderLeftColor: "currentColor",
                        }}
                        title={event.summary}
                      >
                        <span className="opacity-60">{formatTime(event.start.dateTime)}</span>{" "}
                        {event.summary}
                      </button>
                    )
                  })}
                </div>
              )
            })}
          </div>
        ))}
      </div>
    </div>
  )
}
