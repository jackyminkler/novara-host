// Time zones.
//
// The load-bearing fact: everything published is absolute epoch milliseconds,
// so overlapping two people's free time is already zone-independent and needs
// no conversion at all. Zones only matter at two edges.
//
// 1. Derivation. Open hours are wall clock ("I am open from 9"), so turning
//    them into absolute time needs a zone. That conversion happens in the
//    host's own browser against her own clock, which is why `atClock` can use
//    plain local Date construction and be correct. It would not be correct in
//    anyone else's browser, which is why derivation never runs anywhere else.
//
// 2. Display. A partner in New York looking at a San Francisco morning must
//    see their own 11am, labelled, so nobody turns up three hours out.

/** The viewer's IANA zone, for example "America/Los_Angeles". */
export function currentZone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC'
  } catch {
    // Some embedded browsers refuse this. UTC is wrong but never throws, and
    // a visibly wrong zone beats a blank page.
    return 'UTC'
  }
}

/** "PDT", "EDT", "GMT+1". Short enough to sit beside a time. */
export function zoneAbbreviation(at: Date, zone: string = currentZone()): string {
  try {
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone: zone,
      timeZoneName: 'short',
    }).formatToParts(at)
    return parts.find((p) => p.type === 'timeZoneName')?.value ?? ''
  } catch {
    return ''
  }
}

/** "9:30 am" in the given zone. */
export function timeInZone(at: Date, zone: string = currentZone()): string {
  try {
    return new Intl.DateTimeFormat('en-US', {
      timeZone: zone,
      hour: 'numeric',
      minute: '2-digit',
      hour12: true,
    })
      .format(at)
      .toLowerCase()
      .replace(/\s/g, ' ')
  } catch {
    return ''
  }
}

/** "Friday, August 28" in the given zone. */
export function dayInZone(at: Date, zone: string = currentZone()): string {
  try {
    return new Intl.DateTimeFormat('en-US', {
      timeZone: zone,
      weekday: 'long',
      month: 'long',
      day: 'numeric',
    }).format(at)
  } catch {
    return ''
  }
}

/**
 * Whether two zones show the same wall clock time at this moment.
 *
 * Compared at a given instant rather than by name, because the answer changes:
 * London and Lisbon agree for most of the year and diverge across a daylight
 * saving switch. Used only to decide whether a zone label is worth showing.
 */
export function sameWallClock(a: string, b: string, at: Date = new Date()): boolean {
  if (a === b) return true
  return timeInZone(at, a) === timeInZone(at, b) && dayInZone(at, a) === dayInZone(at, b)
}
