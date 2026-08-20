import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { ChevronLeft, ChevronRight, Plane, Plus, Sun } from 'lucide-react'
import { Page } from './Page'
import { useAsync, useMutation } from '../useApi'
import { Button, Card, Chip, ErrorState, Loading, OutlineButton, PageTitle, cx } from '../../ui/primitives'
import { Modal } from '../../ui/Modal'
import { Field, Input } from '../../ui/form'
import type { AvailabilityBlock, CitywideMoment, EventBundle } from '../../data/types'
import { addDays, formatMonthTitle, startOfDay, toDateKey } from '../../lib/dates'

// Canvas template. Proposed date options are dashed first-class citizens
// carrying response counts; confirmed events are solid; away blocks are quiet
// bands; citywide moments sit above the grid and dot their days, so planning
// can be prioritised before anything is concrete.

interface DayMark {
  kind: 'confirmed' | 'proposed'
  label: string
  eventId: string
}

function buildMarks(bundles: EventBundle[]): Map<string, DayMark[]> {
  const marks = new Map<string, DayMark[]>()
  const push = (key: string, mark: DayMark) => {
    const list = marks.get(key) ?? []
    list.push(mark)
    marks.set(key, list)
  }

  for (const { event, parties } of bundles) {
    for (const option of event.dateOptions) {
      const key = toDateKey(new Date(option.startsAt))
      if (event.confirmedDateOptionId === option.id) {
        push(key, { kind: 'confirmed', label: event.title, eventId: event.id })
      } else if (!event.confirmedDateOptionId) {
        const yes = parties.filter((p) => p.dateResponses[option.id]?.value === 'yes').length
        // A short title plus the count is all that fits, and all that matters.
        const short = event.title.split(' ')[0]
        push(key, {
          kind: 'proposed',
          label: parties.length > 0 ? `${short} ${yes}/${parties.length}` : short,
          eventId: event.id,
        })
      }
    }
  }
  return marks
}

function monthGrid(month: Date): Date[] {
  const first = new Date(month.getFullYear(), month.getMonth(), 1)
  const start = addDays(first, -first.getDay())
  return Array.from({ length: 42 }, (_, i) => addDays(start, i))
}

function coversDay(range: { startDate: string; endDate: string }, key: string): boolean {
  return key >= range.startDate && key <= range.endDate
}

