import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Check, Copy, Users } from 'lucide-react'
import { Page, PageHeader } from './Page'
import { Card, Chip, EmptyState, ErrorState, Loading, SubTitle, cx } from '../../ui/primitives'
import type { ChipTone } from '../../ui/primitives'
import { Field, Input, Select } from '../../ui/form'
import { useAsync, useMutation } from '../useApi'
import { useHost } from '../AuthProvider'
import { daysBetween, formatDayLong, formatLong, fromDateKey } from '../../lib/dates'
import { track } from '../../lib/analytics'
import {
  PLAN_DEFAULT_HOURS,
  buildAllowedWindows,
  currentZone,
  endOfDayMs,
  planPhase,
  type PlanPhase,
} from '../../lib/availability'
import type { DayHoursDoc, Huddle } from '../../data/types'

// F20.7. Plans are their own surface: everything about finding a time for a
// group, away from the one-friend-at-a-time availability page.
//
// The organizer's browser owns every derivation. Hours are wall clock and need
// a zone to become absolute, and this is the only place that zone is known, so
// the windows guests rank against are computed here and published with the
// plan. Anything that edits hours or the deadline dates has to recompute them
// in the same write, which is what `derivePlanWindows` is for.

const DAY_MS = 86400000

export const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']

export const PLAN_DURATIONS = [30, 45, 60, 90, 120, 180, 240]

/** "45 min", "1 hr 30 min". How long a thing takes, said the way people say it. */
export function planDuration(minutes: number): string {
  const h = Math.floor(minutes / 60)
  const rest = minutes % 60
  if (h === 0) return `${rest} min`
  return rest === 0 ? `${h} hr` : `${h} hr ${rest} min`
}

export const PLAN_PHASES: Record<PlanPhase, { label: string; tone: ChipTone }> = {
  open: { label: 'Open', tone: 'vio' },
  closed: { label: 'Answers closed', tone: 'amb' },
  settled: { label: 'Settled', tone: 'grn' },
  passed: { label: 'Date passed', tone: 'gray' },
}

/**
 * Everything derived from hours and the two dates, in one object.
 *
 * Returned together on purpose. Saving hours without their windows leaves
 * guests ranking against the hours the plan used to have, and the mistake is
 * invisible until somebody votes for a time the organizer already closed. Every
 * caller spreads this whole result into the write.
 */
export function derivePlanWindows(
  hours: DayHoursDoc[],
  respondBy: string | null,
  happenBy: string | null,
): Pick<Huddle, 'hours' | 'allowed' | 'respondBy' | 'respondByMs' | 'happenBy' | 'happenByMs'> {
  const from = new Date()
  const to = new Date(happenBy ? endOfDayMs(happenBy) : from.getTime() + 30 * DAY_MS)
  return {
    hours,
    allowed: buildAllowedWindows(hours, from, to).map((w) => ({ s: w.start, e: w.end })),
    respondBy,
    respondByMs: respondBy ? endOfDayMs(respondBy) : null,
    happenBy,
    happenByMs: happenBy ? endOfDayMs(happenBy) : null,
  }
}

/**
 * When the link stops working.
 *
 * Two weeks past the day the thing has to have happened, so the page outlives
 * the outcome and everyone can still see what was picked. Never asked for: a
 * date to answer by is a real question, and a date the link dies is plumbing.
 */
export function planExpiryMs(happenBy: string | null): number {
  return happenBy ? endOfDayMs(happenBy) + 14 * DAY_MS : Date.now() + 30 * DAY_MS
}

export function planHorizonDays(happenBy: string | null): number {
  if (!happenBy) return 30
  return Math.min(180, Math.max(1, daysBetween(new Date(), fromDateKey(happenBy))))
}

/** The time with the most votes, earliest first on a tie. Null when nobody voted. */
export function topVote(votes: Record<string, string[]>): { startMs: number; count: number } | null {
  let best: { startMs: number; count: number } | null = null
  for (const [key, voters] of Object.entries(votes)) {
    const startMs = Number(key)
    if (voters.length === 0 || !Number.isFinite(startMs)) continue
    if (!best || voters.length > best.count || (voters.length === best.count && startMs < best.startMs)) {
      best = { startMs, count: voters.length }
    }
  }
  return best
}

export function planUrl(tokenId: string): string {
  return `${window.location.origin}/g/${tokenId}`
}

