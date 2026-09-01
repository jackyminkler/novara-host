// Mirror of src/guest/guestTypes.ts. Two build roots, one contract: change
// one and change the other in the same commit.

/**
 * What a link opens. `card` is the host's share card and is the only scope
 * with no event behind it: those tokens carry an `eventId` of `''` and a
 * `subjectId` of the host's own uid.
 */
export type GuestScope = 'party' | 'crew' | 'recap' | 'card'

export interface GuestDateOption {
  id: string
  startsAt: string
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

/** One line of the agreement, in whichever direction it runs. */
export interface GuestDeliverable {
  id: string
  /** `party` means this partner brings it, `host` means the host does. */
  direction: 'party' | 'host'
  title: string
  due: string | null
  done: boolean
}

/** The effort ledger, so both sides read the same counts. */
export interface GuestDeliverableCounts {
  party: { done: number; total: number }
  host: { done: number; total: number }
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

/**
 * The host's share card. Everything on it is what the host chose to hand out,
 * which is deliberately not everything the account knows: a card view carries
 * this and nothing else, with every event-shaped field on the view left empty.
 */
export interface GuestCard {
  displayName: string
  headline: string
  methods: {
    instagram?: string
    linkedin?: string
    phone?: string
    email?: string
    other?: string
  }
  /** Title of the host's soonest upcoming event, for context. Null when none. */
  eventContext: string | null
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
  /** Party links only. Empty on every other scope. */
  deliverables: GuestDeliverable[]
  deliverableCounts: GuestDeliverableCounts
  runOfShow: GuestRunItem[]
  links: GuestLink[]
  recap: GuestRecap | null
  card: GuestCard | null
}

export type GuestAction =
  | 'respond_dates'
  | 'update_task'
  | 'confirm_role'
  | 'add_note'
  // M1. Scoped as tightly as the four above: a deliverable toggle is party
  // only and reaches one party's own list, and leaving contact details is
  // card only and writes nothing an event can see.
  | 'update_deliverable'
  | 'leave_contact'

/** Only these actions are ever accepted. PRD 3.2, extended for M1. */
  | 'book_slot'
  | 'cancel_booking'
  | 'join_huddle'
  | 'cast_vote'

/**
 * Only these actions are ever accepted. The first four are PRD 3.2; the two
 * booking actions are F18 and are refused for every scope except `booking`;
 * the two huddle actions are the same for `huddle`. Still two endpoints, per
 * the standing rule against a third.
 *
 * This array is the runtime gate, and the type above is not. An action that
 * exists in `GuestAction` but is missing here is refused as `unknown_action`
 * before the scope handler ever runs, which is how the huddle actions were
 * dead in production while mock mode, which never consults this array, kept
 * showing them working.
 */
export const GUEST_ACTIONS: GuestAction[] = [
  'respond_dates',
  'update_task',
  'confirm_role',
  'add_note',
  'update_deliverable',
  'leave_contact',
  'book_slot',
  'cancel_booking',
  'join_huddle',
  'cast_vote',
]

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
