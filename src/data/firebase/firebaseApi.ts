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
import { db } from '../../lib/firebase'
import type {
  HostApi,
  AvailabilityInput,
  ContactInput,
  CreateEventInput,
  MomentInput,
  OrgInput,
  PartyInput,
  RunItemInput,
  TaskInput,
} from '../api'
import type {
  AvailabilityBlock,
  CapturedContact,
  CitywideMoment,
  CrewMember,
  EventBundle,
  EventDoc,
  GuestToken,
  LogEntry,
  Org,
  Party,
  RunItem,
  Task,
  Template,
  TokenScope,
} from '../types'
import { materializeTasks, runItemsFromTemplate, tasksFromTemplate } from '../instantiate'

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

const sub = (eventId: string, name: string) => collection(db, EVENTS, eventId, name)

function withId<T>(snapshot: { id: string; data: () => unknown }): T {
  return { id: snapshot.id, ...(snapshot.data() as object) } as T
}

async function readAll<T>(ref: ReturnType<typeof collection>): Promise<T[]> {
  const snap = await getDocs(ref)
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
    const orgs = await readAll<Org>(collection(db, ORGS))
    return orgs.sort((a, b) => a.name.localeCompare(b.name))
  },

  async getOrg(orgId) {
    const snap = await getDoc(doc(db, ORGS, orgId))
    return snap.exists() ? withId<Org>(snap) : null
  },

  async createOrg(input: OrgInput, uid: string) {
    const ref = await addDoc(collection(db, ORGS), { ...input, createdAt: now(), createdBy: uid })
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
    const events = await readAll<EventDoc>(collection(db, EVENTS))
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
      readAll<Org>(collection(db, ORGS)),
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
    const tokens = await getDocs(query(collection(db, TOKENS), where('eventId', '==', eventId)))
    tokens.docs.forEach((d) => batch.delete(d.ref))
    batch.delete(doc(db, EVENTS, eventId))
    await batch.commit()
  },

  async listTemplates() {
    const templates = await readAll<Template>(collection(db, TEMPLATES))
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
      query(collection(db, TOKENS), where('eventId', '==', eventId), where('subjectId', '==', partyId)),
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
        where('eventId', '==', eventId),
        where('scope', '==', scope),
        where('subjectId', '==', subjectId),
      ),
    )
    const batch = writeBatch(db)
    existing.docs.forEach((d) => batch.update(d.ref, { revoked: true }))

    const id = makeToken()
    const record: Omit<GuestToken, 'id'> = {
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
    const contacts = await readAll<CapturedContact>(collection(db, CONTACTS))
    return contacts.sort((a, b) => {
      const openA = Boolean(a.followUp && !a.followUp.done)
      const openB = Boolean(b.followUp && !b.followUp.done)
      if (openA !== openB) return openA ? -1 : 1
      if (openA && openB) return a.followUp!.due.localeCompare(b.followUp!.due)
      return b.capturedAt.localeCompare(a.capturedAt)
    })
  },

  async createContact(input: ContactInput, uid: string) {
    const ref = await addDoc(collection(db, CONTACTS), { ...input, capturedAt: now(), capturedBy: uid })
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
    return readAll<AvailabilityBlock>(collection(db, AVAILABILITY))
  },

  async createAvailability(input: AvailabilityInput) {
    const ref = await addDoc(collection(db, AVAILABILITY), input)
    return ref.id
  },

  async deleteAvailability(blockId) {
    await deleteDoc(doc(db, AVAILABILITY, blockId))
  },

  async listMoments() {
    return readAll<CitywideMoment>(collection(db, MOMENTS))
  },

  async createMoment(input: MomentInput) {
    const ref = await addDoc(collection(db, MOMENTS), input)
    return ref.id
  },

  async deleteMoment(momentId) {
    await deleteDoc(doc(db, MOMENTS, momentId))
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
