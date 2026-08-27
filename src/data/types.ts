// Shapes for every hp_ document. PRD section 3.3 is the base; F10 to F13 add
// the fields below it, per the note in 3.3 that the builder defines them
// following the same conventions.

export type OrgType = 'cohost' | 'sponsor' | 'vendor' | 'activation' | 'venue'
export type EventStatus = 'draft' | 'planning' | 'confirmed' | 'live' | 'wrapped'
export type PartyStatus = 'invited' | 'confirmed' | 'declined'
export type ResponseValue = 'yes' | 'no' | 'maybe'
export type LinkStatus = 'draft' | 'final'
export type TokenScope = 'party' | 'crew' | 'recap' | 'booking' | 'huddle'

/** Where a date response came from. Both count the same toward confirming. */
/**
 * Where an answer came from.
 *
 * `calendar` is a partner who connected their own calendar through the guest
 * link rather than tapping yes or no. It counts the same toward confirming a
 * date, and the matrix marks it so the host knows it was read rather than
 * decided.
 */
export type ResponseSource = 'link' | 'host' | 'calendar'

/**
 * Owner of a task or run-of-show item. Stored as a prefixed string so one
 * field can address the host, a party, a crew person, or everyone. PRD 3.3
 * predates crew; F13 makes the prefix necessary.
 */
export type OwnerRef = 'host' | 'all' | `party:${string}` | `crew:${string}`

export interface Contact {
  name: string
  role?: string
  email?: string
  phone?: string
  instagram?: string
  linkedin?: string
}

/** Host-added labelled field on any org or party. */
export interface CustomField {
  label: string
  value: string
}

export interface Org {
  id: string
  /**
   * The host who owns this document. One field name across every top-level hp_
   * collection, because the security rules and every list query read it, and a
   * per-collection name is a hand-verification trap. Collections that already had
   * an owner-ish field (createdBy, hostUid, capturedBy) keep it unchanged.
   */
  ownerUid: string
  name: string
  type: OrgType
  description: string
  contacts: Contact[]
  /** Built-in fields for this org type, keyed by profile field key. */
  profile: Record<string, string>
  customFields: CustomField[]
  /** Private to the host, never on a guest page. */
  via: string
  relationshipTerms: string
  notes: string
  createdAt: string
  createdBy: string
}

export interface DateOption {
  id: string
  startsAt: string
  label: string
}

export interface EventLink {
  id: string
  label: string
  url: string
  owner: OwnerRef
  status: LinkStatus
}

export interface EventLocation {
  name: string
  meetPoint: string
  finishPoint: string
  notes: string
}

/** F12. Which listing is official and who holds the guest contacts. */
export interface PageGovernance {
  officialListing: string
  listingUrl: string
  guestContactsOwner: string
  dualPosts: string
}

/** F11. Host-entered, filled after the event. */
export interface EventRecap {
  headcount: number | null
  /** Names the host remembers. Full roster import is M1. */
  remembered: string[]
  photosLink: string
  postsRan: string
  generatedAt: string | null
}

export interface EventDoc {
  id: string
  ownerUid: string
  /**
   * Stable slug for an event that already happened elsewhere, matching
   * `Registration.eventKey`. Null for events created in the app.
   *
   * The join runs on this rather than on the document id so the guest importer
   * stays independent of event creation: slugs are stable, ids are generated,
   * and an event recreated by hand would otherwise orphan 1,233 registrations.
   */
  sourceKey: string | null
  title: string
  status: EventStatus
  description: string
  dateOptions: DateOption[]
  confirmedDateOptionId: string | null
  location: EventLocation
  links: EventLink[]
  capacityTarget: number | null
  /** F12, event-level campaign goal: app launch, feature promo, hiring. */
  campaignGoal: string
  governance: PageGovernance
  signupCount: number | null
  recap: EventRecap
  templateId: string | null
  hostUid: string
  /** Denormalised so guest pages can say who invited them without an auth read. */
  hostDisplayName: string
  createdAt: string
}

export interface DateResponse {
  value: ResponseValue
  source: ResponseSource
  note: string
  at: string
}

/** F11. Up to three per party, echoed against their goal on the recap. */
export interface Outcome {
  id: string
  label: string
  value: string
}

export interface Party {
  id: string
  orgId: string
  roleOnEvent: OrgType
  status: PartyStatus
  terms: { gives: string; gets: string }
  /** F12. Opens the recap; the CTA feeds the welcome script. */
  goal: string
  cta: string
  dateResponses: Record<string, DateResponse>
  constraintNote: string
  tokenId: string | null
  nudgeCount: number
  /** Type-profile values overridden for this event. */
  profile: Record<string, string>
  customFields: CustomField[]
  outcomes: Outcome[]
  order: number
}

export interface Task {
  id: string
  title: string
  owner: OwnerRef
  dueDate: string | null
  /** Set when the task came from a template and no date is confirmed yet. */
  offsetDays: number | null
  status: 'open' | 'done'
  note: string
  order: number
}

