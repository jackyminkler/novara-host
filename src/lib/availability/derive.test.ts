import { describe, expect, it } from 'vitest'
import { DEFAULT_RULES, spreadOf } from './spread'
import { blockedIntervals, deriveWindows, openBands } from './derive'
import { fitsInWindow, suggestedStarts, windowsForFriend } from './booking'
import { merge, subtract } from './windows'
import type { BusyEvent } from './types'

function event(over: Partial<BusyEvent>): BusyEvent {
  return {
    id: 'e1',
    title: 'Something',
    startsAt: '2026-09-10T19:00:00',
    endsAt: '2026-09-10T22:00:00',
    allDay: false,
    location: '',
    transparency: 'busy',
    ...over,
  }
}

const at = (iso: string) => new Date(iso).getTime()

describe('interval algebra', () => {
  it('merges touching intervals so no unusable gap survives', () => {
    expect(merge([{ start: 0, end: 10 }, { start: 10, end: 20 }])).toEqual([{ start: 0, end: 20 }])
  })

  it('subtracts a block from the middle, leaving both sides', () => {
    expect(subtract([{ start: 0, end: 100 }], [{ start: 40, end: 60 }]))
      .toEqual([{ start: 0, end: 40 }, { start: 60, end: 100 }])
  })

  it('drops a span entirely covered by a block', () => {
    expect(subtract([{ start: 10, end: 20 }], [{ start: 0, end: 100 }])).toEqual([])
  })
})

describe('spreadOf defaults', () => {
  it('leaves the morning bookable around an evening event in town', () => {
    const s = spreadOf(event({ title: 'Launch party', location: 'San Francisco' }))
    expect(s.kind).toBe('confined')
  })

  it('ignores an all day entry with no location, the birthday reminder case', () => {
    const s = spreadOf(event({
      title: "Dana's birthday",
      allDay: true,
      startsAt: '2026-09-10T00:00:00',
      endsAt: '2026-09-11T00:00:00',
    }))
    expect(s.kind).toBe('ignored')
  })

  it('ignores anything marked free on the calendar', () => {
    expect(spreadOf(event({ transparency: 'free' })).kind).toBe('ignored')
  })

  it('takes the evening before an early flight', () => {
    const s = spreadOf(event({
      title: 'Flight to NYC',
      startsAt: '2026-09-10T06:00:00',
      endsAt: '2026-09-10T14:30:00',
    }))
    expect(s).toMatchObject({ kind: 'spans', from: { dayOffset: -1, time: '18:00' } })
  })

  it('does not take the night before a midday flight', () => {
    const s = spreadOf(event({
      title: 'Flight to NYC',
      startsAt: '2026-09-10T13:00:00',
      endsAt: '2026-09-10T21:30:00',
    }))
    expect(s).toMatchObject({ kind: 'spans', from: { dayOffset: 0, time: 'dayStart' } })
  })

  it('treats a multi day event away from home as out of town', () => {
    const s = spreadOf(event({
      title: 'Wedding',
      location: 'Tahoe City',
      allDay: true,
      startsAt: '2026-09-12T00:00:00',
      endsAt: '2026-09-14T00:00:00',
    }))
    expect(s).toMatchObject({ kind: 'spans', reason: 'out of town' })
  })

  it('keeps a video call confined even though the location is not the home city', () => {
    const s = spreadOf(event({ title: 'Sync', location: 'https://zoom.us/j/123' }))
    expect(s.kind).toBe('confined')
  })
})

describe('weekend extension', () => {
  it('swallows the Sunday after a Saturday out of town', () => {
    // 2026-09-12 is a Saturday.
    const blocked = blockedIntervals([event({
      title: 'Wedding',
      location: 'Tahoe City',
      allDay: true,
      startsAt: '2026-09-12T00:00:00',
      endsAt: '2026-09-13T00:00:00',
    })])
    expect(blocked).toHaveLength(1)
    expect(blocked[0]!.end).toBe(at('2026-09-14T00:00:00'))
  })
})

