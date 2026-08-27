import { useCallback, useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import { Check, X } from 'lucide-react'
import { fetchGuestView, submitGuestAction, GuestError } from './guestClient'
import type { BookingView, GuestView } from './guestTypes'
import { isBookingView } from './guestTypes'
import BookingPage from './BookingPage'
import { Card, Chip, Eyebrow, SubTitle, cx } from '../ui/primitives'
import { formatClock, formatLong, formatShort } from '../lib/dates'
import { track } from '../lib/analytics'

// One page, mobile first at 390 px. No account, no chrome, private to the
// recipient, every action two taps plus confirmation. This is the product's
// first impression for every partner, so it stays dependency light.

export default function GuestPage() {
  const { token = '' } = useParams()
  const [view, setView] = useState<GuestView | null>(null)
  // A booking link is a different product on the same token mechanism, so it
  // gets its own page rather than another branch inside this one.
  const [booking, setBooking] = useState<BookingView | null>(null)
  const [state, setState] = useState<'loading' | 'ready' | 'invalid' | 'error'>('loading')

  useEffect(() => {
    let cancelled = false
    fetchGuestView(token)
      .then((next) => {
        if (cancelled) return
        if (isBookingView(next)) {
          setBooking(next)
        } else {
          setView(next)
        }
        setState('ready')
        track('hp_guest_view_opened', {
          role: isBookingView(next) ? 'friend' : next.subject.roleLabel,
          scope: next.scope,
        })
      })
      .catch((err: unknown) => {
        if (cancelled) return
        setState(err instanceof GuestError && err.reason === 'invalid' ? 'invalid' : 'error')
      })
    return () => {
      cancelled = true
    }
  }, [token])

  if (state === 'loading') {
    return (
      <Shell>
        <div className="accent-gradient mx-auto mt-16 h-1.5 w-24 animate-pulse rounded-full" />
      </Shell>
    )
  }

  if (state === 'invalid') {
    return (
      <Shell>
        <div className="px-5 py-10 text-center">
          <SubTitle className="mb-[6px]">This link is no longer active</SubTitle>
          <p className="text-[12.5px] text-sec">
            If you were expecting event details, ask your host for a fresh link. Nothing is lost on
            their side.
          </p>
        </div>
      </Shell>
    )
  }

  if (booking) {
    return <BookingPage token={token} initial={booking} Shell={Shell} />
  }

  if (state === 'error' || !view) {
    return (
      <Shell>
        <div className="px-5 py-10 text-center">
          <SubTitle className="mb-[6px]">This didn't load</SubTitle>
          <p className="text-[12.5px] text-sec">It might be the connection. Try opening the link again.</p>
        </div>
      </Shell>
    )
  }

  return (
    <Shell label={view.scope === 'recap' ? 'Recap' : undefined}>
      {view.scope === 'recap' ? (
        <RecapView view={view} />
      ) : (
        <PartyView view={view} token={token} onUpdate={setView} />
      )}
    </Shell>
  )
}

function Shell({ children, label }: { children: React.ReactNode; label?: string }) {
  return (
    <div className="min-h-screen bg-field">
      <div className="mx-auto w-full max-w-[430px]">
        <header className="hairline flex items-center gap-[6px] border-0 border-b border-line bg-surface px-4 py-[10px]">
          <span className="font-display text-sm font-semibold">Novara</span>
          <span className="rounded-full bg-viot px-[7px] py-[2px] text-[11px] font-medium text-vio">
            hosts
          </span>
          {label && <span className="ml-auto text-[11px] text-mut">{label}</span>}
        </header>
        <main className="px-4 py-4">{children}</main>
      </div>
    </div>
  )
}

function PartyView({
  view,
  token,
  onUpdate,
}: {
  view: GuestView
  token: string
  onUpdate: (next: GuestView) => void
}) {
  const [responses, setResponses] = useState<Record<string, 'yes' | 'no' | 'maybe'>>(() =>
    Object.fromEntries(
      view.dateOptions.filter((o) => o.response).map((o) => [o.id, o.response as 'yes' | 'no' | 'maybe']),
    ),
  )
  const [note, setNote] = useState(view.subject.constraintNote)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [scheduleTab, setScheduleTab] = useState<'mine' | 'all'>('mine')

  const submit = useCallback(
    async (action: Parameters<typeof submitGuestAction>[1], payload: Record<string, unknown>) => {
      setSaving(true)
      try {
        const next = await submitGuestAction(token, action, payload)
        // Event-scoped pages only ever get event-scoped payloads back.
        if (!isBookingView(next)) onUpdate(next)
        setSaved(true)
        setTimeout(() => setSaved(false), 2500)
      } finally {
        setSaving(false)
      }
    },
    [token, onUpdate],
  )

  const saveDates = () => {
    void submit('respond_dates', { responses, constraintNote: note.trim() })
    track('hp_date_response_submitted', { source: 'link' })
  }

  const toggleTask = (taskId: string, status: 'open' | 'done') => {
    void submit('update_task', { taskId, status })
    track('hp_task_updated', { source: 'link' })
  }

  const myItems = view.runOfShow.filter((item) => item.mine)
  const schedule = scheduleTab === 'mine' ? myItems : view.runOfShow

  return (
    <>
      <SubTitle className="mb-[2px]">{view.event.title}</SubTitle>
      <p className="mb-[10px] text-xs text-sec">
        {view.event.hostName} invited {view.subject.name} as the{' '}
        {view.subject.roleLabel.toLowerCase()}.
      </p>

      {view.event.confirmedStartsAt && (
        <Card tone="violet" className="mb-[10px] !px-3 !py-[10px]">
          <Eyebrow className="mb-[2px] text-vio">Confirmed</Eyebrow>
          <p className="font-display text-[15px] font-semibold text-vio">
            {formatLong(view.event.confirmedStartsAt)}
          </p>
          {(view.event.location.name || view.event.location.meetPoint) && (
            <p className="mt-[2px] text-[11.5px] text-sec">
              {[view.event.location.name, view.event.location.meetPoint].filter(Boolean).join(', ')}
            </p>
          )}
        </Card>
      )}

      {(view.subject.terms.gives || view.subject.terms.gets) && (
        <Card className="mb-[10px] !px-3 !py-[10px]">
          {view.subject.terms.gives && (
            <div className="flex gap-2 py-[5px] text-[12.5px]">
              <span className="min-w-[52px] font-medium text-sec">Gives</span>
              <span>{view.subject.terms.gives}</span>
            </div>
          )}
          {view.subject.terms.gets && (
            <div className="flex gap-2 py-[5px] text-[12.5px]">
              <span className="min-w-[52px] font-medium text-sec">Gets</span>
              <span>{view.subject.terms.gets}</span>
            </div>
          )}
        </Card>
      )}

      {view.dateOptions.length > 0 && (
        <>
          <p className="mb-[5px] text-xs font-medium text-sec">
            Which mornings work? Tap all that apply.
          </p>
          {view.dateOptions.map((option) => {
            const answer = responses[option.id]
            return (
              <Card
                key={option.id}
                className={cx('mb-2 !px-3 !py-2', answer && 'ring-focus')}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="text-[13px] font-medium">{formatShort(option.startsAt)}</span>
                  <span className="flex gap-1">
                    {(['yes', 'maybe', 'no'] as const).map((value) => (
                      <button
                        key={value}
                        type="button"
                        aria-label={`${value} for ${formatShort(option.startsAt)}`}
                        onClick={() => setResponses((prev) => ({ ...prev, [option.id]: value }))}
                      >
                        <Chip
                          tone={
                            answer !== value
                              ? 'gray'
                              : value === 'yes'
                                ? 'grn'
                                : value === 'no'
                                  ? 'rose'
                                  : 'vio'
                          }
                        >
                          {value === 'yes' && <Check size={11} />}
                          {value === 'no' && <X size={11} />}
                          {value === 'yes' ? 'Yes' : value === 'no' ? 'No' : 'Maybe'}
                        </Chip>
                      </button>
                    ))}
                  </span>
                </div>
              </Card>
            )
          })}

          <textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            rows={2}
            placeholder="Anything we should know about these dates?"
            aria-label="Note about the dates"
            className="hairline mb-[10px] w-full rounded-lg border-[#dad5ec] bg-surface px-[11px] py-2 text-xs outline-none focus:ring-focus"
          />

          <button
            type="button"
            onClick={saveDates}
            disabled={saving || Object.keys(responses).length === 0}
            className="accent-gradient w-full rounded-[9px] py-[11px] text-[13px] font-medium text-white transition disabled:opacity-50"
          >
            {saving ? 'Saving' : saved ? 'Saved, thank you' : 'Save responses'}
          </button>
        </>
      )}

      {view.tasks.length > 0 && (
        <>
          <p className="mb-[5px] mt-4 text-xs font-medium text-sec">Your tasks</p>
          <Card className="mb-[10px] !px-3 !py-2">
            {view.tasks.map((task, index) => (
              <div
                key={task.id}
                className={cx(
                  'flex items-center justify-between gap-2 py-[5px]',
                  index > 0 && 'border-t border-hair',
                )}
              >
                <span className="text-[12.5px]">{task.title}</span>
                <button
                  type="button"
                  disabled={saving}
                  onClick={() => toggleTask(task.id, task.status === 'done' ? 'open' : 'done')}
                  aria-label={task.status === 'done' ? `Reopen ${task.title}` : `Mark ${task.title} done`}
                >
                  <Chip tone={task.status === 'done' ? 'grn' : 'gray'}>
                    {task.status === 'done' && <Check size={11} />}
                    {task.status === 'done' ? 'Done' : 'Open'}
                  </Chip>
                </button>
              </div>
            ))}
          </Card>
        </>
      )}

      {view.runOfShow.length > 0 && (
        <>
          <p className="mb-[5px] mt-4 text-xs font-medium text-sec">Run of show</p>
          <div className="mb-2 flex gap-[6px]">
            {(['mine', 'all'] as const).map((tab) => (
              <button key={tab} type="button" onClick={() => setScheduleTab(tab)}>
                <Chip tone={scheduleTab === tab ? 'vio' : 'gray'}>
                  {tab === 'mine' ? 'Your items' : 'Full schedule'}
                </Chip>
              </button>
            ))}
          </div>
          <Card className="!px-3 !py-2">
            {schedule.length === 0 && (
              <p className="py-1 text-[12.5px] text-mut">Nothing assigned to you yet.</p>
            )}
            {schedule.map((item, index) => (
              <div
                key={`${item.time}-${index}`}
                className={cx('flex items-baseline gap-3 py-[6px]', index > 0 && 'border-t border-hair')}
              >
                <b className="font-display text-[15px] font-semibold tabular-nums">{formatClock(item.time)}</b>
                <span className="flex-1 text-[13px]">{item.title}</span>
                {scheduleTab === 'all' && <span className="text-[11px] text-mut">{item.owner}</span>}
              </div>
            ))}
          </Card>
        </>
      )}

      {view.links.length > 0 && (
        <>
          <p className="mb-[5px] mt-4 text-xs font-medium text-sec">Shared links</p>
          <Card className="!px-3 !py-2">
            {view.links.map((link, index) => (
              <a
                key={link.url}
                href={link.url}
                target="_blank"
                rel="noreferrer"
                className={cx('block py-[6px] text-[12.5px] text-vio', index > 0 && 'border-t border-hair')}
              >
                {link.label}
              </a>
            ))}
          </Card>
        </>
      )}

      <p className="mt-[10px] text-center text-[11px] text-mut">
        This page is private to {view.subject.name}.
      </p>
    </>
  )
}

function RecapView({ view }: { view: GuestView }) {
  const recap = view.recap
  if (!recap) return null

  return (
    <>
      <Eyebrow className="mb-1">Recap for {view.subject.name}</Eyebrow>
      <SubTitle className="mb-[2px]">{view.event.title}</SubTitle>
      <p className="mb-3 text-xs text-sec">
        {view.event.confirmedStartsAt && formatLong(view.event.confirmedStartsAt)}
        {view.event.location.name && `, ${view.event.location.name}`}
      </p>

      {recap.goal && (
        <Card tone="violet" className="mb-[10px] !px-[14px] !py-3">
          <p className="text-xs font-medium text-vio">Your goal: {recap.goal}</p>
          {recap.outcomes[0] && (
            <p className="mt-[2px] font-display text-[20px] font-semibold text-vio">
              {recap.outcomes[0].value} {recap.outcomes[0].label.toLowerCase()}
            </p>
          )}
        </Card>
      )}

      <Card className="mb-[10px] !px-[14px] !py-3">
        <Eyebrow className="mb-[5px]">Attendance</Eyebrow>
        {recap.signups !== null && <RecapRow label="Signups">{recap.signups}</RecapRow>}
        {recap.attended !== null && <RecapRow label="Attended">{recap.attended}, host count</RecapRow>}
        <RecapRow label="Verified">{recap.verified} confirmed connections</RecapRow>
      </Card>

      {recap.outcomes.length > 0 && (
        <Card className="mb-[10px] !px-[14px] !py-3">
          <Eyebrow className="mb-[5px]">Your outcomes</Eyebrow>
          {recap.outcomes.map((outcome) => (
            <RecapRow key={outcome.label} label={outcome.label}>
              {outcome.value}
            </RecapRow>
          ))}
        </Card>
      )}

      {(recap.photosLink || recap.postsRan) && (
        <Card className="!px-[14px] !py-3">
          <Eyebrow className="mb-[5px]">Assets</Eyebrow>
          {recap.photosLink && (
            <RecapRow label="Photos">
              <a href={recap.photosLink} target="_blank" rel="noreferrer" className="text-vio">
                Open the album
              </a>
            </RecapRow>
          )}
          {recap.postsRan && <RecapRow label="Posts that ran">{recap.postsRan}</RecapRow>}
        </Card>
      )}

      <p className="mt-[10px] text-center text-[11px] text-mut">
        Prepared by {recap.hostName} in Novara hosts. Want the next one on the calendar?
      </p>
    </>
  )
}

function RecapRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex gap-2 py-[5px] text-[12.5px]">
      <span className="min-w-[110px] font-medium text-sec">{label}</span>
      <span>{children}</span>
    </div>
  )
}
