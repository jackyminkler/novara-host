import { useState } from 'react'
import { Check, Plus, X } from 'lucide-react'
import { Card, EmptyState, Eyebrow, QuietButton, Sub, cx } from '../../ui/primitives'
import { Input, InlineText } from '../../ui/form'
import { useEvent } from './EventContext'
import { OwnerChip } from './InlineEditors'
import { track } from '../../lib/analytics'
import type { RunItem, ShotItem } from '../../data/types'

// Editorial timeline with owner chips including crew and all. Large type and
// high contrast, because this gets read outdoors at 7 am.
//
// M1 shot list sits under the timeline rather than inside it: photos happen
// across the morning rather than at a minute, and the person holding the
// camera is usually not the person running the item.

let shotSeq = 0
const nextShotId = () => `sh-${Date.now().toString(36)}-${(shotSeq += 1)}`

export default function RunOfShowTab() {
  const { bundle, run } = useEvent()
  const [adding, setAdding] = useState(false)
  const [time, setTime] = useState('07:00')
  const [title, setTitle] = useState('')

  const eventId = bundle.event.id

  const add = () => {
    if (!title.trim()) return
    run((api) => api.createRunItem(eventId, { time, title: title.trim(), owner: 'host', notes: '' }))
    setTitle('')
    setAdding(false)
  }

  const update = (item: RunItem, patch: Partial<RunItem>) =>
    run((api) => api.updateRunItem(eventId, item.id, patch))

  return (
    <>
      {bundle.runOfShow.length === 0 && !adding && (
        <EmptyState
          title="No run of show yet"
          body="Lay out the morning from load-in to the last photo. Partners see their own items on their page."
          action={
            <QuietButton onClick={() => setAdding(true)}>
              <Plus size={12} />
              Add item
            </QuietButton>
          }
        />
      )}

      {bundle.runOfShow.length > 0 && (
        <Card className="mb-3 !px-[18px] !py-[6px]">
          {bundle.runOfShow.map((item, index) => (
            <div
              key={item.id}
              className={cx(
                'flex flex-wrap items-center justify-between gap-2 py-[9px]',
                index > 0 && 'border-t border-hair',
              )}
            >
              <div className="flex min-w-0 flex-1 items-center gap-3">
                <input
                  type="time"
                  value={item.time}
                  onChange={(e) => update(item, { time: e.target.value })}
                  aria-label={`Time for ${item.title}`}
                  className="hairline w-[86px] shrink-0 rounded-md border-transparent bg-transparent px-1 py-[2px] font-display text-[15px] font-semibold tabular-nums outline-none transition hover:border-line focus:ring-focus"
                />
                <InlineText
                  ariaLabel="Run of show item"
                  value={item.title}
                  onCommit={(next) => next && update(item, { title: next })}
                  className="flex-1 !text-[13.5px]"
                />
              </div>
              <div className="flex shrink-0 items-center gap-[6px]">
                <OwnerChip
                  owner={item.owner}
                  includeAll
                  tone={item.owner === 'all' ? 'vio' : 'gray'}
                  onChange={(owner) => update(item, { owner })}
                />
                <button
                  type="button"
                  aria-label="Delete item"
                  onClick={() => run((api) => api.deleteRunItem(eventId, item.id))}
                  className="text-mut transition hover:text-rosek"
                >
                  <X size={13} />
                </button>
              </div>
            </div>
          ))}
        </Card>
      )}

      {adding ? (
        <div className="flex flex-wrap gap-2">
          <Input
            type="time"
            value={time}
            onChange={(e) => setTime(e.target.value)}
            aria-label="Time"
            className="!w-[110px]"
          />
          <Input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') add()
              if (e.key === 'Escape') setAdding(false)
            }}
            placeholder="What happens"
            aria-label="New run of show item"
            autoFocus
            className="!w-auto flex-1"
          />
          <QuietButton onClick={add}>Add</QuietButton>
        </div>
      ) : (
        bundle.runOfShow.length > 0 && (
          <div className="flex items-center gap-3">
            <QuietButton onClick={() => setAdding(true)}>
              <Plus size={12} />
              Add item
            </QuietButton>
            <span className="text-[13px] text-sec">Items sort by time.</span>
          </div>
        )
      )}

      <ShotList />
    </>
  )
}

/** What to photograph, and who is holding the camera. */
function ShotList() {
  const { bundle, run } = useEvent()
  const [draft, setDraft] = useState('')

  const eventId = bundle.event.id
  const shots = bundle.event.shotList ?? []

  const write = (next: ShotItem[]) => run((api) => api.updateEvent(eventId, { shotList: next }))

  const patch = (id: string, change: Partial<ShotItem>) =>
    write(shots.map((s) => (s.id === id ? { ...s, ...change } : s)))

  const add = () => {
    const description = draft.trim()
    if (!description) return
    write([...shots, { id: nextShotId(), description, owner: 'host', done: false }])
    setDraft('')
  }

  return (
    <div className="mt-5">
      <Eyebrow className="mb-[6px]">Shot list</Eyebrow>

      {shots.length > 0 && (
        <Card className="mb-2 !px-[18px] !py-[6px]">
          {shots.map((shot, index) => (
            <div
              key={shot.id}
              className={cx(
                'flex flex-wrap items-center justify-between gap-2 py-[9px]',
                index > 0 && 'border-t border-hair',
              )}
            >
              <div className="flex min-w-0 flex-1 items-center gap-2">
                <button
                  type="button"
                  aria-label={shot.done ? 'Mark not taken' : 'Mark taken'}
                  onClick={() => {
                    patch(shot.id, { done: !shot.done })
                    track('hp_shot_toggled', { eventId })
                  }}
                  className={cx(
                    'hairline flex size-[18px] shrink-0 items-center justify-center rounded-md transition',
                    shot.done
                      ? 'border-transparent bg-grn text-grnk'
                      : 'border-[#dad5ec] text-transparent hover:border-viodash',
                  )}
                >
                  <Check size={12} />
                </button>
                <InlineText
                  ariaLabel="Shot"
                  value={shot.description}
                  onCommit={(next) => next && patch(shot.id, { description: next })}
                  className={cx('flex-1 !text-[13px]', shot.done && 'text-mut line-through')}
                />
              </div>
              <div className="flex shrink-0 items-center gap-[6px]">
                <OwnerChip
                  owner={shot.owner}
                  includeAll
                  tone={shot.owner === 'all' ? 'vio' : 'gray'}
                  onChange={(owner) => patch(shot.id, { owner })}
                />
                <button
                  type="button"
                  aria-label="Delete shot"
                  onClick={() => write(shots.filter((s) => s.id !== shot.id))}
                  className="text-mut transition hover:text-rosek"
                >
                  <X size={13} />
                </button>
              </div>
            </div>
          ))}
        </Card>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <Input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && add()}
          placeholder="The shot you would be sad to miss"
          aria-label="New shot"
          className="!w-auto min-w-[200px] flex-1"
        />
        <QuietButton onClick={add}>
          <Plus size={12} />
          Add shot
        </QuietButton>
      </div>
      {shots.length === 0 && (
        <Sub>Photos are the recap. Name a few now so nobody has to remember at 7 am.</Sub>
      )}
    </div>
  )
}
