import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  query,
  setDoc,
  updateDoc,
  where,
  writeBatch,
} from 'firebase/firestore'
import { app, auth, db } from '../../lib/firebase'
import type {
  HostApi,
  AvailabilityInput,
  ContactInput,
  CreateEventInput,
  FeedbackInput,
  HostCardInput,
  MomentInput,
  OrgInput,
  PartyInput,
  PersonEdit,
  PersonImportRow,
  RunItemInput,
  TaskInput,
  TemplateInput,
} from '../api'
import type {
  AvailabilityBlock,
  CapturedContact,
  CitywideMoment,
  CrewMember,
  EventBundle,
  EventDoc,
  GuestToken,
  HostCard,
  LogEntry,
  MatchingRun,
  Org,
  Party,
  Person,
  RunItem,
  Task,
  Template,
  TemplateMatching,
  TokenScope,
} from '../types'
import {
  materializeTasks,
  runItemsFromTemplate,
  tasksFromTemplate,
  templateFromEvent,
} from '../instantiate'
import { mergeRows, normalizeEmail, personFromContact, type PersonDoc } from '../people/merge'

// Every top-level collection is hp_ prefixed and carries its own explicit
// rules match block. Subcollections hang off hp_events and are never reached
// by a collection-group query, because a collection-group rule in the shared
// ruleset would span the consumer app too.

const ORGS = 'hp_orgs'
const EVENTS = 'hp_events'
const TEMPLATES = 'hp_templates'
const CONTACTS = 'hp_contacts'
const AVAILABILITY = 'hp_availability'
const MOMENTS = 'hp_moments'
const TOKENS = 'hp_guestTokens'
const PEOPLE = 'hp_people'
const FEEDBACK = 'hp_feedback'
const PROFILES = 'hp_profiles'

const sub = (eventId: string, name: string) => collection(db, EVENTS, eventId, name)

function withId<T>(snapshot: { id: string; data: () => unknown }): T {
  return { id: snapshot.id, ...(snapshot.data() as object) } as T
}

async function readAll<T>(ref: ReturnType<typeof collection>): Promise<T[]> {
  const snap = await getDocs(ref)
  return snap.docs.map((d) => withId<T>(d))
}

// Normalizers. Every document written before M1 is missing the fields M1
// added, and there is no migration: a document is repaired when it is next
// saved, and until then it is read through here. The rule is that no reader
// anywhere in the app may see `undefined` where the type promises a value, so
// the defaults live in one place per shape rather than at each call site.
//
// A field added later gets its default here at the same time it is added to
// types.ts. Forgetting is how a list page throws on `.map of undefined` for
// exactly the host whose data predates the feature, which is always the one
// host who has been using it longest.

function normalizeOrg(org: Org): Org {
  return { ...org, siteProfile: org.siteProfile ?? null, standing: org.standing ?? [] }
}

function normalizeEvent(event: EventDoc): EventDoc {
  return {
    ...event,
    spendLog: event.spendLog ?? [],
    talkTracks: event.talkTracks ?? [],
    shotList: event.shotList ?? [],
  }
}

function normalizeParty(party: Party): Party {
  return { ...party, deliverables: party.deliverables ?? [] }
}

function normalizeTemplate(template: Template): Template {
  return { ...template, matching: template.matching ?? null }
}

function normalizeContact(contact: CapturedContact): CapturedContact {
  return {
    ...contact,
    quote: contact.quote ?? '',
    voiceNote: contact.voiceNote ?? null,
    personId: contact.personId ?? null,
  }
}

/**
 * The signed-in host. Reads take it from auth rather than from an argument,
 * because every list* on the seam is parameterless and threading a uid through
 * each one would touch every call site in the app. Writes keep passing it
 * explicitly, which is the existing convention.
 */
function currentUid(): string {
  const uid = auth.currentUser?.uid
  // A read before sign-in is a bug, not an empty result: returning nothing
  // would look like an empty workspace instead of surfacing the mistake.
  if (!uid) throw new Error('not signed in')
  return uid
}

