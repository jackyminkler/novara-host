# Pending Firestore rules and indexes

This repo never deploys Firestore rules, indexes, or Storage rules. The consumer app repo owns `firestore.rules`, `firestore.indexes.json`, and `storage.rules` for the shared `novarasocial-dev` project.

Workflow: when a new or changed `hp_` collection needs a rules match block, a composite index, or (from M1) a Storage rules path, the exact definition gets written under Pending below and surfaced to Jacky. She applies it through the consumer repo, then the entry moves to Applied with the date. Queries that need a composite index fail at runtime until the index is applied and built, so entries land here as soon as the query is written.

Reminders for whoever writes entries here:

- Every `hp_` collection needs its own explicit match block with the `hp_config/allowlist` condition. Rules cannot wildcard a collection-name prefix.
- Never a collection-group rule (`match /{path=**}/name/`). Those span the consumer app's subcollections in the shared ruleset.

## Pending

### M0 host access rules (added 2026-08-18)

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

## Applied

Nothing applied yet.
