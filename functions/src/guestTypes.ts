// Mirror of src/guest/guestTypes.ts. Two build roots, one contract: change
// one and change the other in the same commit.

export type GuestScope = 'party' | 'crew' | 'recap'

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

export type GuestAction = 'respond_dates' | 'update_task' | 'confirm_role' | 'add_note'

/** Only these four actions are ever accepted, per PRD 3.2. */
export const GUEST_ACTIONS: GuestAction[] = [
  'respond_dates',
  'update_task',
  'confirm_role',
  'add_note',
]
