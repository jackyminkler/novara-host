#!/usr/bin/env node
// One-time setup: writes the host's own templates and partner directory into
// Firestore. Content lives in seed/content.json, which is gitignored, because
// templates and partners are the host's data and never application code
// (PRD build guardrail 6).
//
//   GOOGLE_APPLICATION_CREDENTIALS=/path/to/key.json node seed/seed.mjs
//   FIRESTORE_EMULATOR_HOST=127.0.0.1:8080 node seed/seed.mjs   against the emulator
//   node seed/seed.mjs --dry-run     to print what would be written
//   node seed/seed.mjs --only-new    create what is missing, never overwrite
//
// Re-running is safe: documents are matched by name and updated in place, so
// nothing is duplicated and nothing the host has edited by hand is deleted.

import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { adminDb, announceTarget } from './admin.mjs'

const here = dirname(fileURLToPath(import.meta.url))
const dryRun = process.argv.includes('--dry-run')
// For a first run against a database that already holds hand-edited documents:
// create what is missing and touch nothing that exists. The merge below
// replaces every field present in content.json, so an existing document
// silently loses anything typed into the app that this file also carries.
const onlyNew = process.argv.includes('--only-new')

let content
try {
  content = JSON.parse(readFileSync(join(here, 'content.json'), 'utf8'))
} catch {
  console.error('No seed/content.json found. Copy seed/content.example.json and fill it in.')
  process.exit(1)
}

if (!content.ownerUid || content.ownerUid === 'REPLACE_WITH_HOST_UID') {
  console.error('Set ownerUid in seed/content.json to the host UID from hp_config/allowlist.')
  process.exit(1)
}

announceTarget()
const db = adminDb()
const now = new Date().toISOString()

/** Find an existing doc by name so a second run updates instead of duplicating. */
async function upsert(collection, name, data) {
  // Matched by name, then narrowed to this owner: two hosts can each have a
  // template called "Sunrise run" and neither should overwrite the other's.
  // Firestore cannot query for a missing field, so documents written before
  // ownerUid existed are found by name and adopted here rather than
  // duplicated. The write below stamps the owner on them.
  const byName = await db.collection(collection).where('name', '==', name).get()
  const match = byName.docs.find((doc) => {
    const owner = doc.get('ownerUid')
    return owner === undefined || owner === content.ownerUid
  })

  if (onlyNew && match) {
    console.log(`skipped ${collection}: ${name} (exists, --only-new)`)
    return
  }
  if (dryRun) {
    console.log(`${match ? 'update' : 'create'} ${collection}: ${name}`)
    return
  }
  if (match) {
    await match.ref.set(data, { merge: true })
    console.log(`updated ${collection}: ${name}`)
  } else {
    await db.collection(collection).add(data)
    console.log(`created ${collection}: ${name}`)
  }
}

for (const template of content.templates ?? []) {
  await upsert('hp_templates', template.name, {
    ownerUid: content.ownerUid,
    name: template.name,
    description: template.description ?? '',
    roleSlots: template.roleSlots ?? [],
    taskSkeleton: template.taskSkeleton ?? [],
    runOfShowSkeleton: template.runOfShowSkeleton ?? [],
    defaults: template.defaults ?? {},
    createdFrom: 'seed',
    createdAt: now,
  })
}

for (const org of content.orgs ?? []) {
  await upsert('hp_orgs', org.name, {
    // ownerUid is the field the rules and every list query read. createdBy
    // keeps its original meaning; the two are the same person at seed time.
    ownerUid: content.ownerUid,
    name: org.name,
    type: org.type,
    description: org.description ?? '',
    contacts: org.contacts ?? [],
    profile: org.profile ?? {},
    customFields: org.customFields ?? [],
    via: org.via ?? '',
    relationshipTerms: org.relationshipTerms ?? '',
    notes: org.notes ?? '',
    createdAt: now,
    createdBy: content.ownerUid,
  })
}

console.log(dryRun ? 'Dry run complete, nothing written.' : 'Seed complete.')
process.exit(0)
