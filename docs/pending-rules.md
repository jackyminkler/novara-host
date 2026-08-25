# Pending Firestore rules and indexes

This repo never deploys Firestore rules, indexes, or Storage rules. The consumer app repo owns `firestore.rules`, `firestore.indexes.json`, and `storage.rules` for the shared `novarasocial-dev` project.

Workflow: when a new or changed `hp_` collection needs a rules match block, a composite index, or (from M1) a Storage rules path, the exact definition gets written under Pending below and surfaced to Jacky. She applies it through the consumer repo, then the entry moves to Applied with the date. Queries that need a composite index fail at runtime until the index is applied and built, so entries land here as soon as the query is written.

Reminders for whoever writes entries here:

- Every `hp_` collection needs its own explicit match block with the `hp_config/allowlist` condition. Rules cannot wildcard a collection-name prefix.
- Never a collection-group rule (`match /{path=**}/name/`). Those span the consumer app's subcollections in the shared ruleset.

## Pending

### Owner scoping on every `hp_` collection, plus `hp_people`

Written 2026-08-25 for CRM sprint 1 (`docs/CRM_Build_Sprint_1_workorder.md` steps 1 and 2).
This is one batch on purpose: three changes that would otherwise be three separate handovers.

**Where the rules live, and a near miss worth keeping.** Verified 2026-08-25 at pinned commits,
not at "main":

```
git show 3697132:firebase/firestore.rules | grep -c "match /hp_"   ->  0
git show f898233:firebase/firestore.rules | grep -c "match /hp_"   ->  8
```