describe('open hours', () => {
  it('closes the day outside her hours', () => {
    const bands = openBands(
      new Date('2026-09-10T00:00:00'),
      new Date('2026-09-11T00:00:00'),
      DEFAULT_RULES,
    )
    expect(bands).toHaveLength(1)
    expect(new Date(bands[0]!.start).getHours()).toBe(6)
    expect(new Date(bands[0]!.end).getHours()).toBe(21)
  })

  it('starts later at the weekend', () => {
    // 2026-09-12 is a Saturday.
    const bands = openBands(
      new Date('2026-09-12T00:00:00'),
      new Date('2026-09-13T00:00:00'),
      DEFAULT_RULES,
    )
    expect(new Date(bands[0]!.start).getHours()).toBe(7)
    expect(new Date(bands[0]!.start).getMinutes()).toBe(30)
  })

  it('skips a day marked closed entirely', () => {
    const rules = {
      ...DEFAULT_RULES,
      openHours: DEFAULT_RULES.openHours.map((d) => ({ ...d, open: false })),
    }
    expect(openBands(new Date('2026-09-10T00:00:00'), new Date('2026-09-17T00:00:00'), rules)).toEqual([])
  })

  it('keeps a closed day\'s hours, so reopening it restores what was set', () => {
    // The bug this guards: closing a day used to store null and lose the
    // times, so toggling it back on reset it to a default.
    const monday = { start: '10:00', end: '15:00', open: true }
    const closed = { ...monday, open: false }
    const rules = {
      ...DEFAULT_RULES,
      openHours: DEFAULT_RULES.openHours.map((d, i) => (i === 1 ? closed : d)),
    }
    expect(openBands(new Date('2026-09-14T00:00:00'), new Date('2026-09-15T00:00:00'), rules)).toEqual([])
    expect(closed.start).toBe('10:00')
    expect(closed.end).toBe('15:00')

    const reopened = { ...DEFAULT_RULES, openHours: rules.openHours.map((d, i) => (i === 1 ? monday : d)) }
    const bands = openBands(new Date('2026-09-14T00:00:00'), new Date('2026-09-15T00:00:00'), reopened)
    expect(new Date(bands[0]!.start).getHours()).toBe(10)
    expect(new Date(bands[0]!.end).getHours()).toBe(15)
  })
})

describe('deriveWindows', () => {
  const from = new Date('2026-09-10T00:00:00')
  const to = new Date('2026-09-11T00:00:00')

  it('leaves one long window on a day with nothing on it', () => {
    const windows = deriveWindows({ events: [], from, to })
    expect(windows).toHaveLength(1)
    expect(new Date(windows[0]!.start).getHours()).toBe(6)
  })

  it('splits the day around an evening event, keeping the morning', () => {
    const windows = deriveWindows({
      events: [event({ title: 'Launch party', location: 'San Francisco' })],
      from,
      to,
    })
    expect(windows).toHaveLength(1)
    // 7pm event with a 30 minute buffer closes the day at 6:30pm.
    expect(new Date(windows[0]!.end).getHours()).toBe(18)
    expect(new Date(windows[0]!.end).getMinutes()).toBe(30)
  })

  it('offers nothing on a travel day', () => {
    const windows = deriveWindows({
      events: [event({
        title: 'Flight to NYC',
        startsAt: '2026-09-10T13:00:00',
        endsAt: '2026-09-10T21:30:00',
      })],
      from,
      to,
    })
    expect(windows).toEqual([])
  })

  it('drops a gap too short to be worth offering', () => {
    // Two meetings 1h45m apart. Buffers eat 30 minutes each side, leaving 45
    // minutes, which is exactly the floor, so a slightly tighter gap vanishes.
    const windows = deriveWindows({
      events: [
        event({ title: 'A', location: 'San Francisco', startsAt: '2026-09-10T10:00:00', endsAt: '2026-09-10T11:00:00' }),
        event({ title: 'B', location: 'San Francisco', startsAt: '2026-09-10T12:30:00', endsAt: '2026-09-10T13:30:00' }),
      ],
      from,
      to,
    })
    expect(windows.some((w) => new Date(w.start).getHours() === 11 && new Date(w.start).getMinutes() === 30)).toBe(false)
  })

  it('never offers time before the window start', () => {
    const noon = new Date('2026-09-10T12:00:00')
    const windows = deriveWindows({ events: [], from: noon, to })
    expect(windows.every((w) => w.start >= noon.getTime())).toBe(true)
  })

  it('removes time that is already booked', () => {
    const windows = deriveWindows({
      events: [],
      from,
      to,
      alsoBlocked: [{ start: at('2026-09-10T10:00:00'), end: at('2026-09-10T11:00:00') }],
    })
    expect(windows).toHaveLength(2)
  })
})