export default function CalendarPage() {
  const [month, setMonth] = useState(() => startOfDay(new Date()))
  const [dialog, setDialog] = useState<'away' | 'moment' | null>(null)

  const { data, error, loading, reload } = useAsync(async (api) => {
    const events = await api.listEvents()
    const bundles = await Promise.all(events.map((e) => api.getEventBundle(e.id)))
    const [availability, moments] = await Promise.all([api.listAvailability(), api.listMoments()])
    return {
      bundles: bundles.filter((b): b is EventBundle => b !== null),
      availability,
      moments,
    }
  }, [])

  const marks = useMemo(() => buildMarks(data?.bundles ?? []), [data])
  const days = useMemo(() => monthGrid(month), [month])
  const todayKey = toDateKey(new Date())

  const shiftMonth = (delta: number) =>
    setMonth((m) => new Date(m.getFullYear(), m.getMonth() + delta, 1))

  // Moments overlapping the visible month, so the banner is never stale.
  const monthStart = toDateKey(new Date(month.getFullYear(), month.getMonth(), 1))
  const monthEnd = toDateKey(new Date(month.getFullYear(), month.getMonth() + 1, 0))
  const visibleMoments = (data?.moments ?? []).filter(
    (m) => m.endDate >= monthStart && m.startDate <= monthEnd,
  )

  return (
    <Page>
      <div className="mb-[10px] flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-[10px]">
          <PageTitle className="text-[19px]">{formatMonthTitle(month)}</PageTitle>
          <button onClick={() => shiftMonth(-1)} aria-label="Previous month" className="text-mut hover:text-ink">
            <ChevronLeft size={16} />
          </button>
          <button onClick={() => shiftMonth(1)} aria-label="Next month" className="text-mut hover:text-ink">
            <ChevronRight size={16} />
          </button>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <OutlineButton onClick={() => setDialog('away')}>
            <Plane size={13} />
            Add away time
          </OutlineButton>
          <OutlineButton onClick={() => setDialog('moment')}>
            <Sun size={13} />
            Add a moment
          </OutlineButton>
          <Link to="/app/events/new">
            <Button>
              <Plus size={13} />
              New event
            </Button>
          </Link>
        </div>
      </div>

      {loading && <Loading label="Loading the calendar" />}
      {error && <ErrorState message={`The calendar didn't load (${error}).`} onRetry={reload} />}

      {data && (
        <>
          {visibleMoments.length > 0 && (
            <div className="mb-[10px] flex flex-wrap gap-2">
              {visibleMoments.map((moment) => (
                <Chip key={moment.id} tone="amb" className="border border-ambline bg-ambfill">
                  <Sun size={12} />
                  {moment.name}, {momentRange(moment)}
                </Chip>
              ))}
            </div>
          )}

          <Card className="overflow-hidden !p-0">
            <div className="grid grid-cols-7">
              {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((day) => (
                <div key={day} className="px-[7px] py-[6px] text-[11px] text-mut">
                  {day}
                </div>
              ))}
            </div>
            <div className="grid grid-cols-7">
              {days.map((day) => {
                const key = toDateKey(day)
                const outside = day.getMonth() !== month.getMonth()
                const away = data.availability.find((b) => b.kind === 'away' && coversDay(b, key))
                const open = data.availability.find((b) => b.kind === 'open' && coversDay(b, key))
                const moment = data.moments.find((m) => coversDay(m, key))
                const dayMarks = marks.get(key) ?? []

                return (
                  <div
                    key={key}
                    className={cx(
                      'min-h-[62px] border-t border-hair px-[7px] py-[5px] text-[11px]',
                      outside ? 'text-faint' : 'text-body',
                      open && !outside && 'bg-viots/60',
                    )}
                  >
                    <span
                      className={cx(
                        key === todayKey && 'rounded-full bg-vio px-[5px] py-[1px] font-medium text-white',
                      )}
                    >
                      {day.getDate()}
                    </span>

                    {moment && !outside && (
                      <span className="mt-[3px] block text-[11px] text-ambk">
                        {key === moment.startDate ? `• ${moment.name}` : '•'}
                      </span>
                    )}

                    {away && !outside && (
                      <span className="mt-[3px] block rounded-[5px] bg-hair px-1 py-[1px] text-[11px] text-sec">
                        {key === away.startDate ? away.label || 'Away' : 'Away'}
                      </span>
                    )}

                    {dayMarks.map((mark, i) => (
                      <Link
                        key={i}
                        to={`/app/events/${mark.eventId}`}
                        className={cx(
                          'mt-[3px] block truncate rounded-[5px] px-1 py-[1px] text-[11px] font-medium',
                          mark.kind === 'confirmed'
                            ? 'bg-vio text-white'
                            : 'border border-dashed border-viodash bg-viots text-vio',
                        )}
                      >
                        {mark.label}
                      </Link>
                    ))}
                  </div>
                )
              })}
            </div>
          </Card>

          <div className="mt-[10px] flex flex-wrap items-center gap-4 text-[11px] text-sec">
            <span className="flex items-center gap-[6px]">
              <span className="inline-block size-[10px] rounded-[3px] bg-vio" /> Confirmed
            </span>
            <span className="flex items-center gap-[6px]">
              <span className="inline-block size-[10px] rounded-[3px] border border-dashed border-viodash bg-viots" />{' '}
              Proposed, responses in
            </span>
            <span className="flex items-center gap-[6px]">
              <span className="inline-block size-[10px] rounded-[3px] bg-hair" /> Away
            </span>
            <span className="flex items-center gap-[6px]">
              <span className="text-ambk">&bull;</span> Citywide moment
            </span>
          </div>
        </>
      )}

      {dialog === 'away' && <AwayDialog onClose={() => setDialog(null)} onSaved={reload} />}
      {dialog === 'moment' && <MomentDialog onClose={() => setDialog(null)} onSaved={reload} />}
    </Page>
  )
}

