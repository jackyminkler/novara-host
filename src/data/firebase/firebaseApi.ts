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
import { auth, db } from '../../lib/firebase'
import type {
  HostApi,
  AvailabilityInput,
  AvailabilitySettingsPatch,
  FriendLinkInput,
  ContactInput,
  CreateEventInput,
  FeedbackInput,
  MomentInput,
  OrgInput,
  PartyInput,
  PersonEdit,
  RunItemInput,
  TaskInput,
} from '../api'
import type {
  AvailabilityBlock,
  AvailabilitySettings,
  Booking,
  FriendLink,
  CapturedContact,
  CitywideMoment,
  CrewMember,
  EventBundle,
  EventDoc,
  GuestToken,
  LogEntry,
  Org,
  Party,
  Person,
  RunItem,
  Task,
  Template,
  TokenScope,
} from '../types'
import { materializeTasks, runItemsFromTemplate, tasksFromTemplate } from '../instantiate'
import { normalizeAvailability } from '../availabilitySettings'

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
// hp_availability already holds the day-level away and open bands from F10, so
// the personal availability settings document gets its own collection rather
// than sharing one.
const AVAILABILITY_SETTINGS = 'hp_availabilitySettings'
const FRIEND_LINKS = 'hp_friendLinks'
const BOOKINGS = 'hp_bookings'
const TOKENS = 'hp_guestTokens'
const PEOPLE = 'hp_people'
const FEEDBACK = 'hp_feedback'

const sub = (eventId: string, name: string) => collection(db, EVENTS, eventId, name)

function withId<T>(snapshot: { id: string; data: () => unknown }): T {
  return { id: snapshot.id, ...(snapshot.data() as object) } as T
}

async function readAll<T>(ref: ReturnType<typeof collection>): Promise<T[]> {
  const snap = await getDocs(ref)
  return snap.docs.map((d) => withId<T>(d))
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

export const firebaseApi: HostApi = {
  // F2, partner directory

  async listOrgs() {
    const orgs = await readOwned<Org>(ORGS)
    return orgs.sort((a, b) => a.name.localeCompare(b.name))
  },

  async getOrg(orgId) {
    const snap = await getDoc(doc(db, ORGS, orgId))
    return snap.exists() ? withId<Org>(snap) : null
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
    const events = await readOwned<EventDoc>(EVENTS)
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
      event: withId<EventDoc>(snap),
      parties: parties.sort((a, b) => a.order - b.order),
      tasks: tasks.sort((a, b) => a.order - b.order),
      runOfShow: runOfShow.sort((a, b) => a.time.localeCompare(b.time) || a.order - b.order),
      crew,
      orgs,
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
    for (const name of ['parties', 'tasks', 'runOfShow', 'crew', 'log']) {
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
    const templates = await readOwned<Template>(TEMPLATES)
    return templates.sort((a, b) => a.name.localeCompare(b.name))
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
      order: nextOrder(parties),
    })
    return ref.id
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
      expiresAt: null,
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
    const contacts = await readOwned<CapturedContact>(CONTACTS)
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

  // F14 to F19. One settings document per host, keyed by uid so there is
  // nothing to list and no index to build.
  async getAvailabilitySettings() {
    const snap = await getDoc(doc(db, AVAILABILITY_SETTINGS, currentUid()))
    // Normalized on read so a document written under an earlier shape cannot
    // reach the UI missing a field. See src/data/availabilitySettings.ts.
    return normalizeAvailability(snap.data() as Partial<AvailabilitySettings>, currentUid())
  },

  async saveAvailabilitySettings(patch: AvailabilitySettingsPatch, uid: string) {
    // Merge rather than replace: the page saves one field at a time as she
    // changes it, and a full write would drop the published offers.
    await setDoc(doc(db, AVAILABILITY_SETTINGS, uid), { ...patch, ownerUid: uid }, { merge: true })
  },

  async listFriendLinks() {
    return readOwned<FriendLink>(FRIEND_LINKS)
  },

  async createFriendLink(input: FriendLinkInput, uid: string) {
    const tokenId = makeToken()
    const batch = writeBatch(db)
    const linkRef = doc(collection(db, FRIEND_LINKS))
    batch.set(linkRef, { ...input, ownerUid: uid, tokenId, createdAt: now() })
    // A booking token carries no eventId: it belongs to the host, not an
    // event. See docs/Availability_Feature_Plan_v1.md section 4.
    batch.set(doc(db, TOKENS, tokenId), {
      ownerUid: uid,
      eventId: null,
      scope: 'booking',
      subjectId: linkRef.id,
      revoked: false,
      createdAt: now(),
      lastUsedAt: null,
      // A friend link is meant to be kept, so it does not expire on its own.
      expiresAt: null,
    })
    await batch.commit()
    return { id: linkRef.id, token: tokenId }
  },

  async updateFriendLink(linkId, patch) {
    await updateDoc(doc(db, FRIEND_LINKS, linkId), patch)
  },

  async deleteFriendLink(linkId) {
    const snap = await getDoc(doc(db, FRIEND_LINKS, linkId))
    const batch = writeBatch(db)
    // Revoke before deleting. A link that outlives the row the host deleted is
    // the worst failure this feature has.
    const tokenId = snap.exists() ? (snap.data() as FriendLink).tokenId : null
    if (tokenId) batch.update(doc(db, TOKENS, tokenId), { revoked: true })
    batch.delete(doc(db, FRIEND_LINKS, linkId))
    await batch.commit()
  },

  async listBookings() {
    const rows = await readOwned<Booking>(BOOKINGS)
    return rows.filter((b) => b.status === 'booked')
  },

  async cancelBooking(bookingId) {
    await updateDoc(doc(db, BOOKINGS, bookingId), { status: 'cancelled' })
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
