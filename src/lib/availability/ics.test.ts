import { describe, expect, it } from 'vitest'
import { parseIcs } from './ics'

const window = { from: new Date('2026-09-01T00:00:00'), to: new Date('2026-10-01T00:00:00') }

function wrap(body: string): string {
  return `BEGIN:VCALENDAR\r\nVERSION:2.0\r\n${body}\r\nEND:VCALENDAR\r\n`
}

describe('parseIcs', () => {
  it('reads a timed event with summary and location', () => {
    const { events } = parseIcs(wrap([
      'BEGIN:VEVENT',
      'UID:abc123',
      'SUMMARY:Launch party',
      'LOCATION:Mission St\\, San Francisco',
      'DTSTART:20260910T190000',
      'DTEND:20260910T220000',
      'END:VEVENT',
    ].join('\r\n')), window)
    expect(events).toHaveLength(1)
    expect(events[0]).toMatchObject({ id: 'abc123', title: 'Launch party' })
    expect(events[0]!.location).toBe('Mission St, San Francisco')
    expect(new Date(events[0]!.startsAt).getHours()).toBe(19)
  })

  it('reads an all day event as midnight to exclusive midnight', () => {
    const { events } = parseIcs(wrap([
      'BEGIN:VEVENT',
      'UID:bday',
      'SUMMARY:Dana birthday',
      'DTSTART;VALUE=DATE:20260912',
      'DTEND;VALUE=DATE:20260913',
      'END:VEVENT',
    ].join('\r\n')), window)
    expect(events[0]!.allDay).toBe(true)
    expect(new Date(events[0]!.startsAt).getHours()).toBe(0)
  })

  it('unfolds continuation lines', () => {
    const { events } = parseIcs(wrap([
      'BEGIN:VEVENT',
      'UID:folded',
      'SUMMARY:A very long title that the exporter',
      '  wrapped across two lines',
      'DTSTART:20260910T090000',
      'DTEND:20260910T100000',
      'END:VEVENT',
    ].join('\r\n')), window)
    expect(events[0]!.title).toBe('A very long title that the exporter wrapped across two lines')
  })

  it('marks TRANSPARENT events free so they do not block', () => {
    const { events } = parseIcs(wrap([
      'BEGIN:VEVENT',
      'UID:free1',
      'SUMMARY:Out of office banner',
      'TRANSP:TRANSPARENT',
      'DTSTART:20260910T090000',
      'DTEND:20260910T100000',
      'END:VEVENT',
    ].join('\r\n')), window)
    expect(events[0]!.transparency).toBe('free')
  })

  it('drops cancelled events', () => {
    const { events } = parseIcs(wrap([
      'BEGIN:VEVENT',
      'UID:gone',
      'STATUS:CANCELLED',
      'DTSTART:20260910T090000',
      'END:VEVENT',
    ].join('\r\n')), window)
    expect(events).toHaveLength(0)
  })

  it('expands a weekly recurrence inside the window only', () => {
    const { events } = parseIcs(wrap([
      'BEGIN:VEVENT',
      'UID:standup',
      'SUMMARY:Standup',
      'DTSTART:20260901T090000',
      'DTEND:20260901T093000',
      'RRULE:FREQ=WEEKLY;INTERVAL=1',
      'END:VEVENT',
    ].join('\r\n')), window)
    // September 1 is a Tuesday; weekly through September is five occurrences.
    expect(events.length).toBe(5)
    expect(new Set(events.map((e) => e.id)).size).toBe(5)
    expect(events.every((e) => new Date(e.startsAt) < window.to)).toBe(true)
  })

  it('honours UNTIL on a recurrence', () => {
    const { events } = parseIcs(wrap([
      'BEGIN:VEVENT',
      'UID:limited',
      'DTSTART:20260901T090000',
      'DTEND:20260901T093000',
      'RRULE:FREQ=WEEKLY;UNTIL=20260916T000000Z',
      'END:VEVENT',
    ].join('\r\n')), window)
    expect(events.length).toBe(3)
  })

  it('defaults a missing DTEND rather than dropping the event', () => {
    const { events } = parseIcs(wrap([
      'BEGIN:VEVENT',
      'UID:noend',
      'DTSTART:20260910T090000',
      'END:VEVENT',
    ].join('\r\n')), window)
    expect(events).toHaveLength(1)
    expect(new Date(events[0]!.endsAt).getHours()).toBe(10)
  })

  it('counts an unreadable block as skipped instead of throwing', () => {
    const { events, skipped } = parseIcs(wrap([
      'BEGIN:VEVENT',
      'UID:broken',
      'DTSTART:not-a-date',
      'END:VEVENT',
    ].join('\r\n')), window)
    expect(events).toHaveLength(0)
    expect(skipped).toBe(1)
  })

  it('survives an empty string', () => {
    expect(parseIcs('', window)).toEqual({ events: [], skipped: 0 })
  })
})
