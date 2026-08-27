import { mockStore, mockPersist } from '../data/mock/mockApi'
import { GuestError } from './guestClient'
import type { GuestAction, GuestView } from './guestTypes'
import { orgTypeLabel, ownerLabel } from '../data/profiles'
import type { OwnerRef } from '../data/types'

// Mock mode serves guest pages straight from the in-memory store, so the
// guest experience can be checked at 390 px with nothing running behind it.
// The real path is the two Cloud Functions; this mirrors their output.

function build(token: string): GuestView {
  const store = mockStore()
  const record = store.tokens.find((t) => t.id === token)
  if (!record || record.revoked) throw new GuestError('invalid')

  // A card token carries no event, and its view is a different page entirely.
  // Rejected here until that page exists, so a card link never renders an
  // event view with every field blank.
  const scope = record.scope
  if (scope === 'card') throw new GuestError('invalid')

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
    runOfShow: runOfShow.map((item) => ({
      time: item.time,
      title: item.title,
      owner: ownerLabel(item.owner, lookup),
      mine: item.owner === owner || item.owner === 'all',
    })),
    // Draft links stay host-side; a partner should only ever see what is final.
    links: event.links.filter((l) => l.status === 'final').map((l) => ({ label: l.label, url: l.url })),
    recap: null,
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

export function mockGuestSubmit(
  token: string,
  action: GuestAction,
  payload: Record<string, unknown>,
): Promise<GuestView> {
  const store = mockStore()
  const record = store.tokens.find((t) => t.id === token)
  if (!record || record.revoked) throw new GuestError('invalid')
  // A recap link is read only, exactly as the real function enforces, and a
  // card link has no event to act on.
  if (record.scope === 'recap' || record.scope === 'card') throw new GuestError('invalid')

  const parties = store.parties[record.eventId] ?? []
  const party = parties.find((p) => p.id === record.subjectId)
  const tasks = store.tasks[record.eventId] ?? []
  const now = new Date().toISOString()

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

  record.lastUsedAt = now
  mockPersist()
  return Promise.resolve(build(token))
}
