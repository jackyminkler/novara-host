/**
 * Import captured contacts into hp_contacts.
 * Standalone: touches no existing seed code.
 *
 *   node seed/seed-contacts.mjs [path/to/contacts.json]
 *   FIRESTORE_EMULATOR_HOST=127.0.0.1:8080 node seed/seed-contacts.mjs   emulator
 *
 * Idempotent by name, same upsert convention as seed.mjs.
 */
import { readFileSync } from 'node:fs'
import { adminDb, announceTarget } from './admin.mjs'

const file = process.argv[2] || new URL('./contacts.json', import.meta.url).pathname
const { contacts, ownerUid } = JSON.parse(readFileSync(file, 'utf8'))

const uid = ownerUid || process.env.HOST_UID
if (!uid) {
  console.error('Set ownerUid in the json or HOST_UID in the environment. It must be in hp_config/allowlist.')
  process.exit(1)
}

announceTarget()
const db = adminDb()

let created = 0, updated = 0
for (const c of contacts) {
  const doc = {
    name: c.name,
    handles: c.handles || {},
    eventId: c.eventId ?? null,
    note: c.note || '',
    followUp: c.followUp ?? null,
    capturedAt: new Date().toISOString(),
    capturedBy: uid,
    // Same field on every hp_ document: the rules and every list query read it.
    ownerUid: uid,
  }
  const existing = await db
    .collection('hp_contacts')
    .where('name', '==', c.name)
    .where('ownerUid', '==', uid)
    .limit(1)
    .get()
  if (existing.empty) {
    await db.collection('hp_contacts').add(doc)
    created++
  } else {
    // keep the original capture timestamp on an update
    const { capturedAt, ...patch } = doc
    await existing.docs[0].ref.update(patch)
    updated++
  }
  console.log(`  ${existing.empty ? 'created' : 'updated'}  ${c.name}`)
}
console.log(`\n${created} created, ${updated} updated in hp_contacts.`)
