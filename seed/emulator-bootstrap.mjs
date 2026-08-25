/**
 * Put the pieces the emulator needs into the emulator, so the whole host app
 * can be exercised end to end with no project credentials.
 *
 *   FIRESTORE_EMULATOR_HOST=127.0.0.1:8080 node seed/emulator-bootstrap.mjs UID [UID...]
 *
 * Writes hp_config/allowlist with the UIDs given. In production that document
 * is `allow write: if false` and is edited in the Firebase console, which is
 * why this is a separate script and refuses to run against a real project.
 */
import { adminDb, usingEmulator } from './admin.mjs'

if (!usingEmulator) {
  console.error('This script only runs against an emulator. Set FIRESTORE_EMULATOR_HOST.')
  process.exit(1)
}

const uids = process.argv.slice(2)
if (!uids.length) {
  console.error('Pass at least one UID to put on the allowlist.')
  process.exit(1)
}

await adminDb().collection('hp_config').doc('allowlist').set({ uids })
console.log(`hp_config/allowlist now holds ${uids.length} uid(s): ${uids.join(', ')}`)
process.exit(0)
