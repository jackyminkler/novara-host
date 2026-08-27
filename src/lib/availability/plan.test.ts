import { describe, expect, it } from 'vitest'
import {
  PLAN_DEFAULT_HOURS,
  allowedDayGroups,
  buildAllowedWindows,
  clipWindows,
  daysCoveredBy,
  endOfDayMs,
  freeFromDays,
  hoursFromWeekdays,
  planPhase,
} from './plan'
import type { DayHours } from './types'

const at = (iso: string) => new Date(iso).getTime()
const day = (y: number, m: number, d: number) => new Date(y, m - 1, d)

function plan(fields: Partial<Parameters<typeof planPhase>[0]> = {}) {
  return { settledStartsAt: null, respondByMs: null, happenByMs: null, ...fields }
}

describe('planPhase', () => {
  const respondBy = endOfDayMs('2026-09-10')
  const happenBy = endOfDayMs('2026-09-12')
  const before = at('2026-09-01T09:00:00')
  const after = at('2026-09-20T09:00:00')

  it('reads a plan with nothing set as open', () => {
    expect(planPhase(plan(), before)).toBe('open')
  })

  it('stays open while both deadlines are ahead', () => {
    expect(planPhase(plan({ respondByMs: respondBy, happenByMs: happenBy }), before)).toBe('open')
  })

  it('calls a pick settled even after both deadlines have gone', () => {
    const settled = plan({
      settledStartsAt: '2026-09-11T18:00:00',
      respondByMs: respondBy,
      happenByMs: happenBy,
    })
    expect(planPhase(settled, after)).toBe('settled')
    expect(planPhase(settled, before)).toBe('settled')
  })

  it('calls an unpicked plan passed once its day has gone', () => {
    expect(planPhase(plan({ respondByMs: respondBy, happenByMs: happenBy }), after)).toBe('passed')
  })

  it('passes on the happen-by date alone, with no respond-by set', () => {
    expect(planPhase(plan({ happenByMs: happenBy }), after)).toBe('passed')
  })

  it('closes when answers are over but the day is still ahead', () => {
    const between = at('2026-09-11T09:00:00')
    expect(planPhase(plan({ respondByMs: respondBy, happenByMs: happenBy }), between)).toBe('closed')
  })

  it('closes on the respond-by date alone, with no happen-by set', () => {
    expect(planPhase(plan({ respondByMs: respondBy }), after)).toBe('closed')
  })

  it('counts the deadline day itself as still open', () => {
    expect(planPhase(plan({ respondByMs: respondBy }), respondBy - 1)).toBe('open')
    expect(planPhase(plan({ respondByMs: respondBy }), respondBy)).toBe('closed')
  })

  it('counts the happen-by day itself as not yet passed', () => {
    expect(planPhase(plan({ happenByMs: happenBy }), happenBy - 1)).toBe('open')
    expect(planPhase(plan({ happenByMs: happenBy }), happenBy)).toBe('passed')
  })
})

describe('endOfDayMs', () => {
  it('is local midnight after the day, so the whole day counts', () => {
    expect(endOfDayMs('2026-09-12')).toBe(day(2026, 9, 13).getTime())
  })

  it('rolls across a month end', () => {
    expect(endOfDayMs('2026-09-30')).toBe(day(2026, 10, 1).getTime())
  })
})

