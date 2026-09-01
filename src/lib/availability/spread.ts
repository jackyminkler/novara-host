// How far one calendar event blocks around itself.
//
// This is the judgment layer, and it is the difference between a dumb free
// and busy overlay and something worth opening. A 7pm launch party in the
// city leaves the morning bookable. A Saturday wedding two hours away eats
// the weekend. A 6am flight eats the night before.
//
// These are defaults, written to be corrected. They lean permissive on
// purpose: a rule that blocks too much produces a calendar showing almost
// nothing bookable, which is the failure that makes people stop opening the
// page. A rule that blocks too little occasionally offers a slot that has to
// be declined, which is recoverable.

import type { AvailabilityRules, BusyEvent, KindTemplate, OpenHours, Spread } from './types'

/**
 * Weekday open hours, index 0 = Sunday.
 *
 * Wide on purpose: this is the sleep and downtime boundary, not a preference.
 * Early enough for a sunrise run, closed by nine so nobody books a call at
 * eleven. Weekends start later because that is when a lie in is worth having.
 */
const WEEKDAY = { start: '06:00', end: '21:00', open: true }
const WEEKEND = { start: '07:30', end: '21:00', open: true }

export const DEFAULT_OPEN_HOURS: OpenHours = [
  WEEKEND, // Sunday
  WEEKDAY,
  WEEKDAY,
  WEEKDAY,
  WEEKDAY,
  WEEKDAY,
  WEEKEND, // Saturday
]

/**
 * Durations are suggestions the person booking can change. An hour is the
 * default for everything because it is what people actually assume, and the
 * shorter options exist so a quick call does not have to pretend to be an hour.
 */
export const DEFAULT_KINDS: KindTemplate[] = [
  { kind: 'coffee', label: 'Coffee', defaultMinutes: 60, choices: [30, 45, 60, 90] },
  { kind: 'run', label: 'Run', defaultMinutes: 60, choices: [30, 45, 60, 90] },
  { kind: 'call', label: 'Call', defaultMinutes: 30, choices: [15, 30, 45, 60] },
]

export const DEFAULT_RULES: AvailabilityRules = {
  openHours: DEFAULT_OPEN_HOURS,
  bufferMinutes: 30,
  // Half an hour of daylight between two meetings is not an opening worth
  // showing anyone, and dropping the scraps keeps the day readable.
  minWindowMinutes: 45,
  homeCity: 'San Francisco',
  travelHints: [
    'flight', 'flying', 'fly to', 'airport', 'depart', 'landing', 'red eye',
    'sfo', 'oak', 'sjc', 'jfk', 'lax', 'boarding',
  ],
  virtualHints: ['zoom.', 'meet.google', 'teams.microsoft', 'facetime', 'http', 'call'],
  earlyDepartureBefore: '09:00',
  eveningStart: '18:00',
  extendAcrossWeekend: true,
  kinds: DEFAULT_KINDS,
}

function has(haystack: string, needles: string[]): boolean {
  const h = haystack.toLowerCase()
  return needles.some((n) => h.includes(n.toLowerCase()))
}

/** Whole days the event itself covers, as an offset from its start day. */
function lastDayOffset(event: BusyEvent): number {
  const start = new Date(event.startsAt)
  const end = new Date(event.endsAt)
  // An all-day event's end is exclusive midnight, so back off a millisecond
  // before asking which day it lands on.
  const lastMoment = new Date(end.getTime() - 1)
  const days = Math.round(
    (new Date(lastMoment.getFullYear(), lastMoment.getMonth(), lastMoment.getDate()).getTime() -
      new Date(start.getFullYear(), start.getMonth(), start.getDate()).getTime()) / 86400000,
  )
  return Math.max(0, days)
}

export function spreadOf(event: BusyEvent, rules: AvailabilityRules = DEFAULT_RULES): Spread {
  if (event.transparency === 'free') {
    return { kind: 'ignored', reason: 'marked free on the calendar' }
  }

  const text = `${event.title} ${event.location}`
  const virtual = event.location.trim() !== '' && has(event.location, rules.virtualHints)

  // Travel wins over everything: a flight is not a meeting you can work around.
  if (!virtual && has(text, rules.travelHints)) {
    const start = new Date(event.startsAt)
    const early = start.getHours() * 60 + start.getMinutes() < 9 * 60
    return {
      from: early
        ? { dayOffset: -1, time: rules.eveningStart }
        : { dayOffset: 0, time: 'dayStart' },
      to: { dayOffset: lastDayOffset(event), time: 'dayEnd' },
      kind: 'spans',
      reason: early ? 'early departure, takes the evening before' : 'travel day',
    }
  }

  // An all-day entry with nowhere attached is usually a birthday, a reminder,
  // or a "week of" banner. Blocking on those hides most of a calendar, and
  // this case bites hard in practice.
  if (event.allDay && event.location.trim() === '') {
    return { kind: 'ignored', reason: 'all day with no location, probably a reminder' }
  }

  // Multi-day or all-day somewhere that is not home: you are away for it.
  const away =
    !virtual &&
    event.location.trim() !== '' &&
    !has(event.location, [rules.homeCity])
  if (away && (event.allDay || lastDayOffset(event) > 0)) {
    return {
      kind: 'spans',
      from: { dayOffset: 0, time: 'dayStart' },
      to: { dayOffset: lastDayOffset(event), time: 'dayEnd' },
      reason: 'out of town',
    }
  }

  // Everything else, including a timed event at an unfamiliar address, stays
  // confined. Most calendar locations are street addresses or video links, so
  // treating "not home city" as travel on a timed event would block far more
  // than it should.
  return { kind: 'confined' }
}
