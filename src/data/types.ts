// Shapes for every hp_ document. PRD section 3.3 is the base; F10 to F13 add
// the fields below it, per the note in 3.3 that the builder defines them
// following the same conventions.

export type OrgType = 'cohost' | 'sponsor' | 'vendor' | 'activation' | 'venue'
export type EventStatus = 'draft' | 'planning' | 'confirmed' | 'live' | 'wrapped'
export type PartyStatus = 'invited' | 'confirmed' | 'declined'
export type ResponseValue = 'yes' | 'no' | 'maybe'
export type LinkStatus = 'draft' | 'final'
export type TokenScope = 'party' | 'crew' | 'recap'

/** Where a date response came from. Both count the same toward confirming. */
export type ResponseSource = 'link' | 'host'

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

export interface GuestToken {
  id: string
  ownerUid: string
  eventId: string
  scope: TokenScope
  subjectId: string
  revoked: boolean
  createdAt: string
  lastUsedAt: string | null
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
