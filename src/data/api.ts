import type {
  AvailabilityBlock,
  CapturedContact,
  CitywideMoment,
  CrewMember,
  EventBundle,
  EventDoc,
  EventRecap,
  LogEntry,
  Org,
  OwnerRef,
  Feedback,
  Party,
  Person,
  ResponseSource,
  ResponseValue,
  RunItem,
  Task,
  Template,
  TokenScope,
} from './types'

// Inputs are the writable slices of each shape. Ids, timestamps, and
// ownership are set by the implementation, never by a component.

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

export type ContactInput = Omit<CapturedContact, 'id' | 'capturedAt' | 'capturedBy' | 'ownerUid'>
export type AvailabilityInput = Omit<AvailabilityBlock, 'id' | 'ownerUid'>
export type MomentInput = Omit<CitywideMoment, 'id' | 'ownerUid'>

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

  // F3, templates. Read only in M0; the editor is M1.
  listTemplates(): Promise<Template[]>

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

  // F10, calendar
  listAvailability(): Promise<AvailabilityBlock[]>
  createAvailability(input: AvailabilityInput): Promise<string>
  deleteAvailability(id: string): Promise<void>
  listMoments(): Promise<CitywideMoment[]>
  createMoment(input: MomentInput): Promise<string>
  deleteMoment(id: string): Promise<void>

  // CRM-1, people. listPeople returns the owner's whole list in one read and
  // the page filters in memory: at this size that needs no composite index and
  // makes search instant. Revisit past roughly 10,000 people per host.
  listPeople(): Promise<Person[]>
  getPerson(id: string): Promise<Person | null>
  updatePerson(id: string, patch: PersonEdit): Promise<void>

  // Step 4, tester feedback. One write, no read: the smallest thing that lets
  // a tester say what is missing without leaving the app.
  sendFeedback(input: FeedbackInput, uid: string): Promise<string>

  // F11, recap
  saveRecap(eventId: string, recap: EventRecap): Promise<void>
  /** Issues a recap-scoped token per party and stamps generatedAt. */
  generateRecaps(eventId: string): Promise<void>

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
