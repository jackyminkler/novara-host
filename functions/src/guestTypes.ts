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
export const GUEST_ACTIONS: GuestAction[] = [
  'respond_dates',
  'update_task',
  'confirm_role',
  'add_note',
  'update_deliverable',
  'leave_contact',
]
