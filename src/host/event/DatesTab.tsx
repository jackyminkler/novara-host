import { useState } from 'react'
import { Check, Plus, X } from 'lucide-react'
import { Button, Card, Chip, Eyebrow, GhostButton, QuietButton, Sub, SubTitle, cx } from '../../ui/primitives'
import { Input } from '../../ui/form'
import { Popover } from '../../ui/Popover'
import { useAsync } from '../useApi'
import { useEvent } from './EventContext'
import type { DateOption, Party, ResponseValue } from '../../data/types'
import { awayConflict, formatDayOnly, formatLong, formatTime, holidayOn } from '../../lib/dates'
import { track } from '../../lib/analytics'

// The hero screen. Parties by options, response chips, and a constraint note.
// Confirming collapses the matrix into a banner and updates every guest view
// without republishing a single link.

let optionSeq = 0
const nextOptionId = () => `opt-${Date.now().toString(36)}-${(optionSeq += 1)}`

function yesCount(parties: Party[], optionId: string): number {
  return parties.filter((p) => p.dateResponses[optionId]?.value === 'yes').length
}

export default function DatesTab() {
  const { bundle, run } = useEvent()
  const { event, parties, orgs } = bundle
  const [adding, setAdding] = useState(false)
  const [draft, setDraft] = useState('')
  const [editing, setEditing] = useState<{ partyId: string; optionId: string } | null>(null)

  // Away blocks are the host's own calendar, so a conflict warning needs them.
  const { data: availability } = useAsync((api) => api.listAvailability(), [])

  const confirmed = event.dateOptions.find((o) => o.id === event.confirmedDateOptionId)

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

  const columns = `minmax(140px,1.5fr) repeat(${event.dateOptions.length},minmax(84px,1fr))`

  return (
    <>
      <div className="overflow-x-auto pb-1">
        <div className="min-w-[420px]">
          <div className="grid gap-[6px] text-[11.5px] text-mut" style={{ gridTemplateColumns: columns }}>
            <div />
            {event.dateOptions.map((option) => (
              <OptionHead
                key={option.id}
                option={option}
                availability={availability ?? []}
                onRemove={() => removeOption(option.id)}
              />
            ))}
          </div>

          {parties.length === 0 && (
            <p className="border-t border-hair py-4 text-[12.5px] text-mut">
              No partners on this event. Pick whichever date suits you and confirm it.
            </p>
          )}

          {parties.map((party) => {
            const org = orgs.find((o) => o.id === party.orgId)
            const silent = Object.keys(party.dateResponses).length === 0
            return (
              <div key={party.id}>
                <div
                  className="grid items-center gap-[6px] border-t border-hair py-[7px] text-[12.5px]"
                  style={{ gridTemplateColumns: columns }}
                >
                  <span className="flex min-w-0 items-center gap-[6px]">
                    <span className="truncate">{org?.name ?? 'Removed partner'}</span>
                    {silent && <Chip tone="rose">Awaiting</Chip>}
                  </span>
                  {event.dateOptions.map((option) => (
                    <span key={option.id} className="relative mx-auto">
                      <ResponseCell
                        response={party.dateResponses[option.id]}
                        onClick={() => setEditing({ partyId: party.id, optionId: option.id })}
                        partyName={org?.name ?? 'this partner'}
                        optionLabel={formatDayOnly(option.startsAt)}
                      />
                      {editing?.partyId === party.id && editing.optionId === option.id && (
                        <RecordPopover
                          title={`${org?.name ?? 'Partner'}, ${formatDayOnly(option.startsAt)}`}
                          current={party.dateResponses[option.id]?.value}
                          onClose={() => setEditing(null)}
                          onPick={(value, note) => {
                            run((api) =>
                              api.setDateResponse(event.id, party.id, option.id, value, 'host', note),
                            )
                            track('hp_date_response_submitted', { eventId: event.id, source: 'host' })
                            setEditing(null)
                          }}
                        />
                      )}
                    </span>
                  ))}
                </div>
                {party.constraintNote && (
                  <p className="pb-[6px] text-[11.5px] text-mut">
                    {org?.name}: {party.constraintNote}
                  </p>
                )}
              </div>
            )
          })}
        </div>
      </div>

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
  onClick,
  partyName,
  optionLabel,
}: {
  response: Party['dateResponses'][string] | undefined
  onClick: () => void
  partyName: string
  optionLabel: string
}) {
  const label = `Record ${partyName} for ${optionLabel}`

  if (!response) {
    return (
      <button type="button" onClick={onClick} aria-label={label}>
        <Chip tone="gray">?</Chip>
      </button>
    )
  }

  const tone = response.value === 'yes' ? 'grn' : response.value === 'no' ? 'rose' : 'gray'
  return (
    <button type="button" onClick={onClick} aria-label={label}>
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
}: {
  title: string
  current: ResponseValue | undefined
  onPick: (value: ResponseValue, note: string) => void
  onClose: () => void
}) {
  const [note, setNote] = useState('')

  return (
    <Popover onClose={onClose} className="w-60">
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
  onRemove,
}: {
  option: DateOption
  availability: { kind: 'away' | 'open'; startDate: string; endDate: string; label: string }[]
  onRemove: () => void
}) {
  const holiday = holidayOn(option.startsAt)
  const away = awayConflict(option.startsAt, availability)
  const date = new Date(option.startsAt)

  return (
    <div className="group px-1 text-center">
      <span className="block">{formatDayOnly(option.startsAt)}</span>
      <span className="block text-[11px]">{formatTime(date)}</span>
      {(holiday || away) && (
        <Chip tone="warn" className="mt-1 !px-[6px] !text-[10px]">
          {holiday ?? `You are ${away?.label.toLowerCase()}`}
        </Chip>
      )}
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
