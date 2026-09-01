import type { Person } from '../../data/types'
// Side-effect import. `matchcore.js` is a UMD bundle: with no CommonJS `module`
// around it assigns itself to `self`, so importing it for its side effect and
// reading the global back is the whole wrapper. That is deliberate. The
// alternative was adding an `export default` line to a vendored file whose
// entire value is being byte-identical to the console copy, and a file the
// drift rule says must not be edited is not a file to edit for module syntax.
import './matchcore.js'

/**
 * M-match-0, rank in the host app.
 *
 * Everything the app calls goes through here, so `matchcore.js` stays a
 * verbatim copy and the seam between it and the app has types. The engine is
 * pure: rows in, ranked matches out, no network, no Firestore, no clock.
 *
 * Decided 2026-08-24 (MATCHING.md section 09): rank runs in-app on the
 * parity-verified JavaScript port; sparks and pods stay Python-canonical
 * behind a service that is not deployed yet, so this file knows only rank.
 */

/** The engine version stamped onto every stored run. */
export const ENGINE_VERSION = 'matchcore rank, console copy 482b9468'

/** Firestore documents cap at about 1 MB. Refuse well short of it. */
export const RESULTS_BYTE_CAP = 800_000

/** One spreadsheet row: header text to cell text, exactly what a CSV would give. */
export type EngineRow = Record<string, string>

/** One ranked match, as `scorePair` plus the ranking key `rank` adds. */
export interface RankMatch {
  name: string
  email: string
  /** Fit across the dimensions both people answered, 0 to 1. */
  total: number
  /** The share of the weight backed by real data on both sides, 0 to 1. */
  confidence: number
  /** Ranking key: total minus the confidence penalty. Sorts the list. */
  lb: number
  breakdown: Record<string, number | null>
  /** Human readable reasons, built only from what both sides supplied. */
  why: string
}

export interface RankPerson {
  name: string
  email: string
  matches: RankMatch[]
}

/** Keyed by the engine's person id, which is the lowercased email or name. */
export type RankResults = Record<string, RankPerson>

interface Matchcore {
  DEFAULT_COLUMNS: Record<string, string[]>
  DEFAULT_WEIGHTS: Record<string, number>
  resolveCols(header: string[], columns: Record<string, string[]>): Record<string, string>
  loadRows(
    rows: EngineRow[],
    columns?: Record<string, string | string[]>,
  ): { people: unknown[]; cols: Record<string, string> }
  rank(
    people: unknown[],
    opts?: { weights?: Record<string, number>; top_n?: number; lambda?: number },
  ): RankResults
}

function engine(): Matchcore {
  const found = (globalThis as { matchcore?: Matchcore }).matchcore
  if (!found) throw new Error('The matching engine did not load.')
  return found
}

/**
 * What rank reads, and the question to add when it reads nothing.
 *
 * The engine resolves columns by case-insensitive substring, so a signup
 * question keeps its own wording as long as it contains one of the fragments
 * in `matchcore.DEFAULT_COLUMNS`. The suggested questions below are worded to
 * contain theirs, which is why they read the way they do.
 *
 * Nothing here is required in the gate sense: an absent column drops out and
 * the weights renormalize (MATCHING.md section 05, and the spreadsheet rule of
 * 2026-08-23). Missing columns cost accuracy, and only a run with no column at
 * all cannot score.
 */
export interface RankColumnNeed {
  /** The engine dimension this feeds. */
  dimension: 'pace' | 'availability' | 'runType' | 'neighborhood' | 'topic'
  /** Keys in `DEFAULT_COLUMNS`. Any one of them satisfies the dimension. */
  keys: string[]
  /** What the answers are, in one phrase, for the host reading the tab. */
  label: string
  /** The question to put on the signup form. */
  question: string
}

export const RANK_COLUMN_NEEDS: RankColumnNeed[] = [
  {
    dimension: 'pace',
    keys: ['pace_min', 'pace_max', 'pace_bands'],
    label: 'Pace',
    question: 'What is your fastest pace, and your slowest pace? Minutes per mile.',
  },
  {
    dimension: 'availability',
    keys: ['availability'],
    label: 'When they can run',
    question: 'When can you usually run? Let people pick more than one.',
  },
  {
    dimension: 'runType',
    keys: ['run_types'],
    label: 'Kind of runs',
    question: 'What kind of runs do you like? Let people pick more than one.',
  },
  {
    dimension: 'neighborhood',
    keys: ['neighborhood'],
    label: 'Neighborhood',
    question: 'What neighborhood are you in?',
  },
  {
    dimension: 'topic',
    keys: ['share', 'learn'],
    label: 'Topics',
    question:
      'What topics do you have experience with, and what topics would you like to learn?',
  },
]

