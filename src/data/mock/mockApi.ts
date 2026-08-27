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
  CrewMember,
  EventBundle,
  EventDoc,
  EventRecap,
  GuestToken,
  HostCard,
  LogEntry,
  MatchingRun,
  Org,
  Party,
  Person,
  ResponseSource,
  ResponseValue,
  RunItem,
  Task,
  Template,
  TokenScope,
} from '../types'
import { buildStore, type MockStore } from './seed'
import {
  materializeTasks,
  runItemsFromTemplate,
  tasksFromTemplate,
  templateFromEvent,
} from '../instantiate'
import { mergeRows, normalizeEmail, personFromContact } from '../people/merge'

// In-memory implementation of the same seam the Firebase one implements.
// Writes persist to localStorage so a refresh keeps the demo state; clearing
// the key resets to the fixture.

// Bumped whenever the fixture grows a field the UI now reads. The version is
// in the key rather than inside the value on purpose: a browser holding an
// older store has none of the newer fixtures, and the fixtures are the whole
// point of mock mode. A new key means the next load rebuilds from seed instead
// of rendering a demo with half its data missing.
//
// v2 added the M1 fields: template matching, deliverables, spend log. v3 adds
// the CRM ones: promoted captures, the standing-availability history, and the
// follow-ups the hub reads.
const STORAGE_KEY = 'novara-hosts-mock-v3'

function load(): MockStore {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw) return JSON.parse(raw) as MockStore
  } catch {
    // A corrupt or unavailable store just falls back to the fixture.
  }
  return buildStore()
}

const store: MockStore = load()

/**
 * A mock voice note is an object URL for this page only. Persisting one would
 * restore a dead `blob:` link after a refresh, which looks like a broken
 * recording rather than an absent one, so it is dropped on the way out.
 */
const isMockVoiceNote = (value: unknown): boolean =>
  typeof value === 'object' &&
  value !== null &&
  typeof (value as { path?: unknown }).path === 'string' &&
  (value as { path: string }).path.startsWith('mock:')

function persist() {
  try {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify(store, (key, value) =>
        key === 'voiceNote' && isMockVoiceNote(value) ? null : value,
      ),
    )
  } catch {
    // Private browsing and quota errors are not worth failing a write over.
  }
}

/**
 * Mock mode has one signed-in host (AuthProvider hands out the same uid), so
 * this is a constant rather than a lookup. It is still applied everywhere the
 * Firebase implementation applies its filter: a fixture row belonging to
 * anyone else must be invisible here too, or mock mode would quietly disagree
 * with production about what a host can see.
 */
const MOCK_UID = 'mock-host-uid'

/** Same scoping the tightened rules enforce, applied to the in-memory store. */
const owned = <T extends { ownerUid: string }>(rows: T[]): T[] =>
  rows.filter((row) => row.ownerUid === MOCK_UID)

let counter = 0
function id(prefix: string): string {
  counter += 1
  return `${prefix}-${Date.now().toString(36)}${counter.toString(36)}`
}

function token(): string {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789'
  const bytes = crypto.getRandomValues(new Uint8Array(24))
  return Array.from(bytes, (b) => alphabet[b % alphabet.length]).join('')
}

// JSON.stringify(undefined) returns undefined, not a string, so a naive
// round trip throws on every void return. Guard it.
const clone = <T,>(value: T): T =>
  value === undefined ? value : (JSON.parse(JSON.stringify(value)) as T)

/** Every call resolves async so swapping in Firebase changes no call site. */
const ok = <T,>(value: T): Promise<T> => Promise.resolve(clone(value))

function requireEvent(eventId: string): EventDoc {
  const event = store.events.find((e) => e.id === eventId)
  if (!event) throw new Error('event_not_found')
  return event
}

function listOf<T>(map: Record<string, T[]>, eventId: string): T[] {
  if (!map[eventId]) map[eventId] = []
  return map[eventId]
}

function nextOrder(items: { order: number }[]): number {
  return items.reduce((max, item) => Math.max(max, item.order + 1), 0)
}

