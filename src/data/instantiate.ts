import { materializeOffsets } from '../lib/dates'
import { orgTypeLabel } from './profiles'
import type {
  EventDoc,
  Org,
  OwnerRef,
  Party,
  RunItem,
  Task,
  Template,
  TemplateMatching,
} from './types'

/**
 * Turns a template skeleton into real tasks and run-of-show items.
 *
 * Tasks are created with their relative offset and no due date. Dates arrive
 * when an option is confirmed (F3), which is also when rush mode compresses a
 * skeleton that would otherwise reach back before today (F4).
 */

/** Template slots name a role; parties fill them. Resolve to an owner ref. */
function resolveOwner(
  ownerSlot: string,
  slotAssignments: Record<string, string>,
  parties: Party[],
): OwnerRef {
  if (ownerSlot === 'host') return 'host'
  if (ownerSlot === 'all') return 'all'
  const orgId = slotAssignments[ownerSlot]
  if (!orgId) return 'host'
  const party = parties.find((p) => p.orgId === orgId)
  return party ? `party:${party.id}` : 'host'
}

export function tasksFromTemplate(
  template: Template,
  slotAssignments: Record<string, string>,
  parties: Party[],
  makeId: () => string,
): Task[] {
  return template.taskSkeleton.map((item, index) => ({
    id: makeId(),
    title: item.title,
    owner: resolveOwner(item.ownerSlot, slotAssignments, parties),
    dueDate: null,
    offsetDays: item.offsetDays,
    status: 'open' as const,
    note: item.note ?? '',
    order: index,
  }))
}

function minutesToClock(base: string, offsetMinutes: number): string {
  const [h, m] = base.split(':').map(Number)
  const total = (h ?? 7) * 60 + (m ?? 0) + offsetMinutes
  const wrapped = ((total % 1440) + 1440) % 1440
  return `${`${Math.floor(wrapped / 60)}`.padStart(2, '0')}:${`${wrapped % 60}`.padStart(2, '0')}`
}

export function runItemsFromTemplate(
  template: Template,
  slotAssignments: Record<string, string>,
  parties: Party[],
  startTime: string,
  makeId: () => string,
): RunItem[] {
  return template.runOfShowSkeleton.map((item, index) => ({
    id: makeId(),
    time: minutesToClock(startTime, item.offsetMinutes),
    title: item.title,
    owner: resolveOwner(item.ownerSlot, slotAssignments, parties),
    notes: item.notes ?? '',
    order: index,
  }))
}

// M1, save as template. The other direction: an event that went well becomes
// the skeleton for the next one.

/** What the workspace already holds, which is everything the derivation needs. */
export interface EventForTemplate {
  event: EventDoc
  parties: Party[]
  tasks: Task[]
  runOfShow: RunItem[]
  orgs: Org[]
}

const DAY = 24 * 60 * 60 * 1000

/** Minutes past midnight for a "07:30" clock string. */
function clockMinutes(time: string): number {
  const [h, m] = time.split(':').map(Number)
  return (h || 0) * 60 + (m || 0)
}

/**
 * Slots name roles, not partners. A template built from an event where Little
 * Wolf poured the coffee should be reusable by whoever pours it next time, so
 * each party becomes its role label, numbered when a role repeats.
 */
function slotNames(parties: Party[]): Map<string, string> {
  const used = new Map<string, number>()
  const byParty = new Map<string, string>()
  for (const party of parties) {
    const base = orgTypeLabel(party.roleOnEvent)
    const seen = (used.get(base) ?? 0) + 1
    used.set(base, seen)
    byParty.set(party.id, seen === 1 ? base : `${base} ${seen}`)
  }
  return byParty
}

/** Owner refs become slot names. Crew is per event and named, so it folds to the host. */
function ownerSlot(owner: OwnerRef, slots: Map<string, string>): string {
  if (owner === 'host' || owner === 'all') return owner
  if (owner.startsWith('crew:')) return 'host'
  return slots.get(owner.slice('party:'.length)) ?? 'host'
}

/**
 * Turn an event into a reusable template.
 *
 * Dates become offsets against the confirmed option, or the first proposed one
 * when nothing is confirmed yet, so a template saved mid-planning still works.
 * A task the host never dated keeps whatever offset it arrived with, and lands
 * on the event day if it never had one.
 *
 * Nothing comes out required. The host marks what matters in the editor; a
 * derived template guessing at that would put a partner in front of a flow
 * that refuses to continue without them, which is the opposite of solo-first.
 */
export function templateFromEvent(
  source: EventForTemplate,
  name: string,
  matching: TemplateMatching | null = null,
): Omit<Template, 'id' | 'ownerUid' | 'createdAt'> {
  const { event, parties, tasks, runOfShow } = source
  const anchor =
    event.dateOptions.find((o) => o.id === event.confirmedDateOptionId)?.startsAt ??
    event.dateOptions[0]?.startsAt ??
    null

  // Date-only, both sides in UTC. Comparing the timestamps directly would let
  // a daylight saving boundary between the two turn a whole number of days
  // into 6.96 and round the wrong way.
  const anchorDate = anchor ? anchor.slice(0, 10) : null
  const startTime = anchor ? anchor.slice(11, 16) : runOfShow[0]?.time ?? '07:00'
  const startMinutes = clockMinutes(startTime)
  const slots = slotNames(parties)

  const taskSkeleton = tasks.map((task) => {
    const offsetDays =
      task.dueDate && anchorDate
        ? Math.round(
            (Date.parse(`${task.dueDate}T00:00:00Z`) - Date.parse(`${anchorDate}T00:00:00Z`)) / DAY,
          )
        : task.offsetDays ?? 0
    return {
      title: task.title,
      ownerSlot: ownerSlot(task.owner, slots),
      offsetDays,
      ...(task.note ? { note: task.note } : {}),
    }
  })

  const runOfShowSkeleton = runOfShow.map((item) => ({
    offsetMinutes: clockMinutes(item.time) - startMinutes,
    title: item.title,
    ownerSlot: ownerSlot(item.owner, slots),
    ...(item.notes ? { notes: item.notes } : {}),
  }))

  const spans = runOfShowSkeleton.map((i) => i.offsetMinutes)

  return {
    name,
    description: event.description,
    roleSlots: parties.map((party) => ({
      slot: slots.get(party.id) as string,
      orgType: party.roleOnEvent,
      required: false,
    })),
    taskSkeleton,
    runOfShowSkeleton,
    defaults: {
      ...(event.capacityTarget !== null ? { capacityTarget: event.capacityTarget } : {}),
      ...(spans.length > 1 ? { durationMinutes: Math.max(...spans) - Math.min(...spans) } : {}),
      startTime,
    },
    matching,
    createdFrom: 'event',
  }
}

export interface Materialized {
  tasks: { id: string; dueDate: string }[]
  compressedCount: number
}

/**
 * Called when a date is confirmed. Only tasks still carrying an offset and no
 * due date get one, so a date the host set by hand is never overwritten.
 */
export function materializeTasks(
  tasks: Task[],
  eventDate: Date,
  today = new Date(),
): Materialized {
  const pending = tasks.filter((t) => t.offsetDays !== null && !t.dueDate)
  if (pending.length === 0) return { tasks: [], compressedCount: 0 }

  const results = materializeOffsets(
    pending.map((t) => t.offsetDays as number),
    eventDate,
    today,
  )

  return {
    tasks: pending.map((t, i) => ({ id: t.id, dueDate: results[i].dueDate })),
    compressedCount: results.filter((r) => r.compressed).length,
  }
}
