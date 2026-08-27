// Availability derivation: calendar events in, open windows out.
//
// Pure by construction. No firebase, no react, no network, and no clock reads:
// the window comes in as an argument so the same inputs always give the same
// answer. That is what makes this testable without a browser, and what lets
// the whole folder lift into a shared package unchanged.
//
// The output is windows, not slots. "Open until it isn't" is a fact about a
// stretch of time; which start times to draw inside it is a rendering choice,
// and keeping that choice out of here is what stops an ordinary calendar
// turning into four thousand "open times".

import { DEFAULT_RULES, spreadOf } from './spread'
import { atClock, merge, pad, parseClock, subtract } from './windows'
import type {
  AvailabilityRules,
  BusyEvent,
  DayEdge,
  Interval,
  OpenWindow,
} from './types'

/** Jacky's reasoning: three months out is where a shared open slot is easiest to find. */
export const DEFAULT_HORIZON_DAYS = 90

function startOfDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate())
}

function addDays(d: Date, days: number): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate() + days)
}

/** Resolve a spread edge against the day the event starts on. */
function edgeAt(eventStart: Date, edge: DayEdge, end: boolean): number {
  const day = addDays(startOfDay(eventStart), edge.dayOffset)
  if (edge.time === 'dayStart') return day.getTime()
  if (edge.time === 'dayEnd') return addDays(day, 1).getTime()
  const minutes = parseClock(edge.time)
  if (minutes === null) return end ? addDays(day, 1).getTime() : day.getTime()
  return atClock(day, minutes).getTime()
}

/**
 * An out of town block that touches a weekend takes the rest of that weekend.
 * Jacky's rule: if the event is out of town, the whole weekend is gone.
 */
function extendWeekend(span: Interval): Interval {
  let { start, end } = span
  for (let cursor = startOfDay(new Date(start)); cursor.getTime() < end; cursor = addDays(cursor, 1)) {
    const dow = cursor.getDay()
    if (dow === 6) end = Math.max(end, addDays(cursor, 2).getTime())
    if (dow === 0) start = Math.min(start, addDays(cursor, -1).getTime())
  }
  return { start, end }
}

/** Everything the calendar takes off the table, merged and disjoint. */
export function blockedIntervals(
  events: BusyEvent[],
  rules: AvailabilityRules = DEFAULT_RULES,
): Interval[] {
  const out: Interval[] = []
  for (const event of events) {
    const spread = spreadOf(event, rules)
    if (spread.kind === 'ignored') continue
    if (spread.kind === 'confined') {
      out.push({ start: new Date(event.startsAt).getTime(), end: new Date(event.endsAt).getTime() })
      continue
    }
    const eventStart = new Date(event.startsAt)
    const span: Interval = {
      start: edgeAt(eventStart, spread.from, false),
      end: edgeAt(eventStart, spread.to, true),
    }
    out.push(rules.extendAcrossWeekend ? extendWeekend(span) : span)
  }
  return merge(out)
}

/** The open hours band for each day in range, as absolute intervals. */
export function openBands(from: Date, to: Date, rules: AvailabilityRules): Interval[] {
  const out: Interval[] = []
  for (let day = startOfDay(from); day.getTime() < to.getTime(); day = addDays(day, 1)) {
    const hours = rules.openHours[day.getDay()]
    if (!hours || !hours.open) continue
    const start = parseClock(hours.start)
    const end = parseClock(hours.end)
    if (start === null || end === null || end <= start) continue
    out.push({ start: atClock(day, start).getTime(), end: atClock(day, end).getTime() })
  }
  return out
}

export interface DeriveInput {
  events: BusyEvent[]
  /** Start of the bookable window, usually now. */
  from: Date
  /** End of the bookable window. Per friend, defaulting to 90 days out. */
  to: Date
  rules?: AvailabilityRules
  /** Already booked time, and any hand-marked away time. */
  alsoBlocked?: Interval[]
}

/**
 * The open stretches inside her hours, once the calendar is taken out.
 *
 * The buffer is applied to the busy side rather than to each window, so a
 * meeting that ends at the edge of a day cannot eat into the next morning.
 */
export function deriveWindows(input: DeriveInput): OpenWindow[] {
  const rules = input.rules ?? DEFAULT_RULES
  const busy = merge([...blockedIntervals(input.events, rules), ...(input.alsoBlocked ?? [])])
  const free = subtract(openBands(input.from, input.to, rules), pad(busy, rules.bufferMinutes))
  const minMs = rules.minWindowMinutes * 60000
  const floor = input.from.getTime()

  return free
    // Never offer the past: a document published this morning should not still
    // be advertising this morning.
    .map((w) => ({ start: Math.max(w.start, floor), end: w.end }))
    .filter((w) => w.end - w.start >= minMs)
}
