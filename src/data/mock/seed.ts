import type {
  AvailabilityBlock,
  CapturedContact,
  CitywideMoment,
  CrewMember,
  EventDoc,
  GuestToken,
  LogEntry,
  Org,
  Party,
  RunItem,
  Task,
  Template,
  Person,
  Registration,
} from '../types'

/**
 * Dev fixture only. Never seeds a real project and never ships in a Firebase
 * build. The partners here are the wireframes' fictional ones; no real names
 * appear, per build guardrail 6.
 */
export interface MockStore {
  orgs: Org[]
  events: EventDoc[]
  parties: Record<string, Party[]>
  tasks: Record<string, Task[]>
  runOfShow: Record<string, RunItem[]>
  crew: Record<string, CrewMember[]>
  log: Record<string, LogEntry[]>
  templates: Template[]
  contacts: CapturedContact[]
  availability: AvailabilityBlock[]
  moments: CitywideMoment[]
  tokens: GuestToken[]
  people: Person[]
}

const HOST = 'mock-host-uid'
const NOW = '2026-08-19T09:00:00.000Z'

function org(
  id: string,
  name: string,
  type: Org['type'],
  description: string,
  contacts: Org['contacts'],
  profile: Record<string, string>,
  extra: Partial<Org> = {},
): Org {
  return {
    id,
    name,
    type,
    description,
    contacts,
    profile,
    customFields: [],
    via: '',
    relationshipTerms: '',
    notes: '',
    createdAt: NOW,
    createdBy: HOST,
    ownerUid: HOST,
    ...extra,
  }
}

function task(
  id: string,
  title: string,
  owner: Task['owner'],
  dueDate: string | null,
  order: number,
  status: Task['status'] = 'open',
  note = '',
): Task {
  return { id, title, owner, dueDate, offsetDays: null, status, note, order }
}

function runItem(
  id: string,
  time: string,
  title: string,
  owner: RunItem['owner'],
  order: number,
  notes = '',
): RunItem {
  return { id, time, title, owner, notes, order }
}

// CRM fixture. Fictional people, like every other mock row: real guests enter
// through the importer, never through application code (PRD guardrail 6).
// Shaped to exercise all five saved segments the People page ships with.
const PERSON_EVENTS = ['2026-05-16-presidio-sunrise', '2026-06-20-marina-track', '2026-07-18-embarcadero-loop']

function registration(
  eventKey: string,
  status: Registration['status'],
  day: string,
  extra: Partial<Registration> = {},
): Registration {
  return {
    eventKey,
    lumaEventId: null,
    status,
    registeredAt: `${day}T17:00:00.000Z`,
    checkedInAt: null,
    source: null,
    surveyRating: null,
    surveyFeedback: null,
    answers: {},
    ...extra,
  }
}

