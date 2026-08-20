import { materializeOffsets } from '../lib/dates'
import type { OwnerRef, Party, RunItem, Task, Template } from './types'

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
