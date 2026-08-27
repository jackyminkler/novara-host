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
import { merge } from './windows'

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
}

export interface Suggestion {
  start: number
  end: number
  free: string[]
  busy: string[]
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

  const candidates = coverage(participants)
    .filter((span) => span.end - span.start >= durationMs && span.free.length >= minFree)
    .map((span) => ({
      start: span.start,
      end: span.start + durationMs,
      free: span.free,
      busy: span.busy,
    }))

  candidates.sort((a, b) => b.free.length - a.free.length || a.start - b.start)

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
