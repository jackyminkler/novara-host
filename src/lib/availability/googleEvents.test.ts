import { describe, expect, it } from 'vitest'
import { normalizeGoogleEvent, normalizeGoogleEvents, type GoogleEvent } from './googleEvents'

const timed: GoogleEvent = {
  id: 'g1',
  status: 'confirmed',
  summary: 'Launch party',
  location: 'Mission St, San Francisco',
  start: { dateTime: '2026-09-10T19:00:00-07:00' },
  end: { dateTime: '2026-09-10T22:00:00-07:00' },
}

describe('normalizeGoogleEvent', () => {
  it('reads a timed event', () => {
    const out = normalizeGoogleEvent(timed)!
    expect(out.title).toBe('Launch party')
    expect(out.allDay).toBe(false)
    expect(out.transparency).toBe('busy')
  })

  it('drops a cancelled event', () => {
    expect(normalizeGoogleEvent({ ...timed, status: 'cancelled' })).toBeNull()
  })

  it('drops an event she declined', () => {
    const declined = { ...timed, attendees: [{ self: true, responseStatus: 'declined' }] }
    expect(normalizeGoogleEvent(declined)).toBeNull()
  })

  it('keeps an event she accepted', () => {
    const accepted = { ...timed, attendees: [{ self: true, responseStatus: 'accepted' }] }
    expect(normalizeGoogleEvent(accepted)).not.toBeNull()
  })

  it('ignores someone else declining', () => {
    const other = { ...timed, attendees: [{ self: false, responseStatus: 'declined' }] }
    expect(normalizeGoogleEvent(other)).not.toBeNull()
  })

  it('drops working location markers, which would otherwise block whole days', () => {
    expect(normalizeGoogleEvent({ ...timed, eventType: 'workingLocation' })).toBeNull()
  })

  it('drops birthdays', () => {
    expect(normalizeGoogleEvent({ ...timed, eventType: 'birthday' })).toBeNull()
  })

  it('keeps a flight auto-added from Gmail', () => {
    const flight: GoogleEvent = {
      id: 'g2',
      eventType: 'fromGmail',
      summary: 'Flight to NYC',
      start: { dateTime: '2026-09-10T06:15:00-07:00' },
      end: { dateTime: '2026-09-10T14:45:00-04:00' },
    }
    expect(normalizeGoogleEvent(flight)).not.toBeNull()
  })

  it('keeps an out of office block as busy', () => {
    const ooo = { ...timed, eventType: 'outOfOffice' }
    expect(normalizeGoogleEvent(ooo)?.transparency).toBe('busy')
  })

  it('marks a transparent event free', () => {
    expect(normalizeGoogleEvent({ ...timed, transparency: 'transparent' })?.transparency).toBe('free')
  })

  it('reads an all day date as local midnight, not UTC', () => {
    const allDay: GoogleEvent = {
      id: 'g3',
      summary: 'Wedding weekend',
      location: 'Tahoe City',
      start: { date: '2026-09-12' },
      end: { date: '2026-09-14' },
    }
    const out = normalizeGoogleEvent(allDay)!
    expect(out.allDay).toBe(true)
    const start = new Date(out.startsAt)
    expect(start.getHours()).toBe(0)
    expect(start.getDate()).toBe(12)
  })

  it('defaults a missing end rather than dropping the event', () => {
    const out = normalizeGoogleEvent({ ...timed, end: undefined })!
    expect(new Date(out.endsAt).getTime() - new Date(out.startsAt).getTime()).toBe(3600000)
  })

  it('skips unreadable rows without losing the rest of the batch', () => {
    const out = normalizeGoogleEvents([timed, { id: 'bad', start: {} }, timed])
    expect(out).toHaveLength(2)
  })
})
