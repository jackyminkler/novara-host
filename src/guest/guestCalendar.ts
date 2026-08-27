// A temporary calendar check for someone with no account.
//
// This is the whole reason the group flows work. `calendar.freebusy` is
// non-sensitive to Google, so a guest sees no "unverified app" screen, costs
// nothing against the project's 100 lifetime unapproved-sensitive grants, and
// needs no verification however many people use it. They authorise Google in
// their own browser, their busy blocks are turned into free time here, and
// only that leaves the page.
//
// freeBusy returns start and end pairs and nothing else: no titles, no
// locations, no attendees. There is no version of this that leaks what someone
// is doing, which is exactly why it is the right scope to hand a group.

import { GoogleAuthError, SCOPE_FREEBUSY, requestToken } from '../lib/googleIdentity'
import { merge, subtract, type Interval } from '../lib/availability'

export { GoogleAuthError as CalendarCheckError }
export { googleConfigured } from '../lib/googleIdentity'

const FREEBUSY = 'https://www.googleapis.com/calendar/v3/freeBusy'

interface FreeBusyResponse {
  calendars?: Record<string, { busy?: { start: string; end: string }[] }>
}

export interface CalendarCheck {
  /** Their free time inside the requested range, absolute milliseconds. */
  free: Interval[]
  /** How many busy blocks were read, so the page can say something happened. */
  busyCount: number
}

/**
 * Ask for one read of the visitor's calendar and hand back their free time.
 *
 * Always interactive: nobody expects a page to touch their calendar without
 * being asked, and there is no stored grant to reuse silently anyway.
 */
export async function checkCalendar(from: Date, to: Date): Promise<CalendarCheck> {
  const token = await requestToken({ scope: SCOPE_FREEBUSY, interactive: true })

  let response: Response
  try {
    response = await fetch(FREEBUSY, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        timeMin: from.toISOString(),
        timeMax: to.toISOString(),
        // Primary only. Asking for every calendar they can see would pull in
        // shared and subscribed ones and mark them busy for other people's
        // events, which is the fastest way to make this look broken.
        items: [{ id: 'primary' }],
      }),
    })
  } catch {
    throw new GoogleAuthError('network')
  }
  if (!response.ok) throw new GoogleAuthError('network', `freebusy ${response.status}`)

  const data = (await response.json()) as FreeBusyResponse
  const busy = merge(
    Object.values(data.calendars ?? {}).flatMap((cal) =>
      (cal.busy ?? []).map((b) => ({
        start: new Date(b.start).getTime(),
        end: new Date(b.end).getTime(),
      })),
    ),
  )

  return {
    free: subtract([{ start: from.getTime(), end: to.getTime() }], busy),
    busyCount: busy.length,
  }
}

/** Which of these moments they can make, given a length. Nothing else is sent. */
export function answerFor(
  free: Interval[],
  moments: { id: string; startsAt: string }[],
  durationMinutes: number,
): Record<string, 'yes' | 'no'> {
  const durationMs = durationMinutes * 60000
  const out: Record<string, 'yes' | 'no'> = {}
  for (const moment of moments) {
    const start = new Date(moment.startsAt).getTime()
    if (Number.isNaN(start)) continue
    const end = start + durationMs
    // Whole span, not any overlap: half a window is not a slot they can make.
    out[moment.id] = free.some((w) => w.start <= start && w.end >= end) ? 'yes' : 'no'
  }
  return out
}
