import { mockStore, mockPersist } from '../data/mock/mockApi'
import { GuestError } from './guestClient'
import type { BookingView, GuestAction, GuestPayload, GuestView, HuddleView } from './guestTypes'
import { fitsInWindow, windowsForFriend } from '../lib/availability'
import type { Booking } from '../data/types'
import { orgTypeLabel, ownerLabel } from '../data/profiles'
import type { OwnerRef } from '../data/types'

// Mock mode serves guest pages straight from the in-memory store, so the
// guest experience can be checked at 390 px with nothing running behind it.
// The real path is the two Cloud Functions; this mirrors their output.

/** Expiry and revocation give the caller the same answer, as in the function. */
function expired(record: { expiresAt: string | null }): boolean {
  return Boolean(record.expiresAt && Date.parse(record.expiresAt) < Date.now())
}

/** F18. A booking link has no event, so it takes its own path out early. */
function buildBooking(token: string): BookingView {
  const store = mockStore()
  const record = store.tokens.find((t) => t.id === token)
  if (!record || record.revoked || expired(record)) throw new GuestError('invalid')
  const link = store.friendLinks.find((l) => l.id === record.subjectId)
  const settings = store.availabilitySettings
  if (!link || !settings) throw new GuestError('invalid')

  const now = new Date()
  const horizon = new Date(now.getFullYear(), now.getMonth(), now.getDate() + link.horizonDays)
  const booked = store.bookings.filter((b: Booking) => b.status === 'booked')

  return {
    scope: 'booking',
    hostName: 'your host',
    friendName: link.name,
    hostZone: settings.timeZone,
    kinds: settings.kinds,
    windows: windowsForFriend(
      (settings.windows ?? []).map((w) => ({ start: w.s, end: w.e })),
      { from: now, to: horizon, taken: booked, minMinutes: 15 },
    ).map((w) => ({ s: w.start, e: w.end })),
    mine: booked
      .filter((b) => b.friendLinkId === link.id)
      .map((b) => ({
        id: b.id,
        kind: b.kind,
        startsAt: b.startsAt,
        endsAt: b.endsAt,
        durationMinutes: b.durationMinutes,
      })),
  }
}

/** A huddle: one link, everyone on it, and nothing kept past its expiry. */
function buildHuddle(token: string, youId: string | null): HuddleView {
  const store = mockStore()
  const record = store.tokens.find((t) => t.id === token)
  if (!record || record.revoked || expired(record)) throw new GuestError('invalid')
  const huddle = store.huddles.find((h) => h.id === record.subjectId)
  if (!huddle) throw new GuestError('invalid')

  return {
    scope: 'huddle',
    huddleId: huddle.id,
    title: huddle.title,
    durationMinutes: huddle.durationMinutes,
    horizonDays: huddle.horizonDays,
    weekdays: huddle.weekdays,
    // Everyone's free time goes to everyone, which is the deal a huddle makes:
    // you can see when the others are free, never what they are doing.
    participants: huddle.participants.map((p) => ({ id: p.id, name: p.name, free: p.free })),
    votes: huddle.votes,
    settledStartsAt: huddle.settledStartsAt,
    expiresAt: huddle.expiresAt,
    you: youId,
  }
}

