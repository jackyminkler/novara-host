import { describe, expect, it } from 'vitest'
import { buildIcs, googleCalendarUrl, type CalendarEventLink } from './calendarLinks'

const base: CalendarEventLink = {
  uid: 'plan123',
  title: 'Draft night',
  startsAt: '2026-09-10T19:00:00Z',
  endsAt: '2026-09-10T22:30:00Z',
  location: 'The back room',
  description: 'Bring a laptop',
}

function lines(ics: string): string[] {
  return ics.split('\r\n')
}

describe('buildIcs', () => {
  it('writes a calendar around one event', () => {
    const out = lines(buildIcs(base))
    expect(out[0]).toBe('BEGIN:VCALENDAR')
    expect(out).toContain('VERSION:2.0')
    expect(out).toContain('PRODID:-//Novara hosts//EN')
    expect(out).toContain('METHOD:PUBLISH')
    expect(out).toContain('BEGIN:VEVENT')
    expect(out).toContain('END:VEVENT')
    expect(out[out.length - 2]).toBe('END:VCALENDAR')
  })

  it('qualifies the uid with our own domain', () => {
    expect(lines(buildIcs(base))).toContain('UID:plan123@hosts.novara.social')
  })

  it('writes times in basic UTC, seconds and all', () => {
    const out = lines(buildIcs(base))
    expect(out).toContain('DTSTART:20260910T190000Z')
    expect(out).toContain('DTEND:20260910T223000Z')
  })

  it('stamps from the start, so the same event always writes the same file', () => {
    expect(lines(buildIcs(base))).toContain('DTSTAMP:20260910T190000Z')
    expect(buildIcs(base)).toBe(buildIcs(base))
  })

  it('carries the summary, location, and description', () => {
    const out = lines(buildIcs(base))
    expect(out).toContain('SUMMARY:Draft night')
    expect(out).toContain('LOCATION:The back room')
    expect(out).toContain('DESCRIPTION:Bring a laptop')
  })

  it('leaves out a location or description nobody wrote', () => {
    const bare = buildIcs({ ...base, location: '', description: '' })
    expect(bare).not.toContain('LOCATION')
    expect(bare).not.toContain('DESCRIPTION')
    expect(lines(bare)).toContain('SUMMARY:Draft night')
  })

  it('escapes the characters the format reserves', () => {
    const out = lines(
      buildIcs({
        ...base,
        title: 'Draft night, round 2; bring snacks',
        location: 'C:\\notes',
        description: 'First line\nsecond line',
      }),
    )
    expect(out).toContain('SUMMARY:Draft night\\, round 2\\; bring snacks')
    // One backslash in, two out. Doubling it first is what stops it eating the
    // escape in front of the n that follows.
    expect(out).toContain('LOCATION:C:\\\\notes')
    expect(out).toContain('DESCRIPTION:First line\\nsecond line')
  })

  it('ends every line with CRLF, the last one included', () => {
    const ics = buildIcs({ ...base, description: 'First line\nsecond line' })
    expect(ics.endsWith('\r\n')).toBe(true)
    // Every newline in the file is part of a CRLF pair. The one inside the
    // description was escaped into a literal backslash n, not left raw.
    expect(ics.replace(/\r\n/g, '')).not.toContain('\n')
    expect(ics).not.toContain('\r\r')
  })
})

describe('googleCalendarUrl', () => {
  it('points at the render page with a template action', () => {
    const url = new URL(googleCalendarUrl(base))
    expect(url.origin + url.pathname).toBe('https://calendar.google.com/calendar/render')
    expect(url.searchParams.get('action')).toBe('TEMPLATE')
  })

  it('carries the title, times, location, and notes', () => {
    const params = new URL(googleCalendarUrl(base)).searchParams
    expect(params.get('text')).toBe('Draft night')
    expect(params.get('dates')).toBe('20260910T190000Z/20260910T223000Z')
    expect(params.get('location')).toBe('The back room')
    expect(params.get('details')).toBe('Bring a laptop')
  })

  it('leaves out a location or notes nobody wrote', () => {
    const params = new URL(googleCalendarUrl({ ...base, location: '', description: '' })).searchParams
    expect(params.has('location')).toBe(false)
    expect(params.has('details')).toBe(false)
    expect(params.get('text')).toBe('Draft night')
  })

  it('encodes a title that would otherwise break the query', () => {
    const url = googleCalendarUrl({ ...base, title: 'Draft night & pizza?' })
    expect(url).toContain('text=Draft+night+%26+pizza%3F')
    expect(new URL(url).searchParams.get('text')).toBe('Draft night & pizza?')
  })
})