function buildPeople(): Person[] {
  const names = [
    'Ada Okafor', 'Bo Lindqvist', 'Cara Mendes', 'Dev Raman', 'Elle Fontaine',
    'Finn Oyelaran', 'Gia Petrov', 'Hana Ishikawa', 'Ines Ferrer', 'Jonah Brandt',
    'Kira Vasquez', 'Liam Doherty', 'Maya Chandra', 'Noor Haddad', 'Otto Lindgren',
    'Pia Ramos', 'Quinn Alvarez', 'Rhea Kapoor', 'Sam Whitfield', 'Tessa Nakamura',
    'Uma Delgado', 'Vik Sorensen', 'Willa Boateng', 'Xan Moreau', 'Yara Solomon',
    'Zeke Ferraro', 'Aria Nwosu', 'Bram Kessler', 'Celia Vance', 'Dane Iverson',
  ]
  const sources = ['referral', 'Luma Feed', 'Instagram', '(direct)', 'Luma Discover']

  return names.map((fullName, i) => {
    const [firstName, lastName] = fullName.split(' ')
    const email = `${firstName.toLowerCase()}.${lastName.toLowerCase()}@example.com`

    // A deterministic spread: every sixth person is invited-only, every
    // eleventh declined, the rest signed up, and every third signed-up person
    // came back a second time.
    const registrations: Registration[] = []
    if (i % 11 === 10) {
      registrations.push(registration(PERSON_EVENTS[0], 'declined', '2026-05-02'))
    } else if (i % 6 === 5) {
      registrations.push(registration(PERSON_EVENTS[1], 'invited', '2026-06-05'))
    } else {
      registrations.push(
        registration(PERSON_EVENTS[0], 'approved', '2026-05-04', {
          source: sources[i % sources.length],
          surveyRating: i % 4 === 0 ? 5 : null,
          surveyFeedback: i % 8 === 0 ? 'Worth the early alarm. More of these.' : null,
          answers: i % 5 === 0 ? { 'Would you like to join the partner waitlist?': 'Yes' } : {},
        }),
      )
      if (i % 3 === 0) {
        registrations.push(
          registration(PERSON_EVENTS[1], 'approved', '2026-06-08', { source: 'referral' }),
        )
      }
      if (i % 9 === 0) {
        registrations.push(registration(PERSON_EVENTS[2], 'approved', '2026-07-06'))
      }
    }

    const approved = registrations.filter((r) => r.status === 'approved')
    const stamps = registrations.map((r) => r.registeredAt).sort()

    return {
      id: `person-${i + 1}`,
      ownerUid: HOST,
      email,
      firstName,
      lastName,
      fullName,
      phone: null,
      handles: i % 4 === 1 ? { linkedin: `linkedin.com/in/${firstName.toLowerCase()}` } : {},
      // A handful have been matched to an app account; most have not, which is
      // what makes the "came to an event, not in the app yet" segment real.
      appUserUid: i % 7 === 2 ? `app-uid-${i}` : null,
      tier: approved.length
        ? ('signed_up' as const)
        : registrations.some((r) => r.status === 'invited')
          ? ('invited_only' as const)
          : ('declined_only' as const),
      eventCount: approved.length,
      firstSeenAt: stamps[0],
      lastSeenAt: stamps[stamps.length - 1],
      sources: [...new Set(registrations.map((r) => r.source).filter((v): v is string => !!v))],
      // Two people brought several others, so the superconnector view has something in it.
      referredBy: i > 0 && i % 4 === 3 ? ['ada.okafor@example.com'] : [],
      notes: i === 0 ? 'Offered to help marshal the next one.' : '',
      followUp: i === 3 ? { due: '2026-08-28', done: false } : null,
      tags: i === 0 ? ['volunteer'] : i % 10 === 4 ? ['photographer'] : [],
      registrations,
    }
  })
}

