import { useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { Plus, X } from 'lucide-react'
import { BackLink, FocusColumn } from './Page'
import { useAsync, useMutation } from '../useApi'
import {
  Button, Card, Chip, ErrorState, Eyebrow, GhostButton, Loading, PageTitle, QuietButton,
} from '../../ui/primitives'
import { Field, Input, Label, Select, Textarea } from '../../ui/form'
import { MATCHING_MODES, ORG_TYPES } from '../../data/profiles'
import { track } from '../../lib/analytics'
import type {
  OrgType,
  RoleSlot,
  RunSkeletonItem,
  TaskSkeletonItem,
  Template,
  TemplateMatching,
} from '../../data/types'

// Focus column, same as the partner form: one centred stack, an explicit save
// at the foot. A template is a plan the host writes in one sitting, so it
// commits as a whole rather than field by field.
//
// Numbers live in the draft as strings. A controlled number input that parses
// on every keystroke fights the host the moment they type a lone minus sign,
// which is the first character of most offsets here.

interface TaskDraft {
  title: string
  ownerSlot: string
  offsetDays: string
  note: string
}

interface RunDraft {
  offsetMinutes: string
  title: string
  ownerSlot: string
  notes: string
}

interface Draft {
  name: string
  description: string
  startTime: string
  durationMinutes: string
  capacityTarget: string
  roleSlots: RoleSlot[]
  tasks: TaskDraft[]
  runItems: RunDraft[]
  matchingMode: 'none' | TemplateMatching['mode']
  profileName: string
  requiredQuestions: string[]
}

function toDraft(template: Template): Draft {
  return {
    name: template.name,
    description: template.description ?? '',
    startTime: template.defaults.startTime ?? '',
    durationMinutes:
      template.defaults.durationMinutes === undefined ? '' : String(template.defaults.durationMinutes),
    capacityTarget:
      template.defaults.capacityTarget === undefined ? '' : String(template.defaults.capacityTarget),
    roleSlots: template.roleSlots.map((slot) => ({ ...slot })),
    tasks: template.taskSkeleton.map((item) => ({
      title: item.title,
      ownerSlot: item.ownerSlot,
      offsetDays: String(item.offsetDays),
      note: item.note ?? '',
    })),
    runItems: template.runOfShowSkeleton.map((item) => ({
      offsetMinutes: String(item.offsetMinutes),
      title: item.title,
      ownerSlot: item.ownerSlot,
      notes: item.notes ?? '',
    })),
    matchingMode: template.matching?.mode ?? 'none',
    profileName: template.matching?.profileName ?? '',
    requiredQuestions: template.matching?.requiredQuestions ?? [],
  }
}

/** Blank strings drop out, because Firestore rejects an undefined field value. */
function toPatch(draft: Draft): Partial<Template> {
  const whole = (value: string) => Math.trunc(Number(value)) || 0

  const roleSlots = draft.roleSlots
    .map((slot) => ({ ...slot, slot: slot.slot.trim() }))
    .filter((slot) => slot.slot !== '')

  const taskSkeleton: TaskSkeletonItem[] = draft.tasks
    .filter((task) => task.title.trim() !== '')
    .map((task) => ({
      title: task.title.trim(),
      ownerSlot: task.ownerSlot,
      offsetDays: whole(task.offsetDays),
      ...(task.note.trim() ? { note: task.note.trim() } : {}),
    }))

  const runOfShowSkeleton: RunSkeletonItem[] = draft.runItems
    .filter((item) => item.title.trim() !== '')
    .map((item) => ({
      offsetMinutes: whole(item.offsetMinutes),
      title: item.title.trim(),
      ownerSlot: item.ownerSlot,
      ...(item.notes.trim() ? { notes: item.notes.trim() } : {}),
    }))

  return {
    name: draft.name.trim(),
    description: draft.description.trim(),
    roleSlots,
    taskSkeleton,
    runOfShowSkeleton,
    defaults: {
      ...(draft.capacityTarget.trim() ? { capacityTarget: whole(draft.capacityTarget) } : {}),
      ...(draft.durationMinutes.trim() ? { durationMinutes: whole(draft.durationMinutes) } : {}),
      ...(draft.startTime.trim() ? { startTime: draft.startTime.trim() } : {}),
    },
    matching:
      draft.matchingMode === 'none'
        ? null
        : {
            mode: draft.matchingMode,
            profileName: draft.profileName.trim(),
            requiredQuestions: draft.requiredQuestions
              .map((question) => question.trim())
              .filter(Boolean),
          },
  }
}

/**
 * Owners a skeleton item can name: the host, everyone, or one of this
 * template's slots. A reference to a slot that has since been deleted stays
 * visible as itself rather than snapping to the host, so the host sees what
 * they broke. Materialisation already falls back to the host if it survives.
 */
function ownerSlotOptions(slots: RoleSlot[], current: string): { value: string; label: string }[] {
  const options = [
    { value: 'host', label: 'You, the host' },
    { value: 'all', label: 'Everyone' },
  ]
  for (const slot of slots) {
    const name = slot.slot.trim()
    if (name && !options.some((option) => option.value === name)) {
      options.push({ value: name, label: name })
    }
  }
  if (!options.some((option) => option.value === current)) {
    options.push({
      value: current,
      label: current ? `${current}, no longer a slot` : 'No owner yet',
    })
  }
  return options
}

export default function TemplateEditorPage() {
  const { templateId = '' } = useParams()
  const { data, error, loading, reload } = useAsync((api) => api.listTemplates(), [])
  const template = data?.find((t) => t.id === templateId) ?? null

  if (loading) {
    return (
      <FocusColumn width="max-w-[640px]">
        <Loading label="Loading the template" />
      </FocusColumn>
    )
  }

  if (error || !template) {
    return (
      <FocusColumn width="max-w-[640px]">
        <BackLink to="/app/templates">Templates</BackLink>
        <ErrorState
          message={error ? `This template didn't load (${error}).` : 'This template is no longer here.'}
          onRetry={error ? reload : undefined}
        />
      </FocusColumn>
    )
  }

  return (
    <FocusColumn width="max-w-[640px]">
      <BackLink to="/app/templates">Templates</BackLink>
      <PageTitle className="mb-3 text-lg">Edit template</PageTitle>
      <TemplateForm key={template.id} initial={template} />
    </FocusColumn>
  )
}

function TemplateForm({ initial }: { initial: Template }) {
  const navigate = useNavigate()
  const [draft, setDraft] = useState<Draft>(() => toDraft(initial))
  const [dirty, setDirty] = useState(false)
  const { mutate, busy, error } = useMutation()

  const edit = (change: (prev: Draft) => Draft) => {
    setDirty(true)
    setDraft(change)
  }

  const set = <K extends keyof Draft>(key: K, value: Draft[K]) =>
    edit((prev) => ({ ...prev, [key]: value }))

  /**
   * Skeleton items address a slot by its name, which is how the stored
   * template addresses it too, so a rename has to carry every reference with
   * it or a task quietly loses its owner. Two slots sharing one name move
   * together, which is inherent to a name-keyed format and not worth a second
   * identity scheme to dodge.
   */
  const renameSlot = (index: number, next: string) =>
    edit((prev) => {
      const previous = prev.roleSlots[index].slot
      return {
        ...prev,
        roleSlots: prev.roleSlots.map((slot, i) => (i === index ? { ...slot, slot: next } : slot)),
        tasks: prev.tasks.map((task) =>
          task.ownerSlot === previous ? { ...task, ownerSlot: next } : task,
        ),
        runItems: prev.runItems.map((item) =>
          item.ownerSlot === previous ? { ...item, ownerSlot: next } : item,
        ),
      }
    })

  const setSlot = (index: number, patch: Partial<RoleSlot>) =>
    edit((prev) => ({
      ...prev,
      roleSlots: prev.roleSlots.map((slot, i) => (i === index ? { ...slot, ...patch } : slot)),
    }))

  const setTask = (index: number, patch: Partial<TaskDraft>) =>
    edit((prev) => ({
      ...prev,
      tasks: prev.tasks.map((task, i) => (i === index ? { ...task, ...patch } : task)),
    }))

  const setRunItem = (index: number, patch: Partial<RunDraft>) =>
    edit((prev) => ({
      ...prev,
      runItems: prev.runItems.map((item, i) => (i === index ? { ...item, ...patch } : item)),
    }))

  const leave = () => {
    if (dirty && !window.confirm('Leave without saving? Your changes are not written yet.')) return
    navigate('/app/templates')
  }

  const save = () => {
    if (!draft.name.trim()) return
    void mutate(async (api) => {
      await api.updateTemplate(initial.id, toPatch(draft))
      track('hp_template_edited', { templateId: initial.id, createdFrom: initial.createdFrom })
      navigate('/app/templates')
    })
  }

  const matchingNeedsService = draft.matchingMode === 'sparks' || draft.matchingMode === 'pods'

  return (
    <>
      <Card className="mb-3">
        <Field label="Name" htmlFor="tpl-name">
          <Input
            id="tpl-name"
            value={draft.name}
            onChange={(e) => set('name', e.target.value)}
            placeholder="What kind of event this is"
            autoFocus
          />
        </Field>

        <Field label="Description" htmlFor="tpl-description">
          <Textarea
            id="tpl-description"
            rows={2}
            value={draft.description}
            onChange={(e) => set('description', e.target.value)}
            placeholder="One line, so you know which plan this is"
          />
        </Field>

        <div className="grid gap-x-[10px] sm:grid-cols-3">
          <Field label="Start time" htmlFor="tpl-start">
            <Input
              id="tpl-start"
              type="time"
              value={draft.startTime}
              onChange={(e) => set('startTime', e.target.value)}
            />
          </Field>
          <Field label="Length in minutes" htmlFor="tpl-duration">
            <Input
              id="tpl-duration"
              type="number"
              inputMode="numeric"
              value={draft.durationMinutes}
              onChange={(e) => set('durationMinutes', e.target.value)}
              placeholder="150"
            />
          </Field>
          <Field label="Capacity target" htmlFor="tpl-capacity">
            <Input
              id="tpl-capacity"
              type="number"
              inputMode="numeric"
              value={draft.capacityTarget}
              onChange={(e) => set('capacityTarget', e.target.value)}
              placeholder="80"
            />
          </Field>
        </div>
        <p className="text-[11px] text-mut">
          Defaults fill in when you start an event from this template. All of them stay editable
          there.
        </p>
      </Card>

      <Card className="mb-3">
        <Eyebrow className="mb-[6px]">Role slots</Eyebrow>
        {draft.roleSlots.length === 0 && (
          <p className="mb-2 text-[12.5px] text-mut">
            No role slots yet. A template works without them, and every task can be yours.
          </p>
        )}

        <div className="mb-2 grid gap-2">
          {draft.roleSlots.map((slot, i) => (
            <div key={i} className="hairline rounded-xl border-line bg-field p-[10px]">
              <div className="grid gap-2 sm:grid-cols-2">
                <Input
                  value={slot.slot}
                  onChange={(e) => renameSlot(i, e.target.value)}
                  placeholder="Coffee vendor, presenting partner"
                  aria-label="Slot name"
                />
                <Select
                  value={slot.orgType}
                  onChange={(e) => setSlot(i, { orgType: e.target.value as OrgType })}
                  aria-label="Partner type for this slot"
                >
                  {ORG_TYPES.map((type) => (
                    <option key={type.value} value={type.value}>
                      {type.label}
                    </option>
                  ))}
                </Select>
              </div>
              <div className="mt-2 flex items-center justify-between gap-2">
                <button
                  type="button"
                  aria-pressed={slot.required}
                  aria-label={`${slot.slot || 'This slot'} is ${slot.required ? 'required' : 'optional'}`}
                  onClick={() => setSlot(i, { required: !slot.required })}
                >
                  <Chip tone={slot.required ? 'vio' : 'gray'}>
                    {slot.required ? 'Required' : 'Optional'}
                  </Chip>
                </button>
                <QuietButton
                  onClick={() =>
                    set('roleSlots', draft.roleSlots.filter((_, index) => index !== i))
                  }
                  aria-label={`Remove ${slot.slot || 'this slot'}`}
                >
                  <X size={12} />
                  Remove
                </QuietButton>
              </div>
            </div>
          ))}
        </div>

        <QuietButton
          onClick={() =>
            set('roleSlots', [...draft.roleSlots, { slot: '', orgType: 'vendor', required: false }])
          }
        >
          <Plus size={12} />
          Add a role slot
        </QuietButton>
        <p className="mt-2 text-[11px] text-mut">
          A slot names a role, not a partner. You pick who fills it when you create the event, and
          required only means the flow reminds you.
        </p>
      </Card>

      <Card className="mb-3">
        <Eyebrow className="mb-[6px]">Tasks</Eyebrow>
        {draft.tasks.length === 0 && (
          <p className="mb-2 text-[12.5px] text-mut">
            No tasks yet. Add what has to happen before the day, in the order you want to see them.
          </p>
        )}

        <div className="mb-2 grid gap-2">
          {draft.tasks.map((task, i) => (
            <div key={i} className="hairline rounded-xl border-line bg-field p-[10px]">
              <Input
                className="mb-2"
                value={task.title}
                onChange={(e) => setTask(i, { title: e.target.value })}
                placeholder="What has to happen"
                aria-label="Task title"
              />
              <div className="grid gap-2 sm:grid-cols-3">
                <Select
                  value={task.ownerSlot}
                  onChange={(e) => setTask(i, { ownerSlot: e.target.value })}
                  aria-label="Task owner"
                >
                  {ownerSlotOptions(draft.roleSlots, task.ownerSlot).map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </Select>
                <Input
                  type="number"
                  inputMode="numeric"
                  value={task.offsetDays}
                  onChange={(e) => setTask(i, { offsetDays: e.target.value })}
                  placeholder="Days"
                  aria-label="Days from the event"
                />
                <Input
                  value={task.note}
                  onChange={(e) => setTask(i, { note: e.target.value })}
                  placeholder="Note, optional"
                  aria-label="Task note"
                />
              </div>
              <div className="mt-2 flex justify-end">
                <QuietButton
                  onClick={() => set('tasks', draft.tasks.filter((_, index) => index !== i))}
                  aria-label="Remove task"
                >
                  <X size={12} />
                  Remove
                </QuietButton>
              </div>
            </div>
          ))}
        </div>

        <QuietButton
          onClick={() =>
            set('tasks', [...draft.tasks, { title: '', ownerSlot: 'host', offsetDays: '-7', note: '' }])
          }
        >
          <Plus size={12} />
          Add a task
        </QuietButton>
        <p className="mt-2 text-[11px] text-mut">
          Days count from the event day. Minus 14 means two weeks before, 2 means two days after.
          Real dates arrive when you confirm one, and a short runway compresses the early ones
          instead of putting them in the past.
        </p>
      </Card>

      <Card className="mb-3">
        <Eyebrow className="mb-[6px]">Run of show</Eyebrow>
        {draft.runItems.length === 0 && (
          <p className="mb-2 text-[12.5px] text-mut">
            No run of show yet. Add the morning in order, from load in to the last photo.
          </p>
        )}

        <div className="mb-2 grid gap-2">
          {draft.runItems.map((item, i) => (
            <div key={i} className="hairline rounded-xl border-line bg-field p-[10px]">
              <Input
                className="mb-2"
                value={item.title}
                onChange={(e) => setRunItem(i, { title: e.target.value })}
                placeholder="What happens"
                aria-label="Run of show title"
              />
              <div className="grid gap-2 sm:grid-cols-3">
                <Input
                  type="number"
                  inputMode="numeric"
                  value={item.offsetMinutes}
                  onChange={(e) => setRunItem(i, { offsetMinutes: e.target.value })}
                  placeholder="Minutes"
                  aria-label="Minutes from the start"
                />
                <Select
                  value={item.ownerSlot}
                  onChange={(e) => setRunItem(i, { ownerSlot: e.target.value })}
                  aria-label="Run of show owner"
                >
                  {ownerSlotOptions(draft.roleSlots, item.ownerSlot).map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </Select>
                <Input
                  value={item.notes}
                  onChange={(e) => setRunItem(i, { notes: e.target.value })}
                  placeholder="Notes, optional"
                  aria-label="Run of show notes"
                />
              </div>
              <div className="mt-2 flex justify-end">
                <QuietButton
                  onClick={() => set('runItems', draft.runItems.filter((_, index) => index !== i))}
                  aria-label="Remove run of show item"
                >
                  <X size={12} />
                  Remove
                </QuietButton>
              </div>
            </div>
          ))}
        </div>

        <QuietButton
          onClick={() =>
            set('runItems', [
              ...draft.runItems,
              { offsetMinutes: '0', title: '', ownerSlot: 'host', notes: '' },
            ])
          }
        >
          <Plus size={12} />
          Add a run of show item
        </QuietButton>
        <p className="mt-2 text-[11px] text-mut">
          Minutes count from the start time. Minus 45 is 45 minutes before, 90 is an hour and a half
          in.
        </p>
      </Card>

      <Card className="mb-3">
        <Eyebrow className="mb-[6px]">Matching</Eyebrow>
        <Field
          label="How this run pairs people"
          htmlFor="tpl-matching-mode"
          hint="Leave it off for an event where nobody gets paired up."
        >
          <Select
            id="tpl-matching-mode"
            value={draft.matchingMode}
            onChange={(e) => set('matchingMode', e.target.value as Draft['matchingMode'])}
          >
            <option value="none">No matching</option>
            {MATCHING_MODES.map((mode) => (
              <option key={mode.value} value={mode.value}>
                {mode.label}
              </option>
            ))}
          </Select>
        </Field>

        {draft.matchingMode !== 'none' && (
          <>
            <Field
              label="Profile name"
              htmlFor="tpl-matching-profile"
              hint="The set of questions and weights this run scores on."
            >
              <Input
                id="tpl-matching-profile"
                value={draft.profileName}
                onChange={(e) => set('profileName', e.target.value)}
                placeholder="pace"
              />
            </Field>

            <Label>Signup questions this needs</Label>
            {draft.requiredQuestions.length === 0 && (
              <p className="mb-2 text-[12.5px] text-mut">
                No questions listed yet. Without them a run has nothing to score on.
              </p>
            )}
            <div className="mb-2 grid gap-2">
              {draft.requiredQuestions.map((question, i) => (
                <div key={i} className="flex gap-2">
                  <Input
                    value={question}
                    onChange={(e) =>
                      set(
                        'requiredQuestions',
                        draft.requiredQuestions.map((q, index) =>
                          index === i ? e.target.value : q,
                        ),
                      )
                    }
                    placeholder="What pace do you usually run?"
                    aria-label="Signup question"
                  />
                  <button
                    type="button"
                    aria-label="Remove question"
                    onClick={() =>
                      set(
                        'requiredQuestions',
                        draft.requiredQuestions.filter((_, index) => index !== i),
                      )
                    }
                    className="shrink-0 text-mut transition hover:text-rosek"
                  >
                    <X size={14} />
                  </button>
                </div>
              ))}
            </div>
            <QuietButton
              onClick={() => set('requiredQuestions', [...draft.requiredQuestions, ''])}
            >
              <Plus size={12} />
              Add a question
            </QuietButton>

            {matchingNeedsService && (
              <Card tone="amber" className="mt-3 !px-3 !py-[9px]">
                <p className="text-[11.5px] text-ambk">
                  Sparks and pods run on the matching service, which is not connected yet. Put these
                  questions on the signup form now, so the answers are waiting when it is.
                </p>
              </Card>
            )}
          </>
        )}
      </Card>

      {error && (
        <p className="mb-2 text-[12px] text-rosek">
          Saving didn't work ({error}). Try again in a moment.
        </p>
      )}

      <div className="sticky bottom-0 flex flex-wrap items-center gap-3 border-t border-hair bg-field/95 py-3">
        <Button onClick={save} disabled={busy || !draft.name.trim()}>
          {busy ? 'Saving' : 'Save template'}
        </Button>
        <GhostButton onClick={leave} disabled={busy}>
          Cancel
        </GhostButton>
        {dirty && <span className="text-[11.5px] text-mut">Unsaved changes</span>}
      </div>
    </>
  )
}
