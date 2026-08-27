import { useState } from 'react'
import { Check, Plus, X } from 'lucide-react'
import { Button, Card, Chip, Eyebrow, GhostButton, QuietButton, Sub, SubTitle, cx } from '../../ui/primitives'
import { Input } from '../../ui/form'
import { Popover } from '../../ui/Popover'
import { useAsync } from '../useApi'
import { useEvent } from './EventContext'
import type { DateOption, Party, ResponseValue } from '../../data/types'
import { awayConflict, formatDayOnly, formatLong, formatTime, holidayOn } from '../../lib/dates'
import { dateClashes } from './siteChecks'
import { track } from '../../lib/analytics'

// The hero screen. Parties by options, response chips, and a constraint note.
// Confirming collapses the matrix into a banner and updates every guest view
// without republishing a single link.

let optionSeq = 0
const nextOptionId = () => `opt-${Date.now().toString(36)}-${(optionSeq += 1)}`

interface EditingCell {
  partyId: string
  optionId: string
  /** Viewport rect of the chip that opened the panel. */
  rect: DOMRect
}

function yesCount(parties: Party[], optionId: string): number {
  return parties.filter((p) => p.dateResponses[optionId]?.value === 'yes').length
}

function recordTitle(
  editing: EditingCell,
  parties: Party[],
  orgs: { id: string; name: string }[],
  options: DateOption[],
): string {
  const party = parties.find((p) => p.id === editing.partyId)
  const name = orgs.find((o) => o.id === party?.orgId)?.name ?? 'Partner'
  const option = options.find((o) => o.id === editing.optionId)
  return `${name}, ${option ? formatDayOnly(option.startsAt) : ''}`
}

