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
  documentId,
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
  // Personal availability, deployed 2026-08-29 and verified by Rules API
  // read-back 2026-08-31 — but never rehearsed here until now. These three
  // carry the standard ownerUid shape. hp_availabilitySettings does not (it
  // is keyed by uid) and gets its own describe block below.
  'hp_friendLinks',
  'hp_bookings',
  'hp_huddles',
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
    // The uid-keyed singleton: the document id is the owner, so the fixture
    // lives at the owner's uid rather than at a fixture name.
    await setDoc(doc(db, 'hp_availabilitySettings', OWNER), {
      timezone: 'America/Los_Angeles',
      weekly: { sat: ['07:00-10:00'] },
    })
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

  it.each(COLLECTIONS)('updates its own %s document', async (name) => {
    await assertSucceeds(updateDoc(doc(asOwner(), name, 'owned'), { name: 'renamed by the owner' }))
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

  it.each(COLLECTIONS)('cannot create a %s document owned by someone else', async (name) => {
    await assertFails(
      setDoc(doc(asNewcomer(), name, 'theirs'), { ownerUid: OWNER, email: 'e@example.com' }),
    )
  })

  it('cannot read the retired allowlist document', async () => {
    await assertFails(getDoc(doc(asNewcomer(), 'hp_config/allowlist')))
  })
})

// hp_availabilitySettings is keyed by uid: one document per host, and the
// owner check is on the document id, not an ownerUid field. The deployed
// block trusts the address rather than a field — no write, however buggy,
// can produce a document whose id and owner disagree in a way the rule
// would accept — so these cases address documents by uid instead of by a
// fixture name. Do not fold this collection into COLLECTIONS above: its
// fixture body carries no ownerUid on purpose.
describe('availability settings, keyed by uid', () => {
  const asNewcomer = () => testEnv.authenticatedContext(NEWCOMER).firestore()

  it('the owner reads the document at their own uid', async () => {
    await assertSucceeds(getDoc(doc(asOwner(), 'hp_availabilitySettings', OWNER)))
  })

  it('the owner writes the document at their own uid', async () => {
    await assertSucceeds(
      setDoc(doc(asOwner(), 'hp_availabilitySettings', OWNER), {
        timezone: 'America/Los_Angeles',
        weekly: { sun: ['08:00-11:00'] },
      }),
    )
  })

  it('the owner lists their own row when the query is pinned to their uid', async () => {
    const snap = await assertSucceeds(
      getDocs(
        query(collection(asOwner(), 'hp_availabilitySettings'), where(documentId(), '==', OWNER)),
      ),
    )
    expect(snap.size).toBe(1)
  })

  it('a second signed-in host cannot read the owner document', async () => {
    await assertFails(getDoc(doc(asOther(), 'hp_availabilitySettings', OWNER)))
  })

  it('a second signed-in host cannot write the owner document', async () => {
    await assertFails(setDoc(doc(asOther(), 'hp_availabilitySettings', OWNER), { timezone: 'UTC' }))
  })

  it('a second signed-in host cannot list the collection unfiltered', async () => {
    await assertFails(getDocs(collection(asOther(), 'hp_availabilitySettings')))
  })

  it('a brand new account cannot create a document at another uid', async () => {
    await assertFails(
      setDoc(doc(asNewcomer(), 'hp_availabilitySettings', OWNER), { timezone: 'UTC' }),
    )
  })

  it('a brand new account creates its own document at its own uid', async () => {
    await assertSucceeds(
      setDoc(doc(asNewcomer(), 'hp_availabilitySettings', NEWCOMER), { timezone: 'UTC' }),
    )
  })

  it('a signed-out visitor cannot read it', async () => {
    await assertFails(
      getDoc(doc(testEnv.unauthenticatedContext().firestore(), 'hp_availabilitySettings', OWNER)),
    )
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
