/**
 * The Firestore half of the hp_people import, kept in its own module so
 * `--offline` never loads firebase-admin and never needs credentials.
 */
import { adminDb } from './admin.mjs'
import type { Person } from './import-luma-guests.ts'

const COLLECTION = 'hp_people'
const BATCH_LIMIT = 500

/** Document id per email, so a second run updates in place instead of duplicating. */
const idsByEmail = new Map<string, string>()

/**
 * Load every person this owner already has into the working map. One read of
 * the collection beats a per-email query: at ~1,200 people that is one pass
 * instead of 1,200 round trips, and the merge needs the whole set anyway.
 */
export async function loadExistingPeople(
  people: Map<string, Person>,
  ownerUid: string,
): Promise<number> {
  const snap = await adminDb().collection(COLLECTION).where('ownerUid', '==', ownerUid).get()
  for (const doc of snap.docs) {
    const person = doc.data() as Person
    idsByEmail.set(person.email, doc.id)
    people.set(person.email, person)
  }
  return snap.size
}

export async function writePeople(people: Map<string, Person>, ownerUid: string): Promise<number> {
  const store = adminDb()
  const entries = [...people.values()]

  for (let i = 0; i < entries.length; i += BATCH_LIMIT) {
    const batch = store.batch()
    for (const person of entries.slice(i, i + BATCH_LIMIT)) {
      const existingId = idsByEmail.get(person.email)
      const ref = existingId
        ? store.collection(COLLECTION).doc(existingId)
        : store.collection(COLLECTION).doc()
      // Full replace, not merge: every derived field was recomputed from the
      // union of stored and incoming registrations, so a partial write could
      // leave a stale tier or eventCount behind.
      batch.set(ref, { ...person, ownerUid })
    }
    await batch.commit()
    console.log(`  committed ${Math.min(i + BATCH_LIMIT, entries.length)} of ${entries.length}`)
  }
  return entries.length
}