function build(token: string): GuestView {
  const store = mockStore()
  const record = store.tokens.find((t) => t.id === token)
  if (!record || record.revoked || expired(record)) throw new GuestError('invalid')

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
    // build() is only reached for event-scoped tokens; booking exits above.
    scope: record.scope as 'party' | 'crew' | 'recap',
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

export function mockGuestView(token: string, you?: string): Promise<GuestPayload> {
  const store = mockStore()
  const record = store.tokens.find((t) => t.id === token)
  if (record?.scope === 'booking') return Promise.resolve(buildBooking(token))
  if (record?.scope === 'huddle') return Promise.resolve(buildHuddle(token, you ?? null))
  return Promise.resolve(build(token))
}

export function mockGuestSubmit(
  token: string,
  action: GuestAction,
  payload: Record<string, unknown>,
): Promise<GuestPayload> {
  const store = mockStore()
  const record = store.tokens.find((t) => t.id === token)
  if (record?.scope === 'booking') return Promise.resolve(bookingSubmit(token, action, payload))
  if (record?.scope === 'huddle') return Promise.resolve(huddleSubmit(token, action, payload))
  if (!record || record.revoked) throw new GuestError('invalid')
  // A recap link is read only, exactly as the real function enforces.
  if (record.scope === 'recap') throw new GuestError('invalid')

  const eventId = record.eventId
  if (!eventId) throw new GuestError('invalid')
  const parties = store.parties[eventId] ?? []
  const party = parties.find((p) => p.id === record.subjectId)
  const tasks = store.tasks[eventId] ?? []
  const now = new Date().toISOString()

  if (action === 'respond_dates' && party) {
    const responses = (payload.responses ?? {}) as Record<string, 'yes' | 'no' | 'maybe'>
    const source = payload.source === 'calendar' ? 'calendar' : 'link'
    for (const [optionId, value] of Object.entries(responses)) {
      party.dateResponses[optionId] = { value, source, note: '', at: now }
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

function bookingSubmit(
  token: string,
  action: GuestAction,
  payload: Record<string, unknown>,
): BookingView {
  const store = mockStore()
  const record = store.tokens.find((t) => t.id === token)
  if (!record || record.revoked || expired(record)) throw new GuestError('invalid')
  const link = store.friendLinks.find((l) => l.id === record.subjectId)
  if (!link) throw new GuestError('invalid')

  if (action === 'book_slot') {
    const startsAt = String(payload.startsAt ?? '')
    const durationMinutes = Number(payload.durationMinutes ?? 0)
    const endsAt = new Date(new Date(startsAt).getTime() + durationMinutes * 60000).toISOString()
    const kind = payload.kind as Booking['kind']
    // Re-check against the live windows rather than trusting the posted time:
    // the page may be minutes old, and this is the one place in the feature
    // with shared state. The end is recomputed here, never accepted.
    const view = buildBooking(token)
    const open = fitsInWindow(
      view.windows.map((w) => ({ start: w.s, end: w.e })),
      startsAt,
      durationMinutes,
    )
    if (open) {
      store.bookings.push({
        id: `bk-${Date.now().toString(36)}`,
        ownerUid: link.ownerUid,
        friendLinkId: link.id,
        friendName: String(payload.friendName ?? link.name),
        kind,
        startsAt,
        endsAt,
        durationMinutes,
        contact: String(payload.contact ?? ''),
        note: String(payload.note ?? ''),
        status: 'booked',
        createdAt: new Date().toISOString(),
      })
    }
  }

  if (action === 'cancel_booking') {
    const booking = store.bookings.find(
      (b: Booking) => b.id === payload.bookingId && b.friendLinkId === link.id,
    )
    if (booking) booking.status = 'cancelled'
  }

  record.lastUsedAt = new Date().toISOString()
  mockPersist()
  return buildBooking(token)
}

function huddleSubmit(
  token: string,
  action: GuestAction,
  payload: Record<string, unknown>,
): HuddleView {
  const store = mockStore()
  const record = store.tokens.find((t) => t.id === token)
  if (!record || record.revoked || expired(record)) throw new GuestError('invalid')
  const huddle = store.huddles.find((h) => h.id === record.subjectId)
  if (!huddle) throw new GuestError('invalid')

  let you = typeof payload.you === 'string' ? payload.you : null

  if (action === 'join_huddle') {
    const name = String(payload.name ?? '').slice(0, 80).trim()
    const free = Array.isArray(payload.free)
      ? (payload.free as { s: number; e: number }[]).filter(
          (w) => typeof w?.s === 'number' && typeof w?.e === 'number' && w.e > w.s,
        )
      : []
    if (name) {
      const existing = you ? huddle.participants.find((p) => p.id === you) : null
      if (existing) {
        // Rejoining replaces rather than duplicates: someone re-reading their
        // calendar after moving a meeting should update, not appear twice.
        existing.name = name
        existing.free = free
      } else {
        you = `hp-${Date.now().toString(36)}${huddle.participants.length}`
        huddle.participants.push({ id: you, name, free, joinedAt: new Date().toISOString() })
      }
    }
  }

  if (action === 'cast_vote' && you) {
    const key = String(payload.slot ?? '')
    if (/^\d+$/.test(key)) {
      // One vote each, moved rather than accumulated: a tally where someone
      // voted for everything is not a tally.
      for (const ids of Object.values(huddle.votes)) {
        const at = ids.indexOf(you)
        if (at >= 0) ids.splice(at, 1)
      }
      huddle.votes[key] = [...(huddle.votes[key] ?? []), you]
    }
  }

  record.lastUsedAt = new Date().toISOString()
  mockPersist()
  return buildHuddle(token, you)
}