/**
 * Read one top-level hp_ collection, scoped to its owner.
 *
 * The filter is not only a convenience: the tightened rules evaluate
 * `resource.data.ownerUid == request.auth.uid` on a list, so a query without
 * this constraint is rejected outright rather than quietly returning another
 * host's rows.
 */
async function readOwned<T>(name: string): Promise<T[]> {
  const snap = await getDocs(query(collection(db, name), where('ownerUid', '==', currentUid())))
  return snap.docs.map((d) => withId<T>(d))
}

const now = () => new Date().toISOString()

/** 24 characters of base62, comfortably past the 22 the PRD asks for. */
function makeToken(): string {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789'
  const bytes = crypto.getRandomValues(new Uint8Array(24))
  return Array.from(bytes, (b) => alphabet[b % alphabet.length]).join('')
}

function nextOrder(items: { order: number }[]): number {
  return items.reduce((max, item) => Math.max(max, item.order + 1), 0)
}

/** Firestore commits at most 500 writes per batch. An import can exceed that. */
const WRITE_CHUNK = 500

export const firebaseApi: HostApi = {
  // F2, partner directory

  async listOrgs() {
    const orgs = await readOwned<Org>(ORGS)
    return orgs.map(normalizeOrg).sort((a, b) => a.name.localeCompare(b.name))
  },

  async getOrg(orgId) {
    const snap = await getDoc(doc(db, ORGS, orgId))
    return snap.exists() ? normalizeOrg(withId<Org>(snap)) : null
  },

  async createOrg(input: OrgInput, uid: string) {
    // createdBy keeps its original meaning; ownerUid is the field the rules and
    // every query read, and it is uniform across all hp_ collections.
    const ref = await addDoc(collection(db, ORGS), {
      ...input,
      createdAt: now(),
      createdBy: uid,
      ownerUid: uid,
    })
    return ref.id
  },

  async updateOrg(orgId, patch) {
    await updateDoc(doc(db, ORGS, orgId), patch)
  },

  async deleteOrg(orgId) {
    await deleteDoc(doc(db, ORGS, orgId))
  },

  // F3, events

  async listEvents() {
    const events = (await readOwned<EventDoc>(EVENTS)).map(normalizeEvent)
    const rank = (e: EventDoc) => (e.status === 'wrapped' ? 1 : 0)
    return events.sort((a, b) => rank(a) - rank(b) || b.createdAt.localeCompare(a.createdAt))
  },

  async getEventBundle(eventId) {
    const snap = await getDoc(doc(db, EVENTS, eventId))
    if (!snap.exists()) return null

    // One round trip per subcollection, fired together. No composite indexes
    // are needed: every read is a full small collection, sorted in memory.
    const [parties, tasks, runOfShow, crew, orgs] = await Promise.all([
      readAll<Party>(sub(eventId, 'parties')),
      readAll<Task>(sub(eventId, 'tasks')),
      readAll<RunItem>(sub(eventId, 'runOfShow')),
      readAll<CrewMember>(sub(eventId, 'crew')),
      readOwned<Org>(ORGS),
    ])

    const bundle: EventBundle = {
      event: normalizeEvent(withId<EventDoc>(snap)),
      parties: parties.map(normalizeParty).sort((a, b) => a.order - b.order),
      tasks: tasks.sort((a, b) => a.order - b.order),
      runOfShow: runOfShow.sort((a, b) => a.time.localeCompare(b.time) || a.order - b.order),
      crew,
      orgs: orgs.map(normalizeOrg),
    }
    return bundle
  },

  async createEvent(input: CreateEventInput, uid: string) {
    const template = input.templateId ? await getDoc(doc(db, TEMPLATES, input.templateId)) : null
    const templateData = template?.exists() ? withId<Template>(template) : null

    const eventRef = await addDoc(collection(db, EVENTS), {
      sourceKey: null,
      title: input.title,
      status: 'planning',
      description: input.description,
      dateOptions: input.dateOptions,
      confirmedDateOptionId: null,
      location: input.location,
      links: [],
      capacityTarget: input.capacityTarget,
      campaignGoal: '',
      governance: { officialListing: '', listingUrl: '', guestContactsOwner: '', dualPosts: '' },
      signupCount: null,
      recap: { headcount: null, remembered: [], photosLink: '', postsRan: '', generatedAt: null },
      spendLog: [],
      talkTracks: [],
      shotList: [],
      templateId: input.templateId,
      hostUid: uid,
      ownerUid: uid,
      hostDisplayName: input.hostDisplayName,
      createdAt: now(),
    })
    const eventId = eventRef.id

    // Filled template slots become parties. Skipping every slot is fine: the
    // event works solo.
    const orgs = await this.listOrgs()
    const batch = writeBatch(db)
    const parties: Party[] = []

    Object.entries(input.slotAssignments).forEach(([slot, orgId], index) => {
      if (!orgId) return
      const org = orgs.find((o) => o.id === orgId)
      const slotDef = templateData?.roleSlots.find((s) => s.slot === slot)
      const ref = doc(sub(eventId, 'parties'))
      const party: Party = {
        id: ref.id,
        orgId,
        roleOnEvent: slotDef?.orgType ?? org?.type ?? 'vendor',
        status: 'invited',
        terms: { gives: '', gets: '' },
        goal: org?.profile?.goal ?? '',
        cta: '',
        dateResponses: {},
        constraintNote: '',
        tokenId: null,
        nudgeCount: 0,
        profile: org?.profile ?? {},
        customFields: [],
        outcomes: [],
        deliverables: [],
        order: index,
      }
      parties.push(party)
      const { id: _id, ...data } = party
      batch.set(ref, data)
    })

    if (templateData) {
      for (const task of tasksFromTemplate(templateData, input.slotAssignments, parties, () => doc(sub(eventId, 'tasks')).id)) {
        const { id: taskId, ...data } = task
        batch.set(doc(sub(eventId, 'tasks'), taskId), data)
      }
      const startTime = templateData.defaults.startTime ?? '07:00'
      for (const item of runItemsFromTemplate(templateData, input.slotAssignments, parties, startTime, () => doc(sub(eventId, 'runOfShow')).id)) {
        const { id: itemId, ...data } = item
        batch.set(doc(sub(eventId, 'runOfShow'), itemId), data)
      }
    }

    await batch.commit()
    return eventId
  },

  async updateEvent(eventId, patch) {
    await updateDoc(doc(db, EVENTS, eventId), patch)
  },

  async deleteEvent(eventId) {
    // Subcollections do not cascade. Small collections, so one batch clears it.
    const batch = writeBatch(db)
    for (const name of ['parties', 'tasks', 'runOfShow', 'crew', 'log', 'matching']) {
      const snap = await getDocs(sub(eventId, name))
      snap.docs.forEach((d) => batch.delete(d.ref))
    }
    const tokens = await getDocs(
      query(
        collection(db, TOKENS),
        where('ownerUid', '==', currentUid()),
        where('eventId', '==', eventId),
      ),
    )
    tokens.docs.forEach((d) => batch.delete(d.ref))
    batch.delete(doc(db, EVENTS, eventId))
    await batch.commit()
  },

  async listTemplates() {
    const templates = (await readOwned<Template>(TEMPLATES)).map(normalizeTemplate)
    return templates.sort((a, b) => a.name.localeCompare(b.name))
  },

  async createTemplate(input: TemplateInput, uid: string) {
    const ref = await addDoc(collection(db, TEMPLATES), {
      ...input,
      ownerUid: uid,
      createdAt: now(),
    })
    return ref.id
  },

  async updateTemplate(templateId, patch) {
    await updateDoc(doc(db, TEMPLATES, templateId), patch)
  },

  async deleteTemplate(templateId) {
    await deleteDoc(doc(db, TEMPLATES, templateId))
  },

  async saveEventAsTemplate(eventId, name, uid) {
    const bundle = await this.getEventBundle(eventId)
    if (!bundle) throw new Error('event_not_found')

    // A template derived from an event that itself came from one keeps that
    // template's matching config, since the questions a run asks do not change
    // just because the plan was saved again.
    let matching: TemplateMatching | null = null
    if (bundle.event.templateId) {
      const snap = await getDoc(doc(db, TEMPLATES, bundle.event.templateId))
      matching = snap.exists() ? normalizeTemplate(withId<Template>(snap)).matching : null
    }

    const ref = await addDoc(collection(db, TEMPLATES), {
      ...templateFromEvent(bundle, name, matching),
      ownerUid: uid,
      createdAt: now(),
    })
    return ref.id
  },

  // F4, dates

  async setDateResponse(eventId, partyId, optionId, value, source, note) {
    await updateDoc(doc(sub(eventId, 'parties'), partyId), {
      [`dateResponses.${optionId}`]: { value, source, note, at: now() },
    })
  },

  async confirmDate(eventId, optionId) {
    const snap = await getDoc(doc(db, EVENTS, eventId))
    if (!snap.exists()) return
    const event = withId<EventDoc>(snap)

    await updateDoc(doc(db, EVENTS, eventId), {
      confirmedDateOptionId: optionId,
      status: optionId ? 'confirmed' : 'planning',
    })
    if (!optionId) return

    const option = event.dateOptions.find((o) => o.id === optionId)
    if (!option) return

    // Template tasks pick up real dates here, compressed on a short runway
    // rather than landing in the past.
    const tasks = await readAll<Task>(sub(eventId, 'tasks'))
    const { tasks: dated } = materializeTasks(tasks, new Date(option.startsAt))
    if (dated.length === 0) return

    const batch = writeBatch(db)
    for (const { id: taskId, dueDate } of dated) {
      batch.update(doc(sub(eventId, 'tasks'), taskId), { dueDate })
    }
    await batch.commit()
  },

  // F5, parties and guest links

  async addParty(eventId, input: PartyInput) {
    const parties = await readAll<Party>(sub(eventId, 'parties'))
    const ref = await addDoc(sub(eventId, 'parties'), {
      ...input,
      status: 'invited',
      dateResponses: {},
      constraintNote: '',
      tokenId: null,
      nudgeCount: 0,
      outcomes: [],
      deliverables: [],
      order: nextOrder(parties),
    })
    return ref.id
  },

  async listPartyHistory() {
    // One events query plus one parties read per event. A bundle each would
    // pull tasks, run of show, crew and the whole directory to look at one
    // response map, and a collection-group query over `parties` is banned:
    // the shared ruleset would need a collection-group rule, which would span
    // the consumer app's subcollections too.
    const events = await readOwned<EventDoc>(EVENTS)
    return Promise.all(
      events.map(async (event) => ({
        eventId: event.id,
        parties: (await readAll<Party>(sub(event.id, 'parties'))).map(normalizeParty),
      })),
    )
  },

  async updateParty(eventId, partyId, patch) {
    await updateDoc(doc(sub(eventId, 'parties'), partyId), patch)
  },

  async removeParty(eventId, partyId) {
    const batch = writeBatch(db)
    batch.delete(doc(sub(eventId, 'parties'), partyId))
    const tokens = await getDocs(
      query(
        collection(db, TOKENS),
        where('ownerUid', '==', currentUid()),
        where('eventId', '==', eventId),
        where('subjectId', '==', partyId),
      ),
    )
    tokens.docs.forEach((d) => batch.update(d.ref, { revoked: true }))
    await batch.commit()
  },

  async logNudge(eventId, partyId) {
    const snap = await getDoc(doc(sub(eventId, 'parties'), partyId))
    const current = snap.exists() ? withId<Party>(snap).nudgeCount ?? 0 : 0
    await updateDoc(doc(sub(eventId, 'parties'), partyId), { nudgeCount: current + 1 })
  },

  async issueToken(eventId: string, scope: TokenScope, subjectId: string) {
    // Revocation is immediate: earlier tokens for the same subject die first.
    const existing = await getDocs(
      query(
        collection(db, TOKENS),
        where('ownerUid', '==', currentUid()),
        where('eventId', '==', eventId),
        where('scope', '==', scope),
        where('subjectId', '==', subjectId),
      ),
    )
    const batch = writeBatch(db)
    existing.docs.forEach((d) => batch.update(d.ref, { revoked: true }))

    const id = makeToken()
    const record: Omit<GuestToken, 'id'> = {
      ownerUid: currentUid(),
      eventId,
      scope,
      subjectId,
      revoked: false,
      createdAt: now(),
      lastUsedAt: null,
    }
    batch.set(doc(db, TOKENS, id), record)

    if (scope === 'party') batch.update(doc(sub(eventId, 'parties'), subjectId), { tokenId: id })
    if (scope === 'crew') batch.update(doc(sub(eventId, 'crew'), subjectId), { tokenId: id })

    await batch.commit()
    return id
  },

  // F6, tasks

  async createTask(eventId, input: TaskInput) {
    const tasks = await readAll<Task>(sub(eventId, 'tasks'))
    const ref = await addDoc(sub(eventId, 'tasks'), {
      ...input,
      offsetDays: null,
      status: 'open',
      order: nextOrder(tasks),
    })
    return ref.id
  },

  async updateTask(eventId, taskId, patch) {
    await updateDoc(doc(sub(eventId, 'tasks'), taskId), patch)
  },

  async deleteTask(eventId, taskId) {
    await deleteDoc(doc(sub(eventId, 'tasks'), taskId))
  },

  // F7, run of show

  async createRunItem(eventId, input: RunItemInput) {
    const items = await readAll<RunItem>(sub(eventId, 'runOfShow'))
    const ref = await addDoc(sub(eventId, 'runOfShow'), { ...input, order: nextOrder(items) })
    return ref.id
  },

  async updateRunItem(eventId, itemId, patch) {
    await updateDoc(doc(sub(eventId, 'runOfShow'), itemId), patch)
  },

  async deleteRunItem(eventId, itemId) {
    await deleteDoc(doc(sub(eventId, 'runOfShow'), itemId))
  },

  // F13, crew

  async createCrew(eventId, name, note) {
    const ref = await addDoc(sub(eventId, 'crew'), { name, note, tokenId: null })
    return ref.id
  },

  async updateCrew(eventId, crewId, patch) {
    await updateDoc(doc(sub(eventId, 'crew'), crewId), patch)
  },

  async deleteCrew(eventId, crewId) {
    await deleteDoc(doc(sub(eventId, 'crew'), crewId))
  },

  // F8, meeting capture

  async listContacts() {
    const contacts = (await readOwned<CapturedContact>(CONTACTS)).map(normalizeContact)
    return contacts.sort((a, b) => {
      const openA = Boolean(a.followUp && !a.followUp.done)
      const openB = Boolean(b.followUp && !b.followUp.done)
      if (openA !== openB) return openA ? -1 : 1
      if (openA && openB) return a.followUp!.due.localeCompare(b.followUp!.due)
      return b.capturedAt.localeCompare(a.capturedAt)
    })
  },

  async createContact(input: ContactInput, uid: string) {
    const ref = await addDoc(collection(db, CONTACTS), {
      ...input,
      // Nothing has been promoted at the moment of capture, and the link is
      // the implementation's to set.
      personId: null,
      capturedAt: now(),
      capturedBy: uid,
      ownerUid: uid,
    })
    return ref.id
  },

  async updateContact(contactId, patch) {
    await updateDoc(doc(db, CONTACTS, contactId), patch)
  },

  async deleteContact(contactId) {
    await deleteDoc(doc(db, CONTACTS, contactId))
  },

  // M1, voice notes on capture

  async saveVoiceNote(contactId, blob, durationSec) {
    const uid = currentUid()
    // Loaded here rather than at the top of the file so the Storage SDK never
    // lands in the guest bundle. A partner opening a link on LTE should not
    // download an upload client they will never use.
    const storage = await import('firebase/storage')
    const path = `hp_voice/${uid}/${contactId}/${Date.now()}.webm`

    // Only the upload is wrapped. The Firestore write below fails for its own
    // reasons, and blaming those on the Storage rules would send whoever reads
    // the message to the wrong file.
    let url: string
    try {
      const fileRef = storage.ref(storage.getStorage(app), path)
      await storage.uploadBytes(fileRef, blob, { contentType: blob.type || 'audio/webm' })
      url = await storage.getDownloadURL(fileRef)
    } catch {
      // The Storage rules for hp_voice are queued in docs/pending-rules.md and
      // have to be applied through the consumer repo, so until that happens
      // every upload fails on permissions. Say that plainly rather than
      // letting a raw SDK error reach the page.
      throw new Error(
        'That voice note could not be saved. Voice notes need the storage rules applied first, and the exact block is queued in pending rules.',
      )
    }
    await updateDoc(doc(db, CONTACTS, contactId), { voiceNote: { path, url, durationSec } })
  },

  async deleteVoiceNote(contactId) {
    const snap = await getDoc(doc(db, CONTACTS, contactId))
    const existing = snap.exists() ? normalizeContact(withId<CapturedContact>(snap)).voiceNote : null
    // The document is cleared first: a file left behind is untidy, a row still
    // pointing at a deleted file is broken.
    await updateDoc(doc(db, CONTACTS, contactId), { voiceNote: null })
    if (!existing) return
    try {
      const storage = await import('firebase/storage')
      await storage.deleteObject(storage.ref(storage.getStorage(app), existing.path))
    } catch {
      // Already gone, or the rules are still pending. The contact is clean
      // either way, so this is not worth failing the action over.
    }
  },

  // M1, the host's share card. One document per host with the uid as its id,
  // so reading it is a get and never a query.

  async getHostCard(uid) {
    const snap = await getDoc(doc(db, PROFILES, uid))
    return snap.exists() ? withId<HostCard>(snap) : null
  },

  async saveHostCard(patch: HostCardInput, uid: string) {
    // Merged rather than replaced, so saving the card never clears a token
    // that is already printed on something.
    await setDoc(
      doc(db, PROFILES, uid),
      { ...patch, ownerUid: uid, updatedAt: now() },
      { merge: true },
    )
  },

  async issueCardToken(uid) {
    // A card token has no event behind it, so this cannot go through
    // issueToken: eventId is empty and the subject is the host herself.
    // Equality filters only, like every other token query, so no composite
    // index is needed.
    const existing = await getDocs(
      query(
        collection(db, TOKENS),
        where('ownerUid', '==', uid),
        where('scope', '==', 'card'),
        where('subjectId', '==', uid),
      ),
    )
    const batch = writeBatch(db)
    existing.docs.forEach((d) => batch.update(d.ref, { revoked: true }))

    const id = makeToken()
    const record: Omit<GuestToken, 'id'> = {
      ownerUid: uid,
      eventId: '',
      scope: 'card',
      subjectId: uid,
      revoked: false,
      createdAt: now(),
      lastUsedAt: null,
    }
    batch.set(doc(db, TOKENS, id), record)
    batch.set(doc(db, PROFILES, uid), { ownerUid: uid, cardTokenId: id }, { merge: true })
    await batch.commit()
    return id
  },

  // F10, calendar

  async listAvailability() {
    return readOwned<AvailabilityBlock>(AVAILABILITY)
  },

  async createAvailability(input: AvailabilityInput) {
    const ref = await addDoc(collection(db, AVAILABILITY), { ...input, ownerUid: currentUid() })
    return ref.id
  },

  async deleteAvailability(blockId) {
    await deleteDoc(doc(db, AVAILABILITY, blockId))
  },

  async listMoments() {
    return readOwned<CitywideMoment>(MOMENTS)
  },

  async createMoment(input: MomentInput) {
    const ref = await addDoc(collection(db, MOMENTS), { ...input, ownerUid: currentUid() })
    return ref.id
  },

  async deleteMoment(momentId) {
    await deleteDoc(doc(db, MOMENTS, momentId))
  },

  // CRM-1, people

  async listPeople() {
    const people = await readOwned<Person>(PEOPLE)
    return people.sort((a, b) => b.lastSeenAt.localeCompare(a.lastSeenAt))
  },

  async getPerson(personId) {
    const snap = await getDoc(doc(db, PEOPLE, personId))
    return snap.exists() ? withId<Person>(snap) : null
  },

  async updatePerson(personId: string, patch: PersonEdit) {
    await updateDoc(doc(db, PEOPLE, personId), patch)
  },

  async importPeople(rows: PersonImportRow[], eventKey: string, uid: string) {
    // Owner-scoped read first, the same shape listPeople uses: the merge needs
    // the whole set anyway, and one pass beats a query per email.
    const mine = await readOwned<Person>(PEOPLE)
    const idsByEmail = new Map(mine.map((p) => [p.email, p.id]))
    const { people, summary, touched } = mergeRows(
      mine.map(({ id: _id, ...rest }) => rest),
      rows,
      eventKey,
      null,
      uid,
    )

    // Full replace per person, never a merge: every derived field was
    // recomputed from the union of stored and incoming registrations, so a
    // partial write could leave a stale tier or eventCount behind.
    const changed = [...touched]
      .map((email) => people.get(email))
      .filter((p): p is PersonDoc => Boolean(p))

    for (let i = 0; i < changed.length; i += WRITE_CHUNK) {
      const batch = writeBatch(db)
      for (const person of changed.slice(i, i + WRITE_CHUNK)) {
        const existingId = idsByEmail.get(person.email)
        const ref = existingId ? doc(db, PEOPLE, existingId) : doc(collection(db, PEOPLE))
        // `id` rode along on the read and is not part of the document body.
        const { id: _id, ...body } = person as PersonDoc & { id?: string }
        batch.set(ref, { ...body, ownerUid: uid })
      }
      await batch.commit()
    }
    return summary
  },

  async promoteContactToPerson(contactId, uid) {
    const snap = await getDoc(doc(db, CONTACTS, contactId))
    if (!snap.exists()) throw new Error('contact_not_found')
    const contact = normalizeContact(withId<CapturedContact>(snap))

    // No email means no dedupe key, so this always creates. Two promotions of
    // the same handshake would make two people, which the `personId` written
    // back onto the capture below is what prevents.
    const email = normalizeEmail(contact.handles.email ?? '')
    const mine = email ? await readOwned<Person>(PEOPLE) : []
    const existing = email ? mine.find((p) => p.email === email) ?? null : null
    const merged = personFromContact(contact, uid, existing)

    const { id: _id, ...body } = merged as PersonDoc & { id?: string }
    const ref = existing ? doc(db, PEOPLE, existing.id) : doc(collection(db, PEOPLE))
    // The person is written first. A capture pointing at a person who does not
    // exist is broken; a person nobody points at is merely untidy, and the
    // next promotion of the same capture would merge into them by email.
    await setDoc(ref, { ...body, ownerUid: uid })
    await updateDoc(doc(db, CONTACTS, contactId), { personId: ref.id })
    return ref.id
  },

  async sendFeedback(input: FeedbackInput, uid: string) {
    const ref = await addDoc(collection(db, FEEDBACK), {
      ...input,
      ownerUid: uid,
      createdAt: now(),
    })
    return ref.id
  },

  // F11, recap

  async saveRecap(eventId, recap) {
    await updateDoc(doc(db, EVENTS, eventId), { recap })
  },

  async generateRecaps(eventId) {
    const parties = await readAll<Party>(sub(eventId, 'parties'))
    for (const party of parties) {
      await this.issueToken(eventId, 'recap', party.id)
    }
    await updateDoc(doc(db, EVENTS, eventId), {
      'recap.generatedAt': now(),
      status: 'wrapped',
    })
  },

  // M1, matching runs

  async listMatchingRuns(eventId) {
    const runs = await readAll<MatchingRun>(sub(eventId, 'matching'))
    return runs.sort((a, b) => b.createdAt.localeCompare(a.createdAt))
  },

  async saveMatchingRun(eventId, run) {
    const ref = await addDoc(sub(eventId, 'matching'), run)
    return ref.id
  },

  // 4.3, the Event Zero log

  async listLog(eventId) {
    const entries = await readAll<LogEntry>(sub(eventId, 'log'))
    return entries.sort((a, b) => b.createdAt.localeCompare(a.createdAt))
  },

  async addLogEntry(eventId, text) {
    const ref = doc(sub(eventId, 'log'))
    await setDoc(ref, { text, createdAt: now() })
    return ref.id
  },
}
