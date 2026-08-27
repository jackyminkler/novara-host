import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { CalendarPlus, Check, Copy, Link2, RefreshCw, Trash2, Unplug } from 'lucide-react'
import { Page, PageHeader } from './Page'
import { Card, Divider, EmptyState, ErrorState, Loading, SubTitle, cx } from '../../ui/primitives'
import { Field, Input, Select } from '../../ui/form'
import { useAsync, useMutation } from '../useApi'
import { useHost } from '../AuthProvider'
import { formatDayLong, formatLong, formatTime } from '../../lib/dates'
import { track } from '../../lib/analytics'
import {
  DEFAULT_HORIZON_DAYS,
  DEFAULT_KINDS,
  DEFAULT_OPEN_HOURS,
  DEFAULT_RULES,
  deriveWindows,
  parseIcs,
  spreadOf,
  type AvailabilityRules,
  type BusyEvent,
  type OpenWindow,
} from '../../lib/availability'
import type {
  AvailabilitySettings,
  Booking,
  DayHoursDoc,
  FriendLink,
  KindTemplateDoc,
} from '../../data/types'
import {
  fetchEvents,
  forgetToken,
  getAccessToken,
  googleConfigured,
  listCalendars,
  GoogleCalendarError,
  type GoogleCalendarSummary,
} from '../googleCalendar'

// F14 to F19. The whole derivation runs here in the browser: the calendar is
// read, classified, and turned into open stretches without ever being uploaded.
// Only those stretches are saved, which is why a friend link can never leak
// more than the times she is choosing to publish.

const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']

const HORIZONS = [
  { days: 30, label: '1 month' },
  { days: 90, label: '3 months' },
  { days: 180, label: '6 months' },
  { days: 365, label: '1 year' },
]

interface Loaded {
  settings: AvailabilitySettings | null
  links: FriendLink[]
  bookings: Booking[]
}

function hours(m: number): string {
  const h = Math.floor(m / 60)
  const rest = m % 60
  if (h === 0) return `${rest} min`
  return rest === 0 ? `${h} hr` : `${h} hr ${rest} min`
}

