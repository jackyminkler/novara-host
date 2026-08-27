// Overlapping many people's free time.
//
// The primitive under every multi-party surface: suggesting dates for an
// event, a template asking for the next three Saturdays that work, and a
// group huddle finding the slot most of them can make. All of them are this
// function with different UI around it.
//
// Deliberately counts rather than intersects. "When are we all free" is the
// special case where count equals everyone, and it is usually the wrong
// question: with five partners there is often no time that works for all five
// and several that work for four.

import type { Interval } from './types'
import { intersect, merge } from './windows'

export interface Participant {
  id: string
  label: string
  /** Their free time, in absolute milliseconds. Zone-independent by construction. */
  free: Interval[]
}

export interface CoverageSpan extends Interval {
  /** Participant ids free for the whole of this span. */
  free: string[]
  /** Participant ids busy for any part of it. */
  busy: string[]
}

/**
 * Break the timeline into spans where the set of free people does not change.
 *
 * A sweep over every boundary: between two consecutive boundaries, membership
 * is constant, so each span can be labelled once. Sorted, disjoint, and only
 * spans with at least one person free are returned.
 */
export function coverage(participants: Participant[]): CoverageSpan[] {
  if (participants.length === 0) return []

  const normalized = participants.map((p) => ({ ...p, free: merge(p.free) }))
  const boundaries = new Set<number>()
  for (const p of normalized) {
    for (const span of p.free) {
      boundaries.add(span.start)
      boundaries.add(span.end)
    }
  }

  const points = [...boundaries].sort((a, b) => a - b)
  const out: CoverageSpan[] = []

  for (let i = 0; i < points.length - 1; i += 1) {
    const start = points[i]!
    const end = points[i + 1]!
    if (end <= start) continue

    const free: string[] = []
    const busy: string[] = []
    for (const p of normalized) {
      // Whole span, not any overlap: a slot half of someone's free time
      // covers is a slot they cannot actually make.
      const covers = p.free.some((w) => w.start <= start && w.end >= end)
      ;(covers ? free : busy).push(p.id)
    }
    if (free.length > 0) out.push({ start, end, free, busy })
  }

  // Adjacent spans with identical membership are one span, and leaving them
  // split would offer the same opening twice.
  const collapsed: CoverageSpan[] = []
  for (const span of out) {
    const last = collapsed[collapsed.length - 1]
    if (last && last.end === span.start && sameSet(last.free, span.free)) {
      last.end = span.end
    } else {
      collapsed.push({ ...span })
    }
  }
  return collapsed
}

function sameSet(a: string[], b: string[]): boolean {
  return a.length === b.length && a.every((id) => b.includes(id))
}

export interface SuggestOptions {
  /** How long the thing needs to be. */
  durationMinutes: number
  /** How many suggestions to return. */
  limit: number
  /** Ignore anything where fewer than this many can make it. */
  minFree?: number
  /**
   * Preferred local start, "07:00", usually from a template.
   *
   * A preference, not a filter. A sunrise run template wants 7am, but a
   * Saturday that is only open from 9 is still a better answer than no answer,
   * so a window that cannot hold the preferred time falls back to its own
   * start and simply ranks below the ones that can.
   */
  preferredStart?: string
  /**
   * Weekdays worth considering, 0 = Sunday. Empty or absent means any day.
   * A template built from a Saturday morning run should keep proposing
   * Saturdays rather than the next free Tuesday.
   */
  weekdays?: number[]
  /**
   * Absolute stretches a suggestion is allowed to sit inside. Every
   * participant's free time is intersected with these before coverage runs.
   *
   * One mechanism instead of several. A caller has bounds of different kinds
   * to respect: nothing before now, nothing after the date the thing has to
   * have happened by, and only the hours the organizer opened. All three are
   * the same fact once they are absolute time, so callers fold them together
   * and hand over one list, and this function never learns what any of them
   * meant. Absent means unbounded, which is what every earlier caller had. An
   * empty list means nothing is allowed, so nothing is suggested.
   */
  within?: Interval[]
}

export interface Suggestion {
  start: number
  end: number
  free: string[]
  busy: string[]
  /** True when the window could hold the template's preferred time of day. */
  atPreferredTime: boolean
}

/**
 * The best few options, most people free first, then earliest.
 *
 * Earliest as the tiebreak rather than latest: a date everyone can make in two
 * weeks beats the same turnout in two months, and planning runway is the whole
 * reason the host is asking.
 */
export function suggest(participants: Participant[], options: SuggestOptions): Suggestion[] {
  const durationMs = options.durationMinutes * 60000
  const minFree = options.minFree ?? 1
  const weekdays = options.weekdays && options.weekdays.length > 0 ? options.weekdays : null
  const preferred = parsePreferred(options.preferredStart)

  // Clipped before coverage rather than after, so someone whose free time only
  // touches the edge of an allowed window is counted busy for a slot they
  // cannot actually make, exactly as coverage already treats a partial overlap.
  const within = options.within
  const bounded = within
    ? participants.map((p) => ({ ...p, free: intersect(p.free, within) }))
    : participants

  const candidates: Suggestion[] = []
  for (const span of coverage(bounded)) {
    if (span.end - span.start < durationMs) continue
    if (span.free.length < minFree) continue
    if (weekdays && !weekdays.includes(new Date(span.start).getDay())) continue

    const preferredStart = preferred === null ? null : atMinutes(span.start, preferred)
    const usePreferred =
      preferredStart !== null &&
      preferredStart >= span.start &&
      preferredStart + durationMs <= span.end

    const start = usePreferred ? (preferredStart as number) : span.start
    candidates.push({
      start,
      end: start + durationMs,
      free: span.free,
      busy: span.busy,
      atPreferredTime: usePreferred,
    })
  }

  // Turnout first, then the template's own time of day, then soonest. Earliest
  // as the final tiebreak rather than latest: the same turnout in two weeks
  // beats two months, and runway is why the host is asking.
  candidates.sort(
    (a, b) =>
      b.free.length - a.free.length ||
      Number(b.atPreferredTime) - Number(a.atPreferredTime) ||
      a.start - b.start,
  )

  // One suggestion per day: three times on the same Saturday is one option
  // dressed as three, and it crowds out the next real alternative.
  const seenDays = new Set<string>()
  const out: Suggestion[] = []
  for (const candidate of candidates) {
    const d = new Date(candidate.start)
    const key = `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`
    if (seenDays.has(key)) continue
    seenDays.add(key)
    out.push(candidate)
    if (out.length >= options.limit) break
  }
  return out
}

function parsePreferred(value: string | undefined): number | null {
  if (!value) return null
  const m = /^(\d{1,2}):(\d{2})$/.exec(value.trim())
  if (!m) return null
  const h = Number(m[1])
  const min = Number(m[2])
  if (h > 23 || min > 59) return null
  return h * 60 + min
}

/** That many minutes past midnight on the day containing `ms`, local time. */
function atMinutes(ms: number, minutes: number): number {
  const d = new Date(ms)
  return new Date(d.getFullYear(), d.getMonth(), d.getDate(), 0, minutes, 0, 0).getTime()
}
