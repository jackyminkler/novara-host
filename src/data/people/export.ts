import { toCsv } from './csv'
import type { Person } from '../types'

/**
 * CRM-2. The current view of the people list as a CSV file.
 *
 * Whatever is on screen after the segment, the search and the filters is what
 * comes out, because the export exists to get a segment somewhere else: a
 * mail merge, a spreadsheet, an upload form. A file that quietly held more
 * than the screen showed would be a privacy surprise rather than a feature.
 *
 * Derived fields only. Notes are the host's own and stay in the app.
 */
const COLUMNS = ['fullName', 'email', 'phone', 'tier', 'eventCount', 'lastSeenAt', 'tags']

/** Tags are joined with a pipe, so a tag containing a comma survives the trip. */
export function peopleCsv(people: Person[]): string {
  const rows = people.map((person) => [
    person.fullName,
    person.email,
    person.phone ?? '',
    person.tier,
    String(person.eventCount),
    person.lastSeenAt,
    person.tags.join('|'),
  ])
  return toCsv(COLUMNS, rows)
}

/** "novara-people-2026-08-26.csv". Dated, because two exports are two days. */
export function peopleCsvName(today = new Date()): string {
  const month = `${today.getMonth() + 1}`.padStart(2, '0')
  const day = `${today.getDate()}`.padStart(2, '0')
  return `novara-people-${today.getFullYear()}-${month}-${day}.csv`
}
