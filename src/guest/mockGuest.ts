import { mockStore, mockPersist } from '../data/mock/mockApi'
import { GuestError } from './guestClient'
import type {
  GuestAction,
  GuestDeliverable,
  GuestDeliverableCounts,
  GuestView,
} from './guestTypes'
import { orgTypeLabel, ownerLabel } from '../data/profiles'
import type { CapturedContact, EventDoc, OwnerRef } from '../data/types'
import { addDays, startOfDay, toDateKey } from '../lib/dates'

// Mock mode serves guest pages straight from the in-memory store, so the
// guest experience can be checked at 390 px with nothing running behind it.
// The real path is the two Cloud Functions; this mirrors their output.

const emptyCounts = (): GuestDeliverableCounts => ({
  party: { done: 0, total: 0 },
  host: { done: 0, total: 0 },
})

function countDeliverables(items: GuestDeliverable[]): GuestDeliverableCounts {
  const counts = emptyCounts()
  for (const item of items) {
    const side = item.direction === 'host' ? counts.host : counts.party
    side.total += 1
    if (item.done) side.done += 1
  }
  return counts
}

/** The host's soonest event that has not happened yet, by confirmed date. */
function soonestUpcoming(ownerUid: string): EventDoc | null {
  const from = startOfDay(new Date()).getTime()
  return (
    mockStore()
      .events.filter((event) => event.ownerUid === ownerUid)
      .map((event) => {
        const option = event.dateOptions.find((o) => o.id === event.confirmedDateOptionId)
        return option ? { event, startsAt: option.startsAt } : null
      })
      .filter((row): row is { event: EventDoc; startsAt: string } => row !== null)
      .filter((row) => new Date(row.startsAt).getTime() >= from)
      .sort((a, b) => a.startsAt.localeCompare(b.startsAt))
      .map((row) => row.event)[0] ?? null
  )
}

/**
 * A card view carries the card and nothing else, exactly as the function
 * builds it: no event is read, and every event-shaped field stays empty.
 */
function buildCard(subjectId: string, ownerUid: string): GuestView {
  const card = mockStore().profiles.find((c) => c.id === subjectId && c.ownerUid === ownerUid)
  if (!card) throw new GuestError('invalid')

  const displayName = card.displayName || 'your host'
  const next = soonestUpcoming(ownerUid)

  return {
    scope: 'card',
    event: {
      title: '',
      description: '',
      hostName: displayName,
      location: { name: '', meetPoint: '', finishPoint: '', notes: '' },
      confirmedStartsAt: null,
    },
    subject: {
      name: displayName,
      roleLabel: '',
      status: 'confirmed',
      terms: { gives: '', gets: '' },
      goal: '',
      cta: '',
      constraintNote: '',
    },
    dateOptions: [],
    tasks: [],
    deliverables: [],
    deliverableCounts: emptyCounts(),
    runOfShow: [],
    links: [],
    recap: null,
    card: {
      displayName,
      headline: card.headline,
      methods: { ...card.methods },
      eventContext: next?.title ?? null,
    },
  }
}

function build(token: string): GuestView {
  const store = mockStore()
  const record = store.tokens.find((t) => t.id === token)
  if (!record || record.revoked) throw new GuestError('invalid')

  const scope = record.scope
  // A card token carries no event, so its view is built from the card alone.
  if (scope === 'card') return buildCard(record.subjectId, record.ownerUid)

  const event = store.events.find((e) => e.id === record.eventId)
  if (!event) throw new GuestError('invalid')

  const parties = store.parties[event.id] ?? []
  const crew = store.crew[event.id] ?? []
  const tasks = store.tasks[event.id] ?? []
  const runOfShow = store.runOfShow[event.id] ?? []
  const hostName = event.hostDisplayName || 'your host'
  const lookup = { parties, orgs: store.orgs, crew, hostName }

  const party = parties.find((p) => p.id === record.subjectId)
  const person = crew.find((c) => c.id === record.subjectId)
  if (!party && !person) throw new GuestError('invalid')

  const owner: OwnerRef = party ? `party:${party.id}` : `crew:${person!.id}`
  const org = party ? store.orgs.find((o) => o.id === party.orgId) : null
  const confirmed = event.dateOptions.find((o) => o.id === event.confirmedDateOptionId)

  // Party links only: a recap is a read-only look back, never a checklist.
  const deliverables: GuestDeliverable[] =
    scope === 'party' && party
      ? (party.deliverables ?? []).map((d) => ({
          id: d.id,
          direction: d.direction,
          title: d.title,
          due: d.due,
          done: d.done,
        }))
      : []

  const view: GuestView = {
    scope,
    event: {
      title: event.title,
      description: event.description,
      hostName,
      location: event.location,
      confirmedStartsAt: confirmed?.startsAt ?? null,
    },
    subject: {
      name: org?.name ?? person?.name ?? 'You',
      roleLabel: party ? orgTypeLabel(party.roleOnEvent) : 'Crew',
      status: party?.status ?? 'confirmed',
      terms: party?.terms ?? { gives: '', gets: '' },
      goal: party?.goal ?? '',
      cta: party?.cta ?? '',
      constraintNote: party?.constraintNote ?? '',
    },
    dateOptions: confirmed
      ? []
      : event.dateOptions.map((option) => ({
          id: option.id,
          startsAt: option.startsAt,
          response: party?.dateResponses[option.id]?.value ?? null,
        })),
    tasks: tasks
      .filter((t) => t.owner === owner)
      .map((t) => ({ id: t.id, title: t.title, dueDate: t.dueDate, status: t.status, note: t.note })),
    deliverables,
    deliverableCounts: countDeliverables(deliverables),
    runOfShow: runOfShow.map((item) => ({
      time: item.time,
      title: item.title,
      owner: ownerLabel(item.owner, lookup),
      mine: item.owner === owner || item.owner === 'all',
    })),
    // Draft links stay host-side; a partner should only ever see what is final.
    links: event.links.filter((l) => l.status === 'final').map((l) => ({ label: l.label, url: l.url })),
    recap: null,
    card: null,
  }

  if (record.scope === 'recap' && party) {
    const verified = store.contacts.filter((c) => c.eventId === event.id).length
    view.recap = {
      goal: party.goal,
      outcomes: party.outcomes.filter((o) => o.label && o.value).map((o) => ({ label: o.label, value: o.value })),
      signups: event.signupCount,
      attended: event.recap.headcount,
      verified,
      photosLink: event.recap.photosLink,
      postsRan: event.recap.postsRan,
      hostName,
    }
  }

  return view
}

