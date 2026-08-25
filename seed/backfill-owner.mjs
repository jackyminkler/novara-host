/**
 * One-time backfill: stamp `ownerUid` on every top-level hp_ document written
 * before the field existed.
 *
 * Run this BEFORE the owner-scoped rules are applied. The new rules read
 * `ownerUid` off the stored document, so applying them first would lock the
 * host out of her own data until this finishes.
 *
 *   node seed/backfill-owner.mjs --owner UID                 dry run, prints the plan
 *   node seed/backfill-owner.mjs --owner UID --write         actually writes
 *   FIRESTORE_EMULATOR_HOST=127.0.0.1:8080 node seed/backfill-owner.mjs --owner UID --write
 *
 * Dry run is the default on purpose: this touches every hp_ collection at once.
 * Idempotent, because a document that already carries `ownerUid` is skipped.
 */
import { adminDb, announceTarget } from './admin.mjs'

/**
 * Where each collection's owner comes from when `ownerUid` is missing.
 *
 * `legacy` is the field that already meant "the host who made this". Those
 * fields keep their original meaning and are left in place; the backfill only
 * copies them across. Collections with no legacy field fall back to --owner,
 * which is correct while one host owns everything and is exactly why this
 * script is a one-time migration rather than something to keep around.
 */
const COLLECTIONS = [
  { name: 'hp_orgs', legacy: 'createdBy' },
  { name: 'hp_events', legacy: 'hostUid' },
  { name: 'hp_templates', legacy: 'ownerUid' },
  { name: 'hp_contacts', legacy: 'capturedBy' },
  { name: 'hp_availability', legacy: null },
  { name: 'hp_moments', legacy: null },
  // Tokens belong to whoever owns the event they open, not to whoever ran this
  // script. Resolved per document below.
  { name: 'hp_guestTokens', legacy: null, fromEvent: true },
]

const args = process.argv.slice(2)
const write = args.includes('--write')
const owner = args[args.indexOf('--owner') + 1]

if (!args.includes('--owner') || !owner || owner.startsWith('--')) {
  console.error('Pass --owner UID. It must be the host UID from hp_config/allowlist.')
  process.exit(1)
}

announceTarget()
console.log(`fallback owner: ${owner}`)
console.log(write ? 'MODE: writing\n' : 'MODE: dry run, nothing will be written\n')

const db = adminDb()

/** Cache of event id to owner, so a run of tokens costs one read per event. */
const eventOwners = new Map()

async function ownerOfEvent(eventId) {
  if (!eventId) return owner
  if (!eventOwners.has(eventId)) {
    const snap = await db.collection('hp_events').doc(eventId).get()
    eventOwners.set(eventId, snap.get('ownerUid') ?? snap.get('hostUid') ?? owner)
  }
  return eventOwners.get(eventId)
}

let totalStamped = 0
let totalSkipped = 0

for (const collection of COLLECTIONS) {
  const snap = await db.collection(collection.name).get()
  let stamped = 0
  let skipped = 0
  let batch = db.batch()
  let pending = 0

  for (const doc of snap.docs) {
    if (doc.get('ownerUid')) {
      skipped++
      continue
    }
    const resolved = collection.fromEvent
      ? await ownerOfEvent(doc.get('eventId'))
      : (collection.legacy && doc.get(collection.legacy)) || owner

    stamped++
    if (write) {
      batch.update(doc.ref, { ownerUid: resolved })
      pending++
      // Firestore caps a batch at 500 writes.
      if (pending === 500) {
        await batch.commit()
        batch = db.batch()
        pending = 0
      }
    }
  }
  if (write && pending) await batch.commit()

  console.log(
    `${collection.name.padEnd(18)} ${String(snap.size).padStart(5)} docs, ` +
      `${String(stamped).padStart(5)} to stamp, ${String(skipped).padStart(5)} already owned`,
  )
  totalStamped += stamped
  totalSkipped += skipped
}

console.log(`\n${totalStamped} to stamp, ${totalSkipped} already owned.`)
console.log(
  write
    ? 'Backfill complete. Read a few documents back, then apply the rules block.'
    : 'Dry run complete. Re-run with --write when the plan above looks right.',
)
process.exit(0)
