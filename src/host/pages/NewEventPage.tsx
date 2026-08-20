import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Plus, X } from 'lucide-react'
import { BackLink, FocusColumn } from './Page'
import { useAsync, useMutation } from '../useApi'
import { useHost } from '../AuthProvider'
import {
  Button, Card, Chip, GhostButton, KV, Loading, PageTitle, QuietButton, Sub, cx,
} from '../../ui/primitives'
import { Field, Input, Label, Select, Textarea } from '../../ui/form'
import type { AvailabilityBlock, DateOption, Org, Template } from '../../data/types'
import { awayConflict, daysBetween, formatShort, holidayOn, isRushRunway, pluralDays, toDateKey } from '../../lib/dates'

// Short stepped flow: template, basics, dates, parties, then the workspace
// with the materialised plan fully editable. Parties are an optional step;
// skipping them lands on a complete solo checklist.

type Step = 1 | 2 | 3 | 4

const STEP_LABEL: Record<Step, string> = {
  1: 'Start from',
  2: 'Basics',
  3: 'Dates',
  4: 'Parties, optional',
}

let optionSeq = 0
const nextOptionId = () => `opt-${Date.now().toString(36)}-${(optionSeq += 1)}`

export default function NewEventPage() {
  const navigate = useNavigate()
  const host = useHost()
  const [step, setStep] = useState<Step>(1)

  const [templateId, setTemplateId] = useState<string | null>(null)
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [meetPoint, setMeetPoint] = useState('')
  const [finishPoint, setFinishPoint] = useState('')
  const [locationName, setLocationName] = useState('')
  const [capacityTarget, setCapacityTarget] = useState('')
  const [dateOptions, setDateOptions] = useState<DateOption[]>([])
  const [slotAssignments, setSlotAssignments] = useState<Record<string, string>>({})

  const { data, loading } = useAsync(async (api) => {
    const [templates, orgs, availability] = await Promise.all([
      api.listTemplates(),
      api.listOrgs(),
      api.listAvailability(),
    ])
    return { templates, orgs, availability }
  }, [])

  const { mutate, busy, error } = useMutation()

  const template = data?.templates.find((t) => t.id === templateId) ?? null

  const create = () =>
    void mutate(async (api) => {
      const id = await api.createEvent(
        {
          title: title.trim(),
          hostDisplayName: host.shortName,
          description: description.trim(),
          location: {
            name: locationName.trim(),
            meetPoint: meetPoint.trim(),
            finishPoint: finishPoint.trim(),
            notes: '',
          },
          dateOptions,
          capacityTarget: capacityTarget ? Number(capacityTarget) : null,
          templateId,
          slotAssignments,
        },
        host.uid,
      )
      navigate(`/app/events/${id}`)
    })

  if (loading) return <FocusColumn><Loading label="Loading" /></FocusColumn>

  return (
    <FocusColumn>
      <BackLink to="/app/events">Events</BackLink>
      <PageTitle className="text-[19px]">New event</PageTitle>
      <Sub className="mb-3">
        Step {step} of 4, {STEP_LABEL[step].toLowerCase()}
      </Sub>

      {step === 1 && (
        <StepTemplate
          templates={data?.templates ?? []}
          selected={templateId}
          onSelect={(id) => {
            setTemplateId(id)
            const chosen = data?.templates.find((t) => t.id === id)
            if (chosen?.defaults.capacityTarget) {
              setCapacityTarget(String(chosen.defaults.capacityTarget))
            }
          }}
          onNext={() => setStep(2)}
        />
      )}

      {step === 2 && (
        <Card>
          <Field label="Title" htmlFor="ev-title">
            <Input
              id="ev-title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="What are you putting on"
              autoFocus
            />
          </Field>
          <Field label="Description" htmlFor="ev-desc">
            <Textarea
              id="ev-desc"
              rows={2}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="One line partners can reuse"
            />
          </Field>
          <Field label="Location" htmlFor="ev-loc">
            <Input
              id="ev-loc"
              value={locationName}
              onChange={(e) => setLocationName(e.target.value)}
              placeholder="Park, track, neighbourhood"
            />
          </Field>
          <Field label="Meet point" htmlFor="ev-meet">
            <Input
              id="ev-meet"
              value={meetPoint}
              onChange={(e) => setMeetPoint(e.target.value)}
              placeholder="Where everyone gathers"
            />
          </Field>
          <Field label="Finish point" htmlFor="ev-finish">
            <Input
              id="ev-finish"
              value={finishPoint}
              onChange={(e) => setFinishPoint(e.target.value)}
              placeholder="Where it ends up"
            />
          </Field>
          <Field label="Capacity target" htmlFor="ev-cap">
            <Input
              id="ev-cap"
              type="number"
              inputMode="numeric"
              value={capacityTarget}
              onChange={(e) => setCapacityTarget(e.target.value)}
              placeholder="How many you are hoping for"
            />
          </Field>
          <div className="flex items-center gap-3">
            <Button onClick={() => setStep(3)} disabled={!title.trim()}>
              Next, dates
            </Button>
            <GhostButton onClick={() => setStep(1)}>Back</GhostButton>
          </div>
        </Card>
      )}

      {step === 3 && (
        <StepDates
          options={dateOptions}
          availability={data?.availability ?? []}
          onChange={setDateOptions}
          onBack={() => setStep(2)}
          onNext={() => setStep(4)}
        />
      )}

      {step === 4 && (
        <Card>
          <Label>
            {template ? 'Fill the template slots from Partners, or skip' : 'Add partners now, or skip'}
          </Label>

          {template ? (
            template.roleSlots.map((slot) => (
              <KV key={slot.slot} label={slot.slot}>
                <Select
                  aria-label={`Partner for ${slot.slot}`}
                  value={slotAssignments[slot.slot] ?? ''}
                  onChange={(e) =>
                    setSlotAssignments((prev) => ({ ...prev, [slot.slot]: e.target.value }))
                  }
                >
                  <option value="">Choose</option>
                  {(data?.orgs ?? [])
                    .filter((o) => o.type === slot.orgType)
                    .map((o) => (
                      <option key={o.id} value={o.id}>
                        {o.name}
                      </option>
                    ))}
                </Select>
              </KV>
            ))
          ) : (
            <BlankSlots
              orgs={data?.orgs ?? []}
              assignments={slotAssignments}
              onChange={setSlotAssignments}
            />
          )}

          {error && <p className="mt-2 text-[12px] text-rosek">Creating didn't work ({error}).</p>}

          <div className="mt-3 flex flex-wrap items-center gap-3">
            <Button onClick={create} disabled={busy}>
              {busy ? 'Creating' : 'Create event'}
            </Button>
            <GhostButton
              onClick={() => {
                setSlotAssignments({})
                create()
              }}
              disabled={busy}
            >
              Skip parties, plan solo
            </GhostButton>
            <GhostButton onClick={() => setStep(3)} disabled={busy}>
              Back
            </GhostButton>
          </div>

          {template && (
            <p className="mt-[10px] text-[11px] text-mut">
              {template.taskSkeleton.length} tasks and the run of show materialise with real dates
              once a date confirms.
            </p>
          )}
        </Card>
      )}
    </FocusColumn>
  )
}

function StepTemplate({
  templates,
  selected,
  onSelect,
  onNext,
}: {
  templates: Template[]
  selected: string | null
  onSelect: (id: string | null) => void
  onNext: () => void
}) {
  const cardClass = (active: boolean) =>
    cx(
      'hairline rounded-[10px] border-[#dad5ec] bg-surface px-[11px] py-[10px] text-left transition',
      active && 'ring-focus',
    )

  return (
    <>
      <div className="mb-[14px] grid gap-2 sm:grid-cols-3">
        {templates.map((t) => (
          <button key={t.id} type="button" onClick={() => onSelect(t.id)} className={cardClass(selected === t.id)}>
            <span className="block text-[12.5px] font-semibold">{t.name}</span>
            <span className="mt-[2px] block text-[11px] text-mut">
              {t.roleSlots.length} slots, {t.taskSkeleton.length} tasks, your template
            </span>
          </button>
        ))}
        <button type="button" onClick={() => onSelect(null)} className={cardClass(selected === null)}>
          <span className="block text-[12.5px] font-semibold">Blank</span>
          <span className="mt-[2px] block text-[11px] text-mut">Start from nothing</span>
        </button>
      </div>
      {templates.length === 0 && (
        <p className="mb-3 text-[11px] text-mut">
          No templates saved yet. Blank works fine, and saving an event as a template arrives in M1.
        </p>
      )}
      <Button onClick={onNext}>Next, basics</Button>
    </>
  )
}

/** Without a template there are no slots, so partners attach by type. */
function BlankSlots({
  orgs,
  assignments,
  onChange,
}: {
  orgs: Org[]
  assignments: Record<string, string>
  onChange: (next: Record<string, string>) => void
}) {
  const chosen = Object.values(assignments).filter(Boolean)

  return (
    <>
      {orgs.length === 0 && (
        <p className="text-[12.5px] text-mut">
          No partners in the directory yet. You can add them to the event later.
        </p>
      )}
      <div className="flex flex-wrap gap-2 py-1">
        {orgs.map((org) => {
          const active = chosen.includes(org.id)
          return (
            <button
              key={org.id}
              type="button"
              onClick={() => {
                const next = { ...assignments }
                if (active) delete next[org.name]
                else next[org.name] = org.id
                onChange(next)
              }}
            >
              <Chip tone={active ? 'vio' : 'gray'}>{org.name}</Chip>
            </button>
          )
        })}
      </div>
    </>
  )
}

function StepDates({
  options,
  availability,
  onChange,
  onBack,
  onNext,
}: {
  options: DateOption[]
  availability: AvailabilityBlock[]
  onChange: (next: DateOption[]) => void
  onBack: () => void
  onNext: () => void
}) {
  const [draft, setDraft] = useState('')

  const add = () => {
    if (!draft || options.length >= 5) return
    onChange([...options, { id: nextOptionId(), startsAt: draft, label: '' }])
    setDraft('')
  }

  // The soonest option decides whether this is a rush, since that is the one
  // the task skeleton has to fit inside.
  const soonest = options
    .map((o) => new Date(o.startsAt))
    .sort((a, b) => a.getTime() - b.getTime())[0]
  const rush = soonest ? isRushRunway(soonest) : false
  const runway = soonest ? daysBetween(new Date(), soonest) : 0

  return (
    <Card>
      <Label>Proposed dates, 2 to 5</Label>
      <div className="mb-2 flex flex-col gap-[6px]">
        {options.map((option) => {
          const holiday = holidayOn(option.startsAt)
          const away = awayConflict(option.startsAt, availability)
          const warn = Boolean(holiday || away)
          return (
            <span
              key={option.id}
              className={cx(
                'flex items-center justify-between gap-2 rounded-full px-[10px] py-[6px] text-xs font-medium',
                warn
                  ? 'border border-dashed border-[#e0b564] bg-ambfill text-ambk'
                  : 'border border-dashed border-viodash bg-viots text-vio',
              )}
            >
              <span>
                {formatShort(option.startsAt)}
                {holiday && `, ${holiday}`}
                {away && `, you are ${away.label.toLowerCase()}`}
              </span>
              <button
                type="button"
                aria-label={`Remove ${formatShort(option.startsAt)}`}
                onClick={() => onChange(options.filter((o) => o.id !== option.id))}
              >
                <X size={11} />
              </button>
            </span>
          )
        })}
      </div>

      {options.length < 5 && (
        <div className="mb-[10px] flex gap-2">
          <Input
            type="datetime-local"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            min={toDateKey(new Date())}
            aria-label="New date option"
          />
          <QuietButton onClick={add} className="shrink-0">
            <Plus size={12} />
            Add
          </QuietButton>
        </div>
      )}

      {rush && (
        <Card tone="amber" className="mb-3 !px-3 !py-[9px]">
          <p className="text-[11.5px] text-ambk">
            {pluralDays(runway)} out. Rush mode: earlier tasks compress into this runway instead of erroring.
          </p>
        </Card>
      )}

      {options.length === 1 && (
        <p className="mb-2 text-[11px] text-mut">
          One option works. Two to five lets partners pick, which is the point of the matrix.
        </p>
      )}

      <div className="flex items-center gap-3">
        <Button onClick={onNext} disabled={options.length === 0}>
          Next, parties
        </Button>
        <GhostButton onClick={onBack}>Back</GhostButton>
      </div>
      <p className="mt-3 text-[11px] text-mut">
        Parties, tasks, and the run of show all stay editable inside the event.
      </p>
    </Card>
  )
}
