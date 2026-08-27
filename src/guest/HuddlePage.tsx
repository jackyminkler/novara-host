import { useMemo, useState, type ComponentType, type ReactNode } from 'react'
import { CalendarCheck, Check, Users } from 'lucide-react'
import { submitGuestAction } from './guestClient'
import { isHuddleView, type HuddleView } from './guestTypes'
import { Card, SubTitle, cx } from '../ui/primitives'
import { Input } from '../ui/form'
import { formatDayLong, formatTime } from '../lib/dates'
import { suggest, type Participant } from '../lib/availability'
import { currentZone, zoneAbbreviation } from '../lib/availability'
import { googleConfigured } from '../lib/googleIdentity'

// One link, everyone on it, alive for as long as the host set. Everybody adds
// their calendar, the page ranks the times that work for the most people, and
// the group votes while they are still together.
//
// Suggestions are computed here rather than on the server. Every participant's
// free time is already in the view, so ranking locally avoids a second copy of
// the algorithm in the functions build root, which is exactly how two copies
// drift apart.

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
  const [busy, setBusy] = useState(false)
  const [note, setNote] = useState<string | null>(null)

  const you = view.you
  const joined = Boolean(you && view.participants.some((p) => p.id === you))

  const options = useMemo(() => {
    const participants: Participant[] = view.participants.map((p) => ({
      id: p.id,
      label: p.name,
      free: p.free.map((w) => ({ start: w.s, end: w.e })),
    }))
    if (participants.length === 0) return []
    // The organizer's hours, already absolute. Null means they set none, which
    // is unbounded rather than empty. The deadline and now bounds land here in
    // Phase D, through clipWindows.
    const within = view.allowed?.map((w) => ({ start: w.s, end: w.e }))
    return suggest(participants, {
      durationMinutes: view.durationMinutes,
      limit: 6,
      within,
    })
  }, [view.participants, view.durationMinutes, view.allowed])

  const nameOf = (id: string) => view.participants.find((p) => p.id === id)?.name ?? 'Someone'

  async function send(action: 'join_huddle' | 'cast_vote', payload: Record<string, unknown>) {
    setBusy(true)
    setNote(null)
    try {
      const next = await submitGuestAction(token, action, { ...payload, you })
      if (isHuddleView(next)) setView(next)
    } catch {
      setNote('That did not go through. Try again.')
    } finally {
      setBusy(false)
    }
  }

  async function joinWithCalendar() {
    if (!name.trim()) return
    setBusy(true)
    setNote(null)
    try {
      const { checkCalendar } = await import('./guestCalendar')
      const from = new Date()
      const to = new Date(from.getFullYear(), from.getMonth(), from.getDate() + view.horizonDays)
      const { free } = await checkCalendar(from, to)
      await send('join_huddle', {
        name: name.trim(),
        free: free.map((w) => ({ s: w.start, e: w.end })),
      })
    } catch (err) {
      const reason = (err as { reason?: string })?.reason
      setNote(
        reason === 'popup_blocked'
          ? 'Your browser blocked the Google window. Allow popups, then try again.'
          : reason === 'not_configured'
            ? 'Calendar checking is not switched on for this link.'
            : 'Could not read your calendar. You can still join without it.',
      )
      setBusy(false)
    }
  }

  if (view.settledStartsAt) {
    return (
      <Shell label="Settled">
        <Card className="p-5 text-center">
          <Check size={22} className="mx-auto mb-2 text-emerald-600" />
          <SubTitle className="mb-[4px]">{view.title}</SubTitle>
          <p className="font-display text-[15px] font-semibold text-ink">
            {formatDayLong(view.settledStartsAt)}
          </p>
          <p className="text-[12.5px] text-sec">
            {formatTime(new Date(view.settledStartsAt))} {zoneAbbreviation(new Date(view.settledStartsAt))}
          </p>
          <p className="mt-3 text-[12px] text-mut">That is the one. Nothing else to do here.</p>
        </Card>
      </Shell>
    )
  }

  return (
    <Shell label="Private to this group">
      <SubTitle className="mb-[2px]">{view.title}</SubTitle>
      <p className="mb-4 text-[12.5px] text-sec">
        Add your calendar and it finds the times most of you can make. Times shown in{' '}
        {zoneAbbreviation(new Date(), currentZone())}.
      </p>

      {!joined && (
        <Card className="mb-4 p-4">
          <p className="mb-2 text-[12.5px] text-sec">Who are you?</p>
          <Input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Your name"
            className="mb-2"
          />
          {googleConfigured ? (
            <button
              type="button"
              disabled={busy || !name.trim()}
              onClick={() => void joinWithCalendar()}
              className="accent-gradient inline-flex w-full items-center justify-center gap-[6px] rounded-[9px] px-[15px] py-[10px] text-[13.5px] font-medium text-white transition hover:opacity-90 disabled:opacity-50"
            >
              <CalendarCheck size={15} />
              {busy ? 'Reading your calendar' : 'Add my calendar'}
            </button>
          ) : (
            <p className="text-[12px] text-mut">Calendar checking is not switched on for this link.</p>
          )}
          <p className="mt-2 text-[11px] text-mut">
            One read, nothing stored. It sees when you are busy, never what you are doing, and the
            others only ever see your free time.
          </p>
        </Card>
      )}

      <Card className="mb-4 p-3">
        <div className="mb-1 flex items-center gap-[6px]">
          <Users size={14} className="text-vio" />
          <p className="text-[12.5px] font-medium text-ink">
            {view.participants.length === 0
              ? 'Nobody yet'
              : `${view.participants.length} in so far`}
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
              ? 'Once people add their calendars, the best times show up here.'
              : 'No stretch long enough works for anyone yet. More calendars will help.'}
          </p>
        </Card>
      ) : (
        options.map((option) => {
          const key = String(option.start)
          const voters = view.votes[key] ?? []
          const mine = Boolean(you && voters.includes(you))
          const all = option.free.length === view.participants.length
          return (
            <Card key={key} className={cx('mb-2 p-3', mine && 'ring-focus')}>
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
                <button
                  type="button"
                  disabled={busy || !joined}
                  onClick={() => void send('cast_vote', { slot: key })}
                  className={cx(
                    'hairline shrink-0 rounded-[9px] border px-[11px] py-[6px] text-[12px] font-medium transition disabled:opacity-50',
                    mine ? 'border-vio bg-viot text-vio' : 'border-line bg-surface text-sec hover:text-ink',
                  )}
                >
                  {mine ? 'Your pick' : 'Pick this'}
                </button>
              </div>
              {voters.length > 0 && (
                <p className="mt-2 border-0 border-t border-hair pt-2 text-[11.5px] text-mut">
                  {voters.length} {voters.length === 1 ? 'vote' : 'votes'}: {voters.map(nameOf).join(', ')}
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