describe('windowsForFriend', () => {
  const published = [{ start: at('2026-09-10T09:00:00'), end: at('2026-09-10T17:00:00') }]
  const opts = {
    from: new Date('2026-09-10T00:00:00'),
    to: new Date('2026-09-11T00:00:00'),
    taken: [],
    minMinutes: 45,
  }

  it('passes an untouched window through', () => {
    expect(windowsForFriend(published, opts)).toEqual(published)
  })

  it('cuts a booking out of the middle', () => {
    const out = windowsForFriend(published, {
      ...opts,
      taken: [{ startsAt: '2026-09-10T12:00:00', endsAt: '2026-09-10T13:00:00' }],
    })
    expect(out).toHaveLength(2)
    expect(out[0]!.end).toBe(at('2026-09-10T12:00:00'))
    expect(out[1]!.start).toBe(at('2026-09-10T13:00:00'))
  })

  it('drops a remnant shorter than the floor', () => {
    const out = windowsForFriend(published, {
      ...opts,
      taken: [{ startsAt: '2026-09-10T09:30:00', endsAt: '2026-09-10T17:00:00' }],
    })
    expect(out).toEqual([])
  })

  it('clips to the friend horizon', () => {
    const out = windowsForFriend(published, { ...opts, to: new Date('2026-09-10T11:00:00') })
    expect(out[0]!.end).toBe(at('2026-09-10T11:00:00'))
  })
})

describe('fitsInWindow', () => {
  const windows = [{ start: at('2026-09-10T09:00:00'), end: at('2026-09-10T11:00:00') }]

  it('accepts a booking wholly inside', () => {
    expect(fitsInWindow(windows, '2026-09-10T09:30:00', 60)).toBe(true)
  })

  it('rejects one that runs past the end, rather than shortening it', () => {
    expect(fitsInWindow(windows, '2026-09-10T10:30:00', 60)).toBe(false)
  })

  it('rejects one that starts before the window opens', () => {
    expect(fitsInWindow(windows, '2026-09-10T08:30:00', 30)).toBe(false)
  })

  it('rejects a nonsense duration', () => {
    expect(fitsInWindow(windows, '2026-09-10T09:30:00', 0)).toBe(false)
  })
})

describe('suggestedStarts', () => {
  it('lands on the half hour and leaves room for the whole meeting', () => {
    const starts = suggestedStarts(
      { start: at('2026-09-10T09:10:00'), end: at('2026-09-10T11:00:00') },
      60,
    )
    expect(starts.map((s) => new Date(s).toTimeString().slice(0, 5))).toEqual(['09:30', '10:00'])
  })

  it('returns nothing when the window cannot hold the duration', () => {
    expect(
      suggestedStarts({ start: at('2026-09-10T09:00:00'), end: at('2026-09-10T09:30:00') }, 60),
    ).toEqual([])
  })
})
