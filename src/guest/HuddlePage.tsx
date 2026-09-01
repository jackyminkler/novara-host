import { useMemo, useRef, useState, type ComponentType, type ReactNode } from 'react'
import { CalendarCheck, CalendarPlus, Check, Download, MapPin, Users } from 'lucide-react'
import { fetchGuestView, submitGuestAction, GuestError } from './guestClient'
import { isHuddleView, type HuddleView } from './guestTypes'
import { Card, Chip, SubTitle, cx } from '../ui/primitives'
import { Input } from '../ui/form'
import { addDays, formatDayLong, formatTime, startOfDay } from '../lib/dates'
import {
  allowedDayGroups,
  clipWindows,
  currentZone,
  daysCoveredBy,
  freeFromDays,
  planPhase,
  suggest,
  zoneAbbreviation,
  type Interval,
  type Participant,
} from '../lib/availability'
import { buildIcs, downloadIcs, googleCalendarUrl } from '../lib/calendarLinks'
import { track } from '../lib/analytics'
import { googleConfigured } from '../lib/googleIdentity'

// One link, everyone on it, alive for as long as the organizer set. People join
// with their calendar or by ticking the days that could work, the page ranks the
// times that suit the most of them, and the group votes while they are still
// together.
//
// Four states, from the same `planPhase` the functions enforce with: open takes
// answers, closed shows where it landed while the organizer decides, settled
// hands everyone the time, passed says plainly that nothing was picked. Deriving
// it here rather than reading a stored flag means the page and the server can
// never disagree about which one it is in.
//
// Ranking is computed here rather than on the server. Every participant's free
// time is already in the view, so ranking locally avoids a second copy of the
// algorithm in the functions build root, which is exactly how two copies drift
// apart. The three bounds ranking has to respect (the organizer's own windows,
// nothing in the past, nothing after the happen-by date) fold together through
// `clipWindows` into the single `within` list `suggest` takes.

/** How many days the hand picker shows before "Show more days". */
const VISIBLE_DAYS = 21

/** How far ahead to offer days when the plan published no windows at all. */
const FALLBACK_DAYS = 14

const SECONDARY =
  'hairline inline-flex w-full items-center justify-center gap-[6px] rounded-[9px] border border-line bg-surface px-[13px] py-[10px] text-[12.5px] font-medium text-ink transition hover:border-vio hover:text-vio disabled:opacity-50'

const PRIMARY =
  'accent-gradient inline-flex w-full items-center justify-center gap-[6px] rounded-[9px] px-[15px] py-[10px] text-[13.5px] font-medium text-white transition hover:opacity-90 disabled:opacity-50'

/** "Tue, Sep 1", the row label in the hand picker. */
const dayLabelFormat = new Intl.DateTimeFormat('en-US', {
  weekday: 'short',
  month: 'short',
  day: 'numeric',
})

/** "1 hr 30 min". Said the way people say it, never "90 minutes". */
function formatDuration(minutes: number): string {
  const hours = Math.floor(minutes / 60)
  const rest = minutes % 60
  if (hours === 0) return `${rest} min`
  if (rest === 0) return `${hours} hr`
  return `${hours} hr ${rest} min`
}

/**
 * The day a deadline names, from the millisecond it is stored as.
 *
 * `respondByMs` and `happenByMs` are local midnight *after* the day the
 * organizer typed, because "by the 12th" includes the whole of the 12th. One
 * millisecond back lands inside that day, which is the day the group was told.
 */
function deadlineDay(ms: number): string {
  return formatDayLong(new Date(ms - 1).toISOString())
}

/** A filename a phone will not argue with. */
function icsName(title: string): string {
  const slug = title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '')
  return `${slug || 'plan'}.ics`
}

/**
 * Days to pick from when the plan published no windows at all.
 *
 * `allowed: null` means unbounded, which is what a plan written before hours
 * existed carries. Ranking can take that literally; a picker cannot, so it
 * offers the next fortnight as whole days and lets the same clipping trim the
 * part of today that has already gone.
 */
