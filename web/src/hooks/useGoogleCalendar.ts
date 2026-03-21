/**
 * useGoogleCalendar — React hook for Google Calendar API integration.
 *
 * Uses Google Identity Services (GIS) for OAuth2 token flow (client-side).
 * Loads gapi + GIS scripts dynamically, manages auth state, and provides
 * methods to list and create calendar events.
 */
import { useState, useEffect, useCallback, useRef } from "react"

// ── Types ─────────────────────────────────────────────────────────────────────

export interface CalendarEvent {
  id: string
  summary: string
  description?: string
  location?: string
  start: { dateTime?: string; date?: string; timeZone?: string }
  end: { dateTime?: string; date?: string; timeZone?: string }
  htmlLink?: string
  colorId?: string
  status?: string
  attendees?: Array<{ email: string; responseStatus?: string }>
}

export interface CreateEventParams {
  summary: string
  description?: string
  location?: string
  startDateTime: string
  endDateTime: string
  timeZone?: string
  attendees?: string[]
}

interface UseGoogleCalendarReturn {
  isSignedIn: boolean
  isLoading: boolean
  events: CalendarEvent[]
  error: string | null
  signIn: () => void
  signOut: () => void
  fetchEvents: (timeMin?: string, timeMax?: string) => Promise<void>
  createEvent: (params: CreateEventParams) => Promise<CalendarEvent | null>
  isConfigured: boolean
}

// ── Constants ─────────────────────────────────────────────────────────────────

const CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID || ""
const API_KEY = import.meta.env.VITE_GOOGLE_API_KEY || ""
const SCOPES = "https://www.googleapis.com/auth/calendar"
const INIT_TIMEOUT_MS = 15_000

// ── Globals type augmentation ─────────────────────────────────────────────────

declare global {
  interface Window {
    gapi: any
    google: any
  }
}

// ── Script loading ────────────────────────────────────────────────────────────

let gapiLoadPromise: Promise<void> | null = null
let gisLoadPromise: Promise<void> | null = null

function loadScript(src: string): Promise<void> {
  const isGapi = src.includes("api.js")
  const isGis = src.includes("gsi/client")

  return new Promise((resolve, reject) => {
    // Check if already loaded
    if (isGapi && window.gapi) return resolve()
    if (isGis && window.google?.accounts) return resolve()

    if (document.querySelector(`script[src="${src}"]`)) {
      const check = (attempt = 0) => {
        if (attempt > 100) return reject(new Error(`Timed out waiting for ${src}`))
        if (isGapi && window.gapi) return resolve()
        if (isGis && window.google?.accounts) return resolve()
        setTimeout(() => check(attempt + 1), 100)
      }
      check()
      return
    }

    const script = document.createElement("script")
    script.src = src
    script.async = true
    script.defer = true
    script.onload = () => {
      console.log(`[GoogleCal] Script loaded: ${src}`)
      const check = (attempt = 0) => {
        if (attempt > 50) return reject(new Error(`Global not available after loading ${src}`))
        if (isGapi && window.gapi) return resolve()
        if (isGis && (window.google?.accounts || window.google)) return resolve()
        setTimeout(() => check(attempt + 1), 100)
      }
      check()
    }
    script.onerror = () => reject(new Error(`Failed to load script: ${src}`))
    document.head.appendChild(script)
  })
}

function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) =>
      setTimeout(() => reject(new Error(`${label} timed out after ${ms}ms`)), ms)
    ),
  ])
}

async function ensureGapiLoaded(): Promise<void> {
  if (!gapiLoadPromise) {
    gapiLoadPromise = loadScript("https://apis.google.com/js/api.js")
      .then(
        () =>
          new Promise<void>((resolve, reject) => {
            console.log("[GoogleCal] gapi script available, loading client...")
            window.gapi.load("client", {
              callback: async () => {
                try {
                  console.log("[GoogleCal] gapi.client loaded, initializing...")
                  // Initialize without API key to avoid key restriction issues
                  await window.gapi.client.init({})
                  // Load Calendar API discovery doc separately (no key needed)
                  console.log("[GoogleCal] Loading Calendar API discovery doc...")
                  await window.gapi.client.load("calendar", "v3")
                  console.log("[GoogleCal] Calendar API loaded successfully")
                  resolve()
                } catch (err: any) {
                  const status = err?.status || err?.result?.error?.code || ""
                  const message = err?.result?.error?.message || err?.message || "Unknown error"
                  console.error("[GoogleCal] gapi init failed:", err)
                  reject(new Error(`Calendar API init failed (${status}): ${message}`))
                }
              },
              onerror: () => {
                console.error("[GoogleCal] gapi.load('client') failed")
                reject(new Error("Failed to load gapi client"))
              },
              timeout: 10000,
              ontimeout: () => {
                console.error("[GoogleCal] gapi.load('client') timed out")
                reject(new Error("gapi client load timed out"))
              },
            })
          })
      )
      .catch((err) => {
        gapiLoadPromise = null
        throw err
      })
  }
  return gapiLoadPromise
}

async function ensureGisLoaded(): Promise<void> {
  if (!gisLoadPromise) {
    gisLoadPromise = loadScript("https://accounts.google.com/gsi/client")
      .then(() => {
        console.log("[GoogleCal] GIS script loaded")
      })
      .catch((err) => {
        gisLoadPromise = null
        throw err
      })
  }
  return gisLoadPromise
}

