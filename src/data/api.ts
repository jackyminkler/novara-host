import type {
  AvailabilityBlock,
  AvailabilitySettings,
  Booking,
  FriendLink,
  Huddle,
  CapturedContact,
  CitywideMoment,
  CrewMember,
  EventBundle,
  EventDoc,
  EventRecap,
  HostCard,
  LogEntry,
  MatchingRun,
  Org,
  OwnerRef,
  Feedback,
  Party,
  PartyHistory,
  Person,
  ResponseSource,
  ResponseValue,
  RunItem,
  Task,
  Template,
  TokenScope,
} from './types'
import type { CsvRow } from './people/csv'
import type { ImportSummary } from './people/merge'

// Inputs are the writable slices of each shape. Ids, timestamps, and
// ownership are set by the implementation, never by a component.

/**
 * Everything writable on an org, which from M1 includes `siteProfile` and
 * `standing`. Both ride `updateOrg(id, Partial<OrgInput>)` rather than getting
 * their own method: they are fields on a record the host already edits, and a
 * second write path would be a second place to forget the owner check.
 */
export type OrgInput = Omit<Org, 'id' | 'createdAt' | 'createdBy' | 'ownerUid'>

export interface CreateEventInput {
  title: string
  /** Shown to guests as the person who invited them. */
  hostDisplayName: string
  description: string
  location: EventDoc['location']
  dateOptions: EventDoc['dateOptions']
  capacityTarget: number | null
  templateId: string | null
  /** Chosen partner per template role slot, by slot name. */
  slotAssignments: Record<string, string>
}

export type PartyInput = Pick<
  Party,
  'orgId' | 'roleOnEvent' | 'terms' | 'goal' | 'cta' | 'profile' | 'customFields'
>

export interface TaskInput {
  title: string
  owner: OwnerRef
  dueDate: string | null
  note: string
}

export interface RunItemInput {
  time: string
  title: string
  owner: OwnerRef
  notes: string
}

/**
 * `personId` is left out on purpose: the link to hp_people belongs to
 * `promoteContactToPerson`, and a page that could set it by hand could claim a
 * capture had been promoted when no person exists.
 */
export type ContactInput = Omit<
  CapturedContact,
  'id' | 'capturedAt' | 'capturedBy' | 'ownerUid' | 'personId'
>
export type FriendLinkInput = Pick<FriendLink, 'name' | 'horizonDays' | 'kinds'>
export type HuddleInput = Pick<
  Huddle,
  | 'title'
  | 'durationMinutes'
  | 'horizonDays'
  | 'hours'
  | 'allowed'
  | 'respondBy'
  | 'respondByMs'
  | 'happenBy'
  | 'happenByMs'
  | 'expiresAt'
  | 'hostDisplayName'
  | 'timeZone'
>
/**
 * The editable slice of a plan.
 *
 * Two absences are deliberate. `expiresAt` is missing because expiry moves in
 * two places or not at all: `extendHuddle` writes the huddle and its token
 * together, and a patch that touched only one would leave a live page behind a
 * dead link. `participants` and `votes` are missing because they belong to the
 * guest endpoints, which bound every field a guest can set; letting the host
 * app write them here would put a second, unbounded door on the same data.
 */
export type HuddlePatch = Partial<
  Pick<
    Huddle,
    | 'title'
    | 'durationMinutes'
    | 'hours'
    | 'allowed'
    | 'respondBy'
    | 'respondByMs'
    | 'happenBy'
    | 'happenByMs'
    | 'settledStartsAt'
    | 'settledEndsAt'
    | 'location'
    | 'notes'
    | 'googleEventId'
  >
>
/** The writable slice of the availability document. Busy intervals are derived, never typed. */
export type AvailabilitySettingsPatch = Partial<
  Pick<AvailabilitySettings, | 'openHours'
  | 'timeZone'
  | 'bufferMinutes'
  | 'kinds'
  | 'defaultHorizonDays'
  | 'windows'
  | 'source'
  | 'googleCalendarIds'
  | 'calendarImportedAt'
  | 'importedEventCount'>
>
export type AvailabilityInput = Omit<AvailabilityBlock, 'id' | 'ownerUid'>
export type MomentInput = Omit<CitywideMoment, 'id' | 'ownerUid'>

/** M1. A template is user data, so everything on it except identity is writable. */
export type TemplateInput = Omit<Template, 'id' | 'ownerUid' | 'createdAt'>

/**
 * M1. The card without the parts the implementation owns: its id is the
 * host's uid, and the token is issued separately so saving the card never
 * quietly rotates a link that is already printed on something.
 */
export type HostCardInput = Omit<HostCard, 'id' | 'ownerUid' | 'updatedAt' | 'cardTokenId'>

