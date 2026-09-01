// Putting one settled time on somebody else's calendar.
//
// Outside lib/availability deliberately. That folder is pure, and `downloadIcs`
// reaches for the DOM. It is also the opposite direction from
// availability/ics.ts, which reads a calendar file in: this one writes a single
// event out, for the people who left no email and so get no Google invite.

export interface CalendarEventLink {
  uid: string
  title: string
  /** ISO. */
  startsAt: string
  /** ISO. */
  endsAt: string
  location: string
  description: string
}

/** "20260910T190000Z", the basic UTC form every calendar client accepts. */
function utcBasic(iso: string): string {
  return new Date(iso).toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '')
}

/** RFC 5545 text escaping. Backslash first, or it escapes its own escapes. */
function escapeText(value: string): string {
  return value
    .replace(/\\/g, '\\\\')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,')
    .replace(/\r\n|\r|\n/g, '\\n')
}

/** One event as a .ics file, small enough to hand straight to a download. */
export function buildIcs(event: CalendarEventLink): string {
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Novara hosts//EN',
    'METHOD:PUBLISH',
    'BEGIN:VEVENT',
    `UID:${event.uid}@hosts.novara.social`,
    // The stamp is the event's own start rather than the moment of writing.
    // Nothing downstream reads it, and holding it still keeps the file
    // identical for identical input, which is what lets a test check the whole
    // thing without a clock.
    `DTSTAMP:${utcBasic(event.startsAt)}`,
    `DTSTART:${utcBasic(event.startsAt)}`,
    `DTEND:${utcBasic(event.endsAt)}`,
    `SUMMARY:${escapeText(event.title)}`,
  ]
  // An empty property is not the same as no property, and some clients render
  // the blank line as an empty location field on the event.
  if (event.location) lines.push(`LOCATION:${escapeText(event.location)}`)
  if (event.description) lines.push(`DESCRIPTION:${escapeText(event.description)}`)
  lines.push('END:VEVENT', 'END:VCALENDAR')
  // CRLF throughout, including the last line: the spec asks for it and a few
  // desktop clients refuse a file that ends without it.
  return `${lines.join('\r\n')}\r\n`
}

/** The Google Calendar "add this" page, prefilled. Works signed in on any device. */
export function googleCalendarUrl(event: CalendarEventLink): string {
  const params = new URLSearchParams({
    action: 'TEMPLATE',
    text: event.title,
    dates: `${utcBasic(event.startsAt)}/${utcBasic(event.endsAt)}`,
  })
  if (event.description) params.set('details', event.description)
  if (event.location) params.set('location', event.location)
  return `https://calendar.google.com/calendar/render?${params.toString()}`
}

/**
 * Hand the file to the browser.
 *
 * The only thing here that touches the DOM, and the reason this module sits
 * outside the pure folder. Untested on purpose: there is nothing to assert
 * beyond the browser doing its own job.
 */
export function downloadIcs(filename: string, ics: string): void {
  const blob = new Blob([ics], { type: 'text/calendar;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = filename
  document.body.appendChild(anchor)
  anchor.click()
  anchor.remove()
  URL.revokeObjectURL(url)
}