export function mockGuestView(token: string): Promise<GuestView> {
  return Promise.resolve(build(token))
}

const trimmed = (value: unknown, max: number): string =>
  typeof value === 'string' ? value.trim().slice(0, max) : ''

let cardCaptureSeq = 0

export function mockGuestSubmit(
  token: string,
  action: GuestAction,
  payload: Record<string, unknown>,
): Promise<GuestView> {
  const store = mockStore()
  const record = store.tokens.find((t) => t.id === token)
  if (!record || record.revoked) throw new GuestError('invalid')
  // A recap link is read only, exactly as the real function enforces.
  if (record.scope === 'recap') throw new GuestError('invalid')

  const now = new Date().toISOString()

  // A card link takes one action and has no event to act on, so it is handled
  // before anything below reaches for one.
  if (record.scope === 'card') {
    if (action !== 'leave_contact') throw new GuestError('invalid')
    const name = trimmed(payload.name, 120)
    if (!name) throw new GuestError('invalid')

    const next = soonestUpcoming(record.ownerUid)
    const instagram = trimmed(payload.instagram, 120)
    const linkedin = trimmed(payload.linkedin, 300)
    const phone = trimmed(payload.phone, 40)
    const email = trimmed(payload.email, 200)

    cardCaptureSeq += 1
    const contact: CapturedContact = {
      id: `ct-card-${Date.now().toString(36)}${cardCaptureSeq.toString(36)}`,
      ownerUid: record.ownerUid,
      name,
      handles: {
        ...(instagram && { instagram }),
        ...(linkedin && { linkedin }),
        ...(phone && { phone }),
        ...(email && { email }),
      },
      eventId: next?.id ?? null,
      note: trimmed(payload.note, 1000),
      quote: '',
      voiceNote: null,
      followUp: { due: toDateKey(addDays(new Date(), 2)), done: false },
      personId: null,
      capturedAt: now,
      capturedBy: 'card',
    }
    store.contacts.push(contact)
    record.lastUsedAt = now
    mockPersist()
    return Promise.resolve(build(token))
  }

  if (action === 'leave_contact') throw new GuestError('invalid')

  const parties = store.parties[record.eventId] ?? []
  const party = parties.find((p) => p.id === record.subjectId)
  const tasks = store.tasks[record.eventId] ?? []

  if (action === 'respond_dates' && party) {
    const responses = (payload.responses ?? {}) as Record<string, 'yes' | 'no' | 'maybe'>
    for (const [optionId, value] of Object.entries(responses)) {
      party.dateResponses[optionId] = { value, source: 'link', note: '', at: now }
    }
    if (typeof payload.constraintNote === 'string') party.constraintNote = payload.constraintNote
  }

  if (action === 'update_task') {
    const task = tasks.find((t) => t.id === payload.taskId)
    if (task) {
      if (payload.status === 'open' || payload.status === 'done') task.status = payload.status
      if (typeof payload.note === 'string') task.note = payload.note
    }
  }

  if (action === 'confirm_role' && party) {
    party.status = payload.declined === true ? 'declined' : 'confirmed'
  }

  if (action === 'add_note' && party && typeof payload.note === 'string') {
    party.constraintNote = payload.note
  }

  if (action === 'update_deliverable' && party && typeof payload.done === 'boolean') {
    // Their own list, and only the half they owe: what the host brings is the
    // host's to tick off, and is read only on the guest page.
    const target = (party.deliverables ?? []).find((d) => d.id === payload.deliverableId)
    if (target && target.direction === 'party') target.done = payload.done
  }

  record.lastUsedAt = now
  mockPersist()
  return Promise.resolve(build(token))
}
