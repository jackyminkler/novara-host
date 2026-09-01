/**
 * The one copy of hp_people merge semantics.
 *
 * Guest CRM Plan section 3. One person per normalized email, with an embedded
 * per-event registration history. Idempotent: re-running the same export
 * changes nothing, because every write is a full recompute from the union of
 * registrations already stored plus the ones being folded in.
 *
 * This was `seed/import-luma-guests.ts` first, and moved here when CRM-3 put
 * the same import behind a button in the app. Both callers now share these
 * functions rather than each holding a version of the rules. The rules that
 * matter, and that a second copy would eventually get wrong:
 *
 *  - email, trimmed and lowercased, is the dedupe key,
 *  - tier is precedence, not recency,
 *  - notes, followUp and tags belong to the host and an import never clears
 *    them,
 *  - the entry for an event is replaced rather than appended, so a corrected
 *    export updates in place.
 *
 * Pure, and every import here is type only, so the seed scripts can load this
 * module directly under Node's type stripping with nothing to resolve.
 */
import type { CsvRow } from './csv'
import type { CapturedContact, Person, PersonTier, Registration } from '../types'

// The columns every Luma export carries. Anything else on a row is an
// event-specific registration question and belongs in `answers`.
const STANDARD_COLUMNS = new Set([
  'guest_id', 'name', 'first_name', 'last_name', 'email', 'phone_number',
  'created_at', 'approval_status', 'checked_in_at', 'utm_source', 'referrer',
  'referred_by', 'qr_code_url', 'amount', 'amount_tax', 'amount_discount',
  'currency', 'coupon_code', 'eth_address', 'solana_address',
  'survey_response_rating', 'survey_response_feedback', 'ticket_type_id', 'ticket_name',
])

/**
 * A person as stored. The document shape is defined once, in the app's own
 * types; two hand-kept copies would drift the first time a field was added.
 */
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

export function blankPerson(ownerUid: string, email: string): PersonDoc {
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

/**
 * The tag a promoted capture carries, so where a person came from stays
 * readable after the fact and a second promotion can find them again.
 */
export const CAPTURE_TAG = 'met in person'

/**
 * Fold a captured contact into a person, or build a new one from it.
 *
 * Someone met at an event has no registration, so there is nothing for the
 * tier rules to read. `invited_only` is the least wrong of the three: they are
 * on the list without having signed up for anything, where `declined_only`
 * would read as a refusal that never happened. It corrects itself the first
 * time a real export carries them, because every import recomputes the tier.
 *
 * The host's own fields are additive, never overwritten. A note already on the
 * person keeps its place and the capture note is appended under it, and an
 * existing follow-up is left alone rather than replaced by the capture's.
 */
export function personFromContact(
  contact: CapturedContact,
  ownerUid: string,
  existing: PersonDoc | null,
): PersonDoc {
  const email = normalizeEmail(contact.handles.email ?? '')
  const person = existing
    ? (JSON.parse(JSON.stringify(existing)) as PersonDoc)
    : blankPerson(ownerUid, email)

  const words = contact.name.trim().split(/\s+/).filter(Boolean)
  person.fullName = person.fullName || contact.name.trim()
  person.firstName = person.firstName || (words[0] ?? '')
  person.lastName = person.lastName || words.slice(1).join(' ')
  person.phone = person.phone || contact.handles.phone || null
  person.handles = {
    ...person.handles,
    ...(contact.handles.instagram ? { instagram: contact.handles.instagram } : {}),
    ...(contact.handles.linkedin ? { linkedin: contact.handles.linkedin } : {}),
  }

  const note = contact.note.trim()
  if (note && !person.notes.includes(note)) {
    person.notes = person.notes ? `${person.notes}\n\n${note}` : note
  }
  if (!person.followUp && contact.followUp) person.followUp = { ...contact.followUp }
  if (!person.tags.includes(CAPTURE_TAG)) person.tags = [...person.tags, CAPTURE_TAG]

  person.sources = uniq([...person.sources, 'capture'])
  person.firstSeenAt = person.firstSeenAt || contact.capturedAt
  if (contact.capturedAt > person.lastSeenAt) person.lastSeenAt = contact.capturedAt
  person.tier = person.registrations.length ? tierFrom(person.registrations) : 'invited_only'
  person.eventCount = person.registrations.filter((r) => r.status === 'approved').length
  person.ownerUid = ownerUid
  person.email = person.email || email

  return person
}

/** What one import did. Unchanged is the number that proves it is idempotent. */
export interface ImportSummary {
  added: number
  updated: number
  unchanged: number
}

/**
 * Fold a whole export into a set of people already held, and say what moved.
 *
 * `unchanged` is a real comparison rather than a count of rows that matched an
 * email: re-importing the same file has to report every row as unchanged, and
 * only comparing the person before and after can tell you that. Callers get
 * the merged map back and write it however their backend writes.
 */
export function mergeRows(
  existing: PersonDoc[],
  rows: CsvRow[],
  eventKey: string,
  lumaEventId: string | null,
  ownerUid: string,
): { people: Map<string, PersonDoc>; summary: ImportSummary; touched: Set<string> } {
  const people = new Map<string, PersonDoc>()
  const before = new Map<string, string>()
  for (const person of existing) {
    // A copy, so the caller's rows are not mutated under it by applyRow.
    people.set(person.email, JSON.parse(JSON.stringify(person)) as PersonDoc)
    before.set(person.email, JSON.stringify(person))
  }

  const touched = new Set<string>()
  for (const row of rows) {
    const email = normalizeEmail(row.email ?? '')
    applyRow(people, row, eventKey, lumaEventId, ownerUid)
    touched.add(email)
  }

  const summary: ImportSummary = { added: 0, updated: 0, unchanged: 0 }
  for (const email of touched) {
    const was = before.get(email)
    if (was === undefined) summary.added += 1
    else if (was === JSON.stringify(people.get(email))) summary.unchanged += 1
    else summary.updated += 1
  }

  return { people, summary, touched }
}
