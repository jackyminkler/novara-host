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

  it('honours a minimum turnout', () => {
    const out = suggest(three, { durationMinutes: 60, limit: 5, minFree: 3 })
    expect(out.every((o) => o.free.length === 3)).toBe(true)
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