export interface RunItem {
  id: string
  time: string
  title: string
  owner: OwnerRef
  notes: string
  order: number
}

/** F13. Named helpers with no accounts, scoped to one event in M0. */
export interface CrewMember {
  id: string
  name: string
  note: string
  tokenId: string | null
}

export interface LogEntry {
  id: string
  text: string
  createdAt: string
}

// F3 templates. User data in hp_templates, never hardcoded in the app.

export interface RoleSlot {
  slot: string
  orgType: OrgType
  required: boolean
}

export interface TaskSkeletonItem {
  title: string
  ownerSlot: string
  /** Negative means days before the event. */
  offsetDays: number
  note?: string
}

export interface RunSkeletonItem {
  offsetMinutes: number
  title: string
  ownerSlot: string
  notes?: string
}

export interface Template {
  id: string
  ownerUid: string
  name: string
  description: string
  roleSlots: RoleSlot[]
  taskSkeleton: TaskSkeletonItem[]
  runOfShowSkeleton: RunSkeletonItem[]
  defaults: {
    capacityTarget?: number
    durationMinutes?: number
    startTime?: string
  }
  createdFrom: 'seed' | 'event' | 'blank'
  createdAt: string
}

// F8 meeting capture.

export interface CapturedContact {
  id: string
  ownerUid: string
  name: string
  handles: {
    instagram?: string
    linkedin?: string
    phone?: string
    email?: string
  }
  eventId: string | null
  note: string
  followUp: { due: string; done: boolean } | null
  capturedAt: string
  capturedBy: string
}

// F10 calendar.

export interface AvailabilityBlock {
  id: string
  ownerUid: string
  kind: 'away' | 'open'
  startDate: string
  endDate: string
  label: string
}

export interface CitywideMoment {
  id: string
  ownerUid: string
  name: string
  startDate: string
  endDate: string
}

/**
 * F14 to F19, the personal availability layer.
 *
 * Deliberate: the host's calendar never leaves her browser. The `.ics` is
 * parsed locally, derivation runs locally, and the only thing stored is the
 * list of openings she is offering. No titles, no locations, no attendees,
 * and not even the times she is busy. A booking link can therefore only ever
 * reveal when she is free, which is exactly what she is choosing to publish.
 *
 * It also keeps the guest function trivial: filter to the horizon, drop what
 * is already booked, return. No derivation logic on the server, so there is
 * no second copy of the rules to keep in step.
 */
/** Mirrors MeetKind in src/lib/availability, kept here so data has no lib import. */
export type MeetKindName = 'coffee' | 'run' | 'call'

export interface AvailabilitySettings {
  /** Document id is the owner's uid: one settings document per host. */
  ownerUid: string
  /**
   * When she is open at all, by weekday, index 0 = Sunday. Always seven.
   * This is the sleep and downtime setting, and the only time constraint:
   * inside these hours anything not on the calendar is bookable.
   */
  openHours: DayHoursDoc[]
  /**
   * The host's IANA zone, for example "America/Los_Angeles".
   *
   * Open hours are wall clock, so turning them into absolute time needs a
   * named zone. Everything published is absolute, so this is only needed for
   * derivation and for labelling times to someone in a different zone.
   */
  timeZone: string
  /** Minutes kept clear either side of anything already on the calendar. */
  bufferMinutes: number
  /** Kinds of thing to do, each a suggested duration rather than a fixed slot. */
  kinds: KindTemplateDoc[]
  defaultHorizonDays: number
  /**
   * The published open stretches. One row per stretch, not per possible start
   * time: enumerating starts was storing a rendering choice, and it turned an
   * ordinary calendar into four thousand "open times".
   */
  windows: { s: number; e: number }[]
  /** Where the events came from last time. Null until she connects anything. */
  source: 'google' | 'file' | null
  /** Which Google calendars to read. Empty when the source is a file. */
  googleCalendarIds: string[]
  calendarImportedAt: string | null
  /** How many events the last import read, for the host's own confidence. */
  importedEventCount: number
}

export interface DayHoursDoc {
  /** Local "HH:MM". */
  start: string
  end: string
  /** Closing a day keeps its hours, so toggling it back on restores them. */
  open: boolean
}

export interface KindTemplateDoc {
  kind: MeetKindName
  label: string
  defaultMinutes: number
  choices: number[]
}

export interface FriendLink {
  id: string
  ownerUid: string
  name: string
  horizonDays: number
  kinds: MeetKindName[]
  tokenId: string
  createdAt: string
}

/**
 * A group finding a time together, live.
 *
 * Unlike every other guest link, one huddle link goes to everyone: that is the
 * point, "drop your calendar into this and let's see". It is safe to share
 * because it expires, and because the only thing anyone contributes is free
 * time with no titles attached.
 */
