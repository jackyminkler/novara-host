/**
 * CRM-0: import Luma guest exports into hp_people.
 *
 * Guest CRM Plan section 3. One person per normalized email, with an embedded
 * per-event registration history. Idempotent: re-running the same export
 * changes nothing, because every write is a full recompute from the union of
 * registrations already stored plus the ones in the files given.
 *
 * The merge itself lives in `src/data/people/merge.ts` and the parser in
 * `src/data/people/csv.ts`, shared with the in-app importer (CRM-3). This file
 * is the command line around them: arguments, files, totals, and the write.
 *
 * Personal data stays data (PRD guardrail 6): every path and event key is an
 * argument, nothing about Jacky's events is hardcoded here.
 *
 *   node seed/import-luma-guests.ts --offline \
 *     --event 2026-03-21-crissy-field-launch --csv path/to/guests-export-luma.csv \
 *     --event 2026-06-13-sunrise-run-2 --luma-id evt-tzCKKD80P3Qg8Z4 --csv path/to/other.csv
 *
 *   --offline    no Firestore at all: parse, merge, print the totals. Verification.
 *   --dry-run    read Firestore, report adds and updates, write nothing.
 *   (neither)    write.
 *   --owner UID  owner to stamp. Defaults to $HOST_UID.
 */
import { readFileSync } from 'node:fs'
import { pathToFileURL } from 'node:url'
import { parseCsvRecords } from '../src/data/people/csv.ts'
import { applyRow, type PersonDoc } from '../src/data/people/merge.ts'

// ---------------------------------------------------------------- CLI

interface Job { eventKey: string; csvPath: string; lumaEventId: string | null }

function parseArgs(argv: string[]) {
  const jobs: Job[] = []
  const flags = { offline: false, dryRun: false, owner: process.env.HOST_UID ?? '' }

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]
    const value = argv[i + 1]
    // --event opens a job; --csv and --luma-id attach to the one in hand, so
    // the flags can repeat for as many exports as you pass.
    if (arg === '--event') { jobs.push({ eventKey: value, csvPath: '', lumaEventId: null }); i++ }
    else if (arg === '--csv') { requireJob(jobs, arg).csvPath = value; i++ }
    else if (arg === '--luma-id') { requireJob(jobs, arg).lumaEventId = value; i++ }
    else if (arg === '--owner') { flags.owner = value; i++ }
    else if (arg === '--offline') flags.offline = true
    else if (arg === '--dry-run') flags.dryRun = true
    else throw new Error(`unknown argument ${arg}`)
  }
  for (const job of jobs) if (!job.csvPath) throw new Error(`--event ${job.eventKey} has no --csv`)
  return { jobs, flags }
}

function requireJob(jobs: Job[], flag: string): Job {
  if (!jobs.length) throw new Error(`${flag} must follow an --event`)
  return jobs[jobs.length - 1]
}

async function main() {
  const { jobs, flags } = parseArgs(process.argv.slice(2))
  if (!jobs.length) throw new Error('nothing to import. Pass at least one --event with a --csv.')
  if (!flags.owner) throw new Error('set --owner or HOST_UID. It must be in hp_config/allowlist.')

  const people = new Map<string, PersonDoc>()
  let existingCount = 0

  // Offline skips Firestore entirely, so the merge can be checked against known
  // totals without credentials and without touching the database.
  if (!flags.offline) {
    const { loadExistingPeople } = await import('./people-store.ts')
    existingCount = await loadExistingPeople(people, flags.owner)
    console.log(`read ${existingCount} existing people for this owner\n`)
  }

  for (const job of jobs) {
    const { rows } = parseCsvRecords(readFileSync(job.csvPath, 'utf8'))
    let created = 0
    for (const row of rows) {
      if (applyRow(people, row, job.eventKey, job.lumaEventId, flags.owner) === 'created') created++
    }
    console.log(`${job.eventKey}: ${rows.length} rows, ${created} new to the list`)
  }

  const byTier = { signed_up: 0, invited_only: 0, declined_only: 0 }
  for (const person of people.values()) byTier[person.tier]++
  const repeat = [...people.values()].filter((p) => p.eventCount >= 2).length

  console.log(`\ntotal people      ${people.size}`)
  console.log(`  signed_up       ${byTier.signed_up}`)
  console.log(`  invited_only    ${byTier.invited_only}`)
  console.log(`  declined_only   ${byTier.declined_only}`)
  console.log(`  2+ events       ${repeat}`)

  if (flags.offline) { console.log('\nOffline, nothing read and nothing written.'); return }
  if (flags.dryRun) { console.log('\nDry run, nothing written.'); return }

  const { writePeople } = await import('./people-store.ts')
  const written = await writePeople(people, flags.owner)
  console.log(`\nWrote ${written} people to hp_people.`)
}

// Only run the CLI when this file is the entry point, so importing this module
// never fires an import as a side effect of being read. The merge functions it
// calls live in src/data/people/merge.ts and are importable on their own.
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((err: unknown) => {
    console.error(`\n${err instanceof Error ? err.message : String(err)}`)
    process.exit(1)
  })
}
