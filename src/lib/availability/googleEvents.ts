// Normalizing Google Calendar API events into the shape derivation understands.
//
// Pure: JSON in, BusyEvent out. No fetch, no token, no browser. The network
// side lives in src/host/googleCalendar.ts, so everything decided here stays
// testable and stays portable with the rest of this folder.
//
// Google answers several questions the .ics heuristics have to guess at:
// eventType tells us outright that something is a birthday or a working
// location marker, and the attendee list says whether she actually accepted.
// Where Google knows, we believe Google rather than the title.

import type { BusyEvent } from './types'

/** The subset of the v3 Events resource this reads. Everything else is ignored. */
export interface GoogleEvent {
  id?: string
  status?: string
  summary?: string
  location?: string
  transparency?: string
  eventType?: string
  start?: { date?: string; dateTime?: string }
  end?: { date?: string; dateTime?: string }
  attendees?: { self?: boolean; responseStatus?: string }[]
}

/**
 * Event types that never represent a commitment.
 *
 * `workingLocation` is Google's "I am in the office today" marker and covers
 * whole days, so treating it as busy would empty her calendar outright.
 * `birthday` is the same reminder case the .ics rules have to infer.
 * `fromGmail` is deliberately absent: those are the auto-added flight and
 * hotel reservations, which are exactly the events worth blocking.
 */
const IGNORED_TYPES = new Set(['workingLocation', 'birthday'])

/** "2026-09-10" as local midnight. Date.parse would read it as UTC. */
function parseDateOnly(value: string): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value)
  if (!m) return null
  return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]))
}

function parseEnd(
  point: { date?: string; dateTime?: string } | undefined,
  startAt: Date,
  allDay: boolean,
): Date {
  if (point?.dateTime) {
    const at = new Date(point.dateTime)
    if (!Number.isNaN(at.getTime())) return at
  }
  if (point?.date) {
    const at = parseDateOnly(point.date)
    if (at) return at
  }
  // Google always sends an end, but a missing one should not drop the event.
  return allDay
    ? new Date(startAt.getFullYear(), startAt.getMonth(), startAt.getDate() + 1)
    : new Date(startAt.getTime() + 3600000)
}

export function normalizeGoogleEvent(event: GoogleEvent): BusyEvent | null {
  if (event.status === 'cancelled') return null
  if (event.eventType && IGNORED_TYPES.has(event.eventType)) return null

  // She said no. Something she declined should never take time off her day,
  // and this is the single biggest source of phantom busyness on a calendar
  // that gets a lot of invitations.
  const self = event.attendees?.find((a) => a.self)
  if (self?.responseStatus === 'declined') return null

  const allDay = Boolean(event.start?.date && !event.start?.dateTime)
  const startAt = event.start?.dateTime
    ? new Date(event.start.dateTime)
    : event.start?.date
      ? parseDateOnly(event.start.date)
      : null
  if (!startAt || Number.isNaN(startAt.getTime())) return null

  const endAt = parseEnd(event.end, startAt, allDay)

  return {
    id: event.id ?? `${event.summary ?? 'event'}-${startAt.getTime()}`,
    title: (event.summary ?? '').trim(),
    startsAt: startAt.toISOString(),
    endsAt: endAt.toISOString(),
    allDay,
    location: (event.location ?? '').trim(),
    transparency: event.transparency === 'transparent' ? 'free' : 'busy',
  }
}

export function normalizeGoogleEvents(events: GoogleEvent[]): BusyEvent[] {
  const out: BusyEvent[] = []
  for (const event of events) {
    const normalized = normalizeGoogleEvent(event)
    if (normalized) out.push(normalized)
  }
  return out
}