export interface Huddle {
  id: string
  ownerUid: string
  title: string
  durationMinutes: number
  horizonDays: number
  /** Weekdays worth considering, 0 = Sunday. Empty means any day. */
  weekdays: number[]
  tokenId: string
  participants: HuddleParticipant[]
  /** Slot start in epoch milliseconds, as a string key, to the ids that voted. */
  votes: Record<string, string[]>
  /** Set once the group picks, which is what an event gets created from. */
  settledStartsAt: string | null
  createdAt: string
  expiresAt: string | null
}

export interface HuddleParticipant {
  id: string
  name: string
  /** Their free time, derived in their own browser. Never their events. */
  free: { s: number; e: number }[]
  joinedAt: string
}

/** F19. A booked slot. Blocks the time for every other friend. */
export interface Booking {
  id: string
  ownerUid: string
  friendLinkId: string
  friendName: string
  kind: MeetKindName
  startsAt: string
  endsAt: string
  /** Chosen at booking from the kind's suggestion, not fixed by the kind. */
  durationMinutes: number
  /** How to reach them, as typed. Free text on purpose. */
  contact: string
  note: string
  status: 'booked' | 'cancelled'
  createdAt: string
}

export interface GuestToken {
  id: string
  ownerUid: string
  /**
   * Null for booking tokens. Every other scope is about one event; a booking
   * link belongs to the host herself, so this is the first guest token that is
   * not scoped to an event subtree. Widening this is deliberate, and noted in
   * docs/Availability_Feature_Plan_v1.md section 4.
   */
  eventId: string | null
  scope: TokenScope
  subjectId: string
  revoked: boolean
  createdAt: string
  lastUsedAt: string | null
  /**
   * When the link stops working on its own. Null means never, which is right
   * for a partner or friend link they are meant to keep. A huddle or a
   * one-off calendar check sets one, and the host can push it out again.
   */
  expiresAt: string | null
}

/** Expiry choices, shortest first. Capped at a month: past that, "never" is honest. */
export const EXPIRY_PRESETS: { hours: number; label: string }[] = [
  { hours: 1, label: '1 hour' },
  { hours: 4, label: '4 hours' },
  { hours: 24, label: '1 day' },
  { hours: 72, label: '3 days' },
  { hours: 168, label: '1 week' },
  { hours: 336, label: '2 weeks' },
  { hours: 720, label: '1 month' },
]

// CRM. Guest CRM Plan section 2. People who attend events, with per-event
// registration history. Host-side only: guests never read or write hp_people.

/**
 * Derived on every import, never typed by hand. Precedence, not recency:
 * approved anywhere beats invited anywhere beats declined, so someone who
 * declined one run and came to another is signed_up, and declined_only means
 * never approved for anything.
 */
export type PersonTier = 'signed_up' | 'invited_only' | 'declined_only'

export type RegistrationStatus = 'approved' | 'invited' | 'declined'

export interface Registration {
  /** Stable slug for the event, e.g. "2026-06-13-sunrise-run-2". */
  eventKey: string
  lumaEventId: string | null
  status: RegistrationStatus
  registeredAt: string
  checkedInAt: string | null
  source: string | null
  surveyRating: number | null
  surveyFeedback: string | null
  /** Event-specific registration questions, keyed by the question text. */
  answers: Record<string, string>
}

export interface Person {
  id: string
  ownerUid: string
  /** Normalised to trimmed lowercase. The dedupe key for every import. */
  email: string
  firstName: string
  lastName: string
  fullName: string
  phone: string | null
  handles: { instagram?: string; linkedin?: string }
  /**
   * The consumer-app users doc for this person, once matched. Null until then.
   * A link, not a copy, per docs/Partner_Identity_And_Linking_Model_v1.md: the
   * host's notes live here and never flow into the identity.
   */
  appUserUid: string | null
  tier: PersonTier
  /** Count of registrations with status approved. Derived. */
  eventCount: number
  firstSeenAt: string
  lastSeenAt: string
  sources: string[]
  referredBy: string[]
  /** The only fields a host edits. An import must never clear them. */
  notes: string
  followUp: { due: string; done: boolean } | null
  tags: string[]
  /**
   * Embedded rather than a subcollection: bounded (a person attends tens of
   * events, not thousands) and every read of a person wants the history.
   */
  registrations: Registration[]
}

// Step 4. Feedback from a friends-and-family tester, written from anywhere in
// the app. Deliberately write-only from the product's side: the host reads it
// out of the console. A whole feedback system is not the point of this.

export interface Feedback {
  id: string
  ownerUid: string
  text: string
  /** Where they were when they sent it, so a vague note is still actionable. */
  route: string
  createdAt: string
}

/** Everything the event workspace needs, in one call. */
export interface EventBundle {
  event: EventDoc
  parties: Party[]
  tasks: Task[]
  runOfShow: RunItem[]
  crew: CrewMember[]
  orgs: Org[]
}
