// Turning published windows into what one friend sees, and validating a booking.
//
// Deliberately tiny. The host derives her windows in the browser and publishes
// only those, so serving a booking link is a filter, not a second copy of the
// derivation rules. Anything more here would be a rules engine living in two
// places, which is how two copies drift.

import type { KindTemplate, MeetKind, OpenWindow } from './types'

export interface TakenSlot {
  startsAt: string
  endsAt: string
}

export interface WindowOptions {
  /** Nothing before this is shown, so a stale document cannot offer the past. */
  from: Date
  /** The friend's own horizon. */
  to: Date
  /** Confirmed bookings, which close time for everyone. */
  taken: TakenSlot[]
  /** Windows shorter than this are not worth showing. */
  minMinutes: number
}

function toIntervals(taken: TakenSlot[]) {
  return taken
    .map((t) => ({ start: new Date(t.startsAt).getTime(), end: new Date(t.endsAt).getTime() }))
    .sort((a, b) => a.start - b.start)
}

/**
 * The windows this friend may book inside, with bookings already removed.
 *
 * Bookings are cut out here rather than at publish time because they change
 * far more often than the calendar does, and re-publishing on every booking
 * would make one friend's choice rewrite the document everyone reads.
 */
export function windowsForFriend(
  published: OpenWindow[],
  options: WindowOptions,
): OpenWindow[] {
  const taken = toIntervals(options.taken)
  const from = options.from.getTime()
  const to = options.to.getTime()
  const minMs = options.minMinutes * 60000
  const out: OpenWindow[] = []

  for (const window of published) {
    const clipped = { start: Math.max(window.start, from), end: Math.min(window.end, to) }
    if (clipped.end <= clipped.start) continue

    // Walk the bookings that land inside this window, emitting the gaps.
    let cursor = clipped.start
    for (const t of taken) {
      if (t.end <= cursor) continue
      if (t.start >= clipped.end) break
      if (t.start > cursor) out.push({ start: cursor, end: Math.min(t.start, clipped.end) })
      cursor = Math.max(cursor, t.end)
      if (cursor >= clipped.end) break
    }
    if (cursor < clipped.end) out.push({ start: cursor, end: clipped.end })
  }

  return out.filter((w) => w.end - w.start >= minMs)
}

/**
 * Does this booking fit entirely inside one open window?
 *
 * Deliberately not "does it overlap a window": a meeting that runs past the
 * end of her open hours is not a shorter meeting, it is one she did not offer.
 */
export function fitsInWindow(
  windows: OpenWindow[],
  startsAt: string,
  durationMinutes: number,
): boolean {
  const start = new Date(startsAt).getTime()
  if (Number.isNaN(start) || durationMinutes <= 0) return false
  const end = start + durationMinutes * 60000
  return windows.some((w) => start >= w.start && end <= w.end)
}

/**
 * Suggested start times inside a window, on the hour and half hour.
 *
 * Only a convenience for the booking page: the friend may pick any minute the
 * window can hold, so this list is never the definition of what is available.
 */
export function suggestedStarts(
  window: OpenWindow,
  durationMinutes: number,
  stepMinutes = 30,
): number[] {
  const stepMs = stepMinutes * 60000
  const durationMs = durationMinutes * 60000
  const out: number[] = []
  let start = Math.ceil(window.start / stepMs) * stepMs
  while (start + durationMs <= window.end) {
    out.push(start)
    start += stepMs
  }
  return out
}

export function templateFor(kinds: KindTemplate[], kind: MeetKind): KindTemplate | null {
  return kinds.find((k) => k.kind === kind) ?? null
}