export default function AvailabilityPage() {
  const { uid } = useHost()
  const state = useAsync<Loaded>(
    async (api) => ({
      settings: await api.getAvailabilitySettings(),
      links: await api.listFriendLinks(),
      bookings: await api.listBookings(),
    }),
    [],
  )
  const { mutate, busy } = useMutation(state.reload)

  // Parsed events live only in this component. Refreshing the page loses them,
  // which is correct: the published windows are the artifact, not the calendar.
  const [events, setEvents] = useState<BusyEvent[] | null>(null)
  const [importNote, setImportNote] = useState<string | null>(null)
  const fileInput = useRef<HTMLInputElement>(null)

  const [calendars, setCalendars] = useState<GoogleCalendarSummary[] | null>(null)
  const [googleBusy, setGoogleBusy] = useState(false)
  const [googleNote, setGoogleNote] = useState<string | null>(null)
  const [needsConsent, setNeedsConsent] = useState(false)
  const silentTried = useRef(false)

  const settings = state.data?.settings ?? null
  const openHours = settings?.openHours ?? DEFAULT_OPEN_HOURS
  const kinds = settings?.kinds ?? DEFAULT_KINDS
  const bufferMinutes = settings?.bufferMinutes ?? DEFAULT_RULES.bufferMinutes
  const horizonDays = settings?.defaultHorizonDays ?? DEFAULT_HORIZON_DAYS
  const savedCalendarIds = settings?.googleCalendarIds ?? []

  const rules: AvailabilityRules = useMemo(
    () => ({ ...DEFAULT_RULES, openHours, bufferMinutes, kinds }),
    [openHours, bufferMinutes, kinds],
  )

  const windows = useMemo<OpenWindow[]>(() => {
    if (!events) return []
    const from = new Date()
    const to = new Date(from.getFullYear(), from.getMonth(), from.getDate() + horizonDays)
    return deriveWindows({
      events,
      from,
      to,
      rules,
      alsoBlocked: (state.data?.bookings ?? []).map((b) => ({
        start: new Date(b.startsAt).getTime(),
        end: new Date(b.endsAt).getTime(),
      })),
    })
  }, [events, horizonDays, rules, state.data?.bookings])

  const openMinutes = useMemo(
    () => Math.round(windows.reduce((n, w) => n + (w.end - w.start), 0) / 60000),
    [windows],
  )

  const syncGoogle = useCallback(
    async (mode: 'auto' | 'refresh' | 'connect', calendarIds?: string[]) => {
      const interactive = mode === 'connect'
      setGoogleBusy(true)
      setGoogleNote(null)
      try {
        const token = await getAccessToken(interactive)
        setNeedsConsent(false)
        const available = await listCalendars(token)
        setCalendars(available)

        const ids =
          calendarIds ??
          (savedCalendarIds.length > 0
            ? savedCalendarIds
            : available.filter((c) => c.selectedByDefault).map((c) => c.id))
        if (ids.length === 0) {
          setGoogleNote('Pick at least one calendar to read.')
          return
        }

        const from = new Date()
        const to = new Date(from.getFullYear(), from.getMonth(), from.getDate() + 365)
        const pulled = await fetchEvents(token, ids, from, to)
        setEvents(pulled)
        setGoogleNote(`Read ${pulled.length} events.`)

        // Republish on the automatic pass, but only for a workspace that has
        // published at least once. Otherwise merely opening the page would put
        // times in front of friends she never chose to offer.
        const alreadyLive = Boolean(settings?.calendarImportedAt)
        const republish = mode !== 'connect' && alreadyLive
        const fresh = republish
          ? deriveWindows({
              events: pulled,
              from,
              to: new Date(from.getFullYear(), from.getMonth(), from.getDate() + horizonDays),
              rules,
              alsoBlocked: (state.data?.bookings ?? []).map((b) => ({
                start: new Date(b.startsAt).getTime(),
                end: new Date(b.endsAt).getTime(),
              })),
            })
          : null

        await mutate((api) =>
          api.saveAvailabilitySettings(
            {
              source: 'google',
              googleCalendarIds: ids,
              ...(fresh
                ? {
                    windows: fresh.map((w) => ({ s: w.start, e: w.end })),
                    calendarImportedAt: new Date().toISOString(),
                    importedEventCount: pulled.length,
                  }
                : {}),
            },
            uid,
          ),
        )
        if (republish) setGoogleNote(`Refreshed. ${pulled.length} events read, open times updated.`)
        track('hp_calendar_imported', { source: 'google', count: pulled.length })
      } catch (err) {
        if (err instanceof GoogleCalendarError && err.reason === 'consent_required') {
          setNeedsConsent(true)
          if (mode === 'refresh') setGoogleNote('Google access has expired. Connect again to refresh.')
          return
        }
        if (err instanceof GoogleCalendarError && err.reason === 'not_configured') {
          setGoogleNote('Google is not set up in this build yet. See docs/Google_Calendar_Setup.md.')
          return
        }
        if (err instanceof GoogleCalendarError && err.reason === 'popup_blocked') {
          // Expected on the automatic pass: browsers only allow a popup that a
          // click asked for, and nothing clicked. Saying so would be alarming
          // and wrong, since pressing Refresh works. Only report it when she
          // actually pressed something.
          if (mode !== 'auto') {
            setGoogleNote('Your browser blocked the Google window. Allow popups for this site, then try again.')
          }
          return
        }
        if (err instanceof GoogleCalendarError && err.reason === 'denied') {
          setGoogleNote('Google did not grant access. Nothing changed.')
          return
        }
        setGoogleNote('Could not reach Google Calendar. Try again in a moment.')
      } finally {
        setGoogleBusy(false)
      }
    },
    [savedCalendarIds, mutate, uid, horizonDays, rules, settings?.calendarImportedAt, state.data?.bookings],
  )

  useEffect(() => {
    if (silentTried.current || state.loading) return
    if (!googleConfigured || settings?.source !== 'google') return
    silentTried.current = true
    void syncGoogle('auto')
  }, [state.loading, settings?.source, syncGoogle])

  async function readFile(file: File) {
    const text = await file.text()
    const from = new Date()
    const to = new Date(from.getFullYear(), from.getMonth(), from.getDate() + 365)
    const result = parseIcs(text, { from, to })
    setEvents(result.events)
    setImportNote(
      result.skipped > 0
        ? `Read ${result.events.length} events. ${result.skipped} could not be read.`
        : `Read ${result.events.length} events.`,
    )
    track('hp_calendar_imported', { source: 'file', count: result.events.length })
    void mutate((api) => api.saveAvailabilitySettings({ source: 'file', googleCalendarIds: [] }, uid))
  }

  function publish() {
    void mutate((api) =>
      api.saveAvailabilitySettings(
        {
          windows: windows.map((w) => ({ s: w.start, e: w.end })),
          openHours,
          bufferMinutes,
          kinds,
          defaultHorizonDays: horizonDays,
          calendarImportedAt: new Date().toISOString(),
          importedEventCount: events?.length ?? 0,
        },
        uid,
      ),
    )
  }

  if (state.loading) return <Loading label="Loading availability" />
  if (state.error) return <ErrorState message={state.error} onRetry={state.reload} />

  const isConnected = settings?.source === 'google'
  const liveWindows = settings?.windows.length ?? 0

  return (
    <Page>
      <PageHeader
        title="Availability"
        subtitle="Say when you are open, let your calendar close the rest, and share it one friend at a time."
      />

      <OpenHoursCard
        openHours={openHours}
        bufferMinutes={bufferMinutes}
        kinds={kinds}
        busy={busy}
        onSave={(patch) => void mutate((api) => api.saveAvailabilitySettings(patch, uid))}
      />

      <Card className="mb-4 p-4">
        <SubTitle className="mb-[2px]">Your calendar</SubTitle>
        <p className="mb-3 text-[12.5px] text-sec">
          Connect Google, then refresh whenever your week changes. Your calendar goes from Google
          straight to this browser, never through our server.
        </p>

        {googleConfigured ? (
          <>
            <div className="mb-2 flex flex-wrap items-center gap-2">
              <button
                type="button"
                disabled={googleBusy}
                onClick={() => void syncGoogle(isConnected && !needsConsent ? 'refresh' : 'connect')}
                className="accent-gradient inline-flex items-center gap-[6px] rounded-[9px] px-[15px] py-2 text-[13px] font-medium text-white transition hover:opacity-90 disabled:opacity-50"
              >
                {isConnected && !needsConsent ? <RefreshCw size={15} /> : <CalendarPlus size={15} />}
                {googleBusy
                  ? 'Reading'
                  : isConnected && !needsConsent
                    ? 'Refresh from Google'
                    : 'Connect Google Calendar'}
              </button>
              {isConnected && (
                <button
                  type="button"
                  disabled={googleBusy}
                  onClick={() => {
                    forgetToken()
                    setNeedsConsent(false)
                    setCalendars(null)
                    setEvents(null)
                    setGoogleNote('Disconnected. Your published times stay live until you change them.')
                    void mutate((api) =>
                      api.saveAvailabilitySettings({ source: null, googleCalendarIds: [] }, uid),
                    )
                  }}
                  className="hairline inline-flex items-center gap-[6px] rounded-[9px] border border-line bg-surface px-[13px] py-[7px] text-[13px] text-sec transition hover:text-ink disabled:opacity-50"
                >
                  <Unplug size={14} />
                  Disconnect
                </button>
              )}
              {googleNote && <span className="text-[12.5px] text-sec">{googleNote}</span>}
            </div>

            {calendars && calendars.length > 0 && (
              <div className="mb-3">
                <p className="mb-[6px] text-[11px] font-medium uppercase tracking-wide text-mut">
                  Calendars to read
                </p>
                <div className="flex flex-wrap gap-[6px]">
                  {calendars.map((cal) => {
                    const on = savedCalendarIds.includes(cal.id)
                    return (
                      <button
                        key={cal.id}
                        type="button"
                        disabled={googleBusy}
                        onClick={() =>
                          void syncGoogle(
                            'refresh',
                            on ? savedCalendarIds.filter((id) => id !== cal.id) : [...savedCalendarIds, cal.id],
                          )
                        }
                        className={cx(
                          'hairline rounded-[9px] border px-[11px] py-[6px] text-[12.5px] transition disabled:opacity-50',
                          on ? 'border-vio bg-viot font-medium text-vio' : 'border-line bg-surface text-mut',
                        )}
                      >
                        {cal.name}
                      </button>
                    )
                  })}
                </div>
              </div>
            )}
          </>
        ) : (
          <p className="mb-3 text-[12.5px] text-mut">
            Google is not set up in this build yet. Follow docs/Google_Calendar_Setup.md, then add
            the client id to .env.local.
          </p>
        )}

        <Divider className="my-3" />
        <p className="mb-2 text-[12px] text-mut">
          Or read a file once: in Google Calendar settings, use "Export calendar" and choose the
          .ics here. Nothing is uploaded.
        </p>
        <input
          ref={fileInput}
          type="file"
          accept=".ics,text/calendar"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0]
            if (file) void readFile(file)
          }}
        />
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => fileInput.current?.click()}
            className="hairline inline-flex items-center gap-[6px] rounded-[9px] border border-line bg-surface px-[13px] py-[7px] text-[13px] font-medium text-ink transition hover:border-vio hover:text-vio"
          >
            <CalendarPlus size={15} />
            Choose a calendar file
          </button>
          {importNote && <span className="text-[12.5px] text-sec">{importNote}</span>}
        </div>
        {settings?.calendarImportedAt && !events && (
          <p className="mt-3 text-[12.5px] text-mut">
            Last published {formatLong(settings.calendarImportedAt)} from {settings.importedEventCount}{' '}
            events, {liveWindows} open stretches live now.
          </p>
        )}
      </Card>

      {events && (
        <>
          <Card className="mb-4 p-4">
            <SubTitle className="mb-3">What is open</SubTitle>
            <div className="mb-3 flex flex-wrap items-end gap-3">
              <Field label="How far out" className="mb-0 w-[150px]">
                <Select
                  value={String(horizonDays)}
                  onChange={(e) =>
                    void mutate((api) =>
                      api.saveAvailabilitySettings({ defaultHorizonDays: Number(e.target.value) }, uid),
                    )
                  }
                >
                  {HORIZONS.map((h) => (
                    <option key={h.days} value={h.days}>
                      {h.label}
                    </option>
                  ))}
                </Select>
              </Field>
            </div>

            <p className="mb-1 text-[13px] text-ink">
              {windows.length} open stretches, {hours(openMinutes)} in total.
            </p>
            <NextDays windows={windows} />

            <button
              type="button"
              disabled={busy || windows.length === 0}
              onClick={publish}
              className="accent-gradient mt-3 inline-flex items-center gap-[6px] rounded-[9px] px-[15px] py-2 text-[13px] font-medium text-white transition hover:opacity-90 disabled:opacity-50"
            >
              <Check size={15} />
              Publish these times
            </button>
            <p className="mt-2 text-[12px] text-mut">
              Publishing stores the open stretches only. Titles, locations, and everything else stay
              in this browser.
            </p>
          </Card>

          <Reasoning events={events} rules={rules} />
        </>
      )}

      <Links links={state.data?.links ?? []} bookings={state.data?.bookings ?? []} onChange={state.reload} />
    </Page>
  )
}