export default function DatesTab() {
  const { bundle, run } = useEvent()
  const { event, parties, orgs } = bundle
  const [adding, setAdding] = useState(false)
  const [draft, setDraft] = useState('')
  const [editing, setEditing] = useState<EditingCell | null>(null)

  // Away blocks are the host's own calendar, so a conflict warning needs them.
  const { data: availability } = useAsync((api) => api.listAvailability(), [])
  // The host's other events, for the same-day warning the overview also shows.
  const { data: allEvents } = useAsync((api) => api.listEvents(), [])

  const confirmed = event.dateOptions.find((o) => o.id === event.confirmedDateOptionId)
  const clashes = dateClashes(event, allEvents ?? [])

  const addOption = () => {
    if (!draft || event.dateOptions.length >= 5) return
    run((api) =>
      api.updateEvent(event.id, {
        dateOptions: [...event.dateOptions, { id: nextOptionId(), startsAt: draft, label: '' }],
      }),
    )
    setDraft('')
    setAdding(false)
  }

  const removeOption = (optionId: string) =>
    run((api) =>
      api.updateEvent(event.id, {
        dateOptions: event.dateOptions.filter((o) => o.id !== optionId),
      }),
    )

  const confirm = (optionId: string | null) => run((api) => api.confirmDate(event.id, optionId))

  if (confirmed) {
    const answered = parties.filter((p) => Object.keys(p.dateResponses).length > 0).length
    const silent = parties.length - answered
    return (
      <>
        <Card tone="violet">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <Eyebrow className="mb-1 text-vio">Confirmed</Eyebrow>
              <SubTitle className="text-vio">{formatLong(confirmed.startsAt)}</SubTitle>
              <Sub>
                All guest pages updated. Tasks and the run of show now carry real dates.
              </Sub>
            </div>
            <QuietButton onClick={() => confirm(null)}>Change date</QuietButton>
          </div>
        </Card>
        {parties.length > 0 && (
          <p className="mt-[10px] text-xs text-mut">
            Responses kept for the record: {yesCount(parties, confirmed.id)} yes
            {silent > 0 && `, ${silent} never answered`}.
          </p>
        )}
      </>
    )
  }

  if (event.dateOptions.length === 0) {
    return (
      <Card>
        <SubTitle className="mb-1">No dates proposed yet</SubTitle>
        <Sub className="mb-3">Two to five options give partners something to answer.</Sub>
        <AddOption
          value={draft}
          onChange={setDraft}
          onAdd={addOption}
          onCancel={() => setAdding(false)}
          open
        />
      </Card>
    )
  }

  const scored = event.dateOptions
    .map((option) => ({ option, yes: yesCount(parties, option.id) }))
    .sort((a, b) => b.yes - a.yes)
  const leading = scored[0]

  const constraints = parties
    .filter((p) => p.constraintNote)
    .map((p) => ({
      id: p.id,
      name: orgs.find((o) => o.id === p.orgId)?.name ?? 'A partner',
      note: p.constraintNote,
    }))

  // Narrow screens scroll the whole matrix sideways as one piece. Nothing is
  // pinned: the rows are few and short, so a locked column costs more than the
  // context it buys.
  const columns = `minmax(160px,2fr) repeat(${event.dateOptions.length},minmax(84px,1fr))`
  const cellBorder = 'border-t border-hair'

  return (
    <>
      <Card className="!p-0">
        <div className="overflow-x-auto rounded-[13px]">
          <div className="min-w-[420px]">
            <div
              className="grid gap-[6px] text-[11.5px] text-mut"
              style={{ gridTemplateColumns: columns }}
            >
              <div className="pl-[18px]" />
              {event.dateOptions.map((option, index) => (
                <OptionHead
                  key={option.id}
                  option={option}
                  availability={availability ?? []}
                  sharedWith={clashes.filter((c) => c.optionId === option.id).map((c) => c.title)}
                  onRemove={() => removeOption(option.id)}
                  className={index === event.dateOptions.length - 1 ? 'pr-[18px]' : undefined}
                />
              ))}
            </div>

            {parties.length === 0 && (
              <p className={`${cellBorder} px-[18px] py-4 text-[12.5px] text-mut`}>
                No partners on this event. Pick whichever date suits you and confirm it.
              </p>
            )}

            {parties.map((party) => {
              const org = orgs.find((o) => o.id === party.orgId)
              const silent = Object.keys(party.dateResponses).length === 0
              return (
                <div
                  key={party.id}
                  className="grid items-center gap-[6px] text-[12.5px]"
                  style={{ gridTemplateColumns: columns }}
                >
                  <span
                    className={`${cellBorder} flex min-w-0 items-center gap-[6px] py-[7px] pl-[18px] pr-2`}
                  >
                    <span className="truncate">{org?.name ?? 'Removed partner'}</span>
                    {silent && <Chip tone="rose">Awaiting</Chip>}
                  </span>
                  {event.dateOptions.map((option, index) => (
                    <span
                      key={option.id}
                      className={`${cellBorder} flex justify-center py-[7px] ${
                        index === event.dateOptions.length - 1 ? 'pr-[18px]' : ''
                      }`}
                    >
                      <ResponseCell
                        response={party.dateResponses[option.id]}
                        onOpen={(rect) =>
                          setEditing({ partyId: party.id, optionId: option.id, rect })
                        }
                        partyName={org?.name ?? 'this partner'}
                        optionLabel={formatDayOnly(option.startsAt)}
                      />
                    </span>
                  ))}
                </div>
              )
            })}
          </div>
        </div>
      </Card>

      {/* Constraints live below the matrix, not between its rows: they are full
          sentences, and inside a sideways scroller they would slide out from
          under the party name that is pinned in place. */}
      {constraints.length > 0 && (
        <div className="mt-[10px] space-y-1">
          {constraints.map(({ id, name, note }) => (
            <p key={id} className="text-[11.5px] text-mut">
              <span className="font-medium">{name}:</span> {note}
            </p>
          ))}
        </div>
      )}

      {editing && (
        <RecordPopover
          anchor={editing.rect}
          title={recordTitle(editing, parties, orgs, event.dateOptions)}
          current={
            parties.find((p) => p.id === editing.partyId)?.dateResponses[editing.optionId]?.value
          }
          onClose={() => setEditing(null)}
          onPick={(value, note) => {
            run((api) =>
              api.setDateResponse(event.id, editing.partyId, editing.optionId, value, 'host', note),
            )
            track('hp_date_response_submitted', { eventId: event.id, source: 'host' })
            setEditing(null)
          }}
        />
      )}

      <div className="mt-3 flex flex-wrap items-center gap-3">
        <Button onClick={() => confirm(leading.option.id)}>
          Confirm {formatDayOnly(leading.option.startsAt)}
        </Button>
        {parties.length > 0 && (
          <span className="text-[13px] text-sec">
            {leading.yes} of {parties.length} can make it
          </span>
        )}
        {event.dateOptions.length < 5 && !adding && (
          <QuietButton onClick={() => setAdding(true)}>
            <Plus size={12} />
            Add a date option
          </QuietButton>
        )}
      </div>

      {adding && (
        <div className="mt-3">
          <AddOption
            value={draft}
            onChange={setDraft}
            onAdd={addOption}
            onCancel={() => setAdding(false)}
            open
          />
        </div>
      )}

      <div className="mt-4 flex flex-wrap gap-4 text-[11px] text-sec">
        <span className="flex items-center gap-[6px]">
          <Chip tone="grn" className="!px-[7px] !py-[2px]">
            <Check size={11} />
          </Chip>
          Answered via link
        </span>
        <span className="flex items-center gap-[6px]">
          <Chip tone="grn" className="!px-[7px] !py-[2px]">
            <Check size={11} />
            <ProvenanceDot />
          </Chip>
          Recorded by you
        </span>
      </div>
    </>
  )
}

/** The small dot that marks a host-recorded answer. Both kinds count the same. */
function ProvenanceDot() {
  return <span className="inline-block size-[5px] rounded-full bg-current opacity-45" />
}

