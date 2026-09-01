// Shapes for every hp_ document. PRD section 3.3 is the base; F10 to F13 add
// the fields below it, per the note in 3.3 that the builder defines them
// following the same conventions. M1 (PRD section 5) adds another layer on
// top of those, marked as such where it lands.
//
// Fields added after a collection went live are still declared required here
// and defaulted by whoever writes the document, because a field that is
// optional in the type is a field every call site has to remember to check.
// Production documents predate the M1 fields, so firebaseApi normalizes them
// on read instead: see the normalizers at the top of that file.

export type OrgType = 'cohost' | 'sponsor' | 'vendor' | 'activation' | 'venue'
export type EventStatus = 'draft' | 'planning' | 'confirmed' | 'live' | 'wrapped'
export type PartyStatus = 'invited' | 'confirmed' | 'declined'
export type ResponseValue = 'yes' | 'no' | 'maybe'
export type LinkStatus = 'draft' | 'final'
/**
 * What a capability token opens. M1 adds `card`, the host's share card, which
 * carries an `eventId` of `''` and a `subjectId` of the host's own uid.
 * Booking and huddle tokens (F14 to F19) also have no event behind them and
 * carry `eventId` of null.
 */
export type TokenScope = 'party' | 'crew' | 'recap' | 'card' | 'booking' | 'huddle'

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

/** M1 site profiles. One lesson learned at one event, kept on the venue. */
export interface SiteLesson {
  id: string
  text: string
  eventId: string | null
  at: string
}

/**
 * M1 site profiles and the lessons loop. Private to the host and meaningful
 * on a venue, where the wind, the power, and the permit line are the things
 * nobody remembers until the morning of the next one.
 */
export interface SiteProfile {
  lessons: SiteLesson[]
  /** Headcount above which this site needs a permit, plus the sound rule. */
  permitThresholds: { amplifiedSound: boolean; headcountAbove: number | null }
  notes: string
}

/**
 * M1 standing availability. A window this partner is usually open for, or a
 * stretch they are usually out. Free text plus optional dates, because most
 * of what a partner says about their calendar is a sentence, not a range.
 */
