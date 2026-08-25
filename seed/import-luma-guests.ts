/**
 * CRM-0: import Luma guest exports into hp_people.
 *
 * Guest CRM Plan section 3. One person per normalized email, with an embedded
 * per-event registration history. Idempotent: re-running the same export
 * changes nothing, because every write is a full recompute from the union of
 * registrations already stored plus the ones in the files given.
 *
 * Personal data stays data (PRD guardrail 6): every path and event key is an
 * argument, nothing about Jacky's events is hardcoded here.
 *
 *   node seed/import-luma-guests.ts --offline \
 *     --event 2026-03-21-crissy-field-launch --csv path/to/guests-export-luma.csv \
 *     --event 2026-06-13-sunrise-run-2 --luma-id evt-tzCKKD80P3Qg8Z4 --csv path/to/other.csv
 *
 *   --offline    no Firestore at all: parse, merge, print the totals. Verification.
 *   --dry-run    read Firestore, report adds and updates, write nothing.
 *   (neither)    write.
 *   --owner UID  owner to stamp. Defaults to $HOST_UID.
 */
import { readFileSync } from 'node:fs'
import { pathToFileURL } from 'node:url'
import { parseCsvRecords, type CsvRow } from './csv.ts'
import type { Person, PersonTier, Registration } from '../src/data/types.ts'

// The columns every Luma export carries. Anything else on a row is an
// event-specific registration question and belongs in `answers`.
const STANDARD_COLUMNS = new Set([
  'guest_id', 'name', 'first_name', 'last_name', 'email', 'phone_number',
  'created_at', 'approval_status', 'checked_in_at', 'utm_source', 'referrer',
  'referred_by', 'qr_code_url', 'amount', 'amount_tax', 'amount_discount',
  'currency', 'coupon_code', 'eth_address', 'solana_address',
  'survey_response_rating', 'survey_response_feedback', 'ticket_type_id', 'ticket_name',
])

// The document shape is defined once, in the app's own types, and imported
// here. Two hand-kept copies of this shape would drift the first time a field
// is added, and the importer is the only writer, so drift would be silent.
export type PersonDoc = Omit<Person, 'id'>

/** The dedupe key. Everything downstream assumes email is already through this. */
export const normalizeEmail = (raw: string): string => raw.trim().toLowerCase()

const uniq = (values: (string | null | undefined)[]): string[] =>
  [...new Set(values.map((v) => (v ?? '').trim()).filter(Boolean))]

/**
 * Tier is precedence, not recency: approved anywhere wins over invited
 * anywhere, which wins over declined. Someone who declined one run and came to
 * another is signed_up, and declined_only means never approved for anything.
 */
export function tierFrom(registrations: Registration[]): PersonTier {
  if (registrations.some((r) => r.status === 'approved')) return 'signed_up'
  if (registrations.some((r) => r.status === 'invited')) return 'invited_only'
  return 'declined_only'
}

function registrationFrom(row: CsvRow, eventKey: string, lumaEventId: string | null): Registration {
  const answers: Record<string, string> = {}
  for (const [key, value] of Object.entries(row)) {
    if (!STANDARD_COLUMNS.has(key) && value) answers[key] = value
  }
  const rating = Number.parseInt(row.survey_response_rating ?? '', 10)
  return {
    eventKey,
    lumaEventId,
    status: (row.approval_status || 'invited') as Registration['status'],
    registeredAt: row.created_at || '',
    checkedInAt: row.checked_in_at || null,
    // utm_source is the campaign tag, referrer the Luma surface. Either can be
    // the only one present, so take whichever the row actually carries.
    source: row.utm_source || row.referrer || null,
    surveyRating: Number.isFinite(rating) ? rating : null,
    surveyFeedback: row.survey_response_feedback || null,
    answers,
  }
}

/** Lift a LinkedIn registration answer up to handles, where the app looks for it. */
function linkedinFrom(answers: Record<string, string>): string | undefined {
  const key = Object.keys(answers).find((k) => /linkedin/i.test(k))
  return key ? answers[key] : undefined
}

function blankPerson(ownerUid: string, email: string): PersonDoc {
  return {
    ownerUid, email,
    firstName: '', lastName: '', fullName: '',
    phone: null, handles: {}, appUserUid: null,
    tier: 'declined_only', eventCount: 0,
    firstSeenAt: '', lastSeenAt: '',
    sources: [], referredBy: [],
    notes: '', followUp: null, tags: [],
    registrations: [],
  }
}

/**
 * Fold one export row into a person. Host-written fields (notes, followUp,
 * tags, appUserUid) are never touched: an import must not clear what the host
 * typed. Everything else is derived and recomputed in full.
 */