/**
 * The seven day rows, editable in place.
 *
 * A cousin of the open hours editor on the availability page rather than the
 * same component: that one saves a settings document on every keystroke, and
 * this one is edited locally until there is a plan to save it to.
 */
export function PlanHours({
  hours,
  disabled,
  onChange,
}: {
  hours: DayHoursDoc[]
  disabled?: boolean
  onChange: (next: DayHoursDoc[]) => void
}) {
  function setDay(index: number, next: DayHoursDoc) {
    onChange(hours.map((day, i) => (i === index ? next : day)))
  }

  return (
    <div>
      {hours.map((day, i) => (
        <div
          key={DAY_NAMES[i]}
          className="flex flex-wrap items-center gap-2 border-0 border-b border-hair py-[6px] last:border-0"
        >
          <span className="w-[86px] text-[12.5px] text-ink">{DAY_NAMES[i]}</span>
          <button
            type="button"
            disabled={disabled}
            onClick={() => setDay(i, { ...day, open: !day.open })}
            className={cx(
              'hairline w-[68px] rounded-[8px] border px-2 py-[4px] text-[12px] transition disabled:opacity-50',
              day.open ? 'border-vio bg-viot font-medium text-vio' : 'border-line bg-surface text-mut',
            )}
          >
            {day.open ? 'Open' : 'Closed'}
          </button>
          {/* Greyed rather than removed when a day is closed, so the hours are
              visibly still there to come back to. */}
          <input
            type="time"
            value={day.start}
            disabled={disabled || !day.open}
            aria-label={`${DAY_NAMES[i]} starts at`}
            onChange={(e) => setDay(i, { ...day, start: e.target.value })}
            className={cx(
              'hairline rounded-[8px] border border-line bg-field px-2 py-[4px] text-[12.5px]',
              day.open ? 'text-ink' : 'text-mut opacity-60',
            )}
          />
          <span className={cx('text-[12px] text-mut', !day.open && 'opacity-60')}>to</span>
          <input
            type="time"
            value={day.end}
            disabled={disabled || !day.open}
            aria-label={`${DAY_NAMES[i]} ends at`}
            onChange={(e) => setDay(i, { ...day, end: e.target.value })}
            className={cx(
              'hairline rounded-[8px] border border-line bg-field px-2 py-[4px] text-[12.5px]',
              day.open ? 'text-ink' : 'text-mut opacity-60',
            )}
          />
        </div>
      ))}
    </div>
  )
}

export default function PlansPage() {
  const state = useAsync((api) => api.listHuddles(), [])

  return (
    <Page>
      <PageHeader
        title="Plans"
        subtitle="One link for the whole group. Everyone says when they can do it, you pick the time."
      />

      <CreatePlan onCreated={state.reload} />

      {state.loading && <Loading label="Loading plans" />}
      {state.error && <ErrorState message={`Plans didn't load (${state.error}).`} onRetry={state.reload} />}

      {state.data && state.data.length === 0 && (
        <EmptyState
          title="No plans yet"
          body="Make one above and you will get a link to send. Everyone on it adds their times, and you pick from what works."
        />
      )}

      {state.data?.map((plan) => (
        <PlanRow key={plan.id} plan={plan} />
      ))}
    </Page>
  )
}

