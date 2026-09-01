import type { EventDoc, Org, Party } from '../../data/types'
import { toDateKey } from '../../lib/dates'

// M1 site profiles and date contention. Two quiet warnings that the overview
// and the dates tab both read, kept here so the two screens can never disagree
// about what counts as a clash.
//
// Neither check blocks anything. They are the things nobody remembers until
// the morning of, surfaced early enough to be cheap.

/** The venue on this event, if one was added as a party. */
export function venueParty(
  parties: Party[],
  orgs: Org[],
): { party: Party; org: Org } | null {
  for (const party of parties) {
    if (party.roleOnEvent !== 'venue') continue
    const org = orgs.find((o) => o.id === party.orgId)
    if (org) return { party, org }
  }
  return null
}

/**
 * The site's permit thresholds against what this event plans to be. Headcount
 * compares to the capacity target, which is the only number the host has
 * before the day. Amplified sound is a property of the site, so it reads as a
 * standing reminder rather than a comparison.
 */
export function permitChecks(event: EventDoc, org: Org | null): string[] {
  const thresholds = org?.siteProfile?.permitThresholds
  if (!thresholds) return []

  const checks: string[] = []
  const above = thresholds.headcountAbove
  if (above !== null && event.capacityTarget !== null && event.capacityTarget > above) {
    checks.push(`Permit check: over ${above} people at this site`)
  }
  if (thresholds.amplifiedSound) {
    checks.push('Permit check: amplified sound at this site')
  }
  return checks
}

export interface DateClash {
  /** The option on this event that lands on the shared day. */
  optionId: string
  eventId: string
  title: string
}

/**
 * Another event of the host's sitting on the same day. Once a date is
 * confirmed only that day matters; until then every option is still live, so
 * every option gets checked.
 *
 * The other side counts any of its options, proposed or confirmed: a partner
 * asked to hold two mornings in the same week is the thing worth seeing early.
 */
export function dateClashes(event: EventDoc, others: EventDoc[]): DateClash[] {
  const mine = event.confirmedDateOptionId
    ? event.dateOptions.filter((o) => o.id === event.confirmedDateOptionId)
    : event.dateOptions
  if (mine.length === 0) return []

  const clashes: DateClash[] = []
  for (const option of mine) {
    const day = toDateKey(new Date(option.startsAt))
    for (const other of others) {
      if (other.id === event.id) continue
      const hit = other.dateOptions.some((o) => toDateKey(new Date(o.startsAt)) === day)
      if (hit) clashes.push({ optionId: option.id, eventId: other.id, title: other.title })
    }
  }
  return clashes
}

/** One entry per clashing event, for the summary chip on the overview. */
export function clashedEvents(clashes: DateClash[]): { eventId: string; title: string }[] {
  const seen = new Map<string, string>()
  for (const clash of clashes) seen.set(clash.eventId, clash.title)
  return [...seen].map(([eventId, title]) => ({ eventId, title }))
}