export const mockApi: HostApi = {
  // F2, partner directory

  listOrgs: () => ok(owned(store.orgs).sort((a, b) => a.name.localeCompare(b.name))),

  getOrg: (orgId) => ok(store.orgs.find((o) => o.id === orgId) ?? null),

  createOrg: (input: OrgInput, uid: string) => {
    const org: Org = {
      ...clone(input),
      id: id('org'),
      createdAt: new Date().toISOString(),
      createdBy: uid,
      ownerUid: uid,
    }
    store.orgs.push(org)
    persist()
    return ok(org.id)
  },

  updateOrg: (orgId, patch) => {
    const org = store.orgs.find((o) => o.id === orgId)
    if (org) Object.assign(org, clone(patch))
    persist()
    return ok(undefined)
  },

  deleteOrg: (orgId) => {
    store.orgs = store.orgs.filter((o) => o.id !== orgId)
    persist()
    return ok(undefined)
  },

  // F3, events

  listEvents: () =>
    ok(
      owned(store.events).sort((a, b) => {
        // Live and planning first, wrapped last, then newest first.
        const rank = (e: EventDoc) => (e.status === 'wrapped' ? 1 : 0)
        return rank(a) - rank(b) || b.createdAt.localeCompare(a.createdAt)
      }),
    ),

  getEventBundle: (eventId) => {
    const event = store.events.find((e) => e.id === eventId)
    if (!event) return ok(null)
    const bundle: EventBundle = {
      event,
      parties: [...listOf(store.parties, eventId)].sort((a, b) => a.order - b.order),
      tasks: [...listOf(store.tasks, eventId)].sort((a, b) => a.order - b.order),
      runOfShow: [...listOf(store.runOfShow, eventId)].sort((a, b) => a.time.localeCompare(b.time) || a.order - b.order),
      crew: listOf(store.crew, eventId),
      orgs: owned(store.orgs),
    }
    return ok(bundle)
  },

  createEvent: (input: CreateEventInput, uid: string) => {
    const eventId = id('evt')
    const template = input.templateId ? store.templates.find((t) => t.id === input.templateId) ?? null : null

    const event: EventDoc = {
      id: eventId,
      ownerUid: uid,
      sourceKey: null,
      title: input.title,
      status: 'planning',
      description: input.description,
      dateOptions: clone(input.dateOptions),
      confirmedDateOptionId: null,
      location: clone(input.location),
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
      hostDisplayName: input.hostDisplayName,
      createdAt: new Date().toISOString(),
    }
    store.events.push(event)

    // Parties come from the filled template slots, and are entirely optional.
    const parties: Party[] = []
    Object.entries(input.slotAssignments).forEach(([slot, orgId], index) => {
      if (!orgId) return
      const org = store.orgs.find((o) => o.id === orgId)
      const slotDef = template?.roleSlots.find((s) => s.slot === slot)
      parties.push({
        id: id('pty'),
        orgId,
        roleOnEvent: slotDef?.orgType ?? org?.type ?? 'vendor',
        status: 'invited',
        terms: { gives: '', gets: '' },
        goal: org?.profile.goal ?? '',
        cta: '',
        dateResponses: {},
        constraintNote: '',
        tokenId: null,
        nudgeCount: 0,
        profile: clone(org?.profile ?? {}),
        customFields: [],
        outcomes: [],
        deliverables: [],
        order: index,
      })
    })
    store.parties[eventId] = parties

    if (template) {
      store.tasks[eventId] = tasksFromTemplate(template, input.slotAssignments, parties, () => id('tsk'))
      store.runOfShow[eventId] = runItemsFromTemplate(
        template,
        input.slotAssignments,
        parties,
        template.defaults.startTime ?? '07:00',
        () => id('run'),
      )
    } else {
      store.tasks[eventId] = []
      store.runOfShow[eventId] = []
    }
    store.crew[eventId] = []
    store.log[eventId] = []
    store.matching[eventId] = []

    persist()
    return ok(eventId)
  },

  updateEvent: (eventId, patch) => {
    const event = store.events.find((e) => e.id === eventId)
    if (event) Object.assign(event, clone(patch))
    persist()
    return ok(undefined)
  },

  deleteEvent: (eventId) => {
    store.events = store.events.filter((e) => e.id !== eventId)
    delete store.parties[eventId]
    delete store.tasks[eventId]
    delete store.runOfShow[eventId]
    delete store.crew[eventId]
    delete store.log[eventId]
    delete store.matching[eventId]
    store.tokens = store.tokens.filter((t) => t.eventId !== eventId)
    persist()
    return ok(undefined)
  },

  listTemplates: () => ok(owned(store.templates).sort((a, b) => a.name.localeCompare(b.name))),

  createTemplate: (input: TemplateInput, uid: string) => {
    const template: Template = {
      ...clone(input),
      id: id('tpl'),
      ownerUid: uid,
      createdAt: new Date().toISOString(),
    }
    store.templates.push(template)
    persist()
    return ok(template.id)
  },

  updateTemplate: (templateId, patch) => {
    const template = store.templates.find((t) => t.id === templateId)
    if (template) Object.assign(template, clone(patch))
    persist()
    return ok(undefined)
  },

  deleteTemplate: (templateId) => {
    store.templates = store.templates.filter((t) => t.id !== templateId)
    persist()
    return ok(undefined)
  },

  saveEventAsTemplate: (eventId, name, uid) => {
    const event = requireEvent(eventId)
    // A template derived from an event that itself came from one keeps that
    // template's matching config, since the questions a run asks do not change
    // just because the plan was saved again.
    const from = event.templateId
      ? store.templates.find((t) => t.id === event.templateId) ?? null
      : null
    const template: Template = {
      ...templateFromEvent(
        {
          event,
          parties: listOf(store.parties, eventId),
          tasks: listOf(store.tasks, eventId),
          runOfShow: listOf(store.runOfShow, eventId),
          orgs: owned(store.orgs),
        },
        name,
        from?.matching ?? null,
      ),
      id: id('tpl'),
      ownerUid: uid,
      createdAt: new Date().toISOString(),
    }
    store.templates.push(template)
    persist()
    return ok(template.id)
  },

  // F4, dates

  setDateResponse: (
    eventId: string,
    partyId: string,
    optionId: string,
    value: ResponseValue,
    source: ResponseSource,
    note: string,
  ) => {
    const party = listOf(store.parties, eventId).find((p) => p.id === partyId)
    if (party) {
      party.dateResponses[optionId] = { value, source, note, at: new Date().toISOString() }
    }
    persist()
    return ok(undefined)
  },

  confirmDate: (eventId, optionId) => {
    const event = requireEvent(eventId)
    event.confirmedDateOptionId = optionId
    event.status = optionId ? 'confirmed' : 'planning'

    if (optionId) {
      const option = event.dateOptions.find((o) => o.id === optionId)
      if (option) {
        // Tasks that came from a template pick up real dates here, compressed
        // if the runway is short rather than landing in the past.
        const tasks = listOf(store.tasks, eventId)
        const { tasks: dated } = materializeTasks(tasks, new Date(option.startsAt))
        for (const { id: taskId, dueDate } of dated) {
          const task = tasks.find((t) => t.id === taskId)
          if (task) task.dueDate = dueDate
        }
      }
    }
    persist()
    return ok(undefined)
  },

  // F5, parties and guest links

  addParty: (eventId, input: PartyInput) => {
    const parties = listOf(store.parties, eventId)
    const party: Party = {
      ...clone(input),
      id: id('pty'),
      status: 'invited',
      dateResponses: {},
      constraintNote: '',
      tokenId: null,
      nudgeCount: 0,
      outcomes: [],
      deliverables: [],
      order: nextOrder(parties),
    }
    parties.push(party)
    persist()
    return ok(party.id)
  },

  listPartyHistory: () =>
    ok(
      owned(store.events).map((event) => ({
        eventId: event.id,
        parties: [...listOf(store.parties, event.id)].sort((a, b) => a.order - b.order),
      })),
    ),

  updateParty: (eventId, partyId, patch) => {
    const party = listOf(store.parties, eventId).find((p) => p.id === partyId)
    if (party) Object.assign(party, clone(patch))
    persist()
    return ok(undefined)
  },

  removeParty: (eventId, partyId) => {
    store.parties[eventId] = listOf(store.parties, eventId).filter((p) => p.id !== partyId)
    store.tokens = store.tokens.map((t) =>
      t.eventId === eventId && t.subjectId === partyId ? { ...t, revoked: true } : t,
    )
    persist()
    return ok(undefined)
  },

  logNudge: (eventId, partyId) => {
    const party = listOf(store.parties, eventId).find((p) => p.id === partyId)
    if (party) party.nudgeCount += 1
    persist()
    return ok(undefined)
  },

  issueToken: (eventId: string, scope: TokenScope, subjectId: string) => {
    // Revocation is immediate: the old token stops working the moment a new
    // one is issued for the same subject.
    for (const t of store.tokens) {
      if (t.eventId === eventId && t.scope === scope && t.subjectId === subjectId) t.revoked = true
    }
    const fresh: GuestToken = {
      id: token(),
      ownerUid: MOCK_UID,
      eventId,
      scope,
      subjectId,
      revoked: false,
      createdAt: new Date().toISOString(),
      lastUsedAt: null,
    }
    store.tokens.push(fresh)

    if (scope === 'party') {
      const party = listOf(store.parties, eventId).find((p) => p.id === subjectId)
      if (party) party.tokenId = fresh.id
    } else if (scope === 'crew') {
      const person = listOf(store.crew, eventId).find((c) => c.id === subjectId)
      if (person) person.tokenId = fresh.id
    }
    persist()
    return ok(fresh.id)
  },

  // F6, tasks

  createTask: (eventId, input: TaskInput) => {
    const tasks = listOf(store.tasks, eventId)
    const task: Task = { ...input, id: id('tsk'), offsetDays: null, status: 'open', order: nextOrder(tasks) }
    tasks.push(task)
    persist()
    return ok(task.id)
  },

  updateTask: (eventId, taskId, patch) => {
    const task = listOf(store.tasks, eventId).find((t) => t.id === taskId)
    if (task) Object.assign(task, clone(patch))
    persist()
    return ok(undefined)
  },

  deleteTask: (eventId, taskId) => {
    store.tasks[eventId] = listOf(store.tasks, eventId).filter((t) => t.id !== taskId)
    persist()
    return ok(undefined)
  },

  // F7, run of show

  createRunItem: (eventId, input: RunItemInput) => {
    const items = listOf(store.runOfShow, eventId)
    const item: RunItem = { ...input, id: id('run'), order: nextOrder(items) }
    items.push(item)
    persist()
    return ok(item.id)
  },

  updateRunItem: (eventId, itemId, patch) => {
    const item = listOf(store.runOfShow, eventId).find((i) => i.id === itemId)
    if (item) Object.assign(item, clone(patch))
    persist()
    return ok(undefined)
  },

  deleteRunItem: (eventId, itemId) => {
    store.runOfShow[eventId] = listOf(store.runOfShow, eventId).filter((i) => i.id !== itemId)
    persist()
    return ok(undefined)
  },

  // F13, crew

  createCrew: (eventId, name, note) => {
    const person: CrewMember = { id: id('crw'), name, note, tokenId: null }
    listOf(store.crew, eventId).push(person)
    persist()
    return ok(person.id)
  },

  updateCrew: (eventId, crewId, patch) => {
    const person = listOf(store.crew, eventId).find((c) => c.id === crewId)
    if (person) Object.assign(person, clone(patch))
    persist()
    return ok(undefined)
  },

  deleteCrew: (eventId, crewId) => {
    store.crew[eventId] = listOf(store.crew, eventId).filter((c) => c.id !== crewId)
    persist()
    return ok(undefined)
  },

  // F8, meeting capture

  listContacts: () =>
    ok(
      owned(store.contacts).sort((a, b) => {
        // Open follow-ups first, soonest due at the top, then newest capture.
        const openA = a.followUp && !a.followUp.done
        const openB = b.followUp && !b.followUp.done
        if (openA !== openB) return openA ? -1 : 1
        if (openA && openB) return a.followUp!.due.localeCompare(b.followUp!.due)
        return b.capturedAt.localeCompare(a.capturedAt)
      }),
    ),

  createContact: (input: ContactInput, uid: string) => {
    const contact = {
      ...clone(input),
      id: id('ct'),
      // Nothing has been promoted at the moment of capture, and the link is
      // the implementation's to set.
      personId: null,
      capturedAt: new Date().toISOString(),
      capturedBy: uid,
      ownerUid: uid,
    }
    store.contacts.push(contact)
    persist()
    return ok(contact.id)
  },

  updateContact: (contactId, patch) => {
    const contact = store.contacts.find((c) => c.id === contactId)
    if (contact) Object.assign(contact, clone(patch))
    persist()
    return ok(undefined)
  },

  deleteContact: (contactId) => {
    store.contacts = store.contacts.filter((c) => c.id !== contactId)
    persist()
    return ok(undefined)
  },

  // M1, voice notes. Mock keeps the recording as an object URL, which lives
  // as long as the page does. Real uploads are the Firebase implementation's
  // job; this is enough to build and check the player against.

  saveVoiceNote: (contactId, blob, durationSec) => {
    const contact = store.contacts.find((c) => c.id === contactId)
    if (contact) {
      if (contact.voiceNote?.url.startsWith('blob:')) URL.revokeObjectURL(contact.voiceNote.url)
      contact.voiceNote = {
        path: `mock:${contactId}`,
        url: URL.createObjectURL(blob),
        durationSec,
      }
    }
    persist()
    return ok(undefined)
  },

  deleteVoiceNote: (contactId) => {
    const contact = store.contacts.find((c) => c.id === contactId)
    if (contact) {
      if (contact.voiceNote?.url.startsWith('blob:')) URL.revokeObjectURL(contact.voiceNote.url)
      contact.voiceNote = null
    }
    persist()
    return ok(undefined)
  },

  // M1, the host's share card

  getHostCard: (uid) => ok(store.profiles.find((c) => c.id === uid && c.ownerUid === uid) ?? null),

  saveHostCard: (patch: HostCardInput, uid: string) => {
    const existing = store.profiles.find((c) => c.id === uid)
    const updatedAt = new Date().toISOString()
    if (existing) {
      Object.assign(existing, clone(patch), { updatedAt })
    } else {
      const card: HostCard = {
        ...clone(patch),
        id: uid,
        ownerUid: uid,
        cardTokenId: null,
        updatedAt,
      }
      store.profiles.push(card)
    }
    persist()
    return ok(undefined)
  },

  issueCardToken: (uid) => {
    // A card token has no event behind it, so it cannot go through issueToken:
    // eventId is empty and the subject is the host herself.
    for (const t of store.tokens) {
      if (t.scope === 'card' && t.subjectId === uid) t.revoked = true
    }
    const fresh: GuestToken = {
      id: token(),
      ownerUid: uid,
      eventId: '',
      scope: 'card',
      subjectId: uid,
      revoked: false,
      createdAt: new Date().toISOString(),
      lastUsedAt: null,
    }
    store.tokens.push(fresh)
    const card = store.profiles.find((c) => c.id === uid)
    if (card) card.cardTokenId = fresh.id
    persist()
    return ok(fresh.id)
  },

  // F10, calendar

  listAvailability: () => ok(owned(store.availability)),

  createAvailability: (input: AvailabilityInput) => {
    const block = { ...input, id: id('av'), ownerUid: MOCK_UID }
    store.availability.push(block)
    persist()
    return ok(block.id)
  },

  deleteAvailability: (blockId) => {
    store.availability = store.availability.filter((b) => b.id !== blockId)
    persist()
    return ok(undefined)
  },

  listMoments: () => ok(owned(store.moments)),

  createMoment: (input: MomentInput) => {
    const moment = { ...input, id: id('mo'), ownerUid: MOCK_UID }
    store.moments.push(moment)
    persist()
    return ok(moment.id)
  },

  deleteMoment: (momentId) => {
    store.moments = store.moments.filter((m) => m.id !== momentId)
    persist()
    return ok(undefined)
  },

  // CRM-1, people

  listPeople: () =>
    ok(owned(store.people).sort((a, b) => b.lastSeenAt.localeCompare(a.lastSeenAt))),

  getPerson: (personId) => ok(store.people.find((p) => p.id === personId) ?? null),

  updatePerson: (personId: string, patch: PersonEdit) => {
    const person = store.people.find((p) => p.id === personId)
    if (person) Object.assign(person, clone(patch))
    persist()
    return ok(undefined)
  },

  importPeople: (rows: PersonImportRow[], eventKey: string, uid: string) => {
    // The same merge module the seed importer calls, so mock mode and a real
    // import cannot disagree about tiers, dedupe, or what an import may clear.
    const mine = store.people.filter((p) => p.ownerUid === uid)
    const idsByEmail = new Map(mine.map((p) => [p.email, p.id]))
    const { people, summary, touched } = mergeRows(
      mine.map(({ id: _id, ...rest }) => rest),
      rows,
      eventKey,
      null,
      uid,
    )

    for (const email of touched) {
      const merged = people.get(email)
      if (!merged) continue
      const existingId = idsByEmail.get(email)
      const existing = existingId ? store.people.find((p) => p.id === existingId) : undefined
      if (existing) Object.assign(existing, clone(merged))
      else store.people.push({ ...clone(merged), id: id('per') })
    }
    persist()
    return ok(summary)
  },

  promoteContactToPerson: (contactId, uid) => {
    const contact = store.contacts.find((c) => c.id === contactId && c.ownerUid === uid)
    if (!contact) throw new Error('contact_not_found')

    // No email means no dedupe key, so this always creates. Two promotions of
    // the same handshake would make two people, which the `personId` stamped
    // back onto the capture below is what prevents.
    const email = normalizeEmail(contact.handles.email ?? '')
    const existing = email
      ? store.people.find((p) => p.ownerUid === uid && p.email === email) ?? null
      : null
    const merged = personFromContact(contact, uid, existing)

    if (existing) {
      Object.assign(existing, clone(merged), { id: existing.id })
      contact.personId = existing.id
      persist()
      return ok(existing.id)
    }
    const person: Person = { ...clone(merged), id: id('per') }
    store.people.push(person)
    contact.personId = person.id
    persist()
    return ok(person.id)
  },

  sendFeedback: (input: FeedbackInput, uid: string) => {
    const entry = { ...clone(input), id: id('fb'), ownerUid: uid, createdAt: new Date().toISOString() }
    store.feedback.push(entry)
    persist()
    return ok(entry.id)
  },

  // F11, recap

  saveRecap: (eventId, recap: EventRecap) => {
    const event = requireEvent(eventId)
    event.recap = clone(recap)
    persist()
    return ok(undefined)
  },

  generateRecaps: async (eventId) => {
    const event = requireEvent(eventId)
    for (const party of listOf(store.parties, eventId)) {
      await mockApi.issueToken(eventId, 'recap', party.id)
    }
    event.recap.generatedAt = new Date().toISOString()
    event.status = 'wrapped'
    persist()
  },

  // M1, matching runs

  listMatchingRuns: (eventId) =>
    ok([...listOf(store.matching, eventId)].sort((a, b) => b.createdAt.localeCompare(a.createdAt))),

  saveMatchingRun: (eventId, run) => {
    const stored: MatchingRun = { ...clone(run), id: id('mr') }
    listOf(store.matching, eventId).push(stored)
    persist()
    return ok(stored.id)
  },

  // 4.3, the Event Zero log

  listLog: (eventId) => ok([...listOf(store.log, eventId)].sort((a, b) => b.createdAt.localeCompare(a.createdAt))),

  addLogEntry: (eventId, text) => {
    const entry: LogEntry = { id: id('lg'), text, createdAt: new Date().toISOString() }
    listOf(store.log, eventId).push(entry)
    persist()
    return ok(entry.id)
  },
}

/** Mock mode serves guest pages from the same store, with no function call. */
export function mockStore(): MockStore {
  return store
}

export function mockPersist(): void {
  persist()
}
