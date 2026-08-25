# Pending Firestore rules and indexes

This repo never deploys Firestore rules, indexes, or Storage rules. The consumer app repo owns `firestore.rules`, `firestore.indexes.json`, and `storage.rules` for the shared `novarasocial-dev` project.

Workflow: when a new or changed `hp_` collection needs a rules match block, a composite index, or (from M1) a Storage rules path, the exact definition gets written under Pending below and surfaced to Jacky. She applies it through the consumer repo, then the entry moves to Applied with the date. Queries that need a composite index fail at runtime until the index is applied and built, so entries land here as soon as the query is written.

Reminders for whoever writes entries here:

- Every `hp_` collection needs its own explicit match block with the `hp_config/allowlist` condition. Rules cannot wildcard a collection-name prefix.
- Never a collection-group rule (`match /{path=**}/name/`). Those span the consumer app's subcollections in the shared ruleset.

## Pending

Nothing pending.

## Applied

### Owner scoping on every `hp_` collection, plus `hp_people`

Applied 2026-08-25 through the consumer repo (PR #201, merged as `dbf5b57`) and deployed the same
day. The host platform is multi-tenant in production from this point: being on the allowlist is no
longer enough to read a document, it has to be yours.

**Verified from this repo**, against the consumer repo pinned at `bbba78e`: the applied block
carries `hpIsHost()`, `hpOwns()`, `hpOwnsNew()`, `hpOwnsEvent(eventId)`, owner-scoped blocks on
`hp_orgs`, `hp_events`, `hp_templates`, `hp_contacts`, `hp_availability`, `hp_moments`,
`hp_guestTokens` and the new `hp_people`, all five event subcollections under `hpOwnsEvent`, and
`hp_config` still on a plain `hpIsHost()` read. Normalised for whitespace and comments it is
**identical to `emulator/firestore.rules`**, which is the file `tests/ownership.rules.test.ts`
runs its 72 cases against. What was tested is what shipped.

**Verified elsewhere, not from here:** the deployed ruleset was read back from `novarasocial-dev`
by another session via the Firebase MCP and matches. This repo has no Firebase MCP and no
production credentials, so that is relayed, not first-hand.

**`ownerUid` on the live documents: confirmed.** Read out of production by the consumer-repo
session, which has the credentials for it, using a query **filtered on `ownerUid` equal to the host
uid**. That design is the good part and worth copying: a returned row is itself the evidence that
the field holds that value, rather than a row plus a claim about what was seen in it. All three
documents that existed in production came back:

```
hp_events/uL6u63TveLpkKy8axRs2            ownerUid present, equals the legacy hostUid
hp_orgs/Toa6em6WSYl9DGALhSSg              ownerUid present, equals the legacy createdBy
hp_guestTokens/apkBTBLpZPawNAhtsDKmAHlI   ownerUid present
```

**One claim about that third document does not hold, and the correction matters.** It was reported
as demonstrating that the backfill's token rule, take the owner of the event the token opens rather
than whoever ran the script, executed rather than falling through to the `--owner` fallback. It
cannot demonstrate that. `ownerOfEvent()` returns `ownerUid ?? hostUid ?? owner`, and in this
dataset Jacky owns the event, so all three paths produce the same string. The observation is
consistent with every branch and discriminates between none of them.

So the branch was exercised properly instead, on the emulator, where the answers can differ: plant
an event owned by another uid plus a pre-`ownerUid` token pointing at it, run the backfill with
`--owner` set to Jacky. The token came back owned by the *event's* owner, not by the flag. That is
the branch which breaks first once a second host has events, so it is worth having observed rather
than assumed. Probe documents were removed afterwards.

**The exposure this closed was real, not theoretical.** One of the three backfilled documents was
the Circe org, carrying `"via": "Anna"`. That is a private relationship note, and it was readable
by the second allowlisted account for as long as both UIDs sat on the list. This entry was written
about exactly that field.

**The near miss that justifies the no-rules-from-this-repo rule.** Verified at pinned commits:
`git show 3697132:firebase/firestore.rules | grep -c "match /hp_"` returns 0, and the same at
`f898233` returns 8. The `hp_` blocks were serving production from 2026-08-19, but commit
`b88363f` that captured them sat on an unmerged branch and was not an ancestor of `main`. `main`
carried zero `hp_` blocks from 2026-08-18 until PR #199 merged at 2026-08-24 22:56. For those six
days, `firebase deploy --only firestore` from the consumer repo would have overwritten the live
ruleset with one containing none of the eight, locking the host app out of every collection.

Two process notes that came out of chasing that:

- **Pin the commit.** Record `git rev-parse HEAD` with any finding about another repo. Two checks
  of "main" an hour apart disagreed here, and both were correct for the commit they saw.
- **Two disagreeing checks mean the thing changed at least as often as one was a misread.** This
  entry briefly recorded the near miss as a bad read, with a tidy lesson attached, that
  `git log -S` should be trusted over `grep`. Both halves were false: `log -S` returns nothing at
  `3697132` too, because `b88363f` was not in that history. The tools agreed at both commits. A
  wrong diagnosis dressed as a process improvement is worse than no lesson, because it gets reused.

<details><summary>The block as applied</summary>

Copied out of the consumer repo at `bbba78e`, so this is what is actually deployed rather
than what was proposed.

```
// ── Novara host platform (hp_ collections) ─────────────────────────
//
// Owned by the novara-host repo; blocks applied VERBATIM from its
// docs/pending-rules.md (see CLAUDE.md §Shared Firebase Project).
// Hosts only; guests go through the hpGuest* Cloud Functions with
// the Admin SDK and never hit rules.
//
// 2026-08-25: owner scoping. Until now every allowlisted account could
// read every other host's data, including the private `via` and
// `relationshipTerms` notes on partners. Two UIDs are on the allowlist and
// the guest CRM is about to import 1,233 real people with email addresses.
// Applied only AFTER seed/backfill-owner.mjs stamped `ownerUid` on the
// existing documents — these conditions read that field, so applying them
// first would have locked the host out of her own data. Rehearsed against
// the emulator in novara-host: tests/ownership.rules.test.ts, 72 cases
// green; the same suite scores 33 failures against the hpIsHost()-only
// form this replaces.
function hpIsHost() {
  return request.auth != null
    && request.auth.uid in get(/databases/$(database)/documents/hp_config/allowlist).data.uids;
}

// On the allowlist AND the document is yours. Read, update and delete test
// the stored document; create tests the incoming one.
function hpOwns() {
  return hpIsHost() && resource.data.ownerUid == request.auth.uid;
}
function hpOwnsNew() {
  return hpIsHost() && request.resource.data.ownerUid == request.auth.uid;
}

// Event subcollections inherit the parent event's owner. Explicit path,
// never a collection-group match: this ruleset is shared with the consumer
// app, and host subcollection names (parties, tasks, runOfShow, crew, log)
// are NOT hp_-prefixed, so a collection-group rule would span both products.
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

// New 2026-08-25. The guest CRM: people who attend events, with per-event
// registration history. Host-side only; guests never read or write it.
match /hp_people/{personId} {
  allow read, update, delete: if hpOwns();
  allow create: if hpOwnsNew();
}

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

</details>


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

