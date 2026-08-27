// Interval algebra. Every function is total and returns sorted, disjoint
// intervals, so callers never have to think about overlap or ordering.

import type { Interval } from './types'

/** Local "HH:MM" to minutes past midnight. Returns null on anything unparseable. */
export function parseClock(hhmm: string): number | null {
  const m = /^(\d{1,2}):(\d{2})$/.exec(hhmm.trim())
  if (!m) return null
  const h = Number(m[1])
  const min = Number(m[2])
  if (h > 23 || min > 59) return null
  return h * 60 + min
}

/** Minutes past local midnight on the day containing `at`. */
export function atClock(at: Date, minutes: number): Date {
  return new Date(at.getFullYear(), at.getMonth(), at.getDate(), 0, minutes, 0, 0)
}

export function merge(intervals: Interval[]): Interval[] {
  const sorted = intervals
    .filter((i) => i.end > i.start)
    .sort((a, b) => a.start - b.start)
  const out: Interval[] = []
  for (const next of sorted) {
    const last = out[out.length - 1]
    // Touching counts as overlapping: two back to back blocks leave no gap
    // worth offering, and merging them keeps the output minimal.
    if (last && next.start <= last.end) {
      last.end = Math.max(last.end, next.end)
    } else {
      out.push({ ...next })
    }
  }
  return out
}

/** Everything in `from` that no interval in `cut` covers. */
export function subtract(from: Interval[], cut: Interval[]): Interval[] {
  const blocked = merge(cut)
  const out: Interval[] = []
  for (const span of merge(from)) {
    let start = span.start
    for (const b of blocked) {
      if (b.end <= start) continue
      if (b.start >= span.end) break
      if (b.start > start) out.push({ start, end: Math.min(b.start, span.end) })
      start = Math.max(start, b.end)
      if (start >= span.end) break
    }
    if (start < span.end) out.push({ start, end: span.end })
  }
  return out
}

/** Everything both sides cover. Either side empty means nothing is left. */
export function intersect(a: Interval[], b: Interval[]): Interval[] {
  const left = merge(a)
  const right = merge(b)
  const out: Interval[] = []
  let i = 0
  let j = 0
  while (i < left.length && j < right.length) {
    const start = Math.max(left[i]!.start, right[j]!.start)
    const end = Math.min(left[i]!.end, right[j]!.end)
    if (end > start) out.push({ start, end })
    // Advance whichever ends first. The other one may still reach into what
    // comes next on this side, so dropping it here would lose an overlap.
    if (left[i]!.end < right[j]!.end) i += 1
    else j += 1
  }
  return out
}

export function pad(intervals: Interval[], minutes: number): Interval[] {
  const ms = minutes * 60000
  return intervals.map((i) => ({ start: i.start - ms, end: i.end + ms }))
}
