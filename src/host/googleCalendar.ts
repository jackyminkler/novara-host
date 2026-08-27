// Google Calendar access, browser side only.
//
// Deliberate: the calendar is fetched from Google straight to this browser and
// derived here. Nothing about it is sent to our server, which is the same
// privacy shape the file import has. Only the derived openings get published.
//
// This uses Google Identity Services rather than Firebase Auth's Google
// provider, and the client id comes from its own Google Cloud project. Adding
// a sensitive scope to the Firebase project's consent screen would change what
// every Novara consumer user sees at sign in, and could push that screen back
// into Google verification. Keeping calendar access on a separate client id
// leaves consumer sign in untouched. See docs/Google_Calendar_Setup.md.

import { normalizeGoogleEvents, type BusyEvent, type GoogleEvent } from '../lib/availability'

// Read for availability, write so a confirmed event lands on her calendar.
// Both are already declared on the novarasocial-dev consent screen. Requested
// together so there is one consent prompt rather than two.
//
// Note the deliberate gap between what is granted and what is used: this scope
// permits editing any event, and the write layer only ever touches events
// carrying our own tag. See googleWrite.ts.
const SCOPES = [
  'https://www.googleapis.com/auth/calendar.readonly',
  'https://www.googleapis.com/auth/calendar.events',
].join(' ')
const GIS_SRC = 'https://accounts.google.com/gsi/client'
const API = 'https://www.googleapis.com/calendar/v3'

export const googleClientId: string = import.meta.env.VITE_GOOGLE_OAUTH_CLIENT_ID ?? ''
export const googleConfigured = googleClientId !== ''

export class GoogleCalendarError extends Error {
  constructor(
    public reason:
      | 'not_configured'
      | 'consent_required'
      | 'denied'
      | 'popup_blocked'
      | 'network',
    message?: string,
  ) {
    super(message ?? reason)
  }
}

interface TokenResponse {
  access_token?: string
  error?: string
  expires_in?: number
}

interface TokenClient {
  requestAccessToken: (overrides?: { prompt?: string }) => void
  callback: (response: TokenResponse) => void
}

/** What Google reports when the popup never opened, or was closed unfinished. */
interface TokenError {
  type?: string
  message?: string
}

declare global {
  interface Window {
    google?: {
      accounts: {
        oauth2: {
          initTokenClient: (config: {
            client_id: string
            scope: string
            callback: (response: TokenResponse) => void
            error_callback?: (error: TokenError) => void
          }) => TokenClient
          revoke: (token: string, done?: () => void) => void
        }
      }
    }
  }
}

let scriptPromise: Promise<void> | null = null

function loadGis(): Promise<void> {
  if (window.google?.accounts?.oauth2) return Promise.resolve()
  if (scriptPromise) return scriptPromise
  scriptPromise = new Promise((resolve, reject) => {
    const el = document.createElement('script')
    el.src = GIS_SRC
    el.async = true
    el.onload = () => resolve()
    el.onerror = () => {
      // Let a later attempt retry instead of caching the failure forever.
      scriptPromise = null
      reject(new GoogleCalendarError('network', 'Google sign in script did not load'))
    }
    document.head.appendChild(el)
  })
  return scriptPromise
}

// The access token lives in memory only, never in localStorage. It is good for
// about an hour, and a page reload asks Google for a fresh one silently while
// she still has a Google session.
let accessToken: string | null = null
let expiresAt = 0

export function hasLiveToken(): boolean {
  return accessToken !== null && Date.now() < expiresAt
}

/**
 * Get an access token.
 *
 * `interactive: false` is the silent path used on page load: if she already
 * granted access and still has a Google session, this returns a token with no
 * prompt at all. If it needs consent it fails rather than throwing a popup at
 * someone who did not ask for one.
 */