function fallbackWindows(now: number): Interval[] {
  const first = startOfDay(new Date(now))
  return Array.from({ length: FALLBACK_DAYS }, (_, i) => ({
    start: addDays(first, i).getTime(),
    end: addDays(first, i + 1).getTime(),
  }))
}

export default function HuddlePage({
  token,
  initial,
  Shell,
}: {
  token: string
  initial: HuddleView
  Shell: ComponentType<{ children: ReactNode; label?: string }>
}) {
  const [view, setView] = useState(initial)
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  // Open on arrival when there is no Google to offer, so the only way in is not
  // hidden behind a tap.
  const [handPicking, setHandPicking] = useState(!googleConfigured)
  const [pickedDays, setPickedDays] = useState<string[]>([])
  const [allDays, setAllDays] = useState(false)
  const [editing, setEditing] = useState(false)
  const [busy, setBusy] = useState(false)
  const [note, setNote] = useState<string | null>(null)

  // One clock read for the whole visit. Ranking and the day list would otherwise
  // shift under the reader on every keystroke, and a plan is a moment rather
  // than a session worth ticking along.
  const openedAt = useRef(Date.now()).current
  const phase = planPhase(view, Date.now())

  const you = view.you
  const mine = you ? (view.participants.find((p) => p.id === you) ?? null) : null
  const joined = Boolean(mine)

  /** The organizer's windows, with now and the happen-by date folded in. */
  const within = useMemo(
    () =>
      clipWindows(
        view.allowed ? view.allowed.map((w) => ({ start: w.s, end: w.e })) : null,
        openedAt,
        view.happenByMs,
      ),
    [view.allowed, view.happenByMs, openedAt],
  )

  const options = useMemo(() => {
    const participants: Participant[] = view.participants.map((p) => ({
      id: p.id,
      label: p.name,
      free: p.free.map((w) => ({ start: w.s, end: w.e })),
    }))
    if (participants.length === 0) return []
    return suggest(participants, { durationMinutes: view.durationMinutes, limit: 6, within })
  }, [view.participants, view.durationMinutes, within])

  const dayGroups = useMemo(
    () =>
      allowedDayGroups(
        clipWindows(
          view.allowed ? view.allowed.map((w) => ({ start: w.s, end: w.e })) : fallbackWindows(openedAt),
          openedAt,
          view.happenByMs,
        ),
        openedAt,
      ),
    [view.allowed, view.happenByMs, openedAt],
  )

  const nameOf = (id: string) => view.participants.find((p) => p.id === id)?.name ?? 'Someone'

  async function send(
    action: 'join_huddle' | 'cast_vote',
    payload: Record<string, unknown>,
  ): Promise<HuddleView | null> {
    setBusy(true)
    setNote(null)
    try {
      const next = await submitGuestAction(token, action, { ...payload, you })
      if (isHuddleView(next)) {
        setView(next)
        return next
      }
      return null
    } catch (err) {
      // A deadline can pass while the page is open. The server says so rather
      // than half writing, so the page catches up instead of insisting.
      if (err instanceof GuestError && err.reason === 'closed') {
        setNote('Answers are closed now.')
        try {
          const fresh = await fetchGuestView(token, you ?? undefined)
          if (isHuddleView(fresh)) setView(fresh)
        } catch {
          // Nothing to add: the note already says what happened.
        }
      } else {
        setNote('That did not go through. Try again.')
      }
      return null
    } finally {
      setBusy(false)
    }
  }

  async function join(free: Interval[], source: 'calendar' | 'manual') {
    const next = await send('join_huddle', {
      name: name.trim(),
      email: email.trim(),
      free: free.map((w) => ({ s: w.start, e: w.end })),
      source,
    })
    if (!next) return
    track('hp_plan_joined', { source })
    setEditing(false)
  }

  async function vote(key: string) {
    const next = await send('cast_vote', { slot: key })
    if (next) track('hp_plan_vote_cast', {})
  }

  async function joinWithCalendar() {
    if (!name.trim()) return
    setBusy(true)
    setNote(null)
    try {
      const { checkCalendar } = await import('./guestCalendar')
      const from = new Date()
      // Read exactly as far as the plan can still happen, and only as far as
      // the horizon when it has no end date of its own.
      const to =
        view.happenByMs !== null
          ? new Date(view.happenByMs)
          : new Date(from.getFullYear(), from.getMonth(), from.getDate() + view.horizonDays)
      const { free } = await checkCalendar(from, to)
      await join(free, 'calendar')
    } catch (err) {
      const reason = (err as { reason?: string })?.reason
      setNote(
        reason === 'popup_blocked'
          ? 'Your browser blocked the Google window. Allow popups, then try again.'
          : 'Could not read your calendar. You can pick days by hand instead.',
      )
      setBusy(false)
    }
  }

  function reopenAnswer() {
    setName(mine?.name ?? '')
    setEmail(view.yourEmail ?? '')
    const covered = daysCoveredBy(
      (mine?.free ?? []).map((w) => ({ start: w.s, end: w.e })),
      dayGroups,
    )
    setPickedDays(covered)
    setHandPicking(!googleConfigured || covered.length > 0)
    setEditing(true)
  }

  if (phase === 'settled' && view.settledStartsAt) {
    const startsAt = view.settledStartsAt
    const start = new Date(startsAt)
    const endsAt =
      view.settledEndsAt ?? new Date(start.getTime() + view.durationMinutes * 60000).toISOString()
    const event = {
      uid: view.huddleId,
      title: view.title,
      startsAt,
      endsAt,
      location: view.location,
      description: view.notes,
    }
    return (
      <Shell label="Settled">
        <Card className="p-5 text-center">
          <Check size={22} className="mx-auto mb-2 text-emerald-600" />
          <SubTitle className="mb-[4px]">{view.title}</SubTitle>
          <p className="font-display text-[15px] font-semibold text-ink">{formatDayLong(startsAt)}</p>
          <p className="text-[12.5px] text-sec">
            {formatTime(start)} to {formatTime(new Date(endsAt))}{' '}
            {zoneAbbreviation(start, currentZone())}
          </p>
          {view.location && (
            <p className="mt-2 inline-flex items-center justify-center gap-[5px] text-[12.5px] text-ink">
              <MapPin size={14} className="shrink-0 text-vio" />
              {view.location}
            </p>
          )}
          {view.notes && <p className="mt-2 text-[12.5px] text-sec">{view.notes}</p>}
          <p className="mb-4 mt-3 text-[12px] text-mut">That is the one. Nothing else to do here.</p>

          <a href={googleCalendarUrl(event)} target="_blank" rel="noreferrer" className={SECONDARY}>
            <CalendarPlus size={14} />
            Add to Google Calendar
          </a>
          <button
            type="button"
            onClick={() => downloadIcs(icsName(view.title), buildIcs(event))}
            className={cx(SECONDARY, 'mt-2')}
          >
            <Download size={14} />
            Download for your calendar
          </button>

          {view.inviteSent && (
            <p className="mt-3 text-[11px] text-mut">
              {view.yourEmail
                ? `A calendar invite is on its way to ${view.yourEmail}.`
                : 'If you left an email, a calendar invite is on its way.'}
            </p>
          )}
        </Card>
      </Shell>
    )
  }

  if (phase === 'passed') {
    return (
      <Shell label="Private to this group">
        <Card className="p-5 text-center">
          <SubTitle className="mb-[6px]">{view.title}</SubTitle>
          {view.happenByMs !== null && (
            <p className="text-[12.5px] text-sec">
              No time was picked before {deadlineDay(view.happenByMs)}.
            </p>
          )}
          <p className="mt-[3px] text-[12.5px] text-sec">
            Ask {view.hostName} if this is still happening.
          </p>
        </Card>
      </Shell>
    )
  }

  const visibleDays = allDays ? dayGroups : dayGroups.slice(0, VISIBLE_DAYS)
  const canSaveDays = Boolean(name.trim()) && pickedDays.length > 0

  return (
    <Shell label="Private to this group">
      <SubTitle className="mb-[2px]">{view.title}</SubTitle>
      <p className="text-[12.5px] text-sec">
        {view.hostName} is finding a time that works for everyone.
      </p>
      <p className="mb-4 mt-[5px] flex flex-wrap items-center gap-[6px] text-[12px] text-mut">
        <span>
          Takes about {formatDuration(view.durationMinutes)}, times in{' '}
          {zoneAbbreviation(new Date(), currentZone())}.
        </span>
        {phase === 'open' && view.respondByMs !== null && (
          <Chip tone="vio">Answers close {deadlineDay(view.respondByMs)}</Chip>
        )}
      </p>

      {phase === 'closed' ? (
        <Card className="mb-4 p-3">
          <p className="text-[12.5px] text-sec">
            Answers are closed. {view.hostName} picks the time next.
          </p>
        </Card>
      ) : joined && !editing ? (
        <Card className="mb-4 p-3">
          <div className="flex items-center justify-between gap-2">
            <p className="text-[12.5px] text-ink">You are in as {mine?.name}.</p>
            <button
              type="button"
              onClick={reopenAnswer}
              className="shrink-0 text-[12.5px] font-medium text-vio transition hover:opacity-70"
            >
              Change my answer
            </button>
          </div>
        </Card>
      ) : (
        <Card className="mb-4 p-4">
          <p className="mb-2 text-[12.5px] text-sec">Who are you?</p>
          <Input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Your name"
            aria-label="Your name"
            className="mb-2"
          />
          <Input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="Email, optional"
            aria-label="Email, optional"
          />
          <p className="mb-3 mt-[5px] text-[11px] text-mut">
            For the calendar invite when a time is picked. Nobody else sees it.
          </p>

          {googleConfigured && (
            <>
              <button
                type="button"
                disabled={busy || !name.trim()}
                onClick={() => void joinWithCalendar()}
                className={PRIMARY}
              >
                <CalendarCheck size={15} />
                {busy ? 'Reading your calendar' : 'Add my calendar'}
              </button>
              <p className="mb-3 mt-2 text-[11px] text-mut">
                One read, nothing stored. It sees when you are busy, never what you are doing, and
                the others only ever see your free time.
              </p>
            </>
          )}

          <button
            type="button"
            aria-expanded={handPicking}
            onClick={() => setHandPicking((open) => !open)}
            className={SECONDARY}
          >
            Pick days by hand
          </button>

          {handPicking && (
            <div className="mt-3">
              {dayGroups.length === 0 ? (
                <p className="text-[12px] text-mut">
                  There are no days left to pick. Ask {view.hostName} to open more.
                </p>
              ) : (
                <>
                  <p className="mb-2 text-[12px] text-sec">Tap every day that could work.</p>
                  {visibleDays.map((group) => {
                    const chosen = pickedDays.includes(group.dayKey)
                    return (
                      <button
                        key={group.dayKey}
                        type="button"
                        aria-pressed={chosen}
                        onClick={() =>
                          setPickedDays((days) =>
                            chosen ? days.filter((d) => d !== group.dayKey) : [...days, group.dayKey],
                          )
                        }
                        className={cx(
                          'hairline mb-[6px] flex w-full items-center justify-between gap-2 rounded-[9px] border px-[11px] py-[9px] text-left transition',
                          chosen
                            ? 'border-vio bg-viot text-vio'
                            : 'border-line bg-surface text-ink hover:border-vio',
                        )}
                      >
                        <span className="shrink-0 text-[13px] font-medium">
                          {dayLabelFormat.format(new Date(group.dayStartMs))}
                        </span>
                        <span
                          className={cx(
                            'min-w-0 text-right text-[11.5px]',
                            chosen ? 'text-vio' : 'text-mut',
                          )}
                        >
                          {group.intervals
                            .map((w) => `${formatTime(new Date(w.start))} to ${formatTime(new Date(w.end))}`)
                            .join(', ')}
                        </span>
                      </button>
                    )
                  })}
                  {!allDays && dayGroups.length > VISIBLE_DAYS && (
                    <button
                      type="button"
                      onClick={() => setAllDays(true)}
                      className="mb-1 text-[12.5px] font-medium text-vio transition hover:opacity-70"
                    >
                      Show more days
                    </button>
                  )}
                  <button
                    type="button"
                    disabled={busy || !canSaveDays}
                    onClick={() => void join(freeFromDays(pickedDays, dayGroups), 'manual')}
                    className={cx(PRIMARY, 'mt-2')}
                  >
                    {busy ? 'Saving' : 'Save my days'}
                  </button>
                </>
              )}
            </div>
          )}
        </Card>
      )}

      <Card className="mb-4 p-3">
        <div className="mb-1 flex items-center gap-[6px]">
          <Users size={14} className="text-vio" />
          <p className="text-[12.5px] font-medium text-ink">
            {view.participants.length === 0 ? 'Nobody yet' : `${view.participants.length} in so far`}
          </p>
        </div>
        <p className="text-[12px] text-sec">
          {view.participants.map((p) => p.name).join(', ') || 'Be the first.'}
        </p>
      </Card>

      {options.length === 0 ? (
        <Card className="p-5 text-center">
          <p className="text-[12.5px] text-sec">
            {view.participants.length === 0
              ? 'Once people say when they are free, the best times show up here.'
              : 'No stretch long enough works for anyone yet. More answers will help.'}
          </p>
        </Card>
      ) : (
        options.map((option) => {
          const key = String(option.start)
          const voters = view.votes[key] ?? []
          const yours = Boolean(you && voters.includes(you))
          const all = option.free.length === view.participants.length
          return (
            <Card key={key} className={cx('mb-2 p-3', yours && 'ring-focus')}>
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="text-[13px] font-medium text-ink">
                    {formatDayLong(new Date(option.start).toISOString())}
                  </p>
                  <p className="text-[12.5px] text-sec">
                    {formatTime(new Date(option.start))} to {formatTime(new Date(option.end))}
                  </p>
                  <p className="mt-[3px] text-[11.5px] text-mut">
                    {all
                      ? 'Everyone can make it'
                      : `${option.free.length} of ${view.participants.length} free, ${option.busy
                          .map(nameOf)
                          .join(' and ')} cannot`}
                  </p>
                </div>
                {/* Once answers are closed the ranking is a record rather than a
                    ballot, so the tallies stay and the buttons go. */}
                {phase === 'open' && (
                  <button
                    type="button"
                    disabled={busy || !joined}
                    onClick={() => void vote(key)}
                    className={cx(
                      'hairline shrink-0 rounded-[9px] border px-[11px] py-[6px] text-[12px] font-medium transition disabled:opacity-50',
                      yours
                        ? 'border-vio bg-viot text-vio'
                        : 'border-line bg-surface text-sec hover:text-ink',
                    )}
                  >
                    {yours ? 'Your pick' : 'Pick this'}
                  </button>
                )}
              </div>
              {voters.length > 0 && (
                <p className="mt-2 border-0 border-t border-hair pt-2 text-[11.5px] text-mut">
                  {voters.length} {voters.length === 1 ? 'vote' : 'votes'}:{' '}
                  {voters.map(nameOf).join(', ')}
                </p>
              )}
            </Card>
          )
        })
      )}

      {note && <p className="mt-3 text-center text-[12px] text-rose-600">{note}</p>}
      <p className="mt-5 text-center text-[11px] text-mut">
        {view.expiresAt
          ? `This link stops working ${formatDayLong(view.expiresAt)}.`
          : 'This link is private to whoever has it.'}
      </p>
    </Shell>
  )
}