function CreatePlan({ onCreated }: { onCreated: () => void }) {
  const host = useHost()
  const navigate = useNavigate()
  const { mutate, busy } = useMutation(onCreated)

  const [title, setTitle] = useState('')
  const [durationMinutes, setDurationMinutes] = useState(60)
  const [hours, setHours] = useState<DayHoursDoc[]>(PLAN_DEFAULT_HOURS)
  const [respondBy, setRespondBy] = useState('')
  const [happenBy, setHappenBy] = useState('')

  const today = new Date()
  const happenGone = happenBy !== '' && daysBetween(today, fromDateKey(happenBy)) < 0
  const closesLate = respondBy !== '' && happenBy !== '' && respondBy > happenBy
  const expires = formatDayLong(new Date(planExpiryMs(happenBy || null)).toISOString())

  function create() {
    if (!title.trim()) return
    void mutate(async (api) => {
      const { id } = await api.createHuddle(
        {
          title: title.trim(),
          durationMinutes,
          horizonDays: planHorizonDays(happenBy || null),
          ...derivePlanWindows(hours, respondBy || null, happenBy || null),
          expiresAt: new Date(planExpiryMs(happenBy || null)).toISOString(),
          hostDisplayName: host.displayName || '',
          timeZone: currentZone(),
        },
        host.uid,
      )
      track('hp_plan_created', { durationMinutes })
      navigate(`/app/plans/${id}`)
    })
  }

  return (
    <Card className="mb-4 p-4">
      <SubTitle className="mb-[2px]">Start a plan</SubTitle>
      <p className="mb-3 text-[12.5px] text-sec">
        Say what it is and roughly when it could happen. The group fills in the rest.
      </p>

      <div className="mb-3 flex flex-wrap items-end gap-3">
        <Field label="What for" className="mb-0 w-[260px]">
          <Input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Draft night, dinner, a walk"
            onKeyDown={(e) => e.key === 'Enter' && create()}
          />
        </Field>
        <Field label="How long" className="mb-0 w-[140px]">
          <Select value={String(durationMinutes)} onChange={(e) => setDurationMinutes(Number(e.target.value))}>
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
      <p className="mb-2 text-[12px] text-mut">
        Nothing is ever suggested outside these, whatever anyone's calendar says.
      </p>
      <div className="mb-4">
        <PlanHours hours={hours} disabled={busy} onChange={setHours} />
      </div>

      <div className="mb-1 flex flex-wrap items-start gap-3">
        <Field
          label="Answers close by"
          className="mb-0 w-[190px]"
          hint="After this, joining and voting lock."
        >
          <Input type="date" value={respondBy} onChange={(e) => setRespondBy(e.target.value)} />
        </Field>
        <Field
          label="Must happen by"
          className="mb-0 w-[190px]"
          hint="Times are only suggested up to this day."
        >
          <Input type="date" value={happenBy} onChange={(e) => setHappenBy(e.target.value)} />
        </Field>
      </div>

      {happenGone && (
        <p className="mt-2 text-[12px] text-ambk">
          That day has already gone, so nothing will be suggested. Move it out to start ranking times.
        </p>
      )}
      {closesLate && (
        <p className="mt-2 text-[12px] text-ambk">
          Answers would close after the day it has to happen. Bring the first date back.
        </p>
      )}

      <p className="mt-3 text-[12px] text-mut">
        The link keeps working until {expires}, so everyone can still see the pick.
      </p>

      <button
        type="button"
        disabled={busy || !title.trim()}
        onClick={create}
        className="accent-gradient mt-3 inline-flex items-center gap-[6px] rounded-[9px] px-[15px] py-2 text-[13px] font-medium text-white transition hover:opacity-90 disabled:opacity-50"
      >
        <Check size={15} />
        Make the plan
      </button>
    </Card>
  )
}

function PlanRow({ plan }: { plan: Huddle }) {
  const [copied, setCopied] = useState(false)
  const phase = PLAN_PHASES[planPhase(plan, Date.now())]
  const leading = topVote(plan.votes)

  function copy() {
    void navigator.clipboard.writeText(planUrl(plan.tokenId))
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <Card className="mb-3 transition hover:border-viodash">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <Link to={`/app/plans/${plan.id}`} className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <SubTitle>{plan.title || 'Untitled plan'}</SubTitle>
            <Chip tone={phase.tone}>{phase.label}</Chip>
          </div>

          <div className="mt-[9px] flex flex-wrap items-center gap-4 text-xs text-sec">
            <span className="flex items-center gap-[6px]">
              <Users size={14} />
              {plan.participants.length === 0
                ? 'Nobody in yet'
                : `${plan.participants.length} in so far`}
            </span>
            <span>{planDuration(plan.durationMinutes)}</span>
            {leading && (
              <span className="font-medium text-vio">
                {formatDayLong(new Date(leading.startMs).toISOString())} is ahead
              </span>
            )}
            <span className="text-mut">{whenLine(plan)}</span>
          </div>
        </Link>

        <button
          type="button"
          onClick={copy}
          className="inline-flex shrink-0 items-center gap-1 text-[12px] text-sec transition hover:text-vio"
        >
          {copied ? <Check size={13} /> : <Copy size={13} />}
          {copied ? 'Copied' : 'Copy link'}
        </button>
      </div>
    </Card>
  )
}

/** The one date that matters right now, which is a different date in each phase. */
function whenLine(plan: Huddle): string {
  if (plan.settledStartsAt) return `Settled for ${formatLong(plan.settledStartsAt)}`
  if (plan.respondBy) return `Answers close ${formatDayLong(fromDateKey(plan.respondBy).toISOString())}`
  if (plan.expiresAt) return `Link until ${formatDayLong(plan.expiresAt)}`
  return ''
}