function momentRange(moment: CitywideMoment): string {
  const opts: Intl.DateTimeFormatOptions = { month: 'short', day: 'numeric' }
  const from = new Date(`${moment.startDate}T12:00:00`).toLocaleDateString(undefined, opts)
  const to = new Date(`${moment.endDate}T12:00:00`).toLocaleDateString(undefined, opts)
  return `${from} to ${to}`
}

function AwayDialog({ onClose, onSaved }: { onClose: () => void; onSaved: () => void }) {
  const [label, setLabel] = useState('Away')
  const [kind, setKind] = useState<AvailabilityBlock['kind']>('away')
  const [startDate, setStart] = useState(toDateKey(new Date()))
  const [endDate, setEnd] = useState(toDateKey(new Date()))
  const { mutate, busy } = useMutation()

  const save = () =>
    void mutate(async (api) => {
      await api.createAvailability({ kind, label: label.trim(), startDate, endDate })
      onSaved()
      onClose()
    })

  return (
    <Modal title="Add time to the calendar" onClose={onClose} width="max-w-[420px]">
      <div className="mb-3 flex gap-2">
        <button type="button" onClick={() => setKind('away')}>
          <Chip tone={kind === 'away' ? 'vio' : 'gray'}>Away</Chip>
        </button>
        <button type="button" onClick={() => setKind('open')}>
          <Chip tone={kind === 'open' ? 'vio' : 'gray'}>Open for events</Chip>
        </button>
      </div>
      <Field label="Label" htmlFor="away-label">
        <Input id="away-label" value={label} onChange={(e) => setLabel(e.target.value)} placeholder="Away" />
      </Field>
      <div className="grid gap-2 sm:grid-cols-2">
        <Field label="From" htmlFor="away-from">
          <Input id="away-from" type="date" value={startDate} onChange={(e) => setStart(e.target.value)} />
        </Field>
        <Field label="To" htmlFor="away-to">
          <Input id="away-to" type="date" value={endDate} onChange={(e) => setEnd(e.target.value)} />
        </Field>
      </div>
      <Button onClick={save} disabled={busy || endDate < startDate}>
        {busy ? 'Saving' : 'Save'}
      </Button>
    </Modal>
  )
}

function MomentDialog({ onClose, onSaved }: { onClose: () => void; onSaved: () => void }) {
  const [name, setName] = useState('')
  const [startDate, setStart] = useState(toDateKey(new Date()))
  const [endDate, setEnd] = useState(toDateKey(new Date()))
  const { mutate, busy } = useMutation()

  const save = () =>
    void mutate(async (api) => {
      await api.createMoment({ name: name.trim(), startDate, endDate })
      onSaved()
      onClose()
    })

  return (
    <Modal title="Add a citywide moment" onClose={onClose} width="max-w-[420px]">
      <Field
        label="Name"
        htmlFor="moment-name"
        hint="Big weeks worth planning around, entered by hand. There is no external calendar sync in M0."
      >
        <Input
          id="moment-name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Tech week, a festival, a marathon"
          autoFocus
        />
      </Field>
      <div className="grid gap-2 sm:grid-cols-2">
        <Field label="From" htmlFor="moment-from">
          <Input id="moment-from" type="date" value={startDate} onChange={(e) => setStart(e.target.value)} />
        </Field>
        <Field label="To" htmlFor="moment-to">
          <Input id="moment-to" type="date" value={endDate} onChange={(e) => setEnd(e.target.value)} />
        </Field>
      </div>
      <Button onClick={save} disabled={busy || !name.trim() || endDate < startDate}>
        {busy ? 'Saving' : 'Save'}
      </Button>
    </Modal>
  )
}
