// Google Calendar access for the host, browser side only.
//
// Deliberate: the calendar is fetched from Google straight to this browser and
// derived here. Nothing about it is sent to our server, which is the same
// privacy shape the file import has. Only the derived openings get published.
//
// The client id comes from a dedicated OAuth client inside novarasocial-dev.
// See docs/Google_Calendar_Setup.md for why it is a separate client but the
// same project.

import { normalizeGoogleEvents, type BusyEvent, type GoogleEvent } from '../lib/availability'
import {
  GoogleAuthError,
  SCOPE_EVENTS,
  SCOPE_READ,
  googleClientId,
  googleConfigured,
  requestToken,
  revokeToken,
} from '../lib/googleIdentity'

const API = 'https://www.googleapis.com/calendar/v3'

// Read for availability, write so a confirmed event lands on her calendar.
// Requested together so there is one consent prompt rather than two.
//
// Note the deliberate gap between what is granted and what is used: this scope
// permits editing any event, and the write layer only ever touches events
// carrying our own tag. See googleWrite.ts.
const SCOPES = [SCOPE_READ, SCOPE_EVENTS].join(' ')

export { googleClientId, googleConfigured }
export { GoogleAuthError as GoogleCalendarError }

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
 * prompt at all.
 */
export async function getAccessToken(interactive: boolean): Promise<string> {
  if (hasLiveToken()) return accessToken as string
  const token = await requestToken({ scope: SCOPES, interactive })
  accessToken = token
  // A minute of slack, so a request started just under the wire does not fail
  // halfway through paging a year of calendar.
  expiresAt = Date.now() + 3600_000 - 60_000
  return token
}

export function forgetToken(): void {
  const token = accessToken
  accessToken = null
  expiresAt = 0
  if (token) revokeToken(token)
}

async function call<T>(path: string, token: string): Promise<T> {
  let response: Response
  try {
    response = await fetch(`${API}${path}`, { headers: { Authorization: `Bearer ${token}` } })
  } catch {
    throw new GoogleAuthError('network')
  }
  if (response.status === 401 || response.status === 403) {
    accessToken = null
    expiresAt = 0
    throw new GoogleAuthError('consent_required')
  }
  if (!response.ok) throw new GoogleAuthError('network', `calendar api ${response.status}`)
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
