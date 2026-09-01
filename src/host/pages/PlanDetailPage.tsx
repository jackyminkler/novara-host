import { useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import {
  CalendarCheck,
  CalendarPlus,
  Check,
  Copy,
  Download,
  ExternalLink,
  Hand,
  Mail,
  RefreshCw,
} from 'lucide-react'
import { BackLink, Page } from './Page'
import {
  Card,
  Chip,
  Divider,
  EmptyState,
  ErrorState,
  Loading,
  SubTitle,
  cx,
} from '../../ui/primitives'
import { Field, Input, Select, Textarea } from '../../ui/form'
import { useAsync, useMutation } from '../useApi'
import { formatDayLong, formatLong, formatTime, fromDateKey, toLocalInputValue } from '../../lib/dates'
import { track } from '../../lib/analytics'
import {
  clipWindows,
  planPhase,
  suggest,
  type Participant,
  type PlanPhase,
  type Suggestion,
} from '../../lib/availability'
import { buildIcs, downloadIcs } from '../../lib/calendarLinks'
import { GoogleCalendarError, getAccessToken, googleConfigured } from '../googleCalendar'
import { removeEvent, upsertEvent, type CalendarEventDraft } from '../googleWrite'
import type { Huddle } from '../../data/types'
import type { HuddlePatch } from '../../data/api'
import {
  PLAN_DURATIONS,
  PLAN_PHASES,
  PlanHours,
  derivePlanWindows,
  planDuration,
  planUrl,
} from './PlansPage'

// F20.5 and F20.6. One plan, from the link to the pick to the invite.
//
// Two rules run through the whole page. Anything that touches hours or the
// deadline dates writes the recomputed windows in the same call, through
// `save`, because hours saved without their windows leave guests ranking
// against a plan that no longer exists. And the ranked times are computed from
// exactly the data a guest gets, with the same call, so the organizer and the
// group are always looking at the same list.

const DAY_MS = 86400000

interface Draft {
  /** Local wall clock, straight from a datetime-local input. */
  startsAt: string
  durationMinutes: number
  location: string
  notes: string
}

export default function PlanDetailPage() {
  const { planId } = useParams()
  const state = useAsync((api) => api.listHuddles(), [])
  const plan = state.data?.find((p) => p.id === planId) ?? null

  if (state.loading) {
    return (
      <Page>
        <Loading label="Loading the plan" />
      </Page>
    )
  }
  if (state.error) {
    return (
      <Page>
        <ErrorState message={`The plan didn't load (${state.error}).`} onRetry={state.reload} />
      </Page>
    )
  }
  if (!plan) {
    return (
      <Page>
        <BackLink to="/app/plans">All plans</BackLink>
        <ErrorState message="That plan is not here. It may have been deleted." />
      </Page>
    )
  }

  // Keyed on the plan, so the editors below seed their local state once and
  // keep it through a refetch instead of snapping back mid-edit.
  return <PlanBody key={plan.id} plan={plan} onChange={state.reload} />
}

function PlanBody({ plan, onChange }: { plan: Huddle; onChange: () => void }) {
  const navigate = useNavigate()
  const { mutate, busy } = useMutation(onChange)
  const [draft, setDraft] = useState<Draft | null>(null)
  const [eventLink, setEventLink] = useState<string | null>(null)
  const [googleNote, setGoogleNote] = useState<string | null>(null)

  const phase = planPhase(plan, Date.now())
  const chip = PLAN_PHASES[phase]
  const url = planUrl(plan.tokenId)
  const emails = plan.participants.map((p) => (p.email ?? '').trim()).filter(Boolean)
  // Narrowed here rather than at each use: the pick is two fields, and a
  // callback loses the narrowing that a property check gives an expression.
  const settledStart = plan.settledStartsAt
  const settledEnd = plan.settledEndsAt

  function save(patch: HuddlePatch) {
    void mutate((api) => api.updateHuddle(plan.id, patch))
  }

  /** The Google event this plan should mirror, from whatever the details are now. */
  function inviteDraft(startsAt: string, endsAt: string, location: string, notes: string): CalendarEventDraft {
    const page = `Plan page: ${url}`
    return {
      sourceId: plan.id,
      title: plan.title || 'Plan',
      description: notes ? `${notes}\n\n${page}` : page,
      location,
      startsAt,
      endsAt,
      attendees: emails.map((email) => ({ email })),
    }
  }

  async function lockIn() {
    if (!draft) return
    const startMs = new Date(draft.startsAt).getTime()
    if (!Number.isFinite(startMs)) return
    const endMs = startMs + draft.durationMinutes * 60000
    const startsAt = new Date(startMs).toISOString()
    const endsAt = new Date(endMs).toISOString()
    const location = draft.location.trim()
    const notes = draft.notes.trim()
    const firstPick = !plan.settledStartsAt

    setGoogleNote(null)
    await mutate((api) =>
      api.updateHuddle(plan.id, { settledStartsAt: startsAt, settledEndsAt: endsAt, location, notes }),
    )
    if (firstPick) track('hp_plan_settled', { durationMinutes: draft.durationMinutes })
    setDraft(null)

    // An invite that already went out has to follow the edit, or half the group
    // turns up at the old time. Failing here is worth saying plainly and is
    // never worth losing the saved pick over.
    if (plan.googleEventId) {
      try {
        const token = await getAccessToken(true)
        const result = await upsertEvent(token, inviteDraft(startsAt, endsAt, location, notes))
        setEventLink(result.htmlLink)
      } catch {
        setGoogleNote(
          'Saved here. Updating the Google invite did not go through, try again from the invite section.',
        )
      }
    }
  }

  return (
    <Page>
      <BackLink to="/app/plans">All plans</BackLink>

      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <PlanTitle plan={plan} onSave={(title) => save({ title })} />
          <p className="mt-[3px] px-2 text-[13px] text-sec">
            {planDuration(plan.durationMinutes)}, {plan.participants.length} joined
          </p>
        </div>
        <Chip tone={chip.tone} className="mt-2">
          {chip.label}
        </Chip>
      </div>

      <ShareCard plan={plan} url={url} />

      <SetupCard plan={plan} phase={phase} busy={busy} onSave={save} onExtend={onChange} />

      <ParticipantsCard plan={plan} onRefresh={onChange} />

      {phase !== 'settled' && (
        <TimesCard
          plan={plan}
          phase={phase}
          onPick={(slot) =>
            setDraft({
              startsAt: toLocalInputValue(slot.start),
              durationMinutes: plan.durationMinutes,
              location: plan.location,
              notes: plan.notes,
            })
          }
        />
      )}

      {draft && (
        <Composer
          draft={draft}
          settled={Boolean(plan.settledStartsAt)}
          busy={busy}
          onChange={setDraft}
          onCancel={() => setDraft(null)}
          onSave={() => void lockIn()}
        />
      )}

      {phase === 'settled' && settledStart && settledEnd && (
        <SettledCard
          plan={plan}
          startsAt={settledStart}
          endsAt={settledEnd}
          url={url}
          emails={emails}
          busy={busy}
          eventLink={eventLink}
          googleNote={googleNote}
          setGoogleNote={setGoogleNote}
          setEventLink={setEventLink}
          inviteDraft={inviteDraft}
          onSave={save}
          onEdit={() =>
            setDraft({
              startsAt: toLocalInputValue(new Date(settledStart).getTime()),
              durationMinutes: Math.max(
                5,
                Math.round(
                  (new Date(settledEnd).getTime() - new Date(settledStart).getTime()) / 60000,
                ),
              ),
              location: plan.location,
              notes: plan.notes,
            })
          }
        />
      )}

      {phase === 'passed' && (
        <Card className="mb-4 p-4" tone="amber">
          <SubTitle className="mb-[2px]">Nothing was picked</SubTitle>
          <p className="text-[12.5px] text-sec">
            No time was picked before {deadlineDay(plan.happenBy, plan.happenByMs)}. Move the
            must-happen-by date out above and the plan opens again.
          </p>
        </Card>
      )}

      <DangerRow
        busy={busy}
        onDelete={() =>
          void mutate(async (api) => {
            await api.deleteHuddle(plan.id)
            navigate('/app/plans')
          })
        }
      />
    </Page>
  )
}

/** Click straight into the name. Saves on blur, and Enter blurs. */
function PlanTitle({ plan, onSave }: { plan: Huddle; onSave: (title: string) => void }) {
  const [value, setValue] = useState(plan.title)

  function commit() {
    const next = value.trim()
    if (!next) {
      setValue(plan.title)
      return
    }
    if (next !== plan.title) onSave(next)
  }

  return (
    <input
      value={value}
      aria-label="Plan name"
      placeholder="Untitled plan"
      onChange={(e) => setValue(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()}
      className="w-full max-w-[520px] rounded-md border border-transparent bg-transparent px-2 py-1 font-display text-[19px] font-semibold text-ink outline-none transition hover:border-line focus:bg-surface focus:ring-focus"
    />
  )
}

function ShareCard({ plan, url }: { plan: Huddle; url: string }) {
  const [copied, setCopied] = useState(false)

  return (
    <Card className="mb-4 p-4">
      <SubTitle className="mb-[2px]">The link</SubTitle>
      <p className="mb-3 text-[12.5px] text-sec">Send it wherever the group already talks.</p>

      <p className="hairline mb-2 truncate rounded-[9px] border border-line bg-field px-[11px] py-2 text-[12.5px] text-ink">
        {url}
      </p>

      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={() => {
            void navigator.clipboard.writeText(url)
            setCopied(true)
            setTimeout(() => setCopied(false), 2000)
          }}
          className="hairline inline-flex items-center gap-[6px] rounded-[9px] border border-line bg-surface px-[13px] py-[7px] text-[13px] font-medium text-ink transition hover:border-vio hover:text-vio"
        >
          {copied ? <Check size={14} /> : <Copy size={14} />}
          {copied ? 'Copied' : 'Copy link'}
        </button>
        <a
          href={`/g/${plan.tokenId}`}
          target="_blank"
          rel="noreferrer"
          className="inline-flex items-center gap-[5px] text-[12.5px] font-medium text-vio transition hover:opacity-70"
        >
          <ExternalLink size={13} />
          Open it yourself
        </a>
      </div>
      <p className="mt-2 text-[12px] text-mut">
        Join like everyone else and add your own times.
      </p>
    </Card>
  )
}

/**
 * Everything the plan is made of, and the only place it changes.
 *
 * One save helper, so hours can never be written without the windows they
 * derive into. Local state seeds from the plan once and leads the saves, which
 * keeps a half-typed time from snapping back on the refetch.
 */
function SetupCard({
  plan,
  phase,
  busy,
  onSave,
  onExtend,
}: {
  plan: Huddle
  phase: PlanPhase
  busy: boolean
  onSave: (patch: HuddlePatch) => void
  onExtend: () => void
}) {
  const { mutate, busy: extending } = useMutation(onExtend)
  const [hours, setHours] = useState(plan.hours)
  const [respondBy, setRespondBy] = useState(plan.respondBy ?? '')
  const [happenBy, setHappenBy] = useState(plan.happenBy ?? '')

  const lapsed = plan.expiresAt !== null && new Date(plan.expiresAt).getTime() <= Date.now()
  const openDays = hours.filter((d) => d.open).length

  function save(next: {
    hours?: typeof hours
    respondBy?: string
    happenBy?: string
    durationMinutes?: number
  }) {
    const nextHours = next.hours ?? hours
    const nextRespond = next.respondBy ?? respondBy
    const nextHappen = next.happenBy ?? happenBy
    if (next.hours) setHours(next.hours)
    if (next.respondBy !== undefined) setRespondBy(next.respondBy)
    if (next.happenBy !== undefined) setHappenBy(next.happenBy)
    onSave({
      ...(next.durationMinutes ? { durationMinutes: next.durationMinutes } : {}),
      ...derivePlanWindows(nextHours, nextRespond || null, nextHappen || null),
    })
  }

  function extend() {
    const target = Math.max(
      plan.happenByMs !== null ? plan.happenByMs + 14 * DAY_MS : 0,
      Date.now() + 30 * DAY_MS,
    )
    void mutate((api) => api.extendHuddle(plan.id, new Date(target).toISOString()))
  }

  const expiryRow = (
    <div className="flex flex-wrap items-center gap-3">
      <p className="text-[12.5px] text-sec">
        {lapsed
          ? 'The link has stopped working. Nobody can open the page.'
          : plan.expiresAt
            ? `Link works until ${formatDayLong(plan.expiresAt)}.`
            : 'The link has no end date.'}
      </p>
      <button
        type="button"
        disabled={extending}
        onClick={extend}
        className={cx(
          'inline-flex items-center gap-[6px] rounded-[9px] text-[13px] font-medium transition disabled:opacity-50',
          lapsed
            ? 'accent-gradient px-[15px] py-2 text-white hover:opacity-90'
            : 'hairline border border-line bg-surface px-[13px] py-[7px] text-ink hover:border-vio hover:text-vio',
        )}
      >
        <RefreshCw size={14} />
        {lapsed ? 'Reopen the link' : 'Extend'}
      </button>
    </div>
  )

  if (phase === 'settled') {
    return (
      <Card className="mb-4 p-4">
        <SubTitle className="mb-[2px]">Setup</SubTitle>
        <p className="mb-3 text-[12.5px] text-sec">
          {planDuration(plan.durationMinutes)}, {openDays} of 7 days open
          {plan.happenBy ? `, was set to happen by ${deadlineDay(plan.happenBy, plan.happenByMs)}` : ''}.
        </p>
        {expiryRow}
      </Card>
    )
  }

  return (
    <Card className="mb-4 p-4">
      <SubTitle className="mb-[2px]">Setup</SubTitle>
      <p className="mb-3 text-[12.5px] text-sec">
        Change any of this and the times below are worked out again, for everyone.
      </p>

      <div className="mb-3 flex flex-wrap items-end gap-3">
        <Field label="How long" className="mb-0 w-[140px]">
          <Select
            value={String(plan.durationMinutes)}
            disabled={busy}
            onChange={(e) => save({ durationMinutes: Number(e.target.value) })}
          >
            {PLAN_DURATIONS.map((m) => (
              <option key={m} value={m}>
                {planDuration(m)}
              </option>
            ))}
          </Select>
        </Field>
      </div>

      <p className="mb-[6px] text-[11px] font-medium uppercase tracking-wide text-mut">
        Which days and hours
      </p>
      <div className="mb-4">
        <PlanHours hours={hours} disabled={busy} onChange={(next) => save({ hours: next })} />
      </div>

      <div className="flex flex-wrap items-start gap-3">
        <Field
          label="Answers close by"
          className="mb-0 w-[190px]"
          hint="After this, joining and voting lock."
        >
          <Input
            type="date"
            value={respondBy}
            disabled={busy}
            onChange={(e) => save({ respondBy: e.target.value })}
          />
        </Field>
        <Field
          label="Must happen by"
          className="mb-0 w-[190px]"
          hint="Times are only suggested up to this day."
        >
          <Input
            type="date"
            value={happenBy}
            disabled={busy}
            onChange={(e) => save({ happenBy: e.target.value })}
          />
        </Field>
      </div>

      <Divider className="my-3" />
      {expiryRow}
    </Card>
  )
}

function ParticipantsCard({ plan, onRefresh }: { plan: Huddle; onRefresh: () => void }) {
  const withEmail = plan.participants.filter((p) => (p.email ?? '').trim() !== '').length

  return (
    <Card className="mb-4 p-4">
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <SubTitle>
          {plan.participants.length === 0 ? 'Nobody in yet' : `${plan.participants.length} in so far`}
        </SubTitle>
        <button
          type="button"
          onClick={onRefresh}
          className="inline-flex items-center gap-[5px] text-[12.5px] font-medium text-vio transition hover:opacity-70"
        >
          <RefreshCw size={13} />
          Refresh
        </button>
      </div>

      {plan.participants.length === 0 ? (
        <EmptyState title="Waiting on the group" body="Nobody yet. Send the link." />
      ) : (
        <>
          {plan.participants.map((person) => (
            <div
              key={person.id}
              className="flex items-center gap-2 border-0 border-b border-hair py-[8px] last:border-0"
            >
              <span className="text-mut">
                {person.source === 'calendar' ? (
                  <CalendarCheck size={14} aria-label="Added their calendar" />
                ) : (
                  <Hand size={14} aria-label="Picked days by hand" />
                )}
              </span>
              <span className="min-w-0 flex-1 truncate text-[13px] text-ink">{person.name}</span>
              {(person.email ?? '').trim() !== '' && (
                <span className="text-mut">
                  <Mail size={14} aria-label="Left an email for the invite" />
                </span>
              )}
            </div>
          ))}
          <p className="mt-2 text-[12px] text-mut">
            {withEmail} of {plan.participants.length} left an email for the invite.
          </p>
        </>
      )}
    </Card>
  )
}

/**
 * The ranked times, computed from exactly what a guest is sent.
 *
 * Same call, same bounds, same limit, so the organizer never picks from a list
 * the group cannot see.
 */
function TimesCard({
  plan,
  phase,
  onPick,
}: {
  plan: Huddle
  phase: PlanPhase
  onPick: (slot: Suggestion) => void
}) {
  const suggestions = useMemo(() => {
    const participants: Participant[] = plan.participants.map((p) => ({
      id: p.id,
      label: p.name,
      free: (p.free ?? []).map((w) => ({ start: w.s, end: w.e })),
    }))
    if (participants.length === 0) return []
    return suggest(participants, {
      durationMinutes: plan.durationMinutes,
      limit: 8,
      within: clipWindows(
        plan.allowed?.map((w) => ({ start: w.s, end: w.e })) ?? null,
        Date.now(),
        plan.happenByMs,
      ),
    })
  }, [plan.participants, plan.durationMinutes, plan.allowed, plan.happenByMs])

  const total = plan.participants.length
  const nameOf = (id: string) => plan.participants.find((p) => p.id === id)?.name ?? 'Someone'

  return (
    <Card className="mb-4 p-4">
      <SubTitle className="mb-[2px]">The times that work</SubTitle>
      <p className="mb-3 text-[12.5px] text-sec">
        Most people free first, then soonest. Votes from the group sit beside each one.
      </p>
      {phase === 'closed' && (
        <p className="mb-3 text-[12.5px] text-ambk">Answers are closed. Pick the time.</p>
      )}

      {suggestions.length === 0 ? (
        <p className="text-[12.5px] text-mut">
          {total === 0
            ? 'Nothing to rank yet. Once people join, their times show up here.'
            : 'No stretch that long works for anyone inside the days and hours above. Try a shorter time, or open more hours.'}
        </p>
      ) : (
        suggestions.map((slot) => {
          const voters = plan.votes[String(slot.start)] ?? []
          const everyone = slot.free.length === total
          return (
            <div
              key={slot.start}
              className="flex flex-wrap items-center gap-2 border-0 border-b border-hair py-[9px] last:border-0"
            >
              <div className="min-w-0 flex-1">
                <p className="text-[13px] text-ink">
                  <span className="font-medium">{formatDayLong(new Date(slot.start).toISOString())}</span>
                  {', '}
                  {formatTime(new Date(slot.start))} to {formatTime(new Date(slot.end))}
                </p>
                <p className="text-[11.5px] text-mut">
                  <span className={cx(everyone && 'font-medium text-vio')}>
                    {everyone ? 'Everyone can make it' : `${slot.free.length} of ${total} can make it`}
                  </span>
                  {voters.length > 0 &&
                    `, ${voters.length} ${voters.length === 1 ? 'vote' : 'votes'}: ${voters
                      .map(nameOf)
                      .join(', ')}`}
                </p>
              </div>
              {phase !== 'passed' && (
                <button
                  type="button"
                  onClick={() => onPick(slot)}
                  className="hairline shrink-0 rounded-[9px] border border-line bg-surface px-[13px] py-[7px] text-[12.5px] font-medium text-ink transition hover:border-vio hover:text-vio"
                >
                  Use this time
                </button>
              )}
            </div>
          )
        })
      )}
    </Card>
  )
}

function Composer({
  draft,
  settled,
  busy,
  onChange,
  onCancel,
  onSave,
}: {
  draft: Draft
  settled: boolean
  busy: boolean
  onChange: (next: Draft) => void
  onCancel: () => void
  onSave: () => void
}) {
  return (
    <Card className="mb-4 p-4" tone="violet">
      <SubTitle className="mb-[2px]">{settled ? 'The details' : 'Make it the plan'}</SubTitle>
      <p className="mb-3 text-[12.5px] text-sec">
        Adjust anything here first. Everyone on the link sees it the moment you save.
      </p>

      <div className="mb-1 flex flex-wrap items-end gap-3">
        <Field label="Starts" className="mb-0 w-[230px]">
          <Input
            type="datetime-local"
            value={draft.startsAt}
            onChange={(e) => onChange({ ...draft, startsAt: e.target.value })}
          />
        </Field>
        <Field label="How long" className="mb-0 w-[140px]">
          <Select
            value={String(draft.durationMinutes)}
            onChange={(e) => onChange({ ...draft, durationMinutes: Number(e.target.value) })}
          >
            {PLAN_DURATIONS.map((m) => (
              <option key={m} value={m}>
                {planDuration(m)}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Where" className="mb-0 w-[240px]">
          <Input
            value={draft.location}
            placeholder="A place, an address, a link"
            onChange={(e) => onChange({ ...draft, location: e.target.value })}
          />
        </Field>
      </div>

      <Field label="Notes" className="mt-2">
        <Textarea
          rows={3}
          value={draft.notes}
          placeholder="Bring anything, park anywhere, whatever they need to know"
          onChange={(e) => onChange({ ...draft, notes: e.target.value })}
        />
      </Field>

      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          disabled={busy || draft.startsAt === ''}
          onClick={onSave}
          className="accent-gradient inline-flex items-center gap-[6px] rounded-[9px] px-[15px] py-2 text-[13px] font-medium text-white transition hover:opacity-90 disabled:opacity-50"
        >
          <Check size={15} />
          {settled ? 'Save the details' : 'Lock it in'}
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="text-[13px] text-sec transition hover:text-ink"
        >
          Never mind
        </button>
      </div>
    </Card>
  )
}

function SettledCard({
  plan,
  startsAt,
  endsAt,
  url,
  emails,
  busy,
  eventLink,
  googleNote,
  setGoogleNote,
  setEventLink,
  inviteDraft,
  onSave,
  onEdit,
}: {
  plan: Huddle
  startsAt: string
  endsAt: string
  url: string
  emails: string[]
  busy: boolean
  eventLink: string | null
  googleNote: string | null
  setGoogleNote: (note: string | null) => void
  setEventLink: (link: string | null) => void
  inviteDraft: (startsAt: string, endsAt: string, location: string, notes: string) => CalendarEventDraft
  onSave: (patch: HuddlePatch) => void
  onEdit: () => void
}) {
  const [googleBusy, setGoogleBusy] = useState(false)
  const [confirmUndo, setConfirmUndo] = useState(false)
  const [copied, setCopied] = useState(false)

  const draft = () => inviteDraft(startsAt, endsAt, plan.location, plan.notes)

  async function sendToGoogle(mode: 'create' | 'update') {
    setGoogleBusy(true)
    setGoogleNote(null)
    try {
      const token = await getAccessToken(true)
      const result = await upsertEvent(token, draft())
      setEventLink(result.htmlLink)
      if (mode === 'create') {
        onSave({ googleEventId: result.id })
        track('hp_plan_invite_created', { attendees: emails.length })
      }
      setGoogleNote(
        emails.length === 0
          ? 'On your calendar. Nobody was emailed, because nobody left an address.'
          : mode === 'create'
            ? `Invite sent to ${emails.length} ${emails.length === 1 ? 'person' : 'people'}.`
            : 'The invite was updated.',
      )
    } catch (err) {
      setGoogleNote(googleMessage(err))
    } finally {
      setGoogleBusy(false)
    }
  }

  async function undo() {
    setGoogleBusy(true)
    setGoogleNote(null)
    try {
      // The calendar goes first. Clearing the pick while the invite is still
      // out would leave the group holding a time this app no longer knows
      // about, and nothing here could take it back.
      if (plan.googleEventId) {
        const token = await getAccessToken(true)
        await removeEvent(token, plan.id, undefined, true)
      }
    } catch (err) {
      setGoogleNote(googleMessage(err))
      setGoogleBusy(false)
      return
    }
    setGoogleBusy(false)
    setConfirmUndo(false)
    setEventLink(null)
    onSave({ settledStartsAt: null, settledEndsAt: null, googleEventId: null })
  }

  function download() {
    const slug = (plan.title || 'plan').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
    downloadIcs(
      `${slug || 'plan'}.ics`,
      buildIcs({
        uid: plan.id,
        title: plan.title || 'Plan',
        startsAt,
        endsAt,
        location: plan.location,
        description: plan.notes ? `${plan.notes}\n\nPlan page: ${url}` : `Plan page: ${url}`,
      }),
    )
  }

  function copySummary() {
    const lines = [plan.title || 'Plan', formatLong(startsAt)]
    if (plan.location) lines.push(plan.location)
    lines.push(url)
    void navigator.clipboard.writeText(lines.join('\n'))
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <Card className="mb-4 p-4" tone="violet">
      <SubTitle className="mb-[2px]">It is set</SubTitle>
      <p className="font-display text-[19px] font-semibold text-ink">
        {formatLong(startsAt)} to {formatTime(new Date(endsAt))}
      </p>
      {plan.location && <p className="mt-1 text-[13px] text-body">{plan.location}</p>}
      {plan.notes && <p className="mt-1 whitespace-pre-line text-[12.5px] text-sec">{plan.notes}</p>}

      <Divider className="my-3" />

      {googleConfigured ? (
        <>
          {plan.googleEventId ? (
            <div className="flex flex-wrap items-center gap-3">
              <p className="text-[12.5px] text-sec">
                {emails.length === 0
                  ? 'On your own calendar. Nobody was emailed.'
                  : `Invite sent to ${emails.length} ${emails.length === 1 ? 'person' : 'people'}.`}
              </p>
              {eventLink && (
                <a
                  href={eventLink}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-[5px] text-[12.5px] font-medium text-vio transition hover:opacity-70"
                >
                  <ExternalLink size={13} />
                  Open in Google Calendar
                </a>
              )}
              <button
                type="button"
                disabled={googleBusy || busy}
                onClick={() => void sendToGoogle('update')}
                className="hairline inline-flex items-center gap-[6px] rounded-[9px] border border-line bg-surface px-[13px] py-[7px] text-[12.5px] font-medium text-ink transition hover:border-vio hover:text-vio disabled:opacity-50"
              >
                <RefreshCw size={14} />
                Update the invite
              </button>
            </div>
          ) : (
            <>
              <button
                type="button"
                disabled={googleBusy || busy}
                onClick={() => void sendToGoogle('create')}
                className="accent-gradient inline-flex items-center gap-[6px] rounded-[9px] px-[15px] py-2 text-[13px] font-medium text-white transition hover:opacity-90 disabled:opacity-50"
              >
                <CalendarPlus size={15} />
                {googleBusy ? 'Sending' : 'Create the invite'}
              </button>
              <p className="mt-2 text-[12px] text-mut">
                {emails.length === 0
                  ? 'Nobody left an email, so this only lands on your calendar. Anyone can still add it from the plan page.'
                  : `${emails.length} of ${plan.participants.length} left an email. Everyone else can add it from the plan page.`}
              </p>
            </>
          )}
        </>
      ) : (
        <p className="text-[12.5px] text-mut">
          Google is not set up in this build yet, so there is no invite to send. The two buttons
          below still work.
        </p>
      )}

      {googleNote && <p className="mt-2 text-[12.5px] text-sec">{googleNote}</p>}

      <div className="mt-3 flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={download}
          className="hairline inline-flex items-center gap-[6px] rounded-[9px] border border-line bg-surface px-[13px] py-[7px] text-[12.5px] font-medium text-ink transition hover:border-vio hover:text-vio"
        >
          <Download size={14} />
          Download for your calendar
        </button>
        <button
          type="button"
          onClick={copySummary}
          className="inline-flex items-center gap-[5px] text-[12.5px] font-medium text-vio transition hover:opacity-70"
        >
          {copied ? <Check size={13} /> : <Copy size={13} />}
          {copied ? 'Copied' : 'Copy a summary'}
        </button>
        <button
          type="button"
          onClick={onEdit}
          className="text-[12.5px] text-sec transition hover:text-ink"
        >
          Change the details
        </button>
      </div>

      <Divider className="my-3" />

      {confirmUndo ? (
        <div className="flex flex-wrap items-center gap-3">
          <p className="text-[12.5px] text-sec">
            This clears the pick
            {plan.googleEventId ? ', and cancels the Google invite.' : '.'}
          </p>
          <button
            type="button"
            disabled={googleBusy || busy}
            onClick={() => void undo()}
            className="text-[12.5px] font-medium text-rosek transition hover:opacity-70 disabled:opacity-50"
          >
            {googleBusy ? 'Working' : 'Yes, undo it'}
          </button>
          <button
            type="button"
            onClick={() => setConfirmUndo(false)}
            className="text-[12.5px] text-sec transition hover:text-ink"
          >
            Keep it
          </button>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setConfirmUndo(true)}
          className="text-[12.5px] text-sec transition hover:text-ink"
        >
          Undo the pick
        </button>
      )}
    </Card>
  )
}

function DangerRow({ busy, onDelete }: { busy: boolean; onDelete: () => void }) {
  const [confirm, setConfirm] = useState(false)

  if (!confirm) {
    return (
      <button
        type="button"
        onClick={() => setConfirm(true)}
        className="text-[12.5px] text-mut transition hover:text-rosek"
      >
        Delete this plan
      </button>
    )
  }

  return (
    <div className="flex flex-wrap items-center gap-3">
      <p className="text-[12.5px] text-sec">
        This deletes the plan and stops the link. Everyone's answers go with it.
      </p>
      <button
        type="button"
        disabled={busy}
        onClick={onDelete}
        className="text-[12.5px] font-medium text-rosek transition hover:opacity-70 disabled:opacity-50"
      >
        Yes, delete it
      </button>
      <button
        type="button"
        onClick={() => setConfirm(false)}
        className="text-[12.5px] text-sec transition hover:text-ink"
      >
        Keep it
      </button>
    </div>
  )
}

/**
 * The deadline day as the organizer wrote it.
 *
 * The stored millisecond is the midnight after that day, because a deadline of
 * the 12th means through the end of the 12th. Formatting the raw number would
 * name the 13th.
 */
function deadlineDay(dateKey: string | null, ms: number | null): string {
  if (dateKey) return formatDayLong(fromDateKey(dateKey).toISOString())
  if (ms !== null) return formatDayLong(new Date(ms - 1).toISOString())
  return 'the deadline'
}

function googleMessage(err: unknown): string {
  if (err instanceof GoogleCalendarError) {
    if (err.reason === 'not_configured') {
      return 'Google is not set up in this build yet. See docs/Google_Calendar_Setup.md.'
    }
    if (err.reason === 'popup_blocked') {
      return 'Your browser blocked the Google window. Allow popups for this site, then try again.'
    }
    if (err.reason === 'denied') return 'Google did not grant access. Nothing changed.'
    if (err.reason === 'consent_required') {
      return 'Google access has expired. Try again and grant access when it asks.'
    }
  }
  return 'Could not reach Google Calendar. Try again in a moment.'
}
