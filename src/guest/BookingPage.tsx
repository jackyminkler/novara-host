import { useMemo, useState, type ComponentType, type ReactNode } from 'react'
import { Check, Coffee, Footprints, Phone, X } from 'lucide-react'
import { submitGuestAction } from './guestClient'
import {
  isBookingView,
  type BookingKind,
  type BookingKindTemplate,
  type BookingView,
  type BookingWindow,
} from './guestTypes'
import { Card, SubTitle, cx } from '../ui/primitives'
import { Field, Input, Select, Textarea } from '../ui/form'
import { formatDayLong, formatTime, toLocalInputValue } from '../lib/dates'
import { currentZone, sameWallClock, timeInZone, zoneAbbreviation } from '../lib/availability'
import { track } from '../lib/analytics'

// F18. Mobile first at 390 px, no account, private to whoever holds the link.
//
// The friend sees open stretches, not a wall of slot buttons. That follows the
// host's model: she is open until she isn't, and how long a coffee takes is
// the visitor's call, not a property of the window.

const KIND_ICON: Record<BookingKind, typeof Coffee> = {
  coffee: Coffee,
  run: Footprints,
  call: Phone,
}

const HALF_HOUR = 1800000

function suggestions(window: BookingWindow, minutes: number): number[] {
  const out: number[] = []
  let start = Math.ceil(window.s / HALF_HOUR) * HALF_HOUR
  while (start + minutes * 60000 <= window.e) {
    out.push(start)
    start += HALF_HOUR
  }
  return out
}

