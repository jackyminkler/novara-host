#!/usr/bin/env node
/**
 * Write already-happened events into hp_events, with their parties.
 *
 * Content lives in seed/events.json, gitignored, because a host's events are
 * their data and never application code (PRD build guardrail 6).
 *
 *   FIRESTORE_EMULATOR_HOST=127.0.0.1:8080 node seed/seed-events.mjs
 *   GOOGLE_APPLICATION_CREDENTIALS=/path/to/key.json node seed/seed-events.mjs
 *   node seed/seed-events.mjs --dry-run
 *
 * Idempotent, matched on (ownerUid, sourceKey): a second run updates the same
 * documents rather than creating a second copy of the same past event.
 */
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { adminDb, announceTarget } from './admin.mjs'

const here = dirname(fileURLToPath(import.meta.url))
const dryRun = process.argv.includes('--dry-run')

let content
try {
  content = JSON.parse(readFileSync(join(here, 'events.json'), 'utf8'))
} catch {
  console.error('No seed/events.json found. Copy seed/events.example.json and fill it in.')
  process.exit(1)
}
if (!content.ownerUid || content.ownerUid === 'REPLACE_WITH_HOST_UID') {
  console.error('Set ownerUid in seed/events.json to the host UID from hp_config/allowlist.')
  process.exit(1)
}

announceTarget()
const db = adminDb()
const now = new Date().toISOString()
const owner = content.ownerUid

// Parties name their org by name; resolve once so a typo is reported rather
// than written as a party pointing at nothing.
const orgSnap = await db.collection('hp_orgs').where('ownerUid', '==', owner).get()
const orgIdByName = new Map(orgSnap.docs.map((d) => [d.data().name, d.id]))
console.log(`${orgIdByName.size} partner orgs available to link\n`)

for (const event of content.events ?? []) {
  const existing = await db
    .collection('hp_events')
    .where('ownerUid', '==', owner)
    .where('sourceKey', '==', event.sourceKey)
    .limit(1)
    .get()

  // One confirmed option rather than a set of proposals: these already
  // happened, so there is nothing left to choose between.
  const optionId = 'confirmed'
  const doc = {
    ownerUid: owner,
    hostUid: owner,
    hostDisplayName: content.hostDisplayName ?? '',
    sourceKey: event.sourceKey,
    title: event.title,
    status: event.status ?? 'wrapped',
    description: event.description ?? '',
    dateOptions: [{ id: optionId, startsAt: event.startsAt, label: event.dateLabel ?? '' }],
    confirmedDateOptionId: optionId,
    location: event.location ?? { name: '', meetPoint: '', finishPoint: '', notes: '' },
    links: (event.links ?? []).map((link, i) => ({
      id: `link-${i + 1}`,
      label: link.label,
      url: link.url,
      owner: 'host',
      status: link.status ?? 'final',
    })),
    capacityTarget: event.capacityTarget ?? null,
    campaignGoal: event.campaignGoal ?? '',
    governance: event.governance ?? {
      officialListing: '', listingUrl: '', guestContactsOwner: '', dualPosts: '',
    },
    signupCount: event.signupCount ?? null,
    recap: {
      headcount: event.recap?.headcount ?? null,
      remembered: [],
      photosLink: event.recap?.photosLink ?? '',
      postsRan: event.recap?.postsRan ?? '',
      generatedAt: null,
    },
    templateId: null,
    createdAt: now,
  }

  const parties = event.parties ?? []
  const missing = parties.filter((p) => !orgIdByName.has(p.org)).map((p) => p.org)

  if (dryRun) {
    console.log(`${existing.empty ? 'create' : 'update'}  ${event.sourceKey}  ${event.title}`)
    console.log(`         ${parties.length - missing.length} of ${parties.length} parties link`)
    if (missing.length) console.log(`         no org named: ${missing.join(', ')}`)
    continue
  }

  const ref = existing.empty ? db.collection('hp_events').doc() : existing.docs[0].ref
  await ref.set(doc, { merge: true })

  for (const [i, party] of parties.entries()) {
    const orgId = orgIdByName.get(party.org)
    if (!orgId) {
      console.log(`  skipped party "${party.org}", no org by that name`)
      continue
    }
    // Deterministic party id from the org, so a re-run updates rather than
    // adding a second copy of the same partner on the same event.
    await ref.collection('parties').doc(orgId).set(
      {
        orgId,
        roleOnEvent: party.role,
        status: 'confirmed',
        terms: { gives: party.gives ?? '', gets: party.gets ?? '' },
        goal: party.goal ?? '',
        cta: party.cta ?? '',
        // Recorded by the host after the fact, not answered through a link.
        dateResponses: { confirmed: { value: 'yes', source: 'host', note: '', at: now } },
        constraintNote: '',
        tokenId: null,
        nudgeCount: 0,
        profile: {},
        customFields: [],
        outcomes: [],
        order: i,
      },
      { merge: true },
    )
  }

  console.log(
    `${existing.empty ? 'created' : 'updated'}  ${event.sourceKey}  ${event.title}` +
      `  (${parties.length - missing.length} parties)`,
  )
  if (missing.length) console.log(`         no org named: ${missing.join(', ')}`)
}

console.log(dryRun ? '\nDry run complete, nothing written.' : '\nEvents seeded.')
process.exit(0)
