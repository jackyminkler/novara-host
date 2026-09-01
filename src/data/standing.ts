import type { DateOption, PartyHistory, StandingNote } from './types'
import { toDateKey } from '../lib/dates'

/**
 * M1 standing availability. What a partner's calendar usually looks like,
 * from two sources that must never disagree:
 *
 *  - the pattern, aggregated from every date they have ever answered, and
 *  - the standing notes the host writes on the org.
 *
 * The partner detail page shows both. The dates tab warns with both. Keeping
 * the arithmetic here means one screen can never call a Saturday impossible
 * while the other calls it fine.
 *
 * Pure, so it can be reasoned about without a store: every function takes what
 * it needs and returns a value.
 */

const WEEKDAY_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
const WEEKDAY_LONG = [
  'Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday',
]

/** One weekday of one partner's answers, counted across every event. */
export interface WeekdayPattern {
  /** 0 is Sunday, matching `Date.getDay`. */
  weekday: number
  /** "Sat", for a chip. */
  label: string
  /** "Saturday", for a sentence. */
  longLabel: string
  yes: number
  maybe: number
  no: number
}

/**
 * Two noes and no yes is the floor for saying anything out loud. One no is a
 * busy weekend, not a pattern, and a partner who has said yes to a Saturday
 * once has proved it is possible.
 */
export const PATTERN_MIN_NO = 2

/** Just the option dates, which is all the aggregate needs from an event. */
export interface EventDates {
  id: string
  dateOptions: DateOption[]
}

/**
 * Every org's answers folded into weekday counts, in one pass over the whole
 * history. Keyed by org id, and only the weekdays that carry an answer: a row
 * reading "0 yes, 0 no" is noise on a card that is meant to be glanced at.
 */
export function weekdayPatterns(
  events: EventDates[],
  history: PartyHistory[],
): Map<string, WeekdayPattern[]> {
  const optionsByEvent = new Map(events.map((e) => [e.id, e.dateOptions]))
  // orgId to weekday index to counts, built as it goes so an org with no
  // answers never gets an entry at all.
  const tally = new Map<string, Map<number, WeekdayPattern>>()

  for (const entry of history) {
    const options = optionsByEvent.get(entry.eventId)
    if (!options) continue
    for (const party of entry.parties) {
      for (const [optionId, response] of Object.entries(party.dateResponses ?? {})) {
        const option = options.find((o) => o.id === optionId)
        if (!option) continue
        const weekday = new Date(option.startsAt).getDay()
        if (Number.isNaN(weekday)) continue

        let byWeekday = tally.get(party.orgId)
        if (!byWeekday) {
          byWeekday = new Map()
          tally.set(party.orgId, byWeekday)
        }
        let row = byWeekday.get(weekday)
        if (!row) {
          row = {
            weekday,
            label: WEEKDAY_SHORT[weekday],
            longLabel: WEEKDAY_LONG[weekday],
            yes: 0,
            maybe: 0,
            no: 0,
          }
          byWeekday.set(weekday, row)
        }
        if (response.value === 'yes') row.yes += 1
        else if (response.value === 'maybe') row.maybe += 1
        else if (response.value === 'no') row.no += 1
      }
    }
  }

  const patterns = new Map<string, WeekdayPattern[]>()
  for (const [orgId, byWeekday] of tally) {
    patterns.set(orgId, [...byWeekday.values()].sort((a, b) => a.weekday - b.weekday))
  }
  return patterns
}

/** "3 yes, 1 maybe". Zero counts are left out rather than written as zero. */
export function patternSummary(pattern: WeekdayPattern): string {
  const parts: string[] = []
  if (pattern.yes) parts.push(`${pattern.yes} yes`)
  if (pattern.maybe) parts.push(`${pattern.maybe} maybe`)
  if (pattern.no) parts.push(`${pattern.no} no`)
  return parts.join(', ')
}

/**
 * The blackout covering this date, if there is one. A note with no dates
 * covers nothing: an open-ended blackout would warn on every option forever,
 * which is how a warning stops being read.
 */
export function blackoutOn(standing: StandingNote[], iso: string): StandingNote | null {
  const key = toDateKey(new Date(iso))
  if (!key) return null
  return (
    standing.find((note) => {
      if (note.kind !== 'blackout') return false
      if (!note.startDate && !note.endDate) return false
      if (note.startDate && key < note.startDate) return false
      if (note.endDate && key > note.endDate) return false
      return true
    }) ?? null
  )
}

/**
 * The weekday pattern worth mentioning for this date, if there is one. Only
 * repeated noes with no yes anywhere qualify.
 */
export function patternAgainst(
  patterns: WeekdayPattern[] | undefined,
  iso: string,
): WeekdayPattern | null {
  if (!patterns) return null
  const weekday = new Date(iso).getDay()
  const row = patterns.find((p) => p.weekday === weekday)
  if (!row) return null
  return row.no >= PATTERN_MIN_NO && row.yes === 0 ? row : null
}

/** One org as the warnings need it: who they are and what they have said. */
export interface StandingSubject {
  orgId: string
  orgName: string
  standing: StandingNote[]
}

export interface StandingWarning {
  orgId: string
  /** A blackout is a fact they told you. A pattern is an inference. */
  kind: 'blackout' | 'pattern'
  text: string
}

/**
 * What to say about one proposed date. Neither kind blocks anything: the host
 * can propose a date every partner has refused before, and sometimes should.
 */
export function standingWarnings(
  option: DateOption,
  subjects: StandingSubject[],
  patterns: Map<string, WeekdayPattern[]>,
): StandingWarning[] {
  const warnings: StandingWarning[] = []
  for (const subject of subjects) {
    const blackout = blackoutOn(subject.standing ?? [], option.startsAt)
    if (blackout) {
      warnings.push({
        orgId: subject.orgId,
        kind: 'blackout',
        text: `${subject.orgName} is away then`,
      })
    }
    const pattern = patternAgainst(patterns.get(subject.orgId), option.startsAt)
    if (pattern) {
      warnings.push({
        orgId: subject.orgId,
        kind: 'pattern',
        text: `${subject.orgName} often can't do ${pattern.longLabel}s`,
      })
    }
  }
  return warnings
}
