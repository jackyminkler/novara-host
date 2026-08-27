import { describe, expect, it } from 'vitest'
import { coverage, suggest, type Participant } from './coverage'
import { sameWallClock, timeInZone } from './zones'
import { toLocalInputValue } from '../dates'

const at = (iso: string) => new Date(iso).getTime()

function person(id: string, ...spans: [string, string][]): Participant {
  return { id, label: id, free: spans.map(([s, e]) => ({ start: at(s), end: at(e) })) }
}

describe('coverage', () => {
  it('finds the stretch two people share', () => {
    const spans = coverage([
      person('a', ['2026-09-10T09:00:00', '2026-09-10T12:00:00']),
      person('b', ['2026-09-10T11:00:00', '2026-09-10T14:00:00']),
    ])
    const both = spans.find((s) => s.free.length === 2)!
    expect(both.start).toBe(at('2026-09-10T11:00:00'))
    expect(both.end).toBe(at('2026-09-10T12:00:00'))
  })

  it('still reports a stretch only some can make', () => {
    const spans = coverage([
      person('a', ['2026-09-10T09:00:00', '2026-09-10T10:00:00']),
      person('b', ['2026-09-10T14:00:00', '2026-09-10T15:00:00']),
    ])
    expect(spans).toHaveLength(2)
    expect(spans.every((s) => s.free.length === 1)).toBe(true)
    expect(spans[0]!.busy).toEqual(['b'])
  })

  it('requires the whole span, not an overlap', () => {
    // b is free 10 to 11 only, so the 9 to 12 span is not one b can make.
    const spans = coverage([
      person('a', ['2026-09-10T09:00:00', '2026-09-10T12:00:00']),
      person('b', ['2026-09-10T10:00:00', '2026-09-10T11:00:00']),
    ])
    expect(spans.some((s) => s.start === at('2026-09-10T09:00:00') && s.free.includes('b'))).toBe(false)
  })

  it('collapses adjacent spans with the same people', () => {
    const spans = coverage([
      person('a', ['2026-09-10T09:00:00', '2026-09-10T10:00:00'], ['2026-09-10T10:00:00', '2026-09-10T11:00:00']),
    ])
    expect(spans).toHaveLength(1)
    expect(spans[0]!.end).toBe(at('2026-09-10T11:00:00'))
  })

  it('returns nothing for nobody', () => {
    expect(coverage([])).toEqual([])
  })
})

describe('suggest', () => {
  const three = [
    person('a', ['2026-09-10T09:00:00', '2026-09-10T17:00:00'], ['2026-09-11T09:00:00', '2026-09-11T17:00:00']),
    person('b', ['2026-09-10T14:00:00', '2026-09-10T17:00:00'], ['2026-09-11T09:00:00', '2026-09-11T17:00:00']),
    person('c', ['2026-09-11T09:00:00', '2026-09-11T17:00:00']),
  ]

  it('puts the option with the most people first', () => {
    const out = suggest(three, { durationMinutes: 60, limit: 3 })
    expect(out[0]!.free).toHaveLength(3)
    expect(new Date(out[0]!.start).getDate()).toBe(11)
  })

  it('names who cannot make each option', () => {
    const out = suggest(three, { durationMinutes: 60, limit: 3 })
    const partial = out.find((o) => o.free.length < 3)!
    expect(partial.busy.length).toBeGreaterThan(0)
  })

  it('offers one option per day rather than three on the same day', () => {
    const out = suggest(three, { durationMinutes: 60, limit: 5 })
    const days = out.map((o) => new Date(o.start).getDate())
    expect(new Set(days).size).toBe(days.length)
  })

  it('drops a window too short for the duration', () => {
    const out = suggest([person('a', ['2026-09-10T09:00:00', '2026-09-10T09:30:00'])], {
      durationMinutes: 60,
      limit: 3,
    })
    expect(out).toEqual([])
  })

  it('lands on the template start time when the window can hold it', () => {
    const out = suggest([person('a', ['2026-09-10T06:00:00', '2026-09-10T18:00:00'])], {
      durationMinutes: 60,
      limit: 1,
      preferredStart: '07:00',
    })
    expect(new Date(out[0]!.start).getHours()).toBe(7)
    expect(out[0]!.atPreferredTime).toBe(true)
  })

  it('still answers when the preferred time will not fit, and says so', () => {
    // A sunrise template against a day that only opens at nine: a later start
    // beats no answer, and the flag lets the UI rank it below a true match.
    const out = suggest([person('a', ['2026-09-10T09:00:00', '2026-09-10T18:00:00'])], {
      durationMinutes: 60,
      limit: 1,
      preferredStart: '07:00',
    })
    expect(new Date(out[0]!.start).getHours()).toBe(9)
    expect(out[0]!.atPreferredTime).toBe(false)
  })

  it('ranks a true template match above a later one with the same turnout', () => {
    const out = suggest(
      [person('a', ['2026-09-10T09:00:00', '2026-09-10T18:00:00'], ['2026-09-11T06:00:00', '2026-09-11T18:00:00'])],
      { durationMinutes: 60, limit: 2, preferredStart: '07:00' },
    )
    expect(out[0]!.atPreferredTime).toBe(true)
    expect(new Date(out[0]!.start).getDate()).toBe(11)
  })

  it('keeps to the weekdays a template cares about', () => {
    // 2026-09-12 is a Saturday, 2026-09-10 a Thursday.
    const out = suggest(
      [person('a', ['2026-09-10T09:00:00', '2026-09-10T18:00:00'], ['2026-09-12T09:00:00', '2026-09-12T18:00:00'])],
      { durationMinutes: 60, limit: 5, weekdays: [6] },
    )
    expect(out).toHaveLength(1)
    expect(new Date(out[0]!.start).getDay()).toBe(6)
  })

  it('honours a minimum turnout', () => {
    const out = suggest(three, { durationMinutes: 60, limit: 5, minFree: 3 })
    expect(out.every((o) => o.free.length === 3)).toBe(true)
  })
})

