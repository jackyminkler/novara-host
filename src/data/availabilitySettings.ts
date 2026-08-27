import { DEFAULT_KINDS, DEFAULT_OPEN_HOURS, DEFAULT_RULES, currentZone } from '../lib/availability'
import type { AvailabilitySettings, DayHoursDoc, KindTemplateDoc } from './types'

/**
 * Fill in whatever a stored settings document is missing.
 *
 * Applied on read in both api implementations, so nothing downstream has to
 * guard. This exists because the published shape changed from an enumerated
 * list of start times to open windows, and a document written before that
 * change has no `windows` field at all: reading `.length` off it took the
 * whole page down. Any future shape change lands here rather than in the UI.
 */
export function normalizeAvailability(
  raw: Partial<AvailabilitySettings> | null | undefined,
  ownerUid: string,
): AvailabilitySettings | null {
  if (!raw) return null
  return {
    ownerUid: raw.ownerUid ?? ownerUid,
    openHours: sevenDays(raw.openHours),
    timeZone: typeof raw.timeZone === 'string' && raw.timeZone ? raw.timeZone : currentZone(),
    bufferMinutes: numberOr(raw.bufferMinutes, DEFAULT_RULES.bufferMinutes),
    kinds: kindsOr(raw.kinds),
    defaultHorizonDays: numberOr(raw.defaultHorizonDays, 90),
    windows: Array.isArray(raw.windows)
      ? raw.windows.filter((w) => typeof w?.s === 'number' && typeof w?.e === 'number' && w.e > w.s)
      : [],
    source: raw.source ?? null,
    googleCalendarIds: Array.isArray(raw.googleCalendarIds) ? raw.googleCalendarIds : [],
    calendarImportedAt: raw.calendarImportedAt ?? null,
    importedEventCount: numberOr(raw.importedEventCount, 0),
  }
}

function numberOr(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback
}

/**
 * Always exactly seven entries, so `openHours[day.getDay()]` cannot be
 * undefined, and every entry carries its own hours whether open or closed.
 *
 * Migrates the earlier shape, where a closed day was stored as null and its
 * hours were lost. A null becomes a closed day with the default hours, which
 * is the best that can be recovered and is what reopening it would have given
 * anyway.
 */
function sevenDays(value: unknown): DayHoursDoc[] {
  if (!Array.isArray(value) || value.length !== 7) return DEFAULT_OPEN_HOURS
  return value.map((day, i) => {
    const fallback = DEFAULT_OPEN_HOURS[i] ?? { start: '08:00', end: '21:00', open: true }
    if (day === null) return { ...fallback, open: false }
    if (typeof day?.start !== 'string' || typeof day?.end !== 'string') return fallback
    // An older document has no `open` field, and its presence meant open.
    return { start: day.start, end: day.end, open: day.open !== false }
  })
}

function kindsOr(value: unknown): KindTemplateDoc[] {
  if (!Array.isArray(value) || value.length === 0) return DEFAULT_KINDS
  const cleaned = value.filter(
    (k): k is KindTemplateDoc =>
      typeof k?.kind === 'string' && typeof k?.label === 'string' && typeof k?.defaultMinutes === 'number',
  )
  return cleaned.length > 0 ? cleaned : DEFAULT_KINDS
}
