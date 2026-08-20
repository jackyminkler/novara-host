import { useState } from 'react'
import { Check, ChevronDown, Plus } from 'lucide-react'
import { Chip, QuietButton, cx } from '../../ui/primitives'
import type { ChipTone } from '../../ui/primitives'
import { Popover, PopoverItem } from '../../ui/Popover'
import { Input } from '../../ui/form'
import { useEvent, useOwnerLookup } from './EventContext'
import { ownerLabel, ownerOptions } from '../../data/profiles'
import type { OwnerRef } from '../../data/types'
import { addDays, formatDue, isOverdue, toDateKey } from '../../lib/dates'

// PRD 4.7: tapping a due date opens a picker, tapping an owner chip opens the
// assignee list. Never more than two taps plus the selection, and never a
// separate edit page.

export function OwnerChip({
  owner,
  onChange,
  includeAll = false,
  tone = 'gray',
}: {
  owner: OwnerRef
  onChange: (next: OwnerRef) => void
  includeAll?: boolean
  tone?: ChipTone
}) {
  const [open, setOpen] = useState(false)
  const [newName, setNewName] = useState('')
  const [adding, setAdding] = useState(false)
  const lookup = useOwnerLookup()
  const { bundle, run } = useEvent()

  const addCrew = () => {
    const name = newName.trim()
    if (!name) return
    run(async (api) => {
      const id = await api.createCrew(bundle.event.id, name, '')
      onChange(`crew:${id}`)
    })
    setNewName('')
    setAdding(false)
    setOpen(false)
  }

  return (
    <span className="relative inline-block">
      <button type="button" onClick={() => setOpen((v) => !v)} aria-label="Change owner">
        <Chip tone={open ? 'vio' : tone} className={cx(open && 'ring-focus')}>
          {ownerLabel(owner, lookup)}
          <ChevronDown size={11} />
        </Chip>
      </button>

      {open && (
        <Popover onClose={() => setOpen(false)} align="right" className="w-52">
          <p className="mb-[6px] px-2 text-[11.5px] font-semibold">Assign to</p>
          {ownerOptions(lookup, includeAll).map((option) => (
            <PopoverItem
              key={option.owner}
              selected={option.owner === owner}
              onClick={() => {
                onChange(option.owner)
                setOpen(false)
              }}
            >
              {option.label}
              {option.owner === owner && <Check size={13} />}
            </PopoverItem>
          ))}

          <div className="mt-1 border-t border-hair pt-1">
            {adding ? (
              <div className="flex gap-1 px-1 py-1">
                <Input
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && addCrew()}
                  placeholder="Their name"
                  aria-label="New crew person name"
                  autoFocus
                  className="!py-1 !text-xs"
                />
                <QuietButton onClick={addCrew}>Add</QuietButton>
              </div>
            ) : (
              <QuietButton className="px-2 text-[11.5px]" onClick={() => setAdding(true)}>
                <Plus size={11} />
                New crew person
              </QuietButton>
            )}
          </div>
        </Popover>
      )}
    </span>
  )
}

export function DueChip({
  dueDate,
  onChange,
  eventDate,
  done = false,
}: {
  dueDate: string | null
  onChange: (next: string | null) => void
  eventDate: Date | null
  /** A finished task is never late, whatever its date says. */
  done?: boolean
}) {
  const [open, setOpen] = useState(false)
  const overdue = !done && isOverdue(dueDate)

  const pick = (value: string | null) => {
    onChange(value)
    setOpen(false)
  }

  // The shortcuts everyone actually uses, relative to the confirmed date.
  const shortcuts: { label: string; value: string }[] = []
  if (eventDate) {
    shortcuts.push(
      { label: 'Day of', value: toDateKey(eventDate) },
      { label: 'Three days before', value: toDateKey(addDays(eventDate, -3)) },
      { label: 'A week before', value: toDateKey(addDays(eventDate, -7)) },
    )
  }
  shortcuts.push({ label: 'Today', value: toDateKey(new Date()) })

  return (
    <span className="relative inline-block">
      <button type="button" onClick={() => setOpen((v) => !v)} aria-label="Change due date">
        <Chip
          tone={open ? 'vio' : overdue ? 'rose' : dueDate ? 'vio' : 'gray'}
          className={cx(open && 'ring-focus')}
        >
          {formatDue(dueDate)}
          <ChevronDown size={11} />
        </Chip>
      </button>

      {open && (
        <Popover onClose={() => setOpen(false)} align="right" className="w-52">
          <p className="mb-[6px] px-2 text-[11.5px] font-semibold">Due date</p>
          <Input
            type="date"
            value={dueDate ?? ''}
            onChange={(e) => pick(e.target.value || null)}
            aria-label="Due date"
            className="mb-1 !py-1 !text-xs"
          />
          {shortcuts.map((shortcut) => (
            <PopoverItem key={shortcut.label} onClick={() => pick(shortcut.value)}>
              {shortcut.label}
            </PopoverItem>
          ))}
          {!eventDate && (
            <p className="px-2 py-1 text-[11px] text-mut">
              Confirm a date to unlock day of and the countdown shortcuts.
            </p>
          )}
          {dueDate && (
            <PopoverItem className="text-sec" onClick={() => pick(null)}>
              Clear the date
            </PopoverItem>
          )}
        </Popover>
      )}
    </span>
  )
}