/**
 * CRM-3. One parsed row of a guest export, keyed by the export's own column
 * names. Parsing happens in the page, with `parseCsvRecords`, so the seam
 * takes rows rather than a file and never has to know about encodings.
 */
export type PersonImportRow = CsvRow

export type { ImportSummary }

/**
 * The only writable slice of a person. Everything else is derived by the
 * importer, so allowing a component to patch it would be silently undone on
 * the next import.
 */
export type FeedbackInput = Omit<Feedback, 'id' | 'ownerUid' | 'createdAt'>

export type PersonEdit = Partial<Pick<Person, 'notes' | 'followUp' | 'tags'>>

/**
 * The one seam between the app and its storage. Components import this, never
 * firebase/firestore. Two implementations sit behind it: mock (in memory) and
 * firebase (the real hp_ collections).
 */
export interface HostApi {
  // F2, partner directory
  listOrgs(): Promise<Org[]>
  getOrg(id: string): Promise<Org | null>
  createOrg(input: OrgInput, uid: string): Promise<string>
  updateOrg(id: string, patch: Partial<OrgInput>): Promise<void>
  deleteOrg(id: string): Promise<void>

  // F3, events
  listEvents(): Promise<EventDoc[]>
  getEventBundle(id: string): Promise<EventBundle | null>
  createEvent(input: CreateEventInput, uid: string): Promise<string>
  updateEvent(id: string, patch: Partial<EventDoc>): Promise<void>
  deleteEvent(id: string): Promise<void>

  // F3, templates. Read only in M0; M1 adds the editor and save-as-template.
  listTemplates(): Promise<Template[]>
  createTemplate(input: TemplateInput, uid: string): Promise<string>
  updateTemplate(id: string, patch: Partial<Template>): Promise<void>
  deleteTemplate(id: string): Promise<void>
  /**
   * M1. Derives skeletons from an event's own tasks and run of show, offset
   * from its confirmed date or, failing that, its first proposed one.
   */
  saveEventAsTemplate(eventId: string, name: string, uid: string): Promise<string>

  // F4, dates
  setDateResponse(
    eventId: string,
    partyId: string,
    optionId: string,
    value: ResponseValue,
    source: ResponseSource,
    note: string,
  ): Promise<void>
  confirmDate(eventId: string, optionId: string | null): Promise<void>

  // F5, parties and guest links
  addParty(eventId: string, input: PartyInput): Promise<string>
  /**
   * M1 standing availability. Every party on every event this host owns, for
   * turning one partner's answers into a weekday pattern. The partner detail
   * page and the dates tab both read it, through `src/data/standing.ts`, so
   * the two cannot disagree about what a pattern is.
   *
   * Firestore cannot answer this in one query. A collection-group query over
   * `parties` would need a collection-group rule, which is banned here because
   * the shared ruleset would apply it to the consumer app's subcollections
   * too. So it is one small subcollection read per event, which is still far
   * less than a bundle each and needs no index.
   */
  listPartyHistory(): Promise<PartyHistory[]>
  updateParty(eventId: string, partyId: string, patch: Partial<Party>): Promise<void>
  removeParty(eventId: string, partyId: string): Promise<void>
  logNudge(eventId: string, partyId: string): Promise<void>
  /** Creates a token and revokes any earlier one for the same subject. */
  issueToken(eventId: string, scope: TokenScope, subjectId: string): Promise<string>

  // F6, tasks
  createTask(eventId: string, input: TaskInput): Promise<string>
  updateTask(eventId: string, taskId: string, patch: Partial<Task>): Promise<void>
  deleteTask(eventId: string, taskId: string): Promise<void>

  // F7, run of show
  createRunItem(eventId: string, input: RunItemInput): Promise<string>
  updateRunItem(eventId: string, itemId: string, patch: Partial<RunItem>): Promise<void>
  deleteRunItem(eventId: string, itemId: string): Promise<void>

  // F13, crew
  createCrew(eventId: string, name: string, note: string): Promise<string>
  updateCrew(eventId: string, crewId: string, patch: Partial<CrewMember>): Promise<void>
  deleteCrew(eventId: string, crewId: string): Promise<void>

  // F8, meeting capture
  listContacts(): Promise<CapturedContact[]>
  createContact(input: ContactInput, uid: string): Promise<string>
  updateContact(id: string, patch: Partial<CapturedContact>): Promise<void>
  deleteContact(id: string): Promise<void>

  // M1, voice notes on capture. The blob comes from MediaRecorder in the
  // page; where it goes is the implementation's business.
  saveVoiceNote(contactId: string, blob: Blob, durationSec: number): Promise<void>
  deleteVoiceNote(contactId: string): Promise<void>