/** The sleep and downtime setting, and the only time constraint there is. */
function OpenHoursCard({
  openHours,
  bufferMinutes,
  kinds,
  busy,
  onSave,
}: {
  openHours: DayHoursDoc[]
  bufferMinutes: number
  kinds: KindTemplateDoc[]
  busy: boolean
  onSave: (patch: { openHours?: DayHoursDoc[]; bufferMinutes?: number; kinds?: KindTemplateDoc[] }) => void
}) {
  function setDay(index: number, next: DayHoursDoc) {
    onSave({ openHours: openHours.map((d, i) => (i === index ? next : d)) })
  }

  return (
    <Card className="mb-4 p-4">
      <SubTitle className="mb-[2px]">When you are open</SubTitle>
      <p className="mb-3 text-[12.5px] text-sec">
        Nothing is ever offered outside these hours, whatever your calendar says. This is where
        sleep and quiet mornings and evenings live.
      </p>

      <div className="mb-4">
        {openHours.map((day, i) => (
          <div key={DAY_NAMES[i]} className="flex items-center gap-2 border-0 border-b border-hair py-[6px] last:border-0">
            <span className="w-[86px] text-[12.5px] text-ink">{DAY_NAMES[i]}</span>
            <button
              type="button"
              disabled={busy}
              onClick={() => setDay(i, { ...day, open: !day.open })}
              className={cx(
                'hairline w-[68px] rounded-[8px] border px-2 py-[4px] text-[12px] transition disabled:opacity-50',
                day.open ? 'border-vio bg-viot font-medium text-vio' : 'border-line bg-surface text-mut',
              )}
            >
              {day.open ? 'Open' : 'Closed'}
            </button>
            {/* The inputs stay put when a day is closed, greyed rather than
                removed, so the hours are visibly still there to come back to. */}
            <input
              type="time"
              value={day.start}
              disabled={busy || !day.open}
              onChange={(e) => setDay(i, { ...day, start: e.target.value })}
              className={cx(
                'hairline rounded-[8px] border border-line bg-field px-2 py-[4px] text-[12.5px]',
                day.open ? 'text-ink' : 'text-mut opacity-60',
              )}
            />
            <span className={cx('text-[12px]', day.open ? 'text-mut' : 'text-mut opacity-60')}>to</span>
            <input
              type="time"
              value={day.end}
              disabled={busy || !day.open}
              onChange={(e) => setDay(i, { ...day, end: e.target.value })}
              className={cx(
                'hairline rounded-[8px] border border-line bg-field px-2 py-[4px] text-[12.5px]',
                day.open ? 'text-ink' : 'text-mut opacity-60',
              )}
            />
          </div>
        ))}
      </div>

      <div className="flex flex-wrap items-end gap-3">
        <Field label="Gap around anything booked" className="mb-0 w-[190px]">
          <Select
            value={String(bufferMinutes)}
            onChange={(e) => onSave({ bufferMinutes: Number(e.target.value) })}
          >
            {[0, 15, 30, 45, 60].map((m) => (
              <option key={m} value={m}>
                {m === 0 ? 'None' : `${m} min`}
              </option>
            ))}
          </Select>
        </Field>
        {kinds.map((k) => (
          <Field key={k.kind} label={`${k.label}, usually`} className="mb-0 w-[130px]">
            <Select
              value={String(k.defaultMinutes)}
              onChange={(e) =>
                onSave({
                  kinds: kinds.map((x) =>
                    x.kind === k.kind ? { ...x, defaultMinutes: Number(e.target.value) } : x,
                  ),
                })
              }
            >
              {k.choices.map((c) => (
                <option key={c} value={c}>
                  {c} min
                </option>
              ))}
            </Select>
          </Field>
        ))}
      </div>
    </Card>
  )
}