describe('buildAllowedWindows', () => {
  it('gives one window a day inside the plan hours', () => {
    const out = buildAllowedWindows(PLAN_DEFAULT_HOURS, day(2026, 9, 10), day(2026, 9, 13))
    expect(out).toHaveLength(3)
    expect(out[0]!.start).toBe(at('2026-09-10T09:00:00'))
    expect(out[0]!.end).toBe(at('2026-09-10T22:00:00'))
  })

  it('clips the first and last day to the range it was given', () => {
    const out = buildAllowedWindows(
      PLAN_DEFAULT_HOURS,
      new Date(2026, 8, 10, 12, 0),
      new Date(2026, 8, 11, 15, 0),
    )
    expect(out).toHaveLength(2)
    expect(out[0]!.start).toBe(at('2026-09-10T12:00:00'))
    expect(out[0]!.end).toBe(at('2026-09-10T22:00:00'))
    expect(out[1]!.start).toBe(at('2026-09-11T09:00:00'))
    expect(out[1]!.end).toBe(at('2026-09-11T15:00:00'))
  })

  it('skips a closed day', () => {
    // 2026-09-12 is a Saturday, so weekends only leaves one day in the week.
    const out = buildAllowedWindows(hoursFromWeekdays([6]), day(2026, 9, 10), day(2026, 9, 17))
    expect(out).toHaveLength(1)
    expect(new Date(out[0]!.start).getDay()).toBe(6)
  })

  it('drops a day whose hours are inverted rather than offering the whole day', () => {
    const broken: DayHours[] = PLAN_DEFAULT_HOURS.map((h, i) =>
      i === 5 ? { ...h, start: '22:00', end: '09:00' } : h,
    )
    // 2026-09-11 is a Friday.
    const out = buildAllowedWindows(broken, day(2026, 9, 10), day(2026, 9, 13))
    expect(out).toHaveLength(2)
    expect(out.some((w) => new Date(w.start).getDay() === 5)).toBe(false)
  })

  it('drops a day the plan closes at the same minute it opens', () => {
    const closedByHours: DayHours[] = PLAN_DEFAULT_HOURS.map((h) => ({ ...h, end: h.start }))
    expect(buildAllowedWindows(closedByHours, day(2026, 9, 10), day(2026, 9, 13))).toEqual([])
  })

  it('returns nothing for an empty range', () => {
    expect(buildAllowedWindows(PLAN_DEFAULT_HOURS, day(2026, 9, 10), day(2026, 9, 10))).toEqual([])
  })

  it('stays monotonic and separate across a daylight saving change', () => {
    // March 8 2026 is the US spring forward. The assertions hold in any zone:
    // an hour appearing or disappearing must not reorder days, overlap two of
    // them, or turn one inside out.
    const out = buildAllowedWindows(PLAN_DEFAULT_HOURS, day(2026, 3, 6), day(2026, 3, 12))
    expect(out).toHaveLength(6)
    for (const window of out) {
      const hours = (window.end - window.start) / 3600000
      expect(hours).toBeGreaterThan(11)
      expect(hours).toBeLessThan(15)
    }
    for (let i = 1; i < out.length; i += 1) {
      expect(out[i]!.start).toBeGreaterThan(out[i - 1]!.end)
    }
  })
})

describe('hoursFromWeekdays', () => {
  it('opens the listed days on the default window and closes the rest', () => {
    const hours = hoursFromWeekdays([0, 6])
    expect(hours.map((h) => h.open)).toEqual([true, false, false, false, false, false, true])
    expect(hours[0]).toMatchObject({ start: '09:00', end: '22:00' })
  })

  it('reads an empty list as any day, which is what it meant', () => {
    expect(hoursFromWeekdays([]).every((h) => h.open)).toBe(true)
  })

  it('leaves the defaults alone', () => {
    hoursFromWeekdays([1])
    expect(PLAN_DEFAULT_HOURS.every((h) => h.open)).toBe(true)
  })
})