export function buildStore(): MockStore {
  const orgs: Org[] = [
    org(
      'alma-health',
      'Alma Health',
      'activation',
      'Hormone wellness brand, demo and testing stations',
      [
        { name: 'Sarah Kim', role: 'Field lead', email: 'sarah@almahealth.co' },
        { name: 'Renee Ide', role: 'Marketing', instagram: '@almahealth' },
      ],
      { staffing: 'Three at the station', consentOwner: 'Alma Health field team' },
      {
        via: 'Friends first, co-created the first event',
        relationshipTerms:
          'Founding partner, covers most event costs, everything informal and in good standing',
        notes:
          'Field team travels the last week of every month. Needs three weeks of lead time for station staffing.',
      },
    ),
    org(
      'common-ground',
      'Common Ground Events',
      'cohost',
      'Event community company running clubs across the bay',
      [{ name: 'Nia Barros', role: 'Programs', email: 'nia@commonground.co' }],
      { audience: 'Their Thursday run list, around 400', split: 'They bring people, we bring production' },
      { via: 'Met at a city run series', relationshipTerms: 'Even split, no money changes hands' },
    ),
    org(
      'loopwork-ai',
      'Loopwork AI',
      'sponsor',
      'Early stage AI startup, actively hiring',
      [{ name: 'Devon Cho', role: 'Marketing', email: 'devon@loopwork.ai', linkedin: 'linkedin.com/in/devoncho' }],
      { value: 'Covers the coffee bean cost, around $300', goal: 'Awareness, two hiring conversations' },
      { via: 'Intro from Common Ground Events', relationshipTerms: 'First time sponsoring, keep the ask small' },
    ),
    org(
      'little-wolf',
      'Little Wolf Coffee',
      'vendor',
      'Mobile coffee cart',
      [{ name: 'Tomas Vale', role: 'Owner', phone: '415 555 0142' }],
      { rate: 'Market $400, event rate $250', terms: 'Needs a flat spot and 20 amps or a generator' },
      { via: 'Regular at the Marina runs' },
    ),
    org(
      'golden-hour',
      'Golden Hour Sound',
      'vendor',
      'DJ duo, outdoor sets',
      [{ name: 'Dre and Mika', role: 'DJs', instagram: '@goldenhoursound', phone: '415 555 0177' }],
      { rate: 'Market $500, friends free', terms: 'Needs power and two tables' },
      {
        via: 'Friends first, launched at our first event',
        relationshipTerms: 'Free for our events, would charge others market rate',
      },
    ),
  ]

  const presidio: EventDoc = {
    id: 'presidio-sunrise-five',
    ownerUid: HOST,
    title: 'Presidio sunrise five',
    status: 'planning',
    description:
      'A Thursday morning five mile run finishing at a coffee cart, with a DJ set and a wellness station.',
    dateOptions: [
      { id: 'opt-a', startsAt: '2026-08-20T07:00:00', label: '' },
      { id: 'opt-b', startsAt: '2026-08-27T07:00:00', label: '' },
      { id: 'opt-c', startsAt: '2026-08-29T07:00:00', label: '' },
    ],
    confirmedDateOptionId: null,
    location: {
      name: 'Presidio, Main Post',
      meetPoint: 'Main Post lawn, flagpole',
      finishPoint: 'Coffee cart at the lawn edge',
      notes: 'No outlets, generator needed. Windy after 9.',
    },
    links: [
      { id: 'l1', label: 'Luma page', url: 'https://lu.ma/presidio-sunrise', owner: 'host', status: 'final' },
      { id: 'l2', label: 'Flyer, Canva', url: 'https://canva.com/design/flyer', owner: 'host', status: 'draft' },
      { id: 'l3', label: 'Asset folder', url: 'https://drive.google.com/assets', owner: 'host', status: 'final' },
    ],
    capacityTarget: 80,
    campaignGoal: 'Grow the Thursday morning regulars',
    governance: {
      officialListing: 'Luma',
      listingUrl: 'https://lu.ma/presidio-sunrise',
      guestContactsOwner: 'Novara, assigned host',
      dualPosts: 'None planned',
    },
    signupCount: 61,
    recap: { headcount: null, remembered: [], photosLink: '', postsRan: '', generatedAt: null },
    templateId: 'tpl-dj-morning',
    hostUid: HOST,
    hostDisplayName: 'Maya',
    createdAt: '2026-07-20T12:00:00.000Z',
  }

  const marina: EventDoc = {
    id: 'marina-track-social',
    ownerUid: HOST,
    title: 'Marina track social',
    status: 'wrapped',
    description:
      'An evening track session and social hour with a coffee cart and a short wellness demo.',
    dateOptions: [{ id: 'm-opt-a', startsAt: '2026-07-16T18:30:00', label: '' }],
    confirmedDateOptionId: 'm-opt-a',
    location: {
      name: 'Marina Green track',
      meetPoint: 'Track gate, bay side',
      finishPoint: 'Picnic tables by the path',
      notes: 'Lights go off at 9.',
    },
    links: [{ id: 'ml1', label: 'Photo album', url: 'https://photos.app/marina', owner: 'host', status: 'final' }],
    capacityTarget: 120,
    campaignGoal: 'Feature promo for the app',
    governance: {
      officialListing: 'Partiful',
      listingUrl: 'https://partiful.com/marina-track',
      guestContactsOwner: 'Novara, assigned host',
      dualPosts: 'Common Ground reposted',
    },
    signupCount: 156,
    recap: {
      headcount: 118,
      remembered: ['Priya Shah', 'Danny Ko'],
      photosLink: 'https://photos.app/marina',
      postsRan: '6 across both accounts',
      generatedAt: '2026-07-18T10:00:00.000Z',
    },
    templateId: null,
    hostUid: HOST,
    hostDisplayName: 'Maya',
    createdAt: '2026-06-01T12:00:00.000Z',
  }

  const answered = (value: Party['dateResponses'][string]['value'], source: 'link' | 'host' = 'link') => ({
    value,
    source,
    note: '',
    at: '2026-08-16T10:00:00.000Z',
  })

  const parties: Record<string, Party[]> = {
    'presidio-sunrise-five': [
      {
        id: 'p-alma',
        orgId: 'alma-health',
        roleOnEvent: 'activation',
        status: 'confirmed',
        terms: { gives: 'Testing station, staff of three, co-promo', gets: 'Station at the finish, welcome mention, leads' },
        goal: '30 tests completed, station leads',
        cta: 'Book a testing slot after the run',
        dateResponses: { 'opt-a': answered('yes'), 'opt-b': answered('yes'), 'opt-c': answered('no') },
        constraintNote: 'Our field team travels the last week of the month.',
        tokenId: 'tok-alma-presidio',
        nudgeCount: 0,
        profile: { staffing: 'Three at the station', consentOwner: 'Alma Health field team' },
        customFields: [],
        outcomes: [],
        order: 0,
      },
      {
        id: 'p-common',
        orgId: 'common-ground',
        roleOnEvent: 'cohost',
        status: 'confirmed',
        terms: { gives: 'Promo to their Thursday list, two volunteers', gets: 'Co-host billing, shared photos' },
        goal: 'Bring 30 of their regulars',
        cta: 'Share the page with the Thursday crew',
        dateResponses: { 'opt-a': answered('yes'), 'opt-c': answered('yes') },
        constraintNote: '',
        tokenId: 'tok-common-presidio',
        nudgeCount: 0,
        profile: { audience: 'Their Thursday run list, around 400', split: 'They bring people, we bring production' },
        customFields: [],
        outcomes: [],
        order: 1,
      },
      {
        id: 'p-loopwork',
        orgId: 'loopwork-ai',
        roleOnEvent: 'sponsor',
        status: 'invited',
        terms: { gives: 'Covers coffee bean cost, co-promo to their list', gets: 'Logo on flyer, welcome mention, table space' },
        goal: 'Awareness, two hiring conversations',
        cta: 'Say hi at the table, they are hiring',
        dateResponses: {},
        constraintNote: '',
        tokenId: 'tok-loopwork-presidio',
        nudgeCount: 1,
        profile: { value: 'Covers the coffee bean cost, around $300', goal: 'Awareness, two hiring conversations' },
        customFields: [],
        outcomes: [],
        order: 2,
      },
      {
        id: 'p-wolf',
        orgId: 'little-wolf',
        roleOnEvent: 'vendor',
        status: 'confirmed',
        terms: { gives: 'Cart at the finish, 80 drinks', gets: 'Event rate paid, tagged posts' },
        goal: 'Serve out, pick up regulars',
        cta: 'Grab a coffee at the finish',
        dateResponses: { 'opt-a': answered('yes'), 'opt-b': answered('yes'), 'opt-c': answered('yes') },
        constraintNote: '',
        tokenId: 'tok-wolf-presidio',
        nudgeCount: 0,
        profile: { rate: 'Event rate $250', terms: 'Needs a flat spot and 20 amps or a generator' },
        customFields: [],
        outcomes: [],
        order: 3,
      },
      {
        id: 'p-golden',
        orgId: 'golden-hour',
        roleOnEvent: 'vendor',
        status: 'confirmed',
        terms: { gives: 'DJ set at the finish, 90 minutes', gets: 'Tagged content, tables and generator provided' },
        goal: 'Exposure, tagged content',
        cta: 'Tag them in your photos',
        dateResponses: { 'opt-a': answered('yes'), 'opt-b': answered('no') },
        constraintNote: '',
        tokenId: 'tok-golden-presidio',
        nudgeCount: 0,
        profile: { rate: 'Friend rate, no charge', terms: 'Tables and generator provided by us' },
        customFields: [],
        outcomes: [],
        order: 4,
      },
    ],
    'marina-track-social': [
      {
        id: 'mp-alma',
        orgId: 'alma-health',
        roleOnEvent: 'activation',
        status: 'confirmed',
        terms: { gives: 'Testing station, staff of two', gets: 'Station by the tables, welcome mention' },
        goal: '30 tests completed',
        cta: 'Book a testing slot',
        dateResponses: { 'm-opt-a': answered('yes') },
        constraintNote: '',
        tokenId: 'tok-alma-marina',
        nudgeCount: 0,
        profile: {},
        customFields: [],
        outcomes: [
          { id: 'o1', label: 'Tests completed', value: '41' },
          { id: 'o2', label: 'Leads shared', value: '18, with consent' },
          { id: 'o3', label: 'Station visits', value: 'Around 60' },
        ],
        order: 0,
      },
      {
        id: 'mp-wolf',
        orgId: 'little-wolf',
        roleOnEvent: 'vendor',
        status: 'confirmed',
        terms: { gives: 'Cart for two hours', gets: 'Event rate paid' },
        goal: 'Serve 100 drinks',
        cta: 'Grab a coffee',
        dateResponses: { 'm-opt-a': answered('yes') },
        constraintNote: '',
        tokenId: 'tok-wolf-marina',
        nudgeCount: 0,
        profile: {},
        customFields: [{ label: 'Cups served', value: '104' }],
        outcomes: [{ id: 'o4', label: 'Cups served', value: '104' }],
        order: 1,
      },
    ],
  }

  const tasks: Record<string, Task[]> = {
    'presidio-sunrise-five': [
      task('t1', 'Verify amplified sound rules with the Presidio site office', 'host', '2026-08-17', 0),
      task('t2', 'Push updated headcount forecast to vendors', 'host', '2026-08-20', 1),
      task('t3', 'Print flyers with final QR code', 'host', '2026-08-24', 2),
      task('t4', 'Confirm set length, start time, and power plan', 'party:p-golden', '2026-08-21', 3),
      task('t5', 'Load-in time at the lawn edge', 'party:p-golden', '2026-08-25', 4),
      task('t6', 'Confirm station staffing of three', 'party:p-alma', '2026-08-18', 5, 'done'),
      task('t7', 'Send consent materials to Maya', 'party:p-alma', '2026-08-24', 6),
      task('t8', 'Confirm testing slot capacity', 'party:p-alma', '2026-08-26', 7),
      task('t9', 'Confirm cart arrival window', 'party:p-wolf', '2026-08-25', 8),
      task('t10', 'Bring the A-frame and tape kit, hold ground while pods are out', 'crew:c-brad', null, 9, 'open', 'Day of'),
    ],
    'marina-track-social': [
      task('mt1', 'Send recap to every party', 'host', '2026-07-18', 0, 'done'),
    ],
  }

  const runOfShow: Record<string, RunItem[]> = {
    'presidio-sunrise-five': [
      runItem('r1', '06:15', 'Host arrives, signage up', 'host', 0),
      runItem('r2', '06:20', 'Coffee cart load-in', 'party:p-wolf', 1),
      runItem('r3', '06:25', 'DJ load-in, quiet soundcheck', 'party:p-golden', 2),
      runItem('r4', '06:30', 'Station setup and volunteer brief', 'party:p-alma', 3),
      runItem('r5', '06:45', 'Check-in opens, waivers', 'host', 4),
      runItem('r6', '06:58', 'Welcome and partner mentions', 'all', 5),
      runItem('r7', '07:00', 'Run start', 'all', 6),
      runItem('r8', '07:00', 'Hold ground, greet early finishers', 'crew:c-brad', 7),
      runItem('r9', '07:45', 'Testing slots open at the station', 'party:p-alma', 8),
      runItem('r10', '08:30', 'Group photo', 'host', 9),
    ],
    'marina-track-social': [],
  }

  const crew: Record<string, CrewMember[]> = {
    'presidio-sunrise-five': [{ id: 'c-brad', name: 'Brad', note: 'Holds ground, brings the A-frame', tokenId: null }],
    'marina-track-social': [],
  }

  const templates: Template[] = [
    {
      id: 'tpl-dj-morning',
      ownerUid: HOST,
      name: 'DJ morning run',
      description: 'Morning run finishing with a DJ set and a coffee cart.',
      roleSlots: [
        { slot: 'Presenting partner', orgType: 'activation', required: true },
        { slot: 'DJ vendor', orgType: 'vendor', required: true },
        { slot: 'Coffee vendor', orgType: 'vendor', required: true },
        { slot: 'Sponsor', orgType: 'sponsor', required: false },
        { slot: 'Cohost', orgType: 'cohost', required: false },
      ],
      taskSkeleton: [
        { title: 'Date options out to all parties', ownerSlot: 'host', offsetDays: -35 },
        { title: 'Lock the venue and check permit thresholds', ownerSlot: 'host', offsetDays: -30 },
        { title: 'Confirm DJ set length and power plan', ownerSlot: 'DJ vendor', offsetDays: -24 },
        { title: 'Event page live', ownerSlot: 'host', offsetDays: -21 },
        { title: 'Coffee cart headcount and arrival window', ownerSlot: 'Coffee vendor', offsetDays: -14 },
        { title: 'Flyer to print with the final code', ownerSlot: 'host', offsetDays: -10 },
        { title: 'Send the run of show to every party', ownerSlot: 'host', offsetDays: -3 },
        { title: 'Day of, signage and check-in kit packed', ownerSlot: 'host', offsetDays: -1 },
        { title: 'Recap out to every party', ownerSlot: 'host', offsetDays: 2 },
      ],
      runOfShowSkeleton: [
        { offsetMinutes: -45, title: 'Host arrives, signage up', ownerSlot: 'host' },
        { offsetMinutes: -40, title: 'Coffee cart load-in', ownerSlot: 'Coffee vendor' },
        { offsetMinutes: -35, title: 'DJ load-in, quiet soundcheck', ownerSlot: 'DJ vendor' },
        { offsetMinutes: -30, title: 'Station setup and volunteer brief', ownerSlot: 'Presenting partner' },
        { offsetMinutes: -15, title: 'Check-in opens', ownerSlot: 'host' },
        { offsetMinutes: -2, title: 'Welcome and partner mentions', ownerSlot: 'all' },
        { offsetMinutes: 0, title: 'Run start', ownerSlot: 'all' },
        { offsetMinutes: 90, title: 'Group photo', ownerSlot: 'host' },
      ],
      defaults: { capacityTarget: 80, durationMinutes: 150, startTime: '07:00' },
      createdFrom: 'seed',
      createdAt: NOW,
    },
    {
      id: 'tpl-mentor-morning',
      ownerUid: HOST,
      name: 'Mentor morning run',
      description: 'Morning run with paired conversations and a coffee finish.',
      roleSlots: [
        { slot: 'Presenting partner', orgType: 'cohost', required: true },
        { slot: 'Coffee vendor', orgType: 'vendor', required: true },
        { slot: 'Sponsor', orgType: 'sponsor', required: false },
        { slot: 'Venue', orgType: 'venue', required: false },
      ],
      taskSkeleton: [
        { title: 'Date options out to all parties', ownerSlot: 'host', offsetDays: -28 },
        { title: 'Confirm the mentor list and pairings', ownerSlot: 'Presenting partner', offsetDays: -21 },
        { title: 'Event page live', ownerSlot: 'host', offsetDays: -18 },
        { title: 'Coffee cart headcount and arrival window', ownerSlot: 'Coffee vendor', offsetDays: -12 },
        { title: 'Send conversation prompts to mentors', ownerSlot: 'host', offsetDays: -4 },
        { title: 'Recap out to every party', ownerSlot: 'host', offsetDays: 2 },
      ],
      runOfShowSkeleton: [
        { offsetMinutes: -40, title: 'Host arrives, signage up', ownerSlot: 'host' },
        { offsetMinutes: -30, title: 'Coffee cart load-in', ownerSlot: 'Coffee vendor' },
        { offsetMinutes: -15, title: 'Check-in and pairing handout', ownerSlot: 'host' },
        { offsetMinutes: 0, title: 'Run start, paired', ownerSlot: 'all' },
        { offsetMinutes: 75, title: 'Coffee and open conversation', ownerSlot: 'all' },
      ],
      defaults: { capacityTarget: 50, durationMinutes: 135, startTime: '07:30' },
      createdFrom: 'seed',
      createdAt: NOW,
    },
  ]

  const contacts: CapturedContact[] = [
    {
      id: 'ct-priya',
      name: 'Priya Shah',
      handles: { instagram: '@priya.runs', linkedin: 'linkedin.com/in/priyashah', phone: '415 555 0113' },
      eventId: 'marina-track-social',
      note: "Runs sub 8s, wants in on the next sunrise five. Knows a mural artist who does event banners. Ask about her club's Thursday crew.",
      followUp: { due: '2026-08-19', done: false },
      capturedAt: '2026-07-16T20:10:00.000Z',
      capturedBy: HOST,
      ownerUid: HOST,
    },
    {
      id: 'ct-danny',
      name: 'Danny Ko',
      handles: { instagram: '@dannyko', email: 'danny@example.com' },
      eventId: 'marina-track-social',
      note: 'Photographer, offered to shoot the next one for tagged credit.',
      followUp: { due: '2026-08-21', done: false },
      capturedAt: '2026-07-16T20:25:00.000Z',
      capturedBy: HOST,
      ownerUid: HOST,
    },
    {
      id: 'ct-jordan',
      name: 'Jordan Reyes',
      handles: { instagram: '@jordanreyes' },
      eventId: 'marina-track-social',
      note: 'Runs a Wednesday club in Oakland, open to a joint morning.',
      followUp: { due: '2026-07-18', done: true },
      capturedAt: '2026-07-16T20:40:00.000Z',
      capturedBy: HOST,
      ownerUid: HOST,
    },
  ]

  const availability: AvailabilityBlock[] = [
    { id: 'av1', ownerUid: HOST, kind: 'away', startDate: '2026-08-13', endDate: '2026-08-16', label: 'Away' },
  ]

  const moments: CitywideMoment[] = [
    { id: 'mo1', ownerUid: HOST, name: 'Outside Lands', startDate: '2026-08-07', endDate: '2026-08-09' },
    { id: 'mo2', ownerUid: HOST, name: 'SF Tech Week', startDate: '2026-10-05', endDate: '2026-10-11' },
  ]

  const tokens: GuestToken[] = Object.entries(parties).flatMap(([eventId, list]) =>
    list.map((p) => ({
      id: p.tokenId as string,
      ownerUid: HOST,
      eventId,
      scope: 'party' as const,
      subjectId: p.id,
      revoked: false,
      createdAt: NOW,
      lastUsedAt: null,
    })),
  )

  const log: Record<string, LogEntry[]> = {
    'presidio-sunrise-five': [],
    'marina-track-social': [
      { id: 'lg1', text: 'Track lights cut at 9 sharp, plan the photo before 8:45 next time.', createdAt: '2026-07-16T21:05:00.000Z' },
    ],
  }

  return {
    orgs,
    events: [presidio, marina],
    parties,
    tasks,
    runOfShow,
    crew,
    log,
    templates,
    contacts,
    availability,
    moments,
    tokens,
    people: buildPeople(),
  }
}
