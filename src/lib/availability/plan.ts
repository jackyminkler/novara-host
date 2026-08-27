// Plans: the pure half of group scheduling.
//
// Nothing here reads the clock. Every function that cares about "now" takes it
// as an argument, the same way derivation takes its window, so a phase or a set
// of windows is reproducible in a test without faking Date and identical
// wherever it runs.

import type { DayHours, Interval } from './types'
import { atClock, intersect, merge, parseClock } from './windows'
import { addDays, fromDateKey, startOfDay, toDateKey } from '../dates'

/**
 * What a new plan opens with: every day, 09:00 to 22:00.
 *
 * Not "any time at all". A calendar read counts three in the morning as free,
 * so an unconstrained plan will happily rank 2am as the slot everyone can make.
 * Waking hours are the honest starting point, and the organizer narrows from
 * there.
 */
export const PLAN_DEFAULT_HOURS: DayHours[] = [0, 1, 2, 3, 4, 5, 6].map(() => ({
  start: '09:00',
  end: '22:00',
  open: true,
}))

export type PlanPhase = 'open' | 'closed' | 'settled' | 'passed'

/**
 * Which of the four states a plan is in.
 *
 * The order is not the order the dates fall in, and that is deliberate. A pick
 * outranks both deadlines, because a plan that got its answer is settled even
 * when the organizer picked after the cutoff. Then the happen-by date, because
 * a plan whose day has gone with nothing picked is over, not merely closed to
 * answers.
 */
export function planPhase(
  plan: { settledStartsAt: string | null; respondByMs: number | null; happenByMs: number | null },
  now: number,
): PlanPhase {
  if (plan.settledStartsAt) return 'settled'
  if (plan.happenByMs !== null && now >= plan.happenByMs) return 'passed'
  if (plan.respondByMs !== null && now >= plan.respondByMs) return 'closed'
  return 'open'
}

/**
 * Epoch milliseconds of local midnight after the given 'YYYY-MM-DD' day.
 *
 * A deadline of "September 12" means through the end of the 12th, so the whole
 * day counts and the test for a lapsed deadline is `now >= endOfDayMs(key)`.
 *
 * Local zone on purpose, and for the same reason `atClock` can be: this runs
 * in the organizer's own browser, at create and edit time only, against the
 * clock the plan is written on. The millisecond it produces is what gets
 * stored, and every later comparison is a number. It would be wrong in a
 * guest's browser or in a function, which is why neither one calls it.
 */
export function endOfDayMs(dateKey: string): number {
  return addDays(fromDateKey(dateKey), 1).getTime()
}

/**
 * The plan's hours across a stretch of days, as absolute intervals.
 *
 * Published once by the organizer rather than recomputed by everyone reading
 * the plan. Wall clock needs a zone to become absolute, and the organizer's is
 * the zone the plan was written in; guests then read milliseconds and convert
 * nothing, so there is no second conversion to get wrong. Organizer's browser
 * only, same as `endOfDayMs`.
 */
export function buildAllowedWindows(hours: DayHours[], from: Date, to: Date): Interval[] {
  const floor = from.getTime()
  const ceiling = to.getTime()
  const out: Interval[] = []
  for (let day = startOfDay(from); day.getTime() < ceiling; day = addDays(day, 1)) {
    const today = hours[day.getDay()]
    if (!today || !today.open) continue
    const start = parseClock(today.start)
    const end = parseClock(today.end)
    // An end at or before its start is not a very short day, it is a day the
    // organizer is halfway through editing. Skipping it beats offering
    // midnight to midnight.
    if (start === null || end === null || end <= start) continue
    const clipped = {
      start: Math.max(atClock(day, start).getTime(), floor),
      end: Math.min(atClock(day, end).getTime(), ceiling),
    }
    if (clipped.end > clipped.start) out.push(clipped)
  }
  return merge(out)
}

/**
 * Hours for a plan written before hours existed.
 *
 * The first build stored `weekdays: number[]`, which could say which days but
 * never which hours. Listed days open on the default window and the rest close;
 * an empty list meant any day, so every day opens. Index 0 is Sunday, as it is
 * everywhere else in this repo.
 */
export function hoursFromWeekdays(weekdays: number[]): DayHours[] {
  const anyDay = weekdays.length === 0
  return PLAN_DEFAULT_HOURS.map((hours, day) => ({
    ...hours,
    open: anyDay || weekdays.includes(day),
  }))
}

/**
 * The single `within` bound a ranking call passes to `suggest`.
 *
 * Ranking has three absolute limits to respect: the hours the organizer opened,
 * the fact that a time in the past helps nobody, and the date the thing has to
 * have happened by. Folding them together here is what keeps `suggest` down to
 * one mechanism. A plan with no published windows is bounded by the pair alone,
 * and an open-ended one runs to the largest millisecond there is rather than to
 * an invented horizon that would quietly become a rule.
 */
export function clipWindows(
  allowed: Interval[] | null,
  notBefore: number,
  notAfter: number | null,
): Interval[] {
  const bound: Interval = { start: notBefore, end: notAfter ?? Number.MAX_SAFE_INTEGER }
  if (bound.end <= bound.start) return []
  if (!allowed) return [bound]
  return intersect(allowed, [bound])
}

export interface AllowedDay {
  /** Local 'YYYY-MM-DD'. */
  dayKey: string
  /** Local midnight starting that day, for sorting and for a heading. */
  dayStartMs: number
  intervals: Interval[]
}

/**
 * The allowed windows grouped into the days someone picks from by hand.
 *
 * A window crossing midnight belongs to the day it starts on, which is how a
 * person reads a late Friday: that is Friday night, not Saturday morning. Days
 * whose windows have all gone are dropped rather than shown greyed out, because
 * there is nothing to pick.
 */
export function allowedDayGroups(allowed: Interval[], now: number): AllowedDay[] {
  const byKey = new Map<string, AllowedDay>()
  for (const interval of merge(allowed)) {
    const day = startOfDay(new Date(interval.start))
    const dayKey = toDateKey(day)
    let group = byKey.get(dayKey)
    if (!group) {
      group = { dayKey, dayStartMs: day.getTime(), intervals: [] }
      byKey.set(dayKey, group)
    }
    group.intervals.push(interval)
  }
  return [...byKey.values()]
    // Merged input arrives sorted and disjoint, so within a day the last
    // window is the one that ends latest.
    .filter((group) => group.intervals[group.intervals.length - 1]!.end > now)
    .sort((a, b) => a.dayStartMs - b.dayStartMs)
}

/** The free time a hand-picked set of days adds up to. */
export function freeFromDays(selectedDayKeys: string[], groups: AllowedDay[]): Interval[] {
  const wanted = new Set(selectedDayKeys)
  const out: Interval[] = []
  for (const group of groups) {
    if (wanted.has(group.dayKey)) out.push(...group.intervals)
  }
  return merge(out)
}

/**
 * Which days someone's free time already covers whole.
 *
 * Used to tick the picker back on when they open the link again. Covering the
 * day partly does not count: half a day free is not a day they chose, and
 * showing it as chosen would let one tap quietly widen what they said.
 */
export function daysCoveredBy(free: Interval[], groups: AllowedDay[]): string[] {
  const merged = merge(free)
  return groups
    .filter((group) =>
      group.intervals.every((slot) =>
        merged.some((window) => window.start <= slot.start && window.end >= slot.end),
      ),
    )
    .map((group) => group.dayKey)
}
