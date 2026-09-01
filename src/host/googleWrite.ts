// Writing Novara events onto the host's Google Calendar.
//
// The safety property here is not the scope, it is this module. The granted
// scope permits editing any event on any of her calendars. Every function
// below refuses to touch anything that does not carry our own tag, so the
// worst a bug in this file can do is damage events Novara created.
//
// The tag is a private extended property. Google keeps it on the event, does
// not show it in any UI, and lets us query by it, which means the link between
// a host event and its calendar event survives even if our stored id is lost.

const API = 'https://www.googleapis.com/calendar/v3'

/** Marks an event as ours. Nothing without this is ever updated or deleted. */
const TAG_KEY = 'novaraHostEventId'
const TAG_SOURCE = 'novaraHostManaged'

export class GoogleWriteError extends Error {}

export interface CalendarEventDraft {
  /** The host event this mirrors. Used as the tag value, so it must be stable. */
  sourceId: string
  title: string
  description: string
  location: string
  startsAt: string
  endsAt: string
  /**
   * Who Google should invite. Address only: the name on the invitation is the
   * invitee's own, and Google fills it in from their account.
   *
   * Absent or empty means nobody is emailed at all, which is the solo case and
   * has to stay silent.
   */
  attendees?: { email: string }[]
}

interface GoogleEventResource {
  id?: string
  /** The event's own page on Google Calendar. */
  htmlLink?: string
  summary?: string
  description?: string
  location?: string
  start?: { dateTime?: string }
  end?: { dateTime?: string }
  attendees?: { email: string }[]
  extendedProperties?: { private?: Record<string, string> }
}

async function call<T>(
  token: string,
  path: string,
  init?: { method?: string; body?: unknown },
): Promise<T> {
  let response: Response
  try {
    response = await fetch(`${API}${path}`, {
      method: init?.method ?? 'GET',
      headers: {
        Authorization: `Bearer ${token}`,
        ...(init?.body ? { 'Content-Type': 'application/json' } : {}),
      },
      body: init?.body ? JSON.stringify(init.body) : undefined,
    })
  } catch {
    throw new GoogleWriteError('network')
  }
  if (response.status === 204) return undefined as T
  if (!response.ok) throw new GoogleWriteError(`calendar api ${response.status}`)
  return (await response.json()) as T
}

function toResource(draft: CalendarEventDraft): GoogleEventResource {
  return {
    summary: draft.title,
    description: draft.description,
    location: draft.location,
    start: { dateTime: new Date(draft.startsAt).toISOString() },
    end: { dateTime: new Date(draft.endsAt).toISOString() },
    // Omitted rather than sent empty. A PATCH carrying an empty list would
    // uninvite everybody, and editing the notes on a settled plan must not do
    // that.
    ...(draft.attendees?.length
      ? { attendees: draft.attendees.map((a) => ({ email: a.email })) }
      : {}),
    extendedProperties: { private: { [TAG_KEY]: draft.sourceId, [TAG_SOURCE]: 'true' } },
  }
}

/**
 * Google emails invitations and updates only when asked to.
 *
 * Asked only when there is somebody to email, so a plan the organizer keeps to
 * herself stays quiet, and every later edit to one with guests reaches them the
 * same way the first invitation did.
 */
function notifyQuery(attendees: CalendarEventDraft['attendees']): string {
  return attendees && attendees.length > 0 ? '?sendUpdates=all' : ''
}

/** Our event for this source id, or null. Queried by tag, not by stored id. */
async function findTagged(
  token: string,
  calendarId: string,
  sourceId: string,
): Promise<GoogleEventResource | null> {
  const query = new URLSearchParams({
    privateExtendedProperty: `${TAG_KEY}=${sourceId}`,
    showDeleted: 'false',
    maxResults: '5',
  })
  const data = await call<{ items?: GoogleEventResource[] }>(
    token,
    `/calendars/${encodeURIComponent(calendarId)}/events?${query.toString()}`,
  )
  return data.items?.[0] ?? null
}

function isOurs(event: GoogleEventResource | null): boolean {
  return event?.extendedProperties?.private?.[TAG_SOURCE] === 'true'
}

export interface UpsertedEvent {
  id: string
  /** Where to see it on Google Calendar. Null when Google hands back no link. */
  htmlLink: string | null
}

/**
 * Create or update the calendar event mirroring one host event.
 *
 * Idempotent by tag rather than by a stored id, so running it twice makes one
 * event, and a lost id does not orphan a duplicate on her calendar.
 */
export async function upsertEvent(
  token: string,
  draft: CalendarEventDraft,
  calendarId = 'primary',
): Promise<UpsertedEvent> {
  const notify = notifyQuery(draft.attendees)
  const existing = await findTagged(token, calendarId, draft.sourceId)
  if (existing?.id) {
    // Belt and braces: findTagged matched our key, and we still check the
    // marker before writing over anything.
    if (!isOurs(existing)) throw new GoogleWriteError('refusing to modify an event Novara did not create')
    const updated = await call<GoogleEventResource>(
      token,
      `/calendars/${encodeURIComponent(calendarId)}/events/${encodeURIComponent(existing.id)}${notify}`,
      { method: 'PATCH', body: toResource(draft) },
    )
    return {
      id: updated.id ?? existing.id,
      htmlLink: updated.htmlLink ?? existing.htmlLink ?? null,
    }
  }
  const created = await call<GoogleEventResource>(
    token,
    `/calendars/${encodeURIComponent(calendarId)}/events${notify}`,
    { method: 'POST', body: toResource(draft) },
  )
  if (!created.id) throw new GoogleWriteError('calendar did not return an event id')
  return { id: created.id, htmlLink: created.htmlLink ?? null }
}

/**
 * Remove the mirror for one host event. Silent when there is nothing to remove.
 *
 * `notify` tells the guests the thing is off. Off by default, because deleting
 * a mirror is usually housekeeping and mailing everyone about it would be
 * alarming.
 */
export async function removeEvent(
  token: string,
  sourceId: string,
  calendarId = 'primary',
  notify = false,
): Promise<void> {
  const existing = await findTagged(token, calendarId, sourceId)
  if (!existing?.id) return
  if (!isOurs(existing)) throw new GoogleWriteError('refusing to delete an event Novara did not create')
  await call<void>(
    token,
    `/calendars/${encodeURIComponent(calendarId)}/events/${encodeURIComponent(existing.id)}${
      notify ? '?sendUpdates=all' : ''
    }`,
    { method: 'DELETE' },
  )
}