/** A few real days, so the totals above mean something concrete. */
function NextDays({ windows }: { windows: OpenWindow[] }) {
  const days = useMemo(() => {
    const groups = new Map<string, OpenWindow[]>()
    for (const w of windows.slice(0, 60)) {
      const d = new Date(w.start)
      const key = `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`
      groups.set(key, [...(groups.get(key) ?? []), w])
    }
    return [...groups.values()].slice(0, 5)
  }, [windows])

  if (days.length === 0) return null
  return (
    <div className="mt-2">
      {days.map((group) => (
        <p key={group[0]!.start} className="text-[12.5px] text-sec">
          <span className="text-ink">{formatDayLong(new Date(group[0]!.start).toISOString())}</span>
          {': '}
          {group
            .map((w) => `${formatTime(new Date(w.start))} to ${formatTime(new Date(w.end))}`)
            .join(', ')}
        </p>
      ))}
    </div>
  )
}

/**
 * Only the readings worth questioning.
 *
 * The first version listed every upcoming event, which read as a second copy
 * of her calendar and told her nothing. An event that simply blocked its own
 * hours needs no explanation; a weekend that vanished does.
 */
function Reasoning({ events, rules }: { events: BusyEvent[]; rules: AvailabilityRules }) {
  const notable = useMemo(() => {
    const now = Date.now()
    return events
      .filter((e) => new Date(e.startsAt).getTime() > now)
      .sort((a, b) => a.startsAt.localeCompare(b.startsAt))
      .map((event) => ({ event, spread: spreadOf(event, rules) }))
      .filter((row) => row.spread.kind !== 'confined')
      .slice(0, 10)
  }, [events, rules])

  if (notable.length === 0) return null

  return (
    <Card className="mb-4 p-4">
      <SubTitle className="mb-[2px]">Worth a look</SubTitle>
      <p className="mb-3 text-[12.5px] text-sec">
        Everything else just blocked its own hours. These did something bigger, so they are the ones
        to check.
      </p>
      {notable.map(({ event, spread }) => (
        <div
          key={event.id}
          className="flex items-center gap-2 border-0 border-b border-hair py-[7px] last:border-0"
        >
          <div className="min-w-0 flex-1">
            <p className="truncate text-[13px] text-ink">{event.title || 'Untitled'}</p>
            <p className="text-[11.5px] text-mut">
              {formatDayLong(event.startsAt)}
              {!event.allDay && `, ${formatTime(new Date(event.startsAt))}`}
            </p>
          </div>
          <span
            className={cx(
              'shrink-0 rounded-full px-[8px] py-[3px] text-[11px] font-medium',
              spread.kind === 'spans' ? 'bg-amber-50 text-amber-700' : 'bg-field text-mut',
            )}
          >
            {spread.kind === 'confined' ? 'blocks its own hours' : spread.reason}
          </span>
        </div>
      ))}
    </Card>
  )
}