function ResponseCell({
  response,
  onOpen,
  partyName,
  optionLabel,
}: {
  response: Party['dateResponses'][string] | undefined
  onOpen: (rect: DOMRect) => void
  partyName: string
  optionLabel: string
}) {
  const label = `Record ${partyName} for ${optionLabel}`
  const open = (e: React.MouseEvent<HTMLButtonElement>) =>
    onOpen(e.currentTarget.getBoundingClientRect())

  if (!response) {
    return (
      <button type="button" onClick={open} aria-label={label}>
        <Chip tone="gray">?</Chip>
      </button>
    )
  }

  const tone = response.value === 'yes' ? 'grn' : response.value === 'no' ? 'rose' : 'gray'
  return (
    <button type="button" onClick={open} aria-label={label}>
      <Chip tone={tone}>
        {response.value === 'yes' && <Check size={12} />}
        {response.value === 'no' && <X size={12} />}
        {response.value === 'maybe' && 'Maybe'}
        {response.source === 'host' && <ProvenanceDot />}
      </Chip>
    </button>
  )
}

function RecordPopover({
  title,
  current,
  onPick,
  onClose,
  anchor,
}: {
  title: string
  current: ResponseValue | undefined
  onPick: (value: ResponseValue, note: string) => void
  onClose: () => void
  anchor: DOMRect
}) {
  const [note, setNote] = useState('')

  return (
    <Popover onClose={onClose} anchor={anchor} className="w-60">
      <p className="mb-[6px] text-xs font-semibold">{title}</p>
      <div className="mb-2 flex gap-[6px]">
        {(['yes', 'maybe', 'no'] as ResponseValue[]).map((value) => (
          <button key={value} type="button" onClick={() => onPick(value, note)}>
            <Chip
              tone={value === 'yes' ? 'grn' : value === 'no' ? 'rose' : 'gray'}
              className={cx(current === value && 'ring-focus')}
            >
              {value === 'yes' && <Check size={11} />}
              {value === 'no' && <X size={11} />}
              {value === 'yes' ? 'Yes' : value === 'no' ? 'No' : 'Maybe'}
            </Chip>
          </button>
        ))}
      </div>
      <Input
        value={note}
        onChange={(e) => setNote(e.target.value)}
        placeholder="Optional note, how you heard"
        aria-label="Note"
        className="mb-2 !py-1 !text-xs"
      />
      <p className="text-[11px] text-mut">
        Saved as recorded by you. Their link still works and can update it.
      </p>
    </Popover>
  )
}

function OptionHead({
  option,
  availability,
  sharedWith,
  onRemove,
  className,
}: {
  option: DateOption
  availability: { kind: 'away' | 'open'; startDate: string; endDate: string; label: string }[]
  /** Titles of the host's other events landing on this same day. */
  sharedWith: string[]
  onRemove: () => void
  className?: string
}) {
  const holiday = holidayOn(option.startsAt)
  const away = awayConflict(option.startsAt, availability)
  const date = new Date(option.startsAt)

  return (
    <div className={cx('group px-1 pt-1 text-center', className)}>
      <span className="block">{formatDayOnly(option.startsAt)}</span>
      <span className="block text-[11px]">{formatTime(date)}</span>
      {(holiday || away) && (
        <Chip tone="warn" className="mt-1 !px-[6px] !text-[10px]">
          {holiday ?? `You are ${away?.label.toLowerCase()}`}
        </Chip>
      )}
      {sharedWith.map((title) => (
        <Chip key={title} tone="warn" className="mt-1 !whitespace-normal !px-[6px] !text-[10px]">
          Shared with {title}
        </Chip>
      ))}
      <button
        type="button"
        onClick={onRemove}
        aria-label={`Remove ${formatDayOnly(option.startsAt)}`}
        className="mt-1 text-mut opacity-0 transition group-hover:opacity-100 focus:opacity-100"
      >
        <X size={11} />
      </button>
    </div>
  )
}

function AddOption({
  value,
  onChange,
  onAdd,
  onCancel,
  open,
}: {
  value: string
  onChange: (v: string) => void
  onAdd: () => void
  onCancel: () => void
  open: boolean
}) {
  if (!open) return null
  const holiday = value ? holidayOn(value) : null

  return (
    <div>
      <div className="flex flex-wrap gap-2">
        <Input
          type="datetime-local"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          aria-label="New date option"
          className="!w-auto"
          autoFocus
        />
        <Button onClick={onAdd} disabled={!value}>
          Add option
        </Button>
        <GhostButton onClick={onCancel}>Cancel</GhostButton>
      </div>
      {holiday && (
        <Chip tone="warn" className="mt-2">
          That is {holiday}. Still fine, just worth knowing.
        </Chip>
      )}
    </div>
  )
}