export interface StandingNote {
  id: string
  kind: 'window' | 'blackout'
  text: string
  startDate: string | null
  endDate: string | null
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
  /** M1. Null on every org that is not a place. */
  siteProfile: SiteProfile | null
  /** M1. What this partner's calendar usually looks like. */
  standing: StandingNote[]
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

/**
 * M1 sponsor ROI. What the event cost, in money or in kind, optionally
 * attributed to the party who covered it. Host-side only: spend never
 * reaches a guest page.
 */
export interface SpendEntry {
  id: string
  label: string
  amount: number
  kind: 'cash' | 'inkind'
  partyId: string | null
}

/** M1 shot list. What to photograph, and who is holding the camera. */
export interface ShotItem {
  id: string
  description: string
  owner: OwnerRef
  done: boolean
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
  /** M1 sponsor ROI, host-side only. */
  spendLog: SpendEntry[]
  /** M1. Conversation prompts for the day, one line each. */
  talkTracks: string[]
  /** M1. */
  shotList: ShotItem[]
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

/**
 * M1 deliverables checklist and effort ledger. Both directions on one list,
 * so an informal arrangement where one side quietly does everything stays
 * visible instead of being remembered differently by each party.
 */
export interface Deliverable {
  id: string
  /** Who owes it: `party` means they deliver, `host` means you do. */
  direction: 'party' | 'host'
  title: string
  due: string | null
  done: boolean
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
  /** M1. Both directions, shown to this party on their guest page. */
  deliverables: Deliverable[]
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

/**
 * M1 matching. Plain configuration, held on the template because a run that
 * pairs people asks the same questions every time it happens. Nothing here
 * couples to the engine: it names a mode and a profile and lists the signup
 * questions the run needs, and the engine reads those names later.
 */
export interface TemplateMatching {
  mode: 'rank' | 'sparks' | 'pods'
  profileName: string
  /** Signup questions this profile needs. Without them, matching cannot run. */
  requiredQuestions: string[]
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
  /** M1. Null on a template whose events do not pair anyone up. */
  matching: TemplateMatching | null
  createdFrom: 'seed' | 'event' | 'blank'
  createdAt: string
}

/**
 * M1 matching. One stored run per document, in the `matching` subcollection
 * of its event, so a later run never overwrites what the last one produced.
 * The engine itself is pure and client side; this only keeps the output.
 */
export interface MatchingRun {
  id: string
  mode: 'rank' | 'sparks' | 'pods'
  profileName: string
  /** Which vendored engine source produced this, for reading old runs back. */
  engineVersion: string
  createdAt: string
  peopleCount: number
  matchedCount: number
  /** Engine JSON, shape per the matchcore output. Stored, never interpreted here. */
  results: unknown
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
  /** M1 quote capture. Something they actually said, kept in their words. */
  quote: string
  /**
   * M1 voice notes. Uploaded to Storage under hp_voice; `path` is the object
   * path and `url` the download URL. Null until one is recorded.
   */
  voiceNote: { path: string; url: string; durationSec: number } | null
  followUp: { due: string; done: boolean } | null
  /**
   * The hp_people document this capture was folded into, once it has been.
   * Null until then, and set by `promoteContactToPerson` rather than by hand.
   *
   * It exists so the promote action can be offered exactly once. A capture
   * with no email has no dedupe key, so a second promotion would build a
   * second person instead of merging into the first, and nothing else on the
   * capture records that it already happened.
   */
  personId: string | null
  capturedAt: string
  capturedBy: string
}

/**
 * M1 QR share card. One document per host in hp_profiles, with the uid as
 * the document id, so the card is reachable without a query. What the host
 * chooses to hand out, which is deliberately not everything the account knows.
 */
export interface HostCard {
  id: string
  ownerUid: string
  displayName: string
  headline: string
  methods: {
    instagram?: string
    linkedin?: string
    phone?: string
    email?: string
    other?: string
  }
  /** The `card` scoped token the public link opens. Null until issued. */
  cardTokenId: string | null
  updatedAt: string
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
 * A group finding a time together, live. Called a plan everywhere a person
 * can read it; the code word stayed `Huddle` from the first build.
 *
 * Unlike every other guest link, one plan link goes to everyone: that is the
 * point, "drop your calendar into this and let's see". It is safe to share
 * because it expires, and because the only thing anyone contributes is free
 * time with no titles attached.
 *
 * See docs/features/plans.md before changing anything here.
 */
export interface Huddle {
  id: string
  ownerUid: string
  title: string
  durationMinutes: number
  horizonDays: number
  /**
   * Which hours are worth considering, by weekday, index 0 = Sunday. Always
   * seven. "After work or weekends" is different hours on different days,
   * which a list of weekdays could never say. Documents written before F20
   * carry `weekdays: number[]` instead and are migrated on read.
   */
  hours: DayHoursDoc[]
  /**
   * Those hours as absolute stretches, derived in the organizer's browser at
   * create and edit time. Wall clock needs a zone to become absolute, so it
   * is turned into milliseconds once, where the plan was written, and every
   * guest afterwards reads numbers and converts nothing. Null on a document
   * written before F20, which means unbounded rather than empty.
   */
  allowed: { s: number; e: number }[] | null
  /** 'YYYY-MM-DD', when answers close. Null means no cutoff. For editing and display. */
  respondBy: string | null
  /** 'YYYY-MM-DD', when the thing has to have happened by. Null means open ended. */
  happenBy: string | null
  /**
   * The same two dates as end-of-day epoch milliseconds, computed in the
   * organizer's browser. These are the enforcement values: the guest
   * functions compare these numbers against now and never parse the date
   * strings, which have no zone in them to parse against.
   */
  respondByMs: number | null
  happenByMs: number | null
  tokenId: string
  participants: HuddleParticipant[]
  /** Slot start in epoch milliseconds, as a string key, to the ids that voted. */
  votes: Record<string, string[]>
  /** Set once the group picks, which is what an event gets created from. */
  settledStartsAt: string | null
  /** The end of the picked time. Set with settledStartsAt, null until then. */
  settledEndsAt: string | null
  /** Where, once there is a where. Free text, added with the pick. */
  location: string
  /** Anything else the group needs to know. Free text, added with the pick. */
  notes: string
  /** The Google Calendar event the pick created, so a later edit updates it. */
  googleEventId: string | null
  /** Shown to guests as the person who is organizing. */
  hostDisplayName: string
  /** The organizer's IANA zone. Reference only: everything stored is absolute. */
  timeZone: string
  createdAt: string
  expiresAt: string | null
}

export interface HuddleParticipant {
  id: string
  name: string
  /** Their free time, derived in their own browser. Never their events. */
  free: { s: number; e: number }[]
  /**
   * Optional, and only ever for the calendar invite. Empty when they did not
   * give one. Never shown to the other guests: the view sends a participant
   * their own address back and nobody else's.
   */
  email: string
  /** How they said it: a calendar read, or days picked by hand. */
  source: 'calendar' | 'manual'
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

/**
 * M1 standing availability. The parties on one event, without the tasks, the
 * run of show, the crew and the directory that a bundle would also carry.
 *
 * Aggregating a partner's date responses means reading every event's parties,
 * and a bundle each would be four subcollection reads per event to look at one
 * map. This is the narrow shape that answers it.
 */
export interface PartyHistory {
  eventId: string
  parties: Party[]
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