function Links({
  links,
  bookings,
  onChange,
}: {
  links: FriendLink[]
  bookings: Booking[]
  onChange: () => void
}) {
  const { uid } = useHost()
  const { mutate, busy } = useMutation(onChange)
  const [name, setName] = useState('')
  const [horizon, setHorizon] = useState(DEFAULT_HORIZON_DAYS)
  const [copied, setCopied] = useState<string | null>(null)

  function add() {
    if (!name.trim()) return
    void mutate(async (api) => {
      await api.createFriendLink({ name: name.trim(), horizonDays: horizon, kinds: ['coffee', 'run', 'call'] }, uid)
      track('hp_friend_link_created', {})
      setName('')
    })
  }

  function copy(link: FriendLink) {
    void navigator.clipboard.writeText(`${window.location.origin}/g/${link.tokenId}`)
    setCopied(link.id)
    setTimeout(() => setCopied(null), 2000)
  }

  return (
    <Card className="p-4">
      <SubTitle className="mb-[2px]">Friend links</SubTitle>
      <p className="mb-3 text-[12.5px] text-sec">
        One link per person, so you always know who has what. Send it however you already talk.
      </p>

      <div className="mb-4 flex flex-wrap items-end gap-2">
        <Field label="Name" className="mb-0 w-[190px]">
          <Input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Who is this for"
            onKeyDown={(e) => e.key === 'Enter' && add()}
          />
        </Field>
        <Field label="How far out" className="mb-0 w-[140px]">
          <Select value={String(horizon)} onChange={(e) => setHorizon(Number(e.target.value))}>
            {HORIZONS.map((h) => (
              <option key={h.days} value={h.days}>
                {h.label}
              </option>
            ))}
          </Select>
        </Field>
        <button
          type="button"
          disabled={busy || !name.trim()}
          onClick={add}
          className="hairline mb-[1px] inline-flex items-center gap-[6px] rounded-[9px] border border-line bg-surface px-[13px] py-[7px] text-[13px] font-medium text-ink transition hover:border-vio hover:text-vio disabled:opacity-50"
        >
          <Link2 size={14} />
          Make a link
        </button>
      </div>

      {links.length === 0 ? (
        <EmptyState title="No links yet" body="Add a friend above and you will get a link to send." />
      ) : (
        links.map((link) => {
          const theirs = bookings.filter((b) => b.friendLinkId === link.id)
          return (
            <div key={link.id} className="flex items-center gap-2 border-0 border-b border-hair py-[9px] last:border-0">
              <div className="min-w-0 flex-1">
                <p className="text-[13px] font-medium text-ink">{link.name}</p>
                <p className="text-[11.5px] text-mut">
                  {HORIZONS.find((h) => h.days === link.horizonDays)?.label ?? `${link.horizonDays} days`}
                  {theirs.length > 0 && `, booked ${formatDayLong(theirs[0]!.startsAt)}`}
                </p>
              </div>
              <button
                type="button"
                onClick={() => copy(link)}
                className="inline-flex items-center gap-1 text-[12px] text-sec transition hover:text-vio"
              >
                {copied === link.id ? <Check size={13} /> : <Copy size={13} />}
                {copied === link.id ? 'Copied' : 'Copy link'}
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={() => void mutate((api) => api.deleteFriendLink(link.id))}
                className="text-mut transition hover:text-rose-600 disabled:opacity-50"
                aria-label={`Remove the link for ${link.name}`}
              >
                <Trash2 size={14} />
              </button>
            </div>
          )
        })
      )}

      {bookings.length > 0 && (
        <>
          <Divider className="my-3" />
          <p className="mb-2 text-[11px] font-medium uppercase tracking-wide text-mut">Booked</p>
          {bookings.map((b) => (
            <div key={b.id} className="flex items-center gap-2 py-[5px]">
              <div className="min-w-0 flex-1">
                <p className="text-[13px] text-ink">
                  {b.kind} with {b.friendName}
                </p>
                <p className="text-[11.5px] text-mut">
                  {formatDayLong(b.startsAt)} at {formatTime(new Date(b.startsAt))}, {b.durationMinutes} min
                  {b.contact && `, ${b.contact}`}
                </p>
              </div>
              <button
                type="button"
                disabled={busy}
                onClick={() =>
                  void mutate(async (api) => {
                    await api.cancelBooking(b.id)
                    track('hp_booking_cancelled', {})
                  })
                }
                className="text-[12px] text-mut transition hover:text-ink disabled:opacity-50"
              >
                Cancel
              </button>
            </div>
          ))}
        </>
      )}
    </Card>
  )
}