The `hp_` blocks were applied to the live project on 2026-08-19 and 2026-08-20 and were serving
production the whole time, but they were **not on `main`**. Commit `b88363f` ("Commit the live hp_
rules batch 1 that was only in the working tree") sat on an unmerged branch and was not an
ancestor of `main`'s tip. `main` carried zero `hp_` match blocks from 2026-08-18 until PR #199
merged at 2026-08-24 22:56, which finally pulled `b88363f` into `main`'s history.

For those six days, `firebase deploy --only firestore` from `~/novara` would have overwritten the
live ruleset with one containing none of the eight blocks, locking the host app out of every one
of its collections. That window is closed: `main` carries all eight today, and applying the block
below through the consumer repo is safe.

**The lesson is to pin the commit, not to prefer one tool.** This entry briefly recorded the
opposite of the above, on the theory that the original finding was a bad read and that
`git log -S` should have been trusted over `grep`. Both halves were wrong. The two checks ran
either side of the PR #199 merge and each was accurate for the commit it saw; `git log -S "hp_"`
returns nothing at `3697132` too, because `b88363f` was not in that history at all. `grep` and
`log -S` agreed at both points. The variable was never the tool, it was which commit `HEAD`
pointed at. When recording a rules finding, record `git rev-parse HEAD` with it: "main" is a
moving target whenever another session is working in that repo.

**Do not apply this until the backfill has run.** The new condition reads `ownerUid` off each
document, and every document written before this sprint has no such field. Applying the rules
first locks the host out of her own data until the backfill finishes. The order is:

1. `node seed/backfill-owner.mjs` (Admin SDK, bypasses rules, so it works either way). Dry run
   by default; re-runnable.
2. Read back a few documents and confirm `ownerUid` is present.
3. Then apply the block below through the consumer repo.
4. Sign in and confirm events, partners, templates, capture, and calendar all still load.

If step 4 fails, reverting is just restoring the previous `hpIsHost()`-only block; no data moved.

**Why now:** two UIDs are on the allowlist (`docs/build-log.md:15`), and today every allowlisted
account reads every `hp_` collection, including the private `via` and `relationshipTerms` notes
on partners. CRM sprint 1 imports 1,233 real people with their email addresses. That import
must not land in a collection a second account can read.

**Field convention:** every top-level `hp_` document carries `ownerUid`, one field name across
all collections. Existing owner-ish fields (`hp_orgs.createdBy`, `hp_events.hostUid`,
`hp_contacts.capturedBy`, `hp_templates.ownerUid`) keep their current meaning and are left
alone; the backfill copies them into `ownerUid` where present. Uniformity is deliberate: with
rules tests deferred this sprint, hand verification is the only check, and four different owner
field names is exactly where a hand check goes wrong.

**Subcollections** (`parties`, `tasks`, `runOfShow`, `crew`, `log`) carry no owner of their own
and inherit the parent event's, via an explicit path lookup. Still no collection-group rule.

**No composite index is needed.** Every `list*` becomes a single equality filter on `ownerUid`
with no `orderBy` (`readAll` in `firebaseApi` does a plain `getDocs`, and all sorting happens in
the components). Single-field indexes are automatic. The People page follows the same pattern:
fetch the owner's people once, filter and sort in memory. At 1,233 documents that is the boring
option and it needs no index; revisit if one host ever passes roughly 10,000 people.

```
// Novara host platform (hp_ collections). Hosts only; guests go through
// the hpGuest* Cloud Functions with the Admin SDK and never hit rules.
function hpIsHost() {
  return request.auth != null
    && request.auth.uid in get(/databases/$(database)/documents/hp_config/allowlist).data.uids;
}

// On the allowlist AND the document is yours. Read, update and delete test the
// stored document; create tests the incoming one.
function hpOwns() {
  return hpIsHost() && resource.data.ownerUid == request.auth.uid;
}
function hpOwnsNew() {
  return hpIsHost() && request.resource.data.ownerUid == request.auth.uid;
}

// Event subcollections inherit the parent event's owner. Explicit path, never
// a collection-group match: this ruleset is shared with the consumer app.
function hpOwnsEvent(eventId) {
  return hpIsHost()
    && get(/databases/$(database)/documents/hp_events/$(eventId)).data.ownerUid == request.auth.uid;
}

match /hp_config/{docId} {
  allow read: if hpIsHost();
  allow write: if false; // allowlist edits happen in the console in M0
}

match /hp_orgs/{orgId} {
  allow read, update, delete: if hpOwns();
  allow create: if hpOwnsNew();
}

match /hp_events/{eventId} {
  allow read, update, delete: if hpOwns();
  allow create: if hpOwnsNew();

  match /parties/{partyId} {
    allow read, write: if hpOwnsEvent(eventId);
  }
  match /tasks/{taskId} {
    allow read, write: if hpOwnsEvent(eventId);
  }
  match /runOfShow/{itemId} {
    allow read, write: if hpOwnsEvent(eventId);
  }
  match /crew/{crewId} {
    allow read, write: if hpOwnsEvent(eventId);
  }
  match /log/{entryId} {
    allow read, write: if hpOwnsEvent(eventId);
  }
}

match /hp_templates/{templateId} {
  allow read, update, delete: if hpOwns();
  allow create: if hpOwnsNew();
}

match /hp_contacts/{contactId} {
  allow read, update, delete: if hpOwns();
  allow create: if hpOwnsNew();
}

match /hp_availability/{blockId} {
  allow read, update, delete: if hpOwns();
  allow create: if hpOwnsNew();
}

match /hp_moments/{momentId} {
  allow read, update, delete: if hpOwns();
  allow create: if hpOwnsNew();
}

match /hp_guestTokens/{tokenId} {
  allow read, update, delete: if hpOwns();
  allow create: if hpOwnsNew();
}

// New this sprint. The guest CRM: people who attend events, with per-event
// registration history. Host-side only; guests never read or write it.
match /hp_people/{personId} {
  allow read, update, delete: if hpOwns();
  allow create: if hpOwnsNew();
}
```

Notes:

- A `list` against any of these now **requires** the query to carry `where('ownerUid', '==', uid)`.
  That is the intended failure mode: an unfiltered list returns permission-denied rather than
  another host's rows. Every `list*` in `firebaseApi` is updated in the same change.
- `hpOwnsEvent()` adds a second billed `get()` per subcollection operation, on top of the one
  `hpIsHost()` already does. Accepted at this scale; the alternative is denormalising `ownerUid`
  onto every task and run-of-show item, which is more places to get wrong.
- `hp_config` deliberately keeps the plain `hpIsHost()` read: the allowlist is shared, not owned.

## Applied

### M0 v2 collections, F10 to F13

Applied 2026-08-20 through the consumer repo, verified the same day by reading the deployed ruleset back from the project. `hp_templates`, `hp_availability`, and `hp_moments` are live as top-level blocks, and `crew` is nested inside `hp_events` alongside `parties`, `tasks`, `runOfShow`, and `log`, exactly as asked. No collection-group rule was introduced, and nothing outside the `hp_` section changed.

<details><summary>The block as applied</summary>

The v2 PRD adds templates (F3), host availability and citywide moments (F10), and crew (F13). Crew is a subcollection of `hp_events`, so it needs a nested match block, never a collection-group rule. Paste these **alongside** the M0 host access rules above, and add the `crew` block inside the existing `match /hp_events/{eventId}` block.

```
match /hp_templates/{templateId} {
  allow read, write: if hpIsHost();
}

match /hp_availability/{blockId} {
  allow read, write: if hpIsHost();
}

match /hp_moments/{momentId} {
  allow read, write: if hpIsHost();
}
```

And inside `match /hp_events/{eventId} { ... }`, next to `parties`, `tasks`, `runOfShow`, and `log`:

```
  match /crew/{crewId} {
    allow read, write: if hpIsHost();
  }
```

Notes:

- No composite indexes needed. `hp_guestTokens` is queried with equality filters only (`eventId`, `scope`, `subjectId`), and Firestore merges single-field indexes for equality-only conjunctions. The first composite index would appear the moment one of those queries gains an `orderBy` or a range filter; nothing does today.
- Every subcollection read is a full small collection sorted in memory, deliberately, so no ordering index is required.
- `hp_guestTokens` documents now carry `scope` (`party` | `crew` | `recap`) and `subjectId` instead of a bare `partyId`. Same collection, same rules block, no change needed to the block already pending above.

</details>

### M0 host access rules

Applied 2026-08-19, verified live in the shared ruleset on 2026-08-20 by reading the deployed rules back from the project. The consumer ruleset now carries `hpIsHost()` plus match blocks for `hp_config`, `hp_orgs`, `hp_events` (with `parties`, `tasks`, `runOfShow`, `log`), `hp_guestTokens`, and `hp_contacts`.

<details><summary>The block as applied</summary>

Prerequisite, done 2026-08-18: `hp_config/allowlist` was seeded in the Firebase console with `uids: ["34R2FXCvosRjLh2jS4twZ9csT492"]` (Jacky's UID). Console writes bypass rules, which is what made bootstrapping possible.

Then paste everything below inside `match /databases/{database}/documents { ... }` in the consumer repo's `firestore.rules`, after the existing consumer blocks, and deploy rules from that repo.

```
// Novara host platform (hp_ collections). Hosts only; guests go through
// the hpGuest* Cloud Functions with the Admin SDK and never hit rules.
function hpIsHost() {
  return request.auth != null
    && request.auth.uid in get(/databases/$(database)/documents/hp_config/allowlist).data.uids;
}

match /hp_config/{docId} {
  allow read: if hpIsHost();
  allow write: if false; // allowlist edits happen in the console in M0
}

match /hp_orgs/{orgId} {
  allow read, write: if hpIsHost();
}

match /hp_events/{eventId} {
  allow read, write: if hpIsHost();

  match /parties/{partyId} {
    allow read, write: if hpIsHost();
  }
  match /tasks/{taskId} {
    allow read, write: if hpIsHost();
  }
  match /runOfShow/{itemId} {
    allow read, write: if hpIsHost();
  }
  match /log/{entryId} {
    allow read, write: if hpIsHost();
  }
}

match /hp_guestTokens/{tokenId} {
  allow read, write: if hpIsHost();
}

match /hp_contacts/{contactId} {
  allow read, write: if hpIsHost();
}
```

Notes:

- `hpIsHost()` does one `get()` per operation, a billed read. Fine at this scale.
- The subcollection blocks are nested inside `hp_events` on purpose: explicit paths, no collection-group matches.
- No composite indexes needed yet. First candidates arrive with the task board queries; they will be added here when the queries are written.

</details>