export default function BookingPage({
  token,
  initial,
  Shell,
}: {
  token: string
  initial: BookingView
  Shell: ComponentType<{ children: ReactNode; label?: string }>
}) {
  const [view, setView] = useState(initial)
  const [kind, setKind] = useState<BookingKind>(view.kinds[0]?.kind ?? 'coffee')
  const template: BookingKindTemplate | undefined =
    view.kinds.find((k) => k.kind === kind) ?? view.kinds[0]
  const [minutes, setMinutes] = useState(template?.defaultMinutes ?? 60)
  const [picked, setPicked] = useState<number | null>(null)
  const [custom, setCustom] = useState('')
  const [name, setName] = useState('')
  const [contact, setContact] = useState('')
  const [note, setNote] = useState('')
  const [saving, setSaving] = useState(false)
  const [failed, setFailed] = useState<string | null>(null)

  const days = useMemo(() => {
    const groups = new Map<string, BookingWindow[]>()
    for (const w of view.windows) {
      if (w.e - w.s < minutes * 60000) continue
      const d = new Date(w.s)
      const key = `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`
      groups.set(key, [...(groups.get(key) ?? []), w])
    }
    return [...groups.values()]
  }, [view.windows, minutes])

  function chooseKind(next: BookingKind) {
    setKind(next)
    const t = view.kinds.find((k) => k.kind === next)
    if (t) setMinutes(t.defaultMinutes)
    setPicked(null)
  }

  async function send(action: 'book_slot' | 'cancel_booking', payload: Record<string, unknown>) {
    setSaving(true)
    setFailed(null)
    try {
      const next = await submitGuestAction(token, action, payload)
      if (isBookingView(next)) setView(next)
      return next
    } catch {
      setFailed('That did not go through. Try again.')
      return null
    } finally {
      setSaving(false)
    }
  }

  async function confirm() {
    if (picked === null || !name.trim()) return
    const before = view.mine.length
    const next = await send('book_slot', {
      kind,
      startsAt: new Date(picked).toISOString(),
      durationMinutes: minutes,
      friendName: name.trim(),
      contact: contact.trim(),
      note: note.trim(),
    })
    // The server re-checks the time, so a booking can come back refused if
    // someone took it first. Say so instead of pretending it worked.
    if (next && isBookingView(next) && next.mine.length === before) {
      setFailed('That time was taken while you were deciding. Pick another and it will hold.')
      return
    }
    track('hp_booking_created', { kind })
    setPicked(null)
    setCustom('')
    setName('')
    setContact('')
    setNote('')
  }

  if (picked !== null) {
    const Icon = KIND_ICON[kind]
    return (
      <Shell label="Private to you">
        <button
          type="button"
          onClick={() => setPicked(null)}
          className="mb-3 text-[12.5px] font-medium text-vio transition hover:opacity-70"
        >
          Back to open times
        </button>
        <Card className="p-4">
          <div className="mb-1 flex items-center gap-[7px]">
            <Icon size={15} className="text-vio" />
            <SubTitle>{template?.label ?? 'Meet'}</SubTitle>
          </div>
          <p className="font-display text-[15px] font-semibold text-ink">
            {formatDayLong(new Date(picked).toISOString())}
          </p>
          <p className="mb-1 text-[12.5px] text-sec">
            {formatTime(new Date(picked))} to {formatTime(new Date(picked + minutes * 60000))}{' '}
            {zoneAbbreviation(new Date(picked), currentZone())}
          </p>
          {/* Both clocks on the confirmation screen, which is the last moment
              anyone can catch a three hour mistake. */}
          {!sameWallClock(view.hostZone, currentZone()) && (
            <p className="mb-4 text-[12px] text-mut">
              That is {timeInZone(new Date(picked), view.hostZone)}{' '}
              {zoneAbbreviation(new Date(picked), view.hostZone)} for them.
            </p>
          )}

          <Field label="Your name">
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="So they know who is coming" />
          </Field>
          <Field label="How to reach you">
            <Input
              value={contact}
              onChange={(e) => setContact(e.target.value)}
              placeholder="Phone, email, or a handle"
            />
          </Field>
          <Field label="Anything to add">
            <Textarea rows={3} value={note} onChange={(e) => setNote(e.target.value)} placeholder="Optional" />
          </Field>

          {failed && <p className="mb-2 text-[12.5px] text-rose-600">{failed}</p>}

          <button
            type="button"
            disabled={saving || !name.trim()}
            onClick={() => void confirm()}
            className="accent-gradient w-full rounded-[9px] px-[15px] py-[10px] text-[13.5px] font-medium text-white transition hover:opacity-90 disabled:opacity-50"
          >
            {saving ? 'Booking' : 'Book this time'}
          </button>
        </Card>
      </Shell>
    )
  }

  return (
    <Shell label="Private to you">
      <SubTitle className="mb-[2px]">Find a time with {view.hostName}</SubTitle>
      <p className="mb-4 text-[12.5px] text-sec">
        These are the stretches that are open. Pick anything inside one.
        {!sameWallClock(view.hostZone, currentZone()) && (
          <>
            {' '}
            Shown in your time, {zoneAbbreviation(new Date(), currentZone())}.
          </>
        )}
      </p>

      {view.mine.length > 0 && (
        <Card className="mb-4 p-3">
          <p className="mb-2 text-[11px] font-medium uppercase tracking-wide text-mut">You are booked</p>
          {view.mine.map((b) => (
            <div key={b.id} className="flex items-center gap-2 py-[3px]">
              <Check size={14} className="text-emerald-600" />
              <span className="flex-1 text-[12.5px] text-ink">
                {formatDayLong(b.startsAt)} at {formatTime(new Date(b.startsAt))}, {b.durationMinutes} min
              </span>
              <button
                type="button"
                disabled={saving}
                onClick={() => void send('cancel_booking', { bookingId: b.id })}
                className="inline-flex items-center gap-1 text-[12px] text-mut transition hover:text-ink disabled:opacity-50"
              >
                <X size={13} />
                Cancel
              </button>
            </div>
          ))}
        </Card>
      )}

      <div className="mb-2 flex gap-[6px]">
        {view.kinds.map((k) => {
          const Icon = KIND_ICON[k.kind]
          return (
            <button
              key={k.kind}
              type="button"
              onClick={() => chooseKind(k.kind)}
              className={cx(
                'hairline inline-flex flex-1 items-center justify-center gap-[5px] rounded-[9px] border px-2 py-[7px] text-[12.5px] font-medium transition',
                kind === k.kind
                  ? 'border-vio bg-viot text-vio'
                  : 'border-line bg-surface text-sec hover:text-ink',
              )}
            >
              <Icon size={14} />
              {k.label}
            </button>
          )
        })}
      </div>

      <div className="mb-4 flex items-center gap-2">
        <span className="text-[12.5px] text-sec">How long</span>
        <Select
          className="w-[120px]"
          value={String(minutes)}
          onChange={(e) => {
            setMinutes(Number(e.target.value))
            setPicked(null)
          }}
        >
          {(template?.choices ?? [30, 60]).map((c) => (
            <option key={c} value={c}>
              {c} min
            </option>
          ))}
        </Select>
      </div>

      {days.length === 0 ? (
        <Card className="p-5 text-center">
          <p className="text-[12.5px] text-sec">
            Nothing open long enough for {minutes} minutes right now. Try a shorter one, or check
            back in a few days.
          </p>
        </Card>
      ) : (
        days.map((windows) => (
          <div key={windows[0]!.s} className="mb-4">
            <p className="mb-[6px] text-[11px] font-medium uppercase tracking-wide text-mut">
              {formatDayLong(new Date(windows[0]!.s).toISOString())}
            </p>
            {windows.map((w) => (
              <div key={w.s} className="mb-2">
                <p className="mb-[5px] text-[12.5px] text-sec">
                  Open {formatTime(new Date(w.s))} to {formatTime(new Date(w.e))}
                </p>
                <div className="flex flex-wrap gap-[6px]">
                  {suggestions(w, minutes).slice(0, 6).map((start) => (
                    <button
                      key={start}
                      type="button"
                      onClick={() => setPicked(start)}
                      className="hairline rounded-[9px] border border-line bg-surface px-[11px] py-2 text-[12.5px] font-medium text-ink transition hover:border-vio hover:text-vio"
                    >
                      {formatTime(new Date(start))}
                    </button>
                  ))}
                  {/* Any minute inside the window is bookable, so the suggested
                      times above are a shortcut rather than the whole offer. */}
                  <input
                    type="datetime-local"
                    className="hairline rounded-[9px] border border-line bg-surface px-[9px] py-2 text-[12.5px] text-sec"
                    min={toLocalInputValue(w.s)}
                    max={toLocalInputValue(w.e - minutes * 60000)}
                    value={custom}
                    onChange={(e) => {
                      setCustom(e.target.value)
                      const at = new Date(e.target.value).getTime()
                      if (!Number.isNaN(at) && at >= w.s && at + minutes * 60000 <= w.e) setPicked(at)
                    }}
                  />
                </div>
              </div>
            ))}
          </div>
        ))
      )}

      <p className="mt-5 text-center text-[11px] text-mut">
        This page is private to you. It shows open times only, never a calendar.
      </p>
      {failed && <p className="mt-2 text-center text-[12px] text-rose-600">{failed}</p>}
    </Shell>
  )
}