export function applyRow(
  people: Map<string, PersonDoc>,
  row: CsvRow,
  eventKey: string,
  lumaEventId: string | null,
  ownerUid: string,
): 'created' | 'updated' {
  const email = normalizeEmail(row.email ?? '')
  if (!email) throw new Error(`row for "${row.name}" has no email, which is the dedupe key`)

  const existing = people.get(email)
  const person = existing ?? blankPerson(ownerUid, email)
  const outcome = existing ? 'updated' : 'created'

  const registration = registrationFrom(row, eventKey, lumaEventId)
  // Replace the entry for this event rather than appending, so a re-import of
  // a corrected export updates in place instead of duplicating the event.
  const others = person.registrations.filter((r) => r.eventKey !== eventKey)
  person.registrations = [...others, registration].sort((a, b) =>
    a.registeredAt.localeCompare(b.registeredAt),
  )

  // Latest export wins on identity, since names get corrected between events.
  person.firstName = row.first_name || person.firstName
  person.lastName = row.last_name || person.lastName
  person.fullName = row.name || person.fullName
  person.phone = row.phone_number || person.phone

  const linkedin = linkedinFrom(registration.answers)
  if (linkedin) person.handles = { ...person.handles, linkedin }

  person.sources = uniq([...person.sources, row.utm_source, row.referrer])
  person.referredBy = uniq([...person.referredBy, row.referred_by])

  const stamps = person.registrations.map((r) => r.registeredAt).filter(Boolean).sort()
  person.firstSeenAt = stamps[0] ?? ''
  person.lastSeenAt = stamps[stamps.length - 1] ?? ''

  person.tier = tierFrom(person.registrations)
  person.eventCount = person.registrations.filter((r) => r.status === 'approved').length
  person.ownerUid = ownerUid

  people.set(email, person)
  return outcome
}

// ---------------------------------------------------------------- CLI

interface Job { eventKey: string; csvPath: string; lumaEventId: string | null }

function parseArgs(argv: string[]) {
  const jobs: Job[] = []
  const flags = { offline: false, dryRun: false, owner: process.env.HOST_UID ?? '' }

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]
    const value = argv[i + 1]
    // --event opens a job; --csv and --luma-id attach to the one in hand, so
    // the flags can repeat for as many exports as you pass.
    if (arg === '--event') { jobs.push({ eventKey: value, csvPath: '', lumaEventId: null }); i++ }
    else if (arg === '--csv') { requireJob(jobs, arg).csvPath = value; i++ }
    else if (arg === '--luma-id') { requireJob(jobs, arg).lumaEventId = value; i++ }
    else if (arg === '--owner') { flags.owner = value; i++ }
    else if (arg === '--offline') flags.offline = true
    else if (arg === '--dry-run') flags.dryRun = true
    else throw new Error(`unknown argument ${arg}`)
  }
  for (const job of jobs) if (!job.csvPath) throw new Error(`--event ${job.eventKey} has no --csv`)
  return { jobs, flags }
}

function requireJob(jobs: Job[], flag: string): Job {
  if (!jobs.length) throw new Error(`${flag} must follow an --event`)
  return jobs[jobs.length - 1]
}

async function main() {
  const { jobs, flags } = parseArgs(process.argv.slice(2))
  if (!jobs.length) throw new Error('nothing to import. Pass at least one --event with a --csv.')
  if (!flags.owner) throw new Error('set --owner or HOST_UID. It must be in hp_config/allowlist.')

  const people = new Map<string, PersonDoc>()
  let existingCount = 0

  // Offline skips Firestore entirely, so the merge can be checked against known
  // totals without credentials and without touching the database.
  if (!flags.offline) {
    const { loadExistingPeople } = await import('./people-store.ts')
    existingCount = await loadExistingPeople(people, flags.owner)
    console.log(`read ${existingCount} existing people for this owner\n`)
  }

  for (const job of jobs) {
    const { rows } = parseCsvRecords(readFileSync(job.csvPath, 'utf8'))
    let created = 0
    for (const row of rows) {
      if (applyRow(people, row, job.eventKey, job.lumaEventId, flags.owner) === 'created') created++
    }
    console.log(`${job.eventKey}: ${rows.length} rows, ${created} new to the list`)
  }

  const byTier = { signed_up: 0, invited_only: 0, declined_only: 0 }
  for (const person of people.values()) byTier[person.tier]++
  const repeat = [...people.values()].filter((p) => p.eventCount >= 2).length

  console.log(`\ntotal people      ${people.size}`)
  console.log(`  signed_up       ${byTier.signed_up}`)
  console.log(`  invited_only    ${byTier.invited_only}`)
  console.log(`  declined_only   ${byTier.declined_only}`)
  console.log(`  2+ events       ${repeat}`)

  if (flags.offline) { console.log('\nOffline, nothing read and nothing written.'); return }
  if (flags.dryRun) { console.log('\nDry run, nothing written.'); return }

  const { writePeople } = await import('./people-store.ts')
  const written = await writePeople(people, flags.owner)
  console.log(`\nWrote ${written} people to hp_people.`)
}

// Only run the CLI when this file is the entry point. The pure functions above
// are importable on their own, which is how the merge gets checked without
// firing an import as a side effect of reading the module.
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((err: unknown) => {
    console.error(`\n${err instanceof Error ? err.message : String(err)}`)
    process.exit(1)
  })
}
