/**
 * Ownership rules, proven against the emulator.
 *
 * The claim under test is the one the CRM sprint rests on: a second
 * allowlisted host cannot read the first host's hp_ documents. Both accounts
 * are on the allowlist, so `hpIsHost()` passes for both and the only thing
 * standing between them is the ownerUid condition. That is deliberate: it is
 * exactly the situation in production today, where two UIDs are allowlisted.
 *
 * Run the emulator first:
 *   npm run emulators
 *   npm run test:rules
 */
import { readFileSync } from 'node:fs'
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
  type RulesTestEnvironment,
} from '@firebase/rules-unit-testing'
import {
  collection,
  doc,
  getDoc,
  getDocs,
  query,
  setDoc,
  updateDoc,
  where,
} from 'firebase/firestore'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'

const OWNER = 'owner-host-uid'
const OTHER = 'other-host-uid'
const STRANGER = 'not-on-the-allowlist'

/**
 * Every top-level hp_ collection, with a document body good enough to satisfy
 * its rule. The list is the point of the test: adding a collection without
 * adding it here is the regression this file exists to catch.
 */
const COLLECTIONS = [
  'hp_orgs',
  'hp_events',
  'hp_templates',
  'hp_contacts',
  'hp_availability',
  'hp_moments',
  'hp_guestTokens',
  'hp_people',
  'hp_feedback',
]

let testEnv: RulesTestEnvironment

beforeAll(async () => {
  testEnv = await initializeTestEnvironment({
    projectId: 'demo-novara-host-rules',
    firestore: {
      host: '127.0.0.1',
      port: 8080,
      rules: readFileSync(new URL('../emulator/firestore.rules', import.meta.url), 'utf8'),
    },
  })
})

afterAll(async () => {
  await testEnv?.cleanup()
})

beforeEach(async () => {
  await testEnv.clearFirestore()
  // The allowlist and one document per collection owned by OWNER. Written with
  // rules off, because hp_config is `allow write: if false` by design and the
  // fixtures are meant to predate the test, not be created by it.
  await testEnv.withSecurityRulesDisabled(async (context) => {
    const db = context.firestore()
    await setDoc(doc(db, 'hp_config/allowlist'), { uids: [OWNER, OTHER] })
    for (const name of COLLECTIONS) {
      await setDoc(doc(db, name, 'owned'), { ownerUid: OWNER, name: 'owned by the first host' })
    }
    await setDoc(doc(db, 'hp_events/owned/tasks/t1'), { title: 'a task on the first host event' })
  })
})

const asOwner = () => testEnv.authenticatedContext(OWNER).firestore()
const asOther = () => testEnv.authenticatedContext(OTHER).firestore()

describe('the owner', () => {
  it.each(COLLECTIONS)('reads its own %s document', async (name) => {
    await assertSucceeds(getDoc(doc(asOwner(), name, 'owned')))
  })

  it.each(COLLECTIONS)('lists %s when the query carries the owner filter', async (name) => {
    const snap = await assertSucceeds(
      getDocs(query(collection(asOwner(), name), where('ownerUid', '==', OWNER))),
    )
    expect(snap.size).toBe(1)
  })

  it('reads a subcollection under its own event', async () => {
    await assertSucceeds(getDoc(doc(asOwner(), 'hp_events/owned/tasks/t1')))
  })

  it('creates a document it owns', async () => {
    await assertSucceeds(
      setDoc(doc(asOwner(), 'hp_people', 'fresh'), { ownerUid: OWNER, email: 'a@example.com' }),
    )
  })
})

describe('a second allowlisted host', () => {
  it.each(COLLECTIONS)('cannot read the owner %s document', async (name) => {
    await assertFails(getDoc(doc(asOther(), name, 'owned')))
  })

  it.each(COLLECTIONS)('cannot list %s unfiltered', async (name) => {
    // The interesting failure mode. Without the owner constraint the query is
    // rejected outright, rather than quietly returning the other host's rows.
    await assertFails(getDocs(collection(asOther(), name)))
  })

  it.each(COLLECTIONS)('cannot list %s by claiming the owner uid', async (name) => {
    await assertFails(
      getDocs(query(collection(asOther(), name), where('ownerUid', '==', OWNER))),
    )
  })

  it.each(COLLECTIONS)('cannot overwrite the owner %s document', async (name) => {
    await assertFails(updateDoc(doc(asOther(), name, 'owned'), { name: 'taken' }))
  })

  it('cannot read a subcollection under the owner event', async () => {
    await assertFails(getDoc(doc(asOther(), 'hp_events/owned/tasks/t1')))
  })

  it('cannot create a document stamped with someone else as owner', async () => {
    // Stops the reverse of the read case: planting a row in another host's
    // workspace is as bad as reading one out of it.
    await assertFails(
      setDoc(doc(asOther(), 'hp_people', 'planted'), { ownerUid: OWNER, email: 'b@example.com' }),
    )
  })

  it('creates its own documents normally', async () => {
    await assertSucceeds(
      setDoc(doc(asOther(), 'hp_people', 'mine'), { ownerUid: OTHER, email: 'c@example.com' }),
    )
  })

  it('reads the shared allowlist', async () => {
    // hp_config keeps the plain host check: the allowlist is shared, not owned.
    await assertSucceeds(getDoc(doc(asOther(), 'hp_config/allowlist')))
  })
})

describe('an account that is not on the allowlist', () => {
  const asStranger = () => testEnv.authenticatedContext(STRANGER).firestore()

  it.each(COLLECTIONS)('cannot read %s at all', async (name) => {
    await assertFails(getDoc(doc(asStranger(), name, 'owned')))
  })

  it('cannot create a document even under its own uid', async () => {
    await assertFails(
      setDoc(doc(asStranger(), 'hp_people', 'nope'), { ownerUid: STRANGER, email: 'd@example.com' }),
    )
  })

  it('cannot read the allowlist', async () => {
    await assertFails(getDoc(doc(asStranger(), 'hp_config/allowlist')))
  })
})

describe('a signed-out visitor', () => {
  it.each(COLLECTIONS)('cannot read %s', async (name) => {
    await assertFails(getDoc(doc(testEnv.unauthenticatedContext().firestore(), name, 'owned')))
  })
})
