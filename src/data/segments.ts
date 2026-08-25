import type { Person } from './types'

/**
 * Saved segments: the handful of questions a host actually asks their guest
 * list. Pure functions over the already-loaded set, which is why the People
 * page reads everything once instead of querying per filter.
 *
 * Two of these could not be done as Firestore queries at all. Referrals are a
 * graph question over the whole set, and the waitlist one reads inside a map
 * nested in an array. Loading once and filtering in memory is what makes them
 * possible, not just convenient.
 *
 * Deliberately generic. No partner name, question text, or event key appears
 * here: those are the host's data and arrive through the importer
 * (PRD build guardrail 6).
 */
export interface Segment {
  id: string
  label: string
  /** Shown under the label. Sentence case, plain voice, no em dashes. */
  description: string
  select: (people: Person[]) => Person[]
}

/** How many other people name this person's email as their referrer. */
export function referralCounts(people: Person[]): Map<string, number> {
  const counts = new Map<string, number>()
  for (const person of people) {
    for (const email of person.referredBy) {
      const key = email.trim().toLowerCase()
      if (key) counts.set(key, (counts.get(key) ?? 0) + 1)
    }
  }
  return counts
}

/**
 * Any registration question that reads as a waitlist opt-in, answered yes.
 * Matched on the question text rather than a known key, because the questions
 * differ per event and belong to whoever ran that event.
 */
export function saidYesToAWaitlist(person: Person): boolean {
  return person.registrations.some((registration) =>
    Object.entries(registration.answers).some(
      ([question, answer]) =>
        /waitlist/i.test(question) && answer.trim().toLowerCase() === 'yes',
    ),
  )
}

export const SEGMENTS: Segment[] = [
  {
    id: 'repeat',
    label: 'Repeat attendees',
    description: 'Came to two or more. Your strongest signal.',
    select: (people) => people.filter((p) => p.eventCount >= 2),
  },
  {
    id: 'not-in-app',
    label: 'Came, not in the app',
    description: 'Signed up for an event but has no app account yet.',
    select: (people) => people.filter((p) => p.tier === 'signed_up' && !p.appUserUid),
  },
  {
    id: 'invited-never-came',
    label: 'Invited, never came',
    description: 'On an invite list, never registered for anything.',
    select: (people) => people.filter((p) => p.tier === 'invited_only'),
  },
  {
    id: 'waitlist-yes',
    label: 'Said yes to a waitlist',
    description: 'Opted in to a partner waitlist on a registration form.',
    select: (people) => people.filter(saidYesToAWaitlist),
  },
  {
    id: 'superconnectors',
    label: 'Brought someone',
    description: 'Referred at least one other person, most first.',
    select: (people) => {
      const counts = referralCounts(people)
      return people
        .filter((p) => (counts.get(p.email) ?? 0) > 0)
        .sort((a, b) => (counts.get(b.email) ?? 0) - (counts.get(a.email) ?? 0))
    },
  },
]
