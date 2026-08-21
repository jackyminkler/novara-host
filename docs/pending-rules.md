# Pending Firestore rules and indexes

This repo never deploys Firestore rules, indexes, or Storage rules. The consumer app repo owns `firestore.rules`, `firestore.indexes.json`, and `storage.rules` for the shared `novarasocial-dev` project.

Workflow: when a new or changed `hp_` collection needs a rules match block, a composite index, or (from M1) a Storage rules path, the exact definition gets written under Pending below and surfaced to Jacky. She applies it through the consumer repo, then the entry moves to Applied with the date. Queries that need a composite index fail at runtime until the index is applied and built, so entries land here as soon as the query is written.

Reminders for whoever writes entries here:

- Every `hp_` collection needs its own explicit match block with the `hp_config/allowlist` condition. Rules cannot wildcard a collection-name prefix.
- Never a collection-group rule (`match /{path=**}/name/`). Those span the consumer app's subcollections in the shared ruleset.

## Pending

Nothing pending.

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

