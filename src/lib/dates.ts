// Date helpers. Everything runs in the browser's local zone, which is the
// host's zone, which is the zone the event happens in.

const DAY_MS = 86400000

export function toDateKey(d: Date): string {
  const m = `${d.getMonth() + 1}`.padStart(2, '0')
  const day = `${d.getDate()}`.padStart(2, '0')
  return `${d.getFullYear()}-${m}-${day}`
}

export function fromDateKey(key: string): Date {
  const [y, m, d] = key.split('-').map(Number)
  return new Date(y, (m ?? 1) - 1, d ?? 1)
}

export function startOfDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate())
}

export function addDays(d: Date, days: number): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate() + days)
}

export function daysBetween(from: Date, to: Date): number {
  return Math.round((startOfDay(to).getTime() - startOfDay(from).getTime()) / DAY_MS)
}

const WEEKDAY = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
const MONTH = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
]
const MONTH_SHORT = MONTH.map((m) => m.slice(0, 3))

export function formatTime(d: Date): string {
  const h = d.getHours()
  const m = d.getMinutes()
  const suffix = h < 12 ? 'am' : 'pm'
  const hour12 = h % 12 === 0 ? 12 : h % 12
  return m === 0 ? `${hour12}:00 ${suffix}` : `${hour12}:${`${m}`.padStart(2, '0')} ${suffix}`
}

/** "Thu Aug 20, 7:00 am", the compact form used on chips and lists. */
export function formatShort(iso: string): string {
  const d = new Date(iso)
  return `${WEEKDAY[d.getDay()]} ${MONTH_SHORT[d.getMonth()]} ${d.getDate()}, ${formatTime(d)}`
}

/** "Thursday, August 20, 7:00 am", the confirmed-banner form. */
export function formatLong(iso: string): string {
  const d = new Date(iso)
  const weekday = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'][d.getDay()]
  return `${weekday}, ${MONTH[d.getMonth()]} ${d.getDate()}, ${formatTime(d)}`
}

/** "Thu Aug 20", no time, for matrix column heads. */
export function formatDayOnly(iso: string): string {
  const d = new Date(iso)
  return `${WEEKDAY[d.getDay()]} ${MONTH_SHORT[d.getMonth()]} ${d.getDate()}`
}

/** "06:30" reads as "6:30". Stored 24 hour, displayed the way people speak. */
export function formatClock(time: string): string {
  return time.replace(/^0/, '')
}

/** "1 day", "3 days". Small thing, but the copy rules care. */
export function pluralDays(count: number): string {
  return `${count} ${count === 1 ? 'day' : 'days'}`
}

export function formatMonthTitle(d: Date): string {
  return `${MONTH[d.getMonth()]} ${d.getFullYear()}`
}

/** "Due Thu", "Was due Mon", "Day of", the task-row form. */
export function formatDue(dueDate: string | null, today = new Date()): string {
  if (!dueDate) return 'No date'
  const due = fromDateKey(dueDate)
  const delta = daysBetween(today, due)
  if (delta === 0) return 'Due today'
  if (delta === 1) return 'Due tomorrow'
  if (delta < 0) return `Was due ${WEEKDAY[due.getDay()]}`
  if (delta < 7) return `Due ${WEEKDAY[due.getDay()]}`
  return `Due ${MONTH_SHORT[due.getMonth()]} ${due.getDate()}`
}

export function isOverdue(dueDate: string | null, today = new Date()): boolean {
  if (!dueDate) return false
  return daysBetween(today, fromDateKey(dueDate)) < 0
}

// US federal holidays, computed rather than listed, so no year goes stale.

function nthWeekday(year: number, month: number, weekday: number, nth: number): Date {
  const first = new Date(year, month, 1)
  const shift = (weekday - first.getDay() + 7) % 7
  return new Date(year, month, 1 + shift + (nth - 1) * 7)
}

function lastWeekday(year: number, month: number, weekday: number): Date {
  const last = new Date(year, month + 1, 0)
  const shift = (last.getDay() - weekday + 7) % 7
  return new Date(year, month, last.getDate() - shift)
}

export function federalHolidays(year: number): { date: Date; name: string }[] {
  return [
    { date: new Date(year, 0, 1), name: "New Year's Day" },
    { date: nthWeekday(year, 0, 1, 3), name: 'Martin Luther King Jr. Day' },
    { date: nthWeekday(year, 1, 1, 3), name: "Presidents' Day" },
    { date: lastWeekday(year, 4, 1), name: 'Memorial Day' },
    { date: new Date(year, 5, 19), name: 'Juneteenth' },
    { date: new Date(year, 6, 4), name: 'Independence Day' },
    { date: nthWeekday(year, 8, 1, 1), name: 'Labor Day' },
    { date: nthWeekday(year, 9, 1, 2), name: 'Indigenous Peoples Day' },
    { date: new Date(year, 10, 11), name: 'Veterans Day' },
    { date: nthWeekday(year, 10, 4, 4), name: 'Thanksgiving' },
    { date: new Date(year, 11, 25), name: 'Christmas Day' },
  ]
}

/**
 * F4, the Juneteenth lesson. Returns the holiday name when a proposed date
 * lands on one, including the observed weekday when it falls on a weekend.
 */
export function holidayOn(iso: string): string | null {
  const target = startOfDay(new Date(iso)).getTime()
  const year = new Date(iso).getFullYear()
  for (const { date, name } of federalHolidays(year)) {
    if (startOfDay(date).getTime() === target) return name
    // Saturday holidays are observed the Friday before, Sunday the Monday after.
    if (date.getDay() === 6 && addDays(date, -1).getTime() === target) return `${name}, observed`
    if (date.getDay() === 0 && addDays(date, 1).getTime() === target) return `${name}, observed`
  }
  return null
}

export interface AwayConflict {
  label: string
}

/** F10. Warn when a proposed date falls inside one of the host's away blocks. */
export function awayConflict(
  iso: string,
  blocks: { kind: 'away' | 'open'; startDate: string; endDate: string; label: string }[],
): AwayConflict | null {
  const key = toDateKey(new Date(iso))
  const hit = blocks.find(
    (b) => b.kind === 'away' && key >= b.startDate && key <= b.endDate,
  )
  return hit ? { label: hit.label || 'Away' } : null
}

/**
 * F4 rush mode. Tasks whose offset predates today compress into the runway
 * instead of erroring: they land today or on the earliest remaining day,
 * keeping their relative order.
 */
export interface MaterializedTask {
  offsetDays: number
  dueDate: string
  compressed: boolean
}

export function materializeOffsets(
  offsets: number[],
  eventDate: Date,
  today = new Date(),
): MaterializedTask[] {
  const runway = Math.max(daysBetween(today, eventDate), 0)
  // The whole pre-event range scales together, so tasks never reorder and
  // never land before today. A 35 day skeleton on a 15 day runway keeps its
  // sequence, just tighter.
  const earliest = Math.min(0, ...offsets)
  const naturalSpan = -earliest
  const scale = naturalSpan > runway && naturalSpan > 0 ? runway / naturalSpan : 1

  return offsets.map((offset) => {
    if (offset >= 0) {
      return { offsetDays: offset, dueDate: toDateKey(addDays(eventDate, offset)), compressed: false }
    }
    const shifted = Math.round(offset * scale)
    return {
      offsetDays: offset,
      dueDate: toDateKey(addDays(eventDate, shifted)),
      compressed: scale < 1,
    }
  })
}

/** Under three weeks counts as a rush. */
export function isRushRunway(eventDate: Date, today = new Date()): boolean {
  return daysBetween(today, eventDate) < 21
}
