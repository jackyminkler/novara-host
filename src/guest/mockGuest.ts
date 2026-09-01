import { mockStore, mockPersist } from '../data/mock/mockApi'
import { GuestError } from './guestClient'
import type {
  BookingView,
  GuestAction,
  GuestDeliverable,
  GuestDeliverableCounts,
  GuestPayload,
  GuestView,
  HuddleView,
} from './guestTypes'
import { fitsInWindow, planPhase, windowsForFriend } from '../lib/availability'
import type { Booking } from '../data/types'
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

/**
 * A plan: one link, everyone on it, and nothing kept past its expiry.
 *
 * The defaults here are the same migration functions/src/index.ts and
 * firebaseApi run, so a document written before F20 reads the same in all
 * three. Twins in three build roots, moved together.
 */
function buildHuddle(token: string, youId: string | null): HuddleView {
  const store = mockStore()
  const record = store.tokens.find((t) => t.id === token)
  if (!record || record.revoked || expired(record)) throw new GuestError('invalid')
  const huddle = store.huddles.find((h) => h.id === record.subjectId)
  if (!huddle) throw new GuestError('invalid')

  const mine = youId ? huddle.participants.find((p) => p.id === youId) : null

  return {
    scope: 'huddle',
    huddleId: huddle.id,
    title: huddle.title,
    durationMinutes: huddle.durationMinutes,
    horizonDays: huddle.horizonDays,
    // The hours themselves stay host-side. Guests read the absolute windows
    // those hours already became.
    allowed: huddle.allowed ?? null,
    respondBy: huddle.respondBy ?? null,
    respondByMs: huddle.respondByMs ?? null,
    happenBy: huddle.happenBy ?? null,
    happenByMs: huddle.happenByMs ?? null,
    // Everyone's free time goes to everyone, which is the deal a plan makes:
    // you can see when the others are free, never what they are doing. Emails
    // are the exception, and only the caller's own comes back.
    participants: huddle.participants.map((p) => ({ id: p.id, name: p.name, free: p.free })),
    votes: huddle.votes,
    settledStartsAt: huddle.settledStartsAt,
    settledEndsAt: huddle.settledEndsAt ?? null,
    location: huddle.location ?? '',
    notes: huddle.notes ?? '',
    hostName: huddle.hostDisplayName || 'the organizer',
    inviteSent: Boolean(huddle.googleEventId),
    expiresAt: huddle.expiresAt,
    you: youId,
    yourEmail: mine ? mine.email || null : null,
  }
}

function build(token: string): GuestView {
  const store = mockStore()
  const record = store.tokens.find((t) => t.id === token)
  if (!record || record.revoked || expired(record)) throw new GuestError('invalid')

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
    // build() dispatched card above and booking/huddle exit earlier still, so
    // only the three event scopes reach this literal.
    scope: scope as 'party' | 'crew' | 'recap',
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

export function mockGuestView(token: string, you?: string): Promise<GuestPayload> {
  const store = mockStore()
  const record = store.tokens.find((t) => t.id === token)
  if (record?.scope === 'booking') return Promise.resolve(buildBooking(token))
  if (record?.scope === 'huddle') return Promise.resolve(buildHuddle(token, you ?? null))
  return Promise.resolve(build(token))
}

const trimmed = (value: unknown, max: number): string =>
  typeof value === 'string' ? value.trim().slice(0, max) : ''

let cardCaptureSeq = 0

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

  const eventId = record.eventId
  if (!eventId) throw new GuestError('invalid')
  const parties = store.parties[eventId] ?? []
  const party = parties.find((p) => p.id === record.subjectId)
  const tasks = store.tasks[eventId] ?? []

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

  // Before anything else, exactly as the function does it: a plan that has
  // settled, lapsed, or closed to answers takes no more of them, and refusing
  // here means nothing is half written on the way to finding that out.
  if (planPhase(huddle, Date.now()) !== 'open') throw new GuestError('closed')

  let you = typeof payload.you === 'string' ? payload.you : null

  if (action === 'join_huddle') {
    const name = String(payload.name ?? '').slice(0, 80).trim()
    // Finite rather than merely numeric, and capped, for the same reasons the
    // function gives: NaN is a number, and an unchecked list is a way to write
    // a megabyte into someone else's document.
    const free = Array.isArray(payload.free)
      ? (payload.free as { s: number; e: number }[])
          .filter((w) => Number.isFinite(w?.s) && Number.isFinite(w?.e) && w.e > w.s)
          .slice(0, 500)
      : []
    // Optional, and only ever for the calendar invite. An absent key on a
    // rejoin keeps what they left last time; a present one sets it, and an
    // empty or malformed one clears it.
    const emailGiven = 'email' in payload
    const typed = String(payload.email ?? '').slice(0, 120).trim()
    const email = /^\S+@\S+\.\S+$/.test(typed) ? typed : ''
    const source = payload.source === 'manual' ? 'manual' : 'calendar'
    if (name) {
      const existing = you ? huddle.participants.find((p) => p.id === you) : null
      if (existing) {
        // Rejoining replaces rather than duplicates: someone re-reading their
        // calendar after moving a meeting should update, not appear twice.
        existing.name = name
        existing.free = free
        existing.source = source
        if (emailGiven) existing.email = email
        else existing.email = existing.email ?? ''
      } else {
        you = `hp-${Date.now().toString(36)}${huddle.participants.length}`
        huddle.participants.push({
          id: you,
          name,
          free,
          email,
          source,
          joinedAt: new Date().toISOString(),
        })
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
