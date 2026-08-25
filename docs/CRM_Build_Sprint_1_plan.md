# CRM Sprint 1, implementation plan

**Date:** 2026-08-25. **Repo:** novara-host. **Source work order:** `docs/CRM_Build_Sprint_1_workorder.md`.

This is the execution plan for the work order, after reading the two CRM design docs, the
brain repo's event and CRM data, and the current `src/data` seam. It reorders two things
and adds two that the work order assumes exist. Everything else follows it.

## What the data actually is (verified 2026-08-25, offline)

Four Luma exports in `Novara-Brain/03-product/matching/event-data/`:

| Event key (brain slug) | Rows | approved | invited | declined |
|---|---|---|---|---|
| `2026-03-21-crissy-field-launch` | 87 | 83 | 1 | 3 |
| `2026-06-13-sunrise-run-2` | 647 | 587 | 19 | 41 |
| `2026-06-27-sunrise-run-pineapples` | 720 | 159 | 554 | 7 |
| `2026-08-22-girls-run` | 501 | 154 | 335 | 12 |

Deduping on `trim+lowercase(email)` and taking tier as
`approved > invited > declined` reproduces the expected figures **exactly**: 1,233 unique
people, 837 `signed_up`, 352 `invited_only`, 44 `declined_only`, 134 with 2+ signed-up
events. The algorithm is therefore pinned before the importer is written.

Facts that change the build:

- **No phone numbers.** Zero of 1,955 rows carry `phone_number`. `hp_people.phone` is null
  for everyone. Not a bug, just absent upstream.
- **No check-in data.** Zero rows carry `checked_in_at`, in any export.
  `registrations[].checkedInAt` is null everywhere, and F11's corroborated attendance
  cannot lean on Luma. Host headcount plus meeting captures remain the only evidence.
- **Custom questions are real and worth keeping.** Jun 13 carries the Lume waitlist question
  (536 answered, 290 yes). Aug 22 carries ten matchmaking questions (161 answered), which
  are the inputs the matching algorithm wants. These belong in `registrations[].answers`.
- **The girls-run export has quoted column names containing commas and newlines.** A naive
  `split(',')` parser corrupts it. The importer needs a real RFC 4180 parser.
- **Its filename is `girls-run-guests-export-2026-08-21.csv`**, not the
  `guests-export-luma.csv` the work order implies. Take paths as arguments, not by glob.
- **`master-contacts.csv` is already deduped and app-joined.** Do not import it as the
  source: it has no per-event `registeredAt` or `answers`. Use it for two other jobs:
  as a verification oracle against the counts above, and as the source of `appUserUid`
  (21 email-confirmed matches; the 7 `name-possible` rows carry no uid and must stay null).
- **A fifth event exists with no guest export:** `2026-06-19-fort-mason` (Circe collab run)
  holds only an email brief. It gets an `hp_events` record with no registrations.

## Two gates that block everything

**Gate A, Firestore admin credentials.** `seed.mjs`, the contacts loader, the importer, the
backfill, and the event seeder all use `applicationDefault()`, and this machine has no ADC.
Nothing writes until a service account key for `novarasocial-dev` exists and
`GOOGLE_APPLICATION_CREDENTIALS` points at it. This blocks Step 0, which is still unwritten.

**Gate B, one rules handover.** Three separate rules changes are needed: the `hp_people`
match block, the ownership tightening on every existing `hp_` block, and a composite index.
Batch all three into `docs/pending-rules.md` as a **single** handover so Jacky applies them
through the consumer repo once, not three times. Each handover has human latency; three
serialised handovers would stretch this sprint by days for no benefit.

## Ordering, and the one place it departs from the work order

The work order's order is right, and there is now a concrete reason to hold it: **Lisa
Tucker is already on the allowlist** (`docs/build-log.md:15`) and today every allowlisted
UID reads every `hp_` collection. Importing 1,233 real people's email addresses into a
collection a second account can read makes a live privacy gap materially worse. Step 1
lands before Step 2, without exception.

The one departure: **create the `hp_events` records before importing people**, and join them
on a stable slug rather than a generated doc id.

`registrations[].eventKey` stays the brain slug (`2026-06-13-sunrise-run-2`), and `EventDoc`
gains `sourceKey: string | null` carrying the same slug. Two reasons: slugs are stable while
doc ids are generated, so the importer stays idempotent and runnable whether or not events
exist yet; and the People page can still resolve a registration to its event workspace by
looking up `sourceKey`. The alternative, writing hp_events ids into `eventKey`, couples the
importer to event creation order and needs a migration if an event is ever recreated.

## Phases

Each phase is independently shippable and verifiable. Phase 1 needs neither gate.

### Phase 1 — write the rules batch and the importer (no credentials needed)

1. Draft the full pending-rules entry: `hp_people` match block, ownership-tightened blocks
   for `hp_orgs`, `hp_events`, `hp_templates`, `hp_contacts`, `hp_availability`, `hp_moments`,
   `hp_guestTokens`, plus the `hp_people (ownerUid asc, tier asc, lastSeenAt desc)` index.
   Hand to Jacky. This starts Gate B's clock immediately.
