// Minimal iCalendar parsing. No dependencies, no network: text in, normalized
// events out. Handles what a real Google Calendar export actually contains,
// and is deliberately forgiving, because one malformed line in a year of
// calendar should never cost the whole import.
//
// Known limits, all recorded in the feature plan: TZID is treated as the
// host's own zone, and recurrence covers the simple FREQ rules rather than
// the full RFC 5545 grammar.

import type { BusyEvent } from './types'

interface Line {
  name: string
  params: Record<string, string>
  value: string
}

/** Undo RFC 5545 line folding: a continuation begins with a space or tab. */
function unfold(text: string): string[] {
  const raw = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n')
  const out: string[] = []
  for (const line of raw) {
    if ((line.startsWith(' ') || line.startsWith('\t')) && out.length > 0) {
      out[out.length - 1] += line.slice(1)
    } else {
      out.push(line)
    }
  }
  return out
}

function parseLine(line: string): Line | null {
  const colon = line.indexOf(':')
  if (colon === -1) return null
  const left = line.slice(0, colon)
  const value = line.slice(colon + 1)
  const parts = left.split(';')
  const name = (parts[0] ?? '').toUpperCase()
  const params: Record<string, string> = {}
  for (const p of parts.slice(1)) {
    const eq = p.indexOf('=')
    if (eq > 0) params[p.slice(0, eq).toUpperCase()] = p.slice(eq + 1).replace(/^"|"$/g, '')
  }
  return { name, params, value }
}

function unescape(value: string): string {
  return value
    .replace(/\\n/gi, ' ')
    .replace(/\\,/g, ',')
    .replace(/\;/g, ';')
    .replace(/\\\\/g, '\\')
    .trim()
}

/** ICS date or datetime to a local Date. Returns null on anything unreadable. */
function parseStamp(value: string): { at: Date; dateOnly: boolean } | null {
  const v = value.trim()
  const dateOnly = /^\d{8}$/.test(v)
  const m = /^(\d{4})(\d{2})(\d{2})(?:T(\d{2})(\d{2})(\d{2})(Z)?)?$/.exec(v)
  if (!m) return null
  const [, y, mo, d, h, mi, s, z] = m
  if (dateOnly) {
    return { at: new Date(Number(y), Number(mo) - 1, Number(d)), dateOnly: true }
  }
  if (z) {
    return {
      at: new Date(Date.UTC(Number(y), Number(mo) - 1, Number(d), Number(h), Number(mi), Number(s))),
      dateOnly: false,
    }
  }
  // No zone marker, or a TZID we are choosing not to resolve: treat as local,
  // which is right for the common case of a calendar in the host's own zone.
  return {
    at: new Date(Number(y), Number(mo) - 1, Number(d), Number(h), Number(mi), Number(s)),
    dateOnly: false,
  }
}

interface Rrule {
  freq: 'DAILY' | 'WEEKLY' | 'MONTHLY' | 'YEARLY'
  interval: number
  count: number | null
  until: Date | null
}

function parseRrule(value: string): Rrule | null {
  const parts: Record<string, string> = {}
  for (const chunk of value.split(';')) {
    const eq = chunk.indexOf('=')
    if (eq > 0) parts[chunk.slice(0, eq).toUpperCase()] = chunk.slice(eq + 1)
  }
  const freq = parts.FREQ?.toUpperCase()
  if (freq !== 'DAILY' && freq !== 'WEEKLY' && freq !== 'MONTHLY' && freq !== 'YEARLY') return null
  const until = parts.UNTIL ? parseStamp(parts.UNTIL)?.at ?? null : null
  return {
    freq,
    interval: Math.max(1, Number(parts.INTERVAL ?? '1') || 1),
    count: parts.COUNT ? Number(parts.COUNT) || null : null,
    until,
  }
}

