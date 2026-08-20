import { useState } from 'react'
import { Check, Plus, X } from 'lucide-react'
import { Card, Chip, Eyebrow, EmptyState, QuietButton, cx } from '../../ui/primitives'
import { Input, InlineText } from '../../ui/form'
import { useEvent, useOwnerLookup } from './EventContext'
import { DueChip, OwnerChip } from './InlineEditors'
import { ownerLabel, ownerOptions } from '../../data/profiles'
import type { OwnerRef, Task } from '../../data/types'
import { isOverdue } from '../../lib/dates'
import { track } from '../../lib/analytics'

// Grouped by owner: host first, then parties, then crew. Overdue reads
// clearly without alarm panic.

export default function TasksTab() {
  const { bundle, run } = useEvent()
  const lookup = useOwnerLookup()
  const [adding, setAdding] = useState(false)
  const [draft, setDraft] = useState('')

  const eventId = bundle.event.id
  const confirmed = bundle.event.dateOptions.find((o) => o.id === bundle.event.confirmedDateOptionId)
  const eventDate = confirmed ? new Date(confirmed.startsAt) : null

  // Every possible owner gets a group, in picker order, so a newly assigned
  // party never appears at the bottom out of sequence.
  const groups = ownerOptions(lookup)
    .map(({ owner }) => ({
      owner,
      label: ownerLabel(owner, lookup) + (owner === 'host' ? ', host' : ''),
      tasks: bundle.tasks.filter((t) => t.owner === owner),
    }))
    .filter((group) => group.tasks.length > 0)

  const orphaned = bundle.tasks.filter((t) => !groups.some((g) => g.tasks.includes(t)))

  const addTask = () => {
    const title = draft.trim()
    if (!title) return
    run((api) => api.createTask(eventId, { title, owner: 'host', dueDate: null, note: '' }))
    setDraft('')
    setAdding(false)
  }

  const update = (task: Task, patch: Partial<Task>) => {
    run((api) => api.updateTask(eventId, task.id, patch))
    track('hp_task_updated', { eventId, owner: task.owner })
  }

  return (
    <>
      {bundle.tasks.length === 0 && !adding && (
        <EmptyState
          title="No tasks yet"
          body="Add what has to happen before the day. Assign them to yourself, a partner, or a helper."
          action={
            <QuietButton onClick={() => setAdding(true)}>
              <Plus size={12} />
              Add task
            </QuietButton>
          }
        />
      )}

      {[...groups, ...(orphaned.length ? [{ owner: 'host' as OwnerRef, label: 'Unassigned', tasks: orphaned }] : [])].map(
        (group) => (
          <div key={group.label} className="mb-3">
            <Eyebrow className="mb-[6px]">{group.label}</Eyebrow>
            <Card className="!px-4 !py-[6px]">
              {group.tasks.map((task, index) => (
                <div
                  key={task.id}
                  className={cx(
                    'flex flex-wrap items-center justify-between gap-2 py-2',
                    index > 0 && 'border-t border-hair',
                  )}
                >
                  <div className="flex min-w-0 flex-1 items-center gap-2">
                    <button
                      type="button"
                      aria-label={task.status === 'done' ? 'Mark open' : 'Mark done'}
                      onClick={() => update(task, { status: task.status === 'done' ? 'open' : 'done' })}
                      className={cx(
                        'hairline flex size-[18px] shrink-0 items-center justify-center rounded-md transition',
                        task.status === 'done'
                          ? 'border-transparent bg-grn text-grnk'
                          : 'border-[#dad5ec] text-transparent hover:border-viodash',
                      )}
                    >
                      <Check size={12} />
                    </button>

                    {task.status === 'open' && isOverdue(task.dueDate) && (
                      <Chip tone="rose">Overdue</Chip>
                    )}

                    <InlineText
                      ariaLabel="Task title"
                      value={task.title}
                      onCommit={(title) => title && update(task, { title })}
                      className={cx('flex-1', task.status === 'done' && 'text-mut line-through')}
                    />
                  </div>

                  <div className="flex shrink-0 items-center gap-[6px]">
                    <DueChip
                      dueDate={task.dueDate}
                      eventDate={eventDate}
                      done={task.status === 'done'}
                      onChange={(dueDate) => update(task, { dueDate })}
                    />
                    <OwnerChip owner={task.owner} onChange={(owner) => update(task, { owner })} />
                    <button
                      type="button"
                      aria-label="Delete task"
                      onClick={() => run((api) => api.deleteTask(eventId, task.id))}
                      className="text-mut transition hover:text-rosek"
                    >
                      <X size={13} />
                    </button>
                  </div>
                </div>
              ))}
            </Card>
          </div>
        ),
      )}

      {adding ? (
        <div className="flex gap-2">
          <Input
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') addTask()
              if (e.key === 'Escape') setAdding(false)
            }}
            placeholder="What has to happen"
            aria-label="New task"
            autoFocus
          />
          <QuietButton onClick={addTask} className="shrink-0">
            Add
          </QuietButton>
        </div>
      ) : (
        bundle.tasks.length > 0 && (
          <QuietButton onClick={() => setAdding(true)}>
            <Plus size={12} />
            Add task
          </QuietButton>
        )
      )}
    </>
  )
}
