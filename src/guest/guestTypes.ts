// The shape hpGuestView returns and hpGuestSubmit echoes back. This file and
// functions/src/guestTypes.ts are the same contract in two build roots; keep
// them in step.

export type GuestScope = 'party' | 'crew' | 'recap'

export interface GuestDateOption {
  id: string
  startsAt: string
  /** This party's own answer, if they or the host has given one. */
  response: 'yes' | 'no' | 'maybe' | null
}

export interface GuestTask {
  id: string
  title: string
  dueDate: string | null
  status: 'open' | 'done'
  note: string
}

export interface GuestRunItem {
  time: string
  title: string
  owner: string
  mine: boolean
}

export interface GuestLink {
  label: string
  url: string
}

export interface GuestRecap {
  goal: string
  outcomes: { label: string; value: string }[]
  signups: number | null
  attended: number | null
  verified: number
  photosLink: string
  postsRan: string
  hostName: string
}

export interface GuestView {
  scope: GuestScope
  event: {
    title: string
    description: string
    hostName: string
    location: { name: string; meetPoint: string; finishPoint: string; notes: string }
    confirmedStartsAt: string | null
  }
  subject: {
    name: string
    roleLabel: string
    status: 'invited' | 'confirmed' | 'declined'
    terms: { gives: string; gets: string }
    goal: string
    cta: string
    constraintNote: string
  }
  dateOptions: GuestDateOption[]
  tasks: GuestTask[]
  runOfShow: GuestRunItem[]
  links: GuestLink[]
  recap: GuestRecap | null
}

export type GuestAction =
  | 'respond_dates'
  | 'update_task'
  | 'confirm_role'
  | 'add_note'
  | 'book_slot'
  | 'cancel_booking'
  | 'join_huddle'
  | 'cast_vote'

export interface GuestSubmitBody {
  t: string
  action: GuestAction
  payload: Record<string, unknown>
}

/** F18. A booking link is not about an event, so it gets its own payload. */
export type BookingKind = 'coffee' | 'run' | 'call'

export interface BookingSlot {
  kind: BookingKind
  startsAt: string
  endsAt: string
  durationMinutes: number
}

/** A stretch the host is open. Epoch milliseconds, short keys to stay small. */
export interface BookingWindow {
  s: number
  e: number
}

/** A thing to do together. The duration is a suggestion, not a fixed length. */
export interface BookingKindTemplate {
  kind: BookingKind
  label: string
  defaultMinutes: number
  choices: number[]
}

export interface BookingView {
  scope: 'booking'
  hostName: string
  friendName: string
  /**
   * The host's IANA zone. Times are absolute, so nothing needs converting,
   * but a friend in another city has to be told whose morning this is.
   */
  hostZone: string
  kinds: BookingKindTemplate[]
  /**
   * Only the open stretches, never the calendar. The host's events, titles,
   * and locations are computed against on the server and never sent here.
   */
  windows: BookingWindow[]
  /** What this friend has already booked, so the page can show and cancel it. */
  mine: (BookingSlot & { id: string })[]
}


/**
 * A group finding a time together. One link, everyone, expires. Called a plan
 * in every string a guest reads.
 */
export interface HuddleParticipantView {
  id: string
  name: string
  /** Their free time. Titles never exist on this path: freebusy has none. */
  free: { s: number; e: number }[]
}

export interface HuddleView {
  scope: 'huddle'
  huddleId: string
  title: string
  durationMinutes: number
  horizonDays: number
  /**
   * The hours the organizer opened, already absolute. Their browser did the
   * one wall-clock conversion there is, so a guest in another zone reads
   * milliseconds and converts nothing. Null means unbounded, which is what a
   * plan written before F20 has.
   */
  allowed: { s: number; e: number }[] | null
  /** 'YYYY-MM-DD' for display. Deadlines are enforced on the Ms fields, never these. */
  respondBy: string | null
  respondByMs: number | null
  happenBy: string | null
  happenByMs: number | null
  participants: HuddleParticipantView[]
  /** Slot start in epoch milliseconds as a string key, to participant ids. */
  votes: Record<string, string[]>
  settledStartsAt: string | null
  settledEndsAt: string | null
  location: string
  notes: string
  hostName: string
  /** True once the organizer has created the calendar invite. */
  inviteSent: boolean
  expiresAt: string | null
  /**
   * Who this browser is, once they have joined. Held by the page rather than a
   * cookie: a plan is a moment, not a session worth persisting.
   */
  you: string | null
  /**
   * The caller's own email, if they left one, so the page can show it back and
   * let them change it. Only ever theirs: nobody else's address is in this
   * view at all, which is the whole reason emails live off the participant
   * list that everyone can see.
   */
  yourEmail: string | null
}

/** What hpGuestView returns. Discriminated by scope. */
export type GuestPayload = GuestView | BookingView | HuddleView

export function isBookingView(view: GuestPayload): view is BookingView {
  return view.scope === 'booking'
}

export function isHuddleView(view: GuestPayload): view is HuddleView {
  return view.scope === 'huddle'
}