function shift(d: Date, rule: Rrule, n: number): Date {
  const step = rule.interval * n
  if (rule.freq === 'DAILY') return new Date(d.getFullYear(), d.getMonth(), d.getDate() + step, d.getHours(), d.getMinutes())
  if (rule.freq === 'WEEKLY') return new Date(d.getFullYear(), d.getMonth(), d.getDate() + step * 7, d.getHours(), d.getMinutes())
  if (rule.freq === 'MONTHLY') return new Date(d.getFullYear(), d.getMonth() + step, d.getDate(), d.getHours(), d.getMinutes())
  return new Date(d.getFullYear() + step, d.getMonth(), d.getDate(), d.getHours(), d.getMinutes())
}

export interface ParseIcsOptions {
  /** Only events overlapping this window are returned. */
  from: Date
  to: Date
  /** Safety valve so one pathological rule cannot expand without bound. */
  maxOccurrences?: number
}

export interface ParseIcsResult {
  events: BusyEvent[]
  /** Blocks that could not be read at all. Surfaced rather than swallowed. */
  skipped: number
}

export function parseIcs(text: string, options: ParseIcsOptions): ParseIcsResult {
  const maxOccurrences = options.maxOccurrences ?? 400
  const events: BusyEvent[] = []
  let skipped = 0
  let current: Line[] | null = null

  for (const rawLine of unfold(text)) {
    const line = parseLine(rawLine)
    if (!line) continue
    if (line.name === 'BEGIN' && line.value.trim().toUpperCase() === 'VEVENT') {
      current = []
      continue
    }
    if (line.name === 'END' && line.value.trim().toUpperCase() === 'VEVENT') {
      if (current) {
        const built = buildEvent(current, options, maxOccurrences)
        if (built.length === 0) skipped += 1
        events.push(...built)
      }
      current = null
      continue
    }
    if (current) current.push(line)
  }

  return { events, skipped }
}

function buildEvent(lines: Line[], options: ParseIcsOptions, maxOccurrences: number): BusyEvent[] {
  const get = (name: string) => lines.find((l) => l.name === name)
  const dtstart = get('DTSTART')
  if (!dtstart) return []
  const start = parseStamp(dtstart.value)
  if (!start) return []

  const allDay = start.dateOnly || dtstart.params.VALUE?.toUpperCase() === 'DATE'
  const dtend = get('DTEND')
  const end = dtend ? parseStamp(dtend.value)?.at ?? null : null

  // A missing DTEND means a point in time for a timed event, and one whole day
  // for an all-day one. Both are in the spec and both show up in real exports.
  const fallbackEnd = allDay
    ? new Date(start.at.getFullYear(), start.at.getMonth(), start.at.getDate() + 1)
    : new Date(start.at.getTime() + 3600000)
  const durationMs = (end ?? fallbackEnd).getTime() - start.at.getTime()

  const status = get('STATUS')?.value.trim().toUpperCase()
  if (status === 'CANCELLED') return []

  const base = {
    title: unescape(get('SUMMARY')?.value ?? ''),
    location: unescape(get('LOCATION')?.value ?? ''),
    allDay,
    transparency: (get('TRANSP')?.value.trim().toUpperCase() === 'TRANSPARENT'
      ? 'free'
      : 'busy') as BusyEvent['transparency'],
  }
  const uid = unescape(get('UID')?.value ?? '') || `${base.title}-${start.at.getTime()}`

  const rruleLine = get('RRULE')
  const rule = rruleLine ? parseRrule(rruleLine.value) : null
  const starts: Date[] = []
  if (!rule) {
    starts.push(start.at)
  } else {
    for (let n = 0; n < maxOccurrences; n += 1) {
      const at = shift(start.at, rule, n)
      if (at.getTime() > options.to.getTime()) break
      if (rule.until && at.getTime() > rule.until.getTime()) break
      if (rule.count !== null && n >= rule.count) break
      if (at.getTime() + durationMs > options.from.getTime()) starts.push(at)
    }
  }

  return starts
    .filter((at) => at.getTime() < options.to.getTime() && at.getTime() + durationMs > options.from.getTime())
    .map((at, i) => ({
      ...base,
      id: starts.length > 1 ? `${uid}-${i}` : uid,
      startsAt: new Date(at).toISOString(),
      endsAt: new Date(at.getTime() + durationMs).toISOString(),
    }))
}