// ── Hook ──────────────────────────────────────────────────────────────────────

export function useGoogleCalendar(): UseGoogleCalendarReturn {
  const [isSignedIn, setIsSignedIn] = useState(false)
  const [isLoading, setIsLoading] = useState(true)
  const [events, setEvents] = useState<CalendarEvent[]>([])
  const [error, setError] = useState<string | null>(null)
  const tokenClientRef = useRef<any>(null)
  const isConfigured = Boolean(CLIENT_ID && API_KEY)

  // Initialize gapi + GIS on mount
  useEffect(() => {
    if (!isConfigured) {
      console.log("[GoogleCal] Not configured — CLIENT_ID or API_KEY missing")
      setIsLoading(false)
      return
    }

    let cancelled = false
    console.log(
      "[GoogleCal] Initializing... CLIENT_ID:",
      CLIENT_ID.slice(0, 15) + "...",
      "API_KEY:",
      API_KEY.slice(0, 10) + "..."
    )

    async function init() {
      try {
        await withTimeout(
          Promise.all([ensureGapiLoaded(), ensureGisLoaded()]),
          INIT_TIMEOUT_MS,
          "Google API initialization"
        )

        if (cancelled) return
        console.log("[GoogleCal] Both scripts initialized successfully")

        // Create the token client
        tokenClientRef.current = window.google.accounts.oauth2.initTokenClient({
          client_id: CLIENT_ID,
          scope: SCOPES,
          callback: "", // Set dynamically on signIn
        })
        console.log("[GoogleCal] Token client created")

        // Check if there's an existing session token
        const token = window.gapi.client.getToken()
        if (token) {
          console.log("[GoogleCal] Found existing token")
          setIsSignedIn(true)
        }
      } catch (err) {
        console.error("[GoogleCal] Init failed:", err)
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Failed to initialize Google APIs")
        }
      } finally {
        if (!cancelled) {
          console.log("[GoogleCal] Init complete, setting isLoading=false")
          setIsLoading(false)
        }
      }
    }

    init()
    return () => {
      cancelled = true
    }
  }, [isConfigured])

  // Sign in
  const signIn = useCallback(() => {
    if (!tokenClientRef.current) {
      setError("Google APIs not yet initialized. Please wait or refresh.")
      return
    }

    tokenClientRef.current.callback = async (resp: any) => {
      if (resp.error) {
        console.error("[GoogleCal] Auth error:", resp)
        setError(`Auth error: ${resp.error}`)
        return
      }
      console.log("[GoogleCal] Auth successful")
      setIsSignedIn(true)
      setError(null)
    }

    if (window.gapi.client.getToken() === null) {
      tokenClientRef.current.requestAccessToken({ prompt: "consent" })
    } else {
      tokenClientRef.current.requestAccessToken({ prompt: "" })
    }
  }, [])

  // Sign out
  const signOut = useCallback(() => {
    const token = window.gapi.client.getToken()
    if (token) {
      window.google.accounts.oauth2.revoke(token.access_token)
      window.gapi.client.setToken("")
    }
    setIsSignedIn(false)
    setEvents([])
  }, [])

  // Fetch events
  const fetchEvents = useCallback(
    async (timeMin?: string, timeMax?: string) => {
      if (!isSignedIn) return

      try {
        const now = new Date()
        const defaultTimeMin =
          timeMin || new Date(now.getFullYear(), now.getMonth(), 1).toISOString()
        const defaultTimeMax =
          timeMax ||
          new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59).toISOString()

        const response = await window.gapi.client.calendar.events.list({
          calendarId: "primary",
          timeMin: defaultTimeMin,
          timeMax: defaultTimeMax,
          showDeleted: false,
          singleEvents: true,
          maxResults: 250,
          orderBy: "startTime",
        })

        setEvents(response.result.items || [])
        setError(null)
      } catch (err: any) {
        console.error("[GoogleCal] Fetch events error:", err)
        setError(err.result?.error?.message || "Failed to fetch events")
      }
    },
    [isSignedIn]
  )

  // Create event
  const createEvent = useCallback(
    async (params: CreateEventParams): Promise<CalendarEvent | null> => {
      if (!isSignedIn) return null

      try {
        const event = {
          summary: params.summary,
          description: params.description,
          location: params.location,
          start: {
            dateTime: params.startDateTime,
            timeZone:
              params.timeZone || Intl.DateTimeFormat().resolvedOptions().timeZone,
          },
          end: {
            dateTime: params.endDateTime,
            timeZone:
              params.timeZone || Intl.DateTimeFormat().resolvedOptions().timeZone,
          },
          attendees: params.attendees?.map((email) => ({ email })),
          reminders: {
            useDefault: false,
            overrides: [{ method: "popup", minutes: 15 }],
          },
        }

        const response = await window.gapi.client.calendar.events.insert({
          calendarId: "primary",
          resource: event,
        })

        setError(null)
        return response.result as CalendarEvent
      } catch (err: any) {
        console.error("[GoogleCal] Create event error:", err)
        setError(err.result?.error?.message || "Failed to create event")
        return null
      }
    },
    [isSignedIn]
  )

  return {
    isSignedIn,
    isLoading,
    events,
    error,
    signIn,
    signOut,
    fetchEvents,
    createEvent,
    isConfigured,
  }
}