export interface ColumnReport {
  /** Dimensions these rows can be scored on. */
  present: RankColumnNeed[]
  /** Dimensions with nothing to read, each carrying the question to add. */
  missing: RankColumnNeed[]
  /** Which header the engine matched for each column key. */
  resolved: Record<string, string>
  /** False when no dimension resolved, so a run would score nothing at all. */
  scorable: boolean
}

/**
 * Which of rank's dimensions these rows can actually feed. The tab uses this
 * to tell "no guests" apart from "guests whose signup form asked none of the
 * matching questions", which are the same blank screen and completely
 * different problems.
 */
export function requiredColumnsPresent(rows: EngineRow[]): ColumnReport {
  const header = rows.length > 0 ? Object.keys(rows[0]) : []
  const resolved = rows.length > 0 ? engine().resolveCols(header, engine().DEFAULT_COLUMNS) : {}

  const present: RankColumnNeed[] = []
  const missing: RankColumnNeed[] = []
  for (const need of RANK_COLUMN_NEEDS) {
    if (need.keys.some((key) => key in resolved)) present.push(need)
    else missing.push(need)
  }
  return { present, missing, resolved, scorable: present.length > 0 }
}

const NAME_COLUMN = 'Name'
const EMAIL_COLUMN = 'Email'

/**
 * The event's approved guests as engine rows.
 *
 * Registration answers pass through under their own question text rather than
 * being renamed to canonical column keys. That is the point of the engine's
 * substring resolver: the host's own signup wording is the header, so a form
 * that asks "What is your fastest pace?" needs no mapping table here and no
 * edit when the wording changes next season.
 *
 * Every row carries every question any row carried, blank where unanswered,
 * because the engine resolves columns from the first row's header alone.
 */
export function peopleToEngineRows(people: Person[], eventKey: string): EngineRow[] {
  const attending: { person: Person; answers: Record<string, string> }[] = []
  for (const person of people) {
    const registration = person.registrations.find(
      (r) => r.eventKey === eventKey && r.status === 'approved',
    )
    if (registration) attending.push({ person, answers: registration.answers ?? {} })
  }

  // Name and email lead, so a question that happens to mention either word
  // cannot win the resolver ahead of the real one.
  const questions: string[] = []
  for (const { answers } of attending) {
    for (const question of Object.keys(answers)) {
      const key = question.trim().toLowerCase()
      if (key === 'name' || key === 'email') continue
      if (!questions.includes(question)) questions.push(question)
    }
  }

  return attending.map(({ person, answers }) => {
    const row: EngineRow = {
      [NAME_COLUMN]: person.fullName,
      [EMAIL_COLUMN]: person.email,
    }
    for (const question of questions) row[question] = answers[question] ?? ''
    return row
  })
}

export interface RankOutcome {
  results: RankResults
  /** People the engine read from the rows. */
  peopleCount: number
  /** How many of them came out with at least one match. */
  matchedCount: number
  resolvedColumns: Record<string, string>
}

/**
 * Score everyone against everyone and keep each person's top matches.
 *
 * Throws when the parse-rate guard fires (MATCHING.md trap 10): a pace column
 * that mostly does not parse produces a page of identical fallback scores that
 * looks like a working result, so the engine refuses instead.
 */
export function runRank(rows: EngineRow[], topN = 3): RankOutcome {
  const core = engine()
  const { people, cols } = core.loadRows(rows, {})
  const results = core.rank(people, { top_n: topN })
  const matchedCount = Object.values(results).filter((r) => r.matches.length > 0).length
  return { results, peopleCount: people.length, matchedCount, resolvedColumns: cols }
}

/** Bytes a stored run would take, so an oversized one is refused before the write. */
export function resultsByteSize(results: unknown): number {
  return new TextEncoder().encode(JSON.stringify(results)).length
}

/** Narrows a stored run's payload back to rank's shape, or null if it is not one. */
export function asRankResults(value: unknown): RankResults | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  const entries = Object.values(value as Record<string, unknown>)
  if (entries.length === 0) return null
  const ok = entries.every((entry) => {
    if (!entry || typeof entry !== 'object') return false
    const person = entry as Partial<RankPerson>
    return typeof person.name === 'string' && Array.isArray(person.matches)
  })
  return ok ? (value as RankResults) : null
}
