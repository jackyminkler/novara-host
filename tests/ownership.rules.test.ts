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
const NEWCOMER = 'a-brand-new-account'

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
  'hp_profiles',
]

/**
 * Every subcollection of hp_events. These inherit their owner from the parent
 * event through hpOwnsEvent(), and each one needs its own explicit match
 * block: a collection-group rule would span the consumer app's subcollections
 * in the shared ruleset, so the list here is what proves the blocks exist.
 */
const SUBCOLLECTIONS = ['parties', 'tasks', 'runOfShow', 'crew', 'log', 'matching']

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
    for (const name of SUBCOLLECTIONS) {
      await setDoc(doc(db, 'hp_events/owned', name, 'row'), { note: 'under the first host event' })
    }
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

  it.each(SUBCOLLECTIONS)('reads %s under its own event', async (name) => {
    await assertSucceeds(getDoc(doc(asOwner(), 'hp_events/owned', name, 'row')))
  })

  it.each(SUBCOLLECTIONS)('writes %s under its own event', async (name) => {
    await assertSucceeds(
      setDoc(doc(asOwner(), 'hp_events/owned', name, 'fresh'), { note: 'mine to write' }),
    )
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

  it.each(SUBCOLLECTIONS)('cannot read %s under the owner event', async (name) => {
    await assertFails(getDoc(doc(asOther(), 'hp_events/owned', name, 'row')))
  })

  it.each(SUBCOLLECTIONS)('cannot write %s under the owner event', async (name) => {
    // The reverse of the read case. A matching run or a deliverable planted in
    // someone else's event is as bad as one read out of it.
    await assertFails(
      setDoc(doc(asOther(), 'hp_events/owned', name, 'planted'), { note: 'not mine' }),
    )
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

  it('cannot read the retired allowlist either', async () => {
    // hp_config used to be readable by any host, because the allowlist was
    // shared rather than owned. Open signup retired it, and nothing reads it
    // now, so it is denied to everyone rather than left quietly readable.
    await assertFails(getDoc(doc(asOther(), 'hp_config/allowlist')))
  })
})

// Open signup, 2026-08-25: signing in is the whole gate, so a brand new
// account IS a host. These cases changed shape rather than disappearing, and
// they are now the ones that matter most: the guarantee is no longer "we let
// the right people in", it is "everyone is let in and still sees only their
// own".
describe('a brand new account', () => {
  const asNewcomer = () => testEnv.authenticatedContext(NEWCOMER).firestore()

  it.each(COLLECTIONS)('still cannot read the owner %s document', async (name) => {
    await assertFails(getDoc(doc(asNewcomer(), name, 'owned')))
  })

  it.each(COLLECTIONS)('still cannot list %s by claiming the owner uid', async (name) => {
    await assertFails(
      getDocs(query(collection(asNewcomer(), name), where('ownerUid', '==', OWNER))),
    )
  })

  it('can create its own document, which is the point of open signup', async () => {
    await assertSucceeds(
      setDoc(doc(asNewcomer(), 'hp_people', 'mine'), { ownerUid: NEWCOMER, email: 'd@example.com' }),
    )
  })

  it('cannot create a document owned by someone else', async () => {
    await assertFails(
      setDoc(doc(asNewcomer(), 'hp_people', 'theirs'), { ownerUid: OWNER, email: 'e@example.com' }),
    )
  })

  it('cannot read the retired allowlist document', async () => {
    await assertFails(getDoc(doc(asNewcomer(), 'hp_config/allowlist')))
  })
})

describe('a signed-out visitor', () => {
  it.each(COLLECTIONS)('cannot read %s', async (name) => {
    await assertFails(getDoc(doc(testEnv.unauthenticatedContext().firestore(), name, 'owned')))
  })

  it.each(COLLECTIONS)('cannot create %s either', async (name) => {
    await assertFails(
      setDoc(doc(testEnv.unauthenticatedContext().firestore(), name, 'nope'), { ownerUid: 'anyone' }),
    )
  })
})
