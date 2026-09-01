/**
 * Set `appUserUid` on hp_people from an already-verified email join.
 *
 * This is the record-to-identity link from
 * `docs/Partner_Identity_And_Linking_Model_v1.md`: a nullable pointer from the
 * host's private record to the person's own consumer-app account. It is a
 * pointer, never a copy, so nothing about the person's profile is written here
 * and no note of the host's is exposed by setting it.
 *
 *   node seed/link-app-users.ts --csv path/to/master-contacts.csv --owner UID
 *   ... --write            actually write. Dry run is the default.
 *
 * Only rows whose match type is exactly `email` are linked. The `name-possible`
 * rows are a guess about who someone is, and a wrong guess here silently
 * attributes one person's app activity to another, so they stay null until a
 * human confirms them. That is the "suggested, never automatic" rule of the
 * identity model applied to a bulk backfill.
 */
import { readFileSync } from 'node:fs'
import { parseCsvRecords } from '../src/data/people/csv.ts'
import { normalizeEmail } from '../src/data/people/merge.ts'
import { adminDb, announceTarget } from './admin.mjs'

const CONFIRMED_MATCH = 'email'

const argv = process.argv.slice(2)
const flag = (name: string): string | undefined => {
  const i = argv.indexOf(name)
  return i === -1 ? undefined : argv[i + 1]
}

const csvPath = flag('--csv')
const owner = flag('--owner') ?? process.env.HOST_UID ?? ''
const write = argv.includes('--write')

if (!csvPath) throw new Error('pass --csv path/to/master-contacts.csv')
if (!owner) throw new Error('set --owner or HOST_UID. It must be in hp_config/allowlist.')

announceTarget()
console.log(write ? 'MODE: writing\n' : 'MODE: dry run, nothing will be written\n')

const { rows } = parseCsvRecords(readFileSync(csvPath, 'utf8'))

/** email -> app uid, for the rows a human already confirmed by email. */
const confirmed = new Map<string, string>()
let skippedUnconfirmed = 0
for (const row of rows) {
  const uid = (row.app_uid ?? '').trim()
  if (!uid) continue
  if ((row.app_match_type ?? '').trim() !== CONFIRMED_MATCH) {
    skippedUnconfirmed++
    continue
  }
  confirmed.set(normalizeEmail(row.email ?? ''), uid)
}
console.log(`${confirmed.size} confirmed email matches in the file`)
if (skippedUnconfirmed) console.log(`${skippedUnconfirmed} unconfirmed matches left unlinked`)

const db = adminDb()
const snap = await db.collection('hp_people').where('ownerUid', '==', owner).get()

let linked = 0
let alreadyLinked = 0
let notFound = new Set(confirmed.keys())
const batch = db.batch()

for (const doc of snap.docs) {
  const uid = confirmed.get(normalizeEmail(doc.get('email') ?? ''))
  if (!uid) continue
  notFound.delete(normalizeEmail(doc.get('email') ?? ''))
  if (doc.get('appUserUid') === uid) {
    alreadyLinked++
    continue
  }
  linked++
  if (write) batch.update(doc.ref, { appUserUid: uid })
}
if (write && linked) await batch.commit()

console.log(`\n${snap.size} people read for this owner`)
console.log(`${linked} to link, ${alreadyLinked} already linked, ${notFound.size} confirmed emails with no person record`)
console.log(write ? 'Link complete.' : 'Dry run complete. Re-run with --write when this looks right.')
process.exit(0)
