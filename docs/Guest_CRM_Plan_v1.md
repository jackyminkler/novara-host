# Guest CRM Plan v1

**Date:** 2026-08-24
**Status:** Proposed (not yet in PRD scope; approved by Jacky in Cowork session 2026-08-24)
**Goal:** Everything Jacky wants to see about her events lives inside the host app. Solo build now, on the existing allowlist auth; when SSO lands, every host's guest data is their own, scoped and locked to their account.

## 1. What exists today and what this adds

Today the app has three people-shaped things, none of which is a guest CRM:

- `Org.contacts`: partner org contact persons (F2 partner directory)
- `hp_contacts`: quick meeting capture with follow-ups (F-capture)
- Luma guest exports: CSVs living in the brain repo at `Novara-Brain/03-product/matching/event-data/`, deduped by hand into `04-marketing/crm/master-contacts.csv`

This plan adds a fourth, distinct concept: **people who attend events** (`hp_people`), with per-event registration history. It does not replace `hp_contacts` (capture stays a fast inbox; a later phase can offer "promote capture to person").

## 2. Data model

New top-level collection (shared Firebase project, `hp_` namespace, rules via the consumer repo per the standing handover flow):

```
hp_people/{personId}                    // personId = random doc id
  ownerUid: string                      // NOW: Jacky's UID. Later: the SSO account that owns this contact. Write it from day one so multi-tenant needs no migration.
  email: string                         // normalized: trimmed + lowercased. Dedupe key.
  firstName: string
  lastName: string
  fullName: string
  phone: string | null
  handles: { instagram?, linkedin? }
  appUserUid: string | null            // consumer-app users doc id when matched (email join today, first-party check-in later)
  tier: "signed_up" | "invited_only" | "declined_only"   // derived, recomputed on import
  eventCount: number                    // count of signed-up events, derived
  firstSeenAt: ISO
  lastSeenAt: ISO
  sources: string[]                     // utm/referrer values seen
  referredBy: string[]                  // emails that referred them
  notes: string                         // host free text
  followUp: { due: ISO, done: bool } | null
  tags: string[]                        // host-defined ("investor", "dj", "photographer", ...)
  registrations: [{                     // embedded array, not a subcollection: bounded (a person attends tens of events, not thousands), and every read wants the history anyway
    eventKey: string                    // "2026-06-13-sunrise-run-2" (brain slug) or hp_events id once events are created in-app
    lumaEventId: string | null
    status: "approved" | "invited" | "declined"
    registeredAt: ISO
    checkedInAt: ISO | null
    source: string | null
    surveyRating: number | null
    surveyFeedback: string | null
    answers: { [question]: string }     // event-specific registration questions (Lume waitlist, pace, industry, ...)
  }]
```

Security rules (draft; goes to `docs/pending-rules.md` only when the collection is actually built, then Jacky applies through the consumer repo):

```
match /hp_people/{personId} {
  allow read, write: if hpIsHost();
}
```

When SSO/multi-tenant arrives, that block tightens to `hpIsHost() && resource.data.ownerUid == request.auth.uid` (and `request.resource.data.ownerUid == request.auth.uid` on write). Because `ownerUid` is stamped from day one, the change is rules-only.

Likely composite index (surface in pending-rules.md the moment the query is written): `hp_people` on `(ownerUid asc, tier asc, lastSeenAt desc)` for the filtered list view.

## 3. Build phases

Sized so each phase ships alone and the app stays fully usable solo.

**CRM-0: import pipeline (script, no UI).**
`seed/import-luma-guests.ts`: takes one or more Luma guest export CSVs plus an event key, upserts into `hp_people` keyed by normalized email, appends/updates the registration entry, recomputes `tier` and `eventCount`. Idempotent: re-running the same CSV changes nothing. Personal data stays data (repo rule 6): the script reads CSVs from a path argument, nothing hardcoded. First run imports the four existing exports from the brain repo. Rules block lands via pending-rules.md before first write.

**CRM-1: People page (read).**
Host-only route: list with search (name/email), filters (tier, event, tag, repeat attendees), sort by lastSeen/eventCount. Person detail: identity, event history timeline, survey answers, notes + follow-up + tags (the only writes). Goes through the `src/data/api.ts` seam with mock and firebase implementations, like every other page. Amplitude: `people_list_viewed`, `person_viewed`, `person_note_saved`.

**CRM-2: segments + export.**
Saved filters ("signed up 2+", "invited never came", "Lume waitlist yes") and a CSV download of the current filter for Mailchimp. This replaces the brain-repo `04-marketing/crm/` staging folder as the working email list; the folder becomes an archive.

**CRM-3: in-app CSV import.**
Paste/upload a Luma export on an event screen instead of running the script: client-side parse, preview of adds/updates/conflicts, then the same upsert. From here, "export from Luma, drop into the app" is the whole post-event workflow, and each import can link to the `hp_events` doc for that event so recaps (F12) can cite real attendance.

**CRM-4: SSO + per-host data isolation.**
Google sign-in stays, the allowlist gate is replaced by (or wrapped in) real account provisioning, rules tighten to `ownerUid` scoping as above, and every CRM query already filters on `ownerUid`. Guests still never authenticate; the CRM is host-side only. If co-hosts should ever see a shared list, that becomes an explicit per-event share model (denormalized `memberUids`), specified in `docs/Partner_Identity_And_Linking_Model_v1.md`; decided then, not now. The record-vs-identity model in that same doc is the general statement of the `appUserUid` link used here.

## 4. Boundaries honored

- No consumer-app collections touched; everything new is `hp_` prefixed with explicit match blocks, no collection-group rules.
- This repo still never deploys Firestore rules; the pending-rules.md handover flow is unchanged.
- Guest links stay token-only; nothing here adds guest-side Firestore access.
- Solo-first: every phase is useful with zero other users.
- TypeScript, api.ts seam, copy rules apply to all new UI strings.

## 5. Source data note

The canonical raw exports and the current deduped master list live in the brain repo: `Novara-Brain/03-product/matching/event-data/` (per-event) and `Novara-Brain/04-marketing/crm/` (master, 1,233 people as of 2026-08-24: 837 signed up, 352 invited-only, 44 declined-only, 134 repeat attendees). CRM-0 imports exactly these files.