export async function getAccessToken(interactive: boolean): Promise<string> {
  if (!googleConfigured) throw new GoogleCalendarError('not_configured')
  if (hasLiveToken()) return accessToken as string
  await loadGis()

  const oauth2 = window.google?.accounts?.oauth2
  if (!oauth2) throw new GoogleCalendarError('network', 'Google sign in did not initialize')

  return new Promise<string>((resolve, reject) => {
    // Google calls exactly one of callback or error_callback, and in some
    // failure modes neither: a popup blocked before it opens used to leave the
    // caller hanging forever, which showed up as a button stuck on "Reading".
    // settle() makes the first outcome win and the timeout guarantees one.
    let settled = false
    const settle = (fn: () => void) => {
      if (settled) return
      settled = true
      window.clearTimeout(timer)
      fn()
    }

    const timer = window.setTimeout(
      () =>
        settle(() =>
          reject(
            new GoogleCalendarError(
              interactive ? 'denied' : 'consent_required',
              'no answer from Google',
            ),
          ),
        ),
      interactive ? 120_000 : 15_000,
    )

    const client = oauth2.initTokenClient({
      client_id: googleClientId,
      scope: SCOPES,
      callback: (response) => {
        if (response.error || !response.access_token) {
          // A silent attempt that needs consent is an ordinary outcome, not a
          // failure worth showing as an error.
          settle(() =>
            reject(
              new GoogleCalendarError(
                interactive ? 'denied' : 'consent_required',
                response.error ?? 'no token',
              ),
            ),
          )
          return
        }
        accessToken = response.access_token
        expiresAt = Date.now() + (response.expires_in ?? 3600) * 1000 - 60_000
        settle(() => resolve(response.access_token as string))
      },
      error_callback: (error) => {
        // A blocked popup is a browser setting, not a refusal, and telling
        // someone "Google did not grant access" would send them looking in the
        // wrong place entirely.
        const blocked = error?.type === 'popup_failed_to_open'
        settle(() =>
          reject(
            new GoogleCalendarError(
              blocked ? 'popup_blocked' : interactive ? 'denied' : 'consent_required',
              error?.type ?? 'unknown',
            ),
          ),
        )
      },
    })
    client.requestAccessToken({ prompt: interactive ? 'consent' : '' })
  })
}

export function forgetToken(): void {
  const token = accessToken
  accessToken = null
  expiresAt = 0
  if (token) window.google?.accounts?.oauth2?.revoke(token)
}

async function call<T>(path: string, token: string): Promise<T> {
  let response: Response
  try {
    response = await fetch(`${API}${path}`, { headers: { Authorization: `Bearer ${token}` } })
  } catch {
    throw new GoogleCalendarError('network')
  }
  if (response.status === 401 || response.status === 403) {
    accessToken = null
    expiresAt = 0
    throw new GoogleCalendarError('consent_required')
  }
  if (!response.ok) throw new GoogleCalendarError('network', `calendar api ${response.status}`)
  return (await response.json()) as T
}

export interface GoogleCalendarSummary {
  id: string
  name: string
  primary: boolean
  selectedByDefault: boolean
}

export async function listCalendars(token: string): Promise<GoogleCalendarSummary[]> {
  const data = await call<{
    items?: { id: string; summary?: string; primary?: boolean; selected?: boolean; accessRole?: string }[]
  }>('/users/me/calendarList?minAccessRole=reader&maxResults=250', token)

  return (data.items ?? []).map((item) => ({
    id: item.id,
    name: item.summary ?? item.id,
    primary: Boolean(item.primary),
    // Google's own "shown in my calendar" flag is the best available guess at
    // which calendars actually describe her time, rather than every holiday
    // and shared calendar she has ever been added to.
    selectedByDefault: Boolean(item.primary || item.selected),
  }))
}

/**
 * `singleEvents=true` makes Google expand recurrences, so a weekly standup
 * arrives as individual dated events and none of the RRULE handling that the
 * file import needs applies here.
 */
export async function fetchEvents(
  token: string,
  calendarIds: string[],
  from: Date,
  to: Date,
): Promise<BusyEvent[]> {
  const all: GoogleEvent[] = []

  for (const calendarId of calendarIds) {
    let pageToken: string | undefined
    // Bounded rather than while(true): a paging bug should degrade to fewer
    // events, never to an unbounded loop against someone's quota.
    for (let page = 0; page < 20; page += 1) {
      const query = new URLSearchParams({
        singleEvents: 'true',
        orderBy: 'startTime',
        maxResults: '2500',
        timeMin: from.toISOString(),
        timeMax: to.toISOString(),
      })
      if (pageToken) query.set('pageToken', pageToken)

      const data = await call<{ items?: GoogleEvent[]; nextPageToken?: string }>(
        `/calendars/${encodeURIComponent(calendarId)}/events?${query.toString()}`,
        token,
      )
      all.push(...(data.items ?? []))
      pageToken = data.nextPageToken
      if (!pageToken) break
    }
  }

  return normalizeGoogleEvents(all)
}