describe('suggest within', () => {
  const span = (s: string, e: string) => ({ start: at(s), end: at(e) })
  const three = [
    person('a', ['2026-09-10T09:00:00', '2026-09-10T17:00:00'], ['2026-09-11T09:00:00', '2026-09-11T17:00:00']),
    person('b', ['2026-09-10T14:00:00', '2026-09-10T17:00:00'], ['2026-09-11T09:00:00', '2026-09-11T17:00:00']),
    person('c', ['2026-09-11T09:00:00', '2026-09-11T17:00:00']),
  ]

  it('counts someone free only for the part of their time the bound allows', () => {
    // b says 17:00 to 20:00 but the plan does not open until 18:00, so the
    // 18:00 slot is one they can make and a 17:00 one does not exist at all.
    const out = suggest(
      [
        person('a', ['2026-09-10T17:00:00', '2026-09-10T21:00:00']),
        person('b', ['2026-09-10T17:00:00', '2026-09-10T20:00:00']),
      ],
      {
        durationMinutes: 90,
        limit: 5,
        within: [span('2026-09-10T18:00:00', '2026-09-10T19:30:00')],
      },
    )
    expect(out).toHaveLength(1)
    expect(out[0]!.start).toBe(at('2026-09-10T18:00:00'))
    expect(out[0]!.end).toBe(at('2026-09-10T19:30:00'))
    expect(out[0]!.free).toEqual(['a', 'b'])
  })

  it('drops the part of someone free time that falls outside the bound', () => {
    const out = suggest([person('a', ['2026-09-10T09:00:00', '2026-09-10T21:00:00'])], {
      durationMinutes: 60,
      limit: 5,
      within: [span('2026-09-10T18:00:00', '2026-09-10T21:00:00')],
    })
    expect(out).toHaveLength(1)
    expect(out[0]!.start).toBe(at('2026-09-10T18:00:00'))
  })

  it('suggests nothing at all when the bound allows nothing', () => {
    const out = suggest([person('a', ['2026-09-10T09:00:00', '2026-09-10T21:00:00'])], {
      durationMinutes: 60,
      limit: 5,
      within: [],
    })
    expect(out).toEqual([])
  })

  it('leaves the answer alone when the bound is wider than anyone free time', () => {
    const plain = suggest(three, { durationMinutes: 60, limit: 3 })
    const bounded = suggest(three, {
      durationMinutes: 60,
      limit: 3,
      within: [span('2026-09-01T00:00:00', '2026-10-01T00:00:00')],
    })
    expect(bounded).toEqual(plain)
  })

  it('still keeps to one option a day and to the duration inside the bound', () => {
    // Two evenings allowed, and the second one is too short to hold 90 minutes.
    const out = suggest(
      [
        person(
          'a',
          ['2026-09-10T09:00:00', '2026-09-10T23:00:00'],
          ['2026-09-11T09:00:00', '2026-09-11T23:00:00'],
        ),
      ],
      {
        durationMinutes: 90,
        limit: 5,
        within: [
          span('2026-09-10T18:00:00', '2026-09-10T20:00:00'),
          span('2026-09-10T20:30:00', '2026-09-10T22:00:00'),
          span('2026-09-11T18:00:00', '2026-09-11T19:00:00'),
        ],
      },
    )
    expect(out).toHaveLength(1)
    expect(new Date(out[0]!.start).getDate()).toBe(10)
    expect(out[0]!.start).toBe(at('2026-09-10T18:00:00'))
  })
})

describe('zones', () => {
  it('shows the same instant as a different wall clock elsewhere', () => {
    const instant = new Date('2026-09-10T16:00:00Z')
    expect(timeInZone(instant, 'America/Los_Angeles')).not.toBe(timeInZone(instant, 'America/New_York'))
  })

  it('treats one zone as matching itself', () => {
    expect(sameWallClock('America/Los_Angeles', 'America/Los_Angeles')).toBe(true)
  })

  it('spots two zones that differ, so a label is worth showing', () => {
    expect(sameWallClock('America/Los_Angeles', 'Europe/London', new Date('2026-09-10T16:00:00Z'))).toBe(false)
  })
})

describe('toLocalInputValue', () => {
  it('keeps local wall clock rather than shifting to UTC', () => {
    // The bug: toISOString().slice(0,16) turned a 9am Pacific suggestion into
    // 16:00, which the datetime-local input then read back as the afternoon.
    const nine = new Date(2026, 8, 10, 9, 0, 0)
    expect(toLocalInputValue(nine.getTime())).toBe('2026-09-10T09:00')
  })

  it('pads single digit months, days, and minutes', () => {
    expect(toLocalInputValue(new Date(2026, 0, 5, 7, 5).getTime())).toBe('2026-01-05T07:05')
  })
})
