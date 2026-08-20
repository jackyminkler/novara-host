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

export type GuestAction = 'respond_dates' | 'update_task' | 'confirm_role' | 'add_note'

export interface GuestSubmitBody {
  t: string
  action: GuestAction
  payload: Record<string, unknown>
}