  // M1, the host's share card. One document per host, keyed by uid, so it is
  // a get rather than a query.
  getHostCard(uid: string): Promise<HostCard | null>
  saveHostCard(patch: HostCardInput, uid: string): Promise<void>
  /** Issues a card-scoped token for this host, revoking any earlier one. */
  issueCardToken(uid: string): Promise<string>

  // F10, calendar
  listAvailability(): Promise<AvailabilityBlock[]>
  createAvailability(input: AvailabilityInput): Promise<string>
  deleteAvailability(id: string): Promise<void>
  listMoments(): Promise<CitywideMoment[]>
  createMoment(input: MomentInput): Promise<string>
  deleteMoment(id: string): Promise<void>

  // F14 to F19, personal availability. One settings document per host, keyed
  // by uid. It holds her editable rules plus the openings she is publishing.
  // The calendar itself is parsed and derived in the browser and never sent.
  getAvailabilitySettings(): Promise<AvailabilitySettings | null>
  saveAvailabilitySettings(patch: AvailabilitySettingsPatch, uid: string): Promise<void>

  listFriendLinks(): Promise<FriendLink[]>
  /** Returns the new link and its token, which is only ever shown as a URL. */
  createFriendLink(input: FriendLinkInput, uid: string): Promise<{ id: string; token: string }>
  updateFriendLink(id: string, patch: Partial<FriendLinkInput>): Promise<void>
  /** Revokes the token as well, so the link stops working immediately. */
  deleteFriendLink(id: string): Promise<void>

  listBookings(): Promise<Booking[]>
  cancelBooking(id: string): Promise<void>

  // F20, plans. A group finding a time together. One link for everyone, and
  // it expires. Called a plan in every string a person reads.
  listHuddles(): Promise<Huddle[]>
  createHuddle(input: HuddleInput, uid: string): Promise<{ id: string; token: string }>
  updateHuddle(id: string, patch: HuddlePatch): Promise<void>
  /** Pushes the expiry out again without changing the link. */
  extendHuddle(id: string, expiresAt: string): Promise<void>
  deleteHuddle(id: string): Promise<void>

  // CRM-1, people. listPeople returns the owner's whole list in one read and
  // the page filters in memory: at this size that needs no composite index and
  // makes search instant. Revisit past roughly 10,000 people per host.
  listPeople(): Promise<Person[]>
  getPerson(id: string): Promise<Person | null>
  updatePerson(id: string, patch: PersonEdit): Promise<void>

  /**
   * CRM-3. Folds a parsed guest export into hp_people with the same merge the
   * seed importer uses, from the same module: email is the dedupe key, tier is
   * precedence, and notes, follow-ups and tags the host typed are never
   * cleared. Running it twice reports everything as unchanged.
   */
  importPeople(
    rows: PersonImportRow[],
    eventKey: string,
    uid: string,
  ): Promise<ImportSummary>
  /**
   * Turns a captured contact into a person, merging by email when there is
   * one, and stamps the new person's id back onto the capture as `personId`.
   * That link is what lets a page offer the action exactly once: without an
   * email there is no dedupe key, so a second promotion would build a second
   * person rather than merging into the first.
   */
  promoteContactToPerson(contactId: string, uid: string): Promise<string>

  // Step 4, tester feedback. One write, no read: the smallest thing that lets
  // a tester say what is missing without leaving the app.
  sendFeedback(input: FeedbackInput, uid: string): Promise<string>

  // F11, recap
  saveRecap(eventId: string, recap: EventRecap): Promise<void>
  /** Issues a recap-scoped token per party and stamps generatedAt. */
  generateRecaps(eventId: string): Promise<void>

  // M1, matching. The engine is pure and runs client side in
  // src/lib/matching/; these two only keep what it produced, one document per
  // run, so a later run never overwrites the last one.
  listMatchingRuns(eventId: string): Promise<MatchingRun[]>
  saveMatchingRun(eventId: string, run: Omit<MatchingRun, 'id'>): Promise<string>

  // 4.3, the Event Zero log
  listLog(eventId: string): Promise<LogEntry[]>
  addLogEntry(eventId: string, text: string): Promise<string>
}

/**
 * VITE_DATA_MODE=mock runs the entire host app with no Firebase at all, which
 * is how UI work gets verified against the wireframes. Anything else uses the
 * real hp_ collections.
 */
export const dataMode: 'mock' | 'firebase' =
  import.meta.env.VITE_DATA_MODE === 'mock' ? 'mock' : 'firebase'

let cached: Promise<HostApi> | null = null

export function getApi(): Promise<HostApi> {
  if (!cached) {
    cached =
      dataMode === 'mock'
        ? import('./mock/mockApi').then((m) => m.mockApi)
        : import('./firebase/firebaseApi').then((m) => m.firebaseApi)
  }
  return cached
}