2. Build `seed/import-luma-guests.ts`: RFC 4180 parser, normalized-email upsert, registration
   append/update, tier and eventCount recompute, `ownerUid` stamp, `appUserUid: null`.
   Idempotent. Paths and event key are arguments; nothing hardcoded (guardrail 6).
3. Build a `--dry-run` that runs the whole pipeline **in memory with no Firestore** and prints
   the resulting counts. Verifying against 1,233 / 837 / 352 / 44 / 134 proves the importer
   before it ever touches the database or waits on a credential.

### Phase 2 — Step 0, seed the real content (needs Gate A only)

`node seed/seed.mjs` for the three templates and five orgs, already validated and staged.
Then the contacts loader for the nine Aug 22 captures, which needs `HOST_UID` in the
environment because `seed/contacts.json` carries no `ownerUid` key.

### Phase 3 — Step 1, multi-tenant foundation (needs Gates A and B)

Owner field on every top-level `hp_` doc, `where(owner, '==', uid)` on every `list*` in
`firebaseApi`, the same filter in `mockApi`, and the idempotent dry-run-default backfill
stamping Jacky's UID on pre-existing docs. `firebaseApi` reads the uid from
`auth.currentUser` in `src/lib/firebase.ts`; the seam does not currently carry an ambient uid.

### Phase 4 — event details into `hp_events` (needs Gates A and B)

A `seed/seed-events.mjs` writing the five real events as `status: 'wrapped'`, each with one
confirmed date option, `signupCount`, `governance.officialListing: 'Luma'` and the real
`listingUrl`, `sourceKey`, and `recap.headcount` where known (Crissy Field: ~50 of ~80, the
only event with a recorded attendee count). Parties link to the seeded orgs per the event
index. Everything stays editable in the UI afterward.

### Phase 5 — Step 2, run the import (needs Phases 1, 3, 4)

Four runs of the importer, one per export. Verify against the oracle, then enrich
`appUserUid` from `master-contacts.csv` for the 21 confirmed matches.

### Phase 6 — Step 3, the People page

Route, list, search, filters, person detail, the five saved segments, Amplitude events.
Through the seam, mock and firebase both.

### Phase 7 — Step 4, Vicki

Allowlist addition, her own `content.json`, the 290 Lume waitlist opt-ins, `hp_feedback`.

## Gap the work order assumes away

The definition of done requires "the rules/contract tests are green" and "keep
`firestore-rules-coverage` green". **Neither exists in this repo.** There is no test runner
at all: no vitest, no test script in `package.json`, no test files. The emulator harness
(`firebase.emulators.json` plus `emulator/firestore.rules`) exists but is driven by hand.

Standing this up is real scope: `vitest` plus `@firebase/rules-unit-testing`, and a suite
proving a second host cannot read the owner's `hp_` docs while the owner can. It is the only
mechanical proof that Phase 3 actually closed the gap, and the sprint's own DoD asks for it,
so it is planned rather than assumed. Kept deliberately narrow: ownership cases only.

## Decisions taken

**2026-08-25, rules tests deferred.** Jacky chose hand verification against the emulator over
standing up vitest and `@firebase/rules-unit-testing` this sprint. Consequence: the ownership
rules get checked once, by hand, and nothing catches a later regression. This is why the owner
field is uniform (`ownerUid` everywhere) rather than per-collection: with no automated check,
the hand check has to be simple enough to get right.

**2026-08-25, no composite index.** Every `list*` becomes one equality filter on `ownerUid`
with no `orderBy`, because `readAll` in `firebaseApi` does a plain `getDocs` and the components
sort. Single-field indexes are automatic, so nothing goes to the consumer repo. The People page
loads the owner's people once and filters in memory: at 1,233 documents that is the boring
option, it makes search instant, and the five saved segments become plain predicates. Revisit
past roughly 10,000 people per host.

**2026-08-25, run through Phase 6.** Jacky asked for phases 1 to 6 without stopping, ending at
a browsable People page.

## Progress

**Phase 1 complete, 2026-08-25.** Needed no credentials.

- `docs/pending-rules.md` carries the single batched handover, with the backfill-before-rules
  ordering called out: applying owner scoping before `ownerUid` exists on the documents would
  lock the host out of her own data.
- `seed/csv.ts`, an RFC 4180 reader. Verified to agree with Python's `csv` module on all four
  exports, including the 34-column Aug 22 file whose column names contain commas and newlines.
- `seed/import-luma-guests.ts` plus `seed/people-store.ts` (Firestore kept in its own module so
  `--offline` never loads firebase-admin).
- Verified offline against the brain repo's independently built files: 1,233 people, 837 / 352 /
  44 by tier, 134 repeat, 160 LinkedIn handles, 290 Lume waitlist yes, 112 referrers, 16 survey
  ratings. Every figure matches.
- Idempotency proven by importing one export twice under the same event key: 0 repeat attendees
  rather than 587, so registrations replace in place rather than appending.
- `seed` added to `tsconfig.json` include, so the new TypeScript is actually covered by
  `npx tsc --noEmit`. It was not before. Typecheck and `npm run build` both green.
