#!/usr/bin/env node
// One-time setup: writes the host's own templates and partner directory into
// Firestore. Content lives in seed/content.json, which is gitignored, because
// templates and partners are the host's data and never application code
// (PRD build guardrail 6).
//
//   GOOGLE_APPLICATION_CREDENTIALS=/path/to/key.json node seed/seed.mjs
//   node seed/seed.mjs --dry-run     to print what would be written
//
// Re-running is safe: documents are matched by name and updated in place, so
// nothing is duplicated and nothing the host has edited by hand is deleted.

import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { initializeApp, applicationDefault } from 'firebase-admin/app'
import { getFirestore } from 'firebase-admin/firestore'

const here = dirname(fileURLToPath(import.meta.url))
const dryRun = process.argv.includes('--dry-run')

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

initializeApp({ credential: applicationDefault() })
const db = getFirestore()
const now = new Date().toISOString()

/** Find an existing doc by name so a second run updates instead of duplicating. */
async function upsert(collection, name, data) {
  const existing = await db.collection(collection).where('name', '==', name).limit(1).get()
  if (dryRun) {
    console.log(`${existing.empty ? 'create' : 'update'} ${collection}: ${name}`)
    return
  }
  if (existing.empty) {
    await db.collection(collection).add(data)
    console.log(`created ${collection}: ${name}`)
  } else {
    await existing.docs[0].ref.set(data, { merge: true })
    console.log(`updated ${collection}: ${name}`)
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