describe('clipWindows', () => {
  const allowed = [
    { start: at('2026-09-10T09:00:00'), end: at('2026-09-10T22:00:00') },
    { start: at('2026-09-11T09:00:00'), end: at('2026-09-11T22:00:00') },
  ]

  it('with no windows and no end, runs from the floor to the largest millisecond', () => {
    const out = clipWindows(null, at('2026-09-10T12:00:00'), null)
    expect(out).toEqual([{ start: at('2026-09-10T12:00:00'), end: Number.MAX_SAFE_INTEGER }])
  })

  it('with no windows and an end, is the pair of bounds', () => {
    const out = clipWindows(null, at('2026-09-10T12:00:00'), at('2026-09-12T00:00:00'))
    expect(out).toEqual([{ start: at('2026-09-10T12:00:00'), end: at('2026-09-12T00:00:00') }])
  })

  it('with windows and no end, only trims the front', () => {
    const out = clipWindows(allowed, at('2026-09-10T12:00:00'), null)
    expect(out).toHaveLength(2)
    expect(out[0]!.start).toBe(at('2026-09-10T12:00:00'))
    expect(out[1]).toEqual(allowed[1])
  })

  it('with windows and an end, trims both and drops what falls outside', () => {
    const out = clipWindows(allowed, at('2026-09-10T12:00:00'), at('2026-09-11T10:00:00'))
    expect(out).toEqual([
      { start: at('2026-09-10T12:00:00'), end: at('2026-09-10T22:00:00') },
      { start: at('2026-09-11T09:00:00'), end: at('2026-09-11T10:00:00') },
    ])
  })

  it('allows nothing once the end is already behind the floor', () => {
    expect(clipWindows(allowed, at('2026-09-12T00:00:00'), at('2026-09-11T00:00:00'))).toEqual([])
    expect(clipWindows(null, at('2026-09-12T00:00:00'), at('2026-09-11T00:00:00'))).toEqual([])
  })
})

describe('allowedDayGroups', () => {
  const allowed = buildAllowedWindows(PLAN_DEFAULT_HOURS, day(2026, 9, 10), day(2026, 9, 15))

  it('makes one row a day, in order', () => {
    const groups = allowedDayGroups(allowed, at('2026-09-09T00:00:00'))
    expect(groups.map((g) => g.dayKey)).toEqual([
      '2026-09-10',
      '2026-09-11',
      '2026-09-12',
      '2026-09-13',
      '2026-09-14',
    ])
    expect(groups[0]!.dayStartMs).toBe(day(2026, 9, 10).getTime())
  })

  it('drops the days already behind', () => {
    const groups = allowedDayGroups(allowed, at('2026-09-12T12:00:00'))
    expect(groups.map((g) => g.dayKey)).toEqual(['2026-09-12', '2026-09-13', '2026-09-14'])
  })

  it('keeps a window crossing midnight on the day it starts', () => {
    const groups = allowedDayGroups(
      [{ start: at('2026-09-10T22:00:00'), end: at('2026-09-11T02:00:00') }],
      at('2026-09-10T00:00:00'),
    )
    expect(groups).toHaveLength(1)
    expect(groups[0]!.dayKey).toBe('2026-09-10')
  })

  it('has nothing to offer for nothing allowed', () => {
    expect(allowedDayGroups([], at('2026-09-10T00:00:00'))).toEqual([])
  })
})

describe('freeFromDays and daysCoveredBy', () => {
  const allowed = buildAllowedWindows(PLAN_DEFAULT_HOURS, day(2026, 9, 10), day(2026, 9, 15))
  const groups = allowedDayGroups(allowed, at('2026-09-09T00:00:00'))

  it('turns picked days into the free time those days allow', () => {
    const free = freeFromDays(['2026-09-11', '2026-09-13'], groups)
    expect(free).toHaveLength(2)
    expect(free[0]!.start).toBe(at('2026-09-11T09:00:00'))
    expect(free[1]!.end).toBe(at('2026-09-13T22:00:00'))
  })

  it('ignores a day key the plan does not offer', () => {
    expect(freeFromDays(['2026-12-25'], groups)).toEqual([])
    expect(freeFromDays([], groups)).toEqual([])
  })

  it('reads the same days back, so the picker comes back ticked', () => {
    const picked = ['2026-09-10', '2026-09-14']
    expect(daysCoveredBy(freeFromDays(picked, groups), groups)).toEqual(picked)
  })

  it('does not count a day someone is only free part of', () => {
    const partial = [{ start: at('2026-09-11T10:00:00'), end: at('2026-09-11T20:00:00') }]
    expect(daysCoveredBy(partial, groups)).toEqual([])
  })

  it('counts a day someone free stretch more than covers', () => {
    const wide = [{ start: at('2026-09-11T00:00:00'), end: at('2026-09-12T00:00:00') }]
    expect(daysCoveredBy(wide, groups)).toEqual(['2026-09-11'])
  })

  it('reads nothing free as no days picked', () => {
    expect(daysCoveredBy([], groups)).toEqual([])
  })
})
